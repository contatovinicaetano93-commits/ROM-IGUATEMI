import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { canUseCurriculos } from '@/lib/curriculos/access'
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

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseCurriculos(auth.session)) return err('Acesso restrito a Currículos', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)

  const candidateName = typeof body.candidate_name === 'string' ? body.candidate_name : ''
  const fileUrl = typeof body.file_url === 'string' ? body.file_url : ''
  if (!candidateName.trim() || !fileUrl.trim()) {
    return err('Nome e arquivo são obrigatórios', 400)
  }

  const keywordsRaw = Array.isArray(body.keywords)
    ? body.keywords.map(String)
    : typeof body.keywords === 'string'
      ? body.keywords.split(/[,;]+/)
      : []

  try {
    const curriculo = await createCurriculo({
      candidateName,
      email: typeof body.email === 'string' ? body.email : null,
      phone: typeof body.phone === 'string' ? body.phone : null,
      desiredRole: typeof body.desired_role === 'string' ? body.desired_role : null,
      fileUrl,
      fileName: typeof body.file_name === 'string' ? body.file_name : null,
      fileContentType: typeof body.file_content_type === 'string' ? body.file_content_type : null,
      keywords: normalizeKeywords(keywordsRaw),
      notes: typeof body.notes === 'string' ? body.notes : null,
      createdByEmail: auth.session.user,
    })
    return ok({ curriculo }, undefined, 201)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao criar currículo', 400)
  }
}
