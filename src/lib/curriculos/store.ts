import 'server-only'

import { getIntranetSql } from '@/lib/db'
import { generateCurriculoBriefing } from '@/lib/curriculos/brief'
import { extractPdfText } from '@/lib/folha/imap-pdf'
import { isAllowedCurriculoFileUrl } from '@/lib/curriculos/file'
import { fold, normalizeKeywords, searchTokens } from '@/lib/curriculos/search'
import {
  isCurriculoStatus,
  type Curriculo,
  type CurriculoStatus,
} from '@/lib/curriculos/types'
import { readDbSqlFile, splitSqlStatements } from '@/lib/schema-migrations/sql'

let tableReady: Promise<void> | null = null

async function runSql(statement: string): Promise<void> {
  const sql = getIntranetSql() as {
    query?: (q: string, params?: unknown[]) => Promise<unknown>
    unsafe?: (q: string, params?: unknown[]) => Promise<unknown>
  }
  if (typeof sql.query === 'function') {
    await sql.query(statement)
    return
  }
  if (typeof sql.unsafe === 'function') {
    await sql.unsafe(statement)
    return
  }
  throw new Error('Cliente SQL da intranet sem query/unsafe')
}

export async function ensureCurriculosTables(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      const body = readDbSqlFile('delta-curriculos.sql')
      for (const statement of splitSqlStatements(body)) {
        await runSql(statement)
      }
    })().catch((err) => {
      tableReady = null
      throw err
    })
  }
  await tableReady
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    return value
      .replace(/[{}]/g, '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function mapCurriculo(row: Record<string, unknown>): Curriculo {
  const statusRaw = String(row.status ?? 'novo')
  const status: CurriculoStatus = isCurriculoStatus(statusRaw) ? statusRaw : 'novo'
  return {
    id: String(row.id),
    candidate_name: String(row.candidate_name ?? ''),
    email: row.email != null ? String(row.email) : null,
    phone: row.phone != null ? String(row.phone) : null,
    desired_role: row.desired_role != null ? String(row.desired_role) : null,
    status,
    file_url: String(row.file_url ?? ''),
    file_name: row.file_name != null ? String(row.file_name) : null,
    file_content_type: row.file_content_type != null ? String(row.file_content_type) : null,
    extracted_text: row.extracted_text != null ? String(row.extracted_text) : null,
    briefing: row.briefing != null ? String(row.briefing) : null,
    keywords: asStringArray(row.keywords),
    notes: row.notes != null ? String(row.notes) : null,
    created_by_email: row.created_by_email != null ? String(row.created_by_email) : null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

async function extractTextFromFileUrl(
  fileUrl: string,
  fileName: string | null,
  contentType: string | null,
): Promise<string> {
  if (!isAllowedCurriculoFileUrl(fileUrl)) return ''
  const isPdf =
    (contentType ?? '').includes('pdf') ||
    (fileName ?? '').toLowerCase().endsWith('.pdf') ||
    fileUrl.toLowerCase().includes('.pdf')
  if (!isPdf) return ''
  try {
    const res = await fetch(fileUrl)
    if (!res.ok) return ''
    const buf = Buffer.from(await res.arrayBuffer())
    const { text } = await extractPdfText(buf, fileName ?? 'curriculo.pdf')
    return text.trim()
  } catch {
    return ''
  }
}

function haystack(row: Curriculo): string {
  return fold(
    [
      row.candidate_name,
      row.desired_role,
      row.email,
      row.phone,
      row.briefing,
      row.extracted_text,
      row.keywords.join(' '),
      row.notes,
    ]
      .filter(Boolean)
      .join(' '),
  )
}

export async function listCurriculos(opts: {
  q?: string
  status?: CurriculoStatus | 'all'
  limit?: number
}): Promise<Curriculo[]> {
  await ensureCurriculosTables()
  const sql = getIntranetSql()
  const limit = Math.max(1, Math.min(200, opts.limit ?? 80))
  const status = opts.status && opts.status !== 'all' ? opts.status : null
  const tokens = searchTokens(opts.q ?? '')
  // Busca em memória sobre janela recente — volume RH é pequeno; evita SQL dinâmico frágil.
  const fetchLimit = tokens.length > 0 ? Math.max(limit, 500) : limit

  const rows = (await sql`
    select *
    from curriculos
    where (${status}::text is null or status = ${status})
    order by created_at desc
    limit ${fetchLimit}
  `) as Array<Record<string, unknown>>

  let items = rows.map(mapCurriculo)
  if (tokens.length > 0) {
    items = items.filter((item) => {
      const text = haystack(item)
      return tokens.every((token) => text.includes(token))
    })
  }
  return items.slice(0, limit)
}

export async function createCurriculo(input: {
  candidateName: string
  email?: string | null
  phone?: string | null
  desiredRole?: string | null
  fileUrl: string
  fileName?: string | null
  fileContentType?: string | null
  keywords?: readonly string[]
  notes?: string | null
  createdByEmail?: string | null
}): Promise<Curriculo> {
  await ensureCurriculosTables()
  const name = input.candidateName.trim()
  if (!name) throw new Error('Nome do candidato é obrigatório')
  const fileUrl = input.fileUrl.trim()
  if (!fileUrl) throw new Error('Arquivo do currículo é obrigatório')

  const extracted = await extractTextFromFileUrl(
    fileUrl,
    input.fileName ?? null,
    input.fileContentType ?? null,
  )
  const { briefing, keywords } = await generateCurriculoBriefing({
    candidateName: name,
    desiredRole: input.desiredRole,
    extractedText: extracted,
    keywords: input.keywords ?? [],
  })

  const sql = getIntranetSql()
  const rows = (await sql`
    insert into curriculos (
      candidate_name, email, phone, desired_role, status,
      file_url, file_name, file_content_type,
      extracted_text, briefing, keywords, notes, created_by_email
    )
    values (
      ${name},
      ${input.email?.trim() || null},
      ${input.phone?.trim() || null},
      ${input.desiredRole?.trim() || null},
      'novo',
      ${fileUrl},
      ${input.fileName?.trim() || null},
      ${input.fileContentType?.trim() || null},
      ${extracted || null},
      ${briefing},
      ${normalizeKeywords(keywords)},
      ${input.notes?.trim() || null},
      ${input.createdByEmail?.trim() || null}
    )
    returning *
  `) as Array<Record<string, unknown>>

  const created = rows[0]
  if (!created) throw new Error('Falha ao gravar currículo')
  return mapCurriculo(created)
}

export async function updateCurriculoStatus(
  id: string,
  status: CurriculoStatus,
): Promise<Curriculo | null> {
  await ensureCurriculosTables()
  const sql = getIntranetSql()
  const rows = (await sql`
    update curriculos
    set status = ${status}, updated_at = now()
    where id = ${id}::uuid
    returning *
  `) as Array<Record<string, unknown>>
  const row = rows[0]
  return row ? mapCurriculo(row) : null
}
