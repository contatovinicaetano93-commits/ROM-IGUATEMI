import { put } from '@vercel/blob'
import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { canUseCurriculos } from '@/lib/curriculos/access'
import {
  CURRICULO_SERVER_UPLOAD_MAX_BYTES,
  curriculoBlobPathname,
  guessCurriculoContentType,
  isAllowedCurriculoContentType,
  isAllowedCurriculoFileUrl,
  safeCurriculoFileName,
} from '@/lib/curriculos/file'
import { createCurriculo, listCurriculos } from '@/lib/curriculos/store'
import { isCurriculoStatus } from '@/lib/curriculos/types'
import { normalizeKeywords } from '@/lib/curriculos/search'

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseCurriculos(auth.session)) return err('Acesso restrito a Currículos', 403)

  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  const statusRaw = url.searchParams.get('status')
  const status =
    statusRaw === 'all' || statusRaw == null || statusRaw === ''
      ? 'all'
      : isCurriculoStatus(statusRaw)
        ? statusRaw
        : 'all'
  const limitRaw = Number(url.searchParams.get('limit') ?? '80')
  const limit = Number.isFinite(limitRaw) ? limitRaw : 80

  try {
    const curriculos = await listCurriculos({ q, status, limit })
    return ok({ curriculos })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao listar currículos', 500)
  }
}

type CreateBody = {
  candidate_name?: unknown
  email?: unknown
  phone?: unknown
  desired_role?: unknown
  keywords?: unknown
  notes?: unknown
  file_url?: unknown
  file_name?: unknown
  file_content_type?: unknown
}

async function createFromFields(
  sessionUser: string,
  fields: {
    candidateName: string
    email: string | null
    phone: string | null
    desiredRole: string | null
    keywordsRaw: readonly string[]
    notes: string | null
    fileUrl: string
    fileName: string | null
    fileContentType: string | null
  },
) {
  if (!fields.candidateName.trim() || !fields.fileUrl.trim()) {
    return err('Nome e arquivo são obrigatórios', 400)
  }

  const curriculo = await createCurriculo({
    candidateName: fields.candidateName,
    email: fields.email,
    phone: fields.phone,
    desiredRole: fields.desiredRole,
    fileUrl: fields.fileUrl,
    fileName: fields.fileName,
    fileContentType: fields.fileContentType,
    keywords: normalizeKeywords(fields.keywordsRaw),
    notes: fields.notes,
    createdByEmail: sessionUser,
  })
  return ok({ curriculo }, undefined, 201)
}

function keywordsFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return value.split(/[,;]+/)
  return []
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseCurriculos(auth.session)) return err('Acesso restrito a Currículos', 403)

  const contentType = req.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File) || file.size <= 0) {
        return err('Anexe o PDF ou imagem do currículo', 400)
      }
      if (file.size > CURRICULO_SERVER_UPLOAD_MAX_BYTES) {
        return err(
          'Arquivo acima de 4 MB — use PDF mais leve ou tente de novo (upload direto).',
          413,
        )
      }

      const fileName = safeCurriculoFileName(file.name || 'curriculo.pdf')
      const resolvedType = guessCurriculoContentType(fileName, file.type || null)
      if (!isAllowedCurriculoContentType(resolvedType, fileName)) {
        return err('Formato inválido. Use PDF, JPG, PNG, WEBP ou HEIC.', 400)
      }
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return err('Upload indisponível: BLOB_READ_WRITE_TOKEN não configurado', 503)
      }

      const blob = await put(curriculoBlobPathname(fileName), file, {
        access: 'public',
        addRandomSuffix: true,
        contentType: resolvedType,
      })

      return createFromFields(auth.session.user, {
        candidateName: String(form.get('candidate_name') ?? ''),
        email: String(form.get('email') ?? '').trim() || null,
        phone: String(form.get('phone') ?? '').trim() || null,
        desiredRole: String(form.get('desired_role') ?? '').trim() || null,
        keywordsRaw: keywordsFromUnknown(form.get('keywords')),
        notes: String(form.get('notes') ?? '').trim() || null,
        fileUrl: blob.url,
        fileName,
        fileContentType: resolvedType,
      })
    }

    const body = (await req.json().catch(() => null)) as CreateBody | null
    if (!body || typeof body !== 'object') return err('Dados inválidos', 400)

    const fileUrl = typeof body.file_url === 'string' ? body.file_url : ''
    if (fileUrl.trim() && !isAllowedCurriculoFileUrl(fileUrl)) {
      return err('URL do arquivo inválida', 400)
    }

    return createFromFields(auth.session.user, {
      candidateName: typeof body.candidate_name === 'string' ? body.candidate_name : '',
      email: typeof body.email === 'string' ? body.email : null,
      phone: typeof body.phone === 'string' ? body.phone : null,
      desiredRole: typeof body.desired_role === 'string' ? body.desired_role : null,
      keywordsRaw: keywordsFromUnknown(body.keywords),
      notes: typeof body.notes === 'string' ? body.notes : null,
      fileUrl,
      fileName: typeof body.file_name === 'string' ? body.file_name : null,
      fileContentType:
        typeof body.file_content_type === 'string' ? body.file_content_type : null,
    })
  } catch (error) {
    console.error('[curriculos/POST]', error instanceof Error ? error.message : error)
    return err(error instanceof Error ? error.message : 'Falha ao criar currículo', 400)
  }
}
