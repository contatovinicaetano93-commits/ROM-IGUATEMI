import { NextRequest } from 'next/server'
import { err } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { blobProxyResponse } from '@/lib/blob/private'
import { canUseCurriculos } from '@/lib/curriculos/access'
import { isAllowedCurriculoFileUrl } from '@/lib/curriculos/file'
import { getCurriculoById } from '@/lib/curriculos/store'

type Ctx = { params: Promise<{ id: string }> }

/** Download autenticado de CV (blob privado ou legado público). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseCurriculos(auth.session)) return err('Acesso restrito a Currículos', 403)

  const { id } = await ctx.params
  if (!id) return err('Id inválido', 400)

  try {
    const curriculo = await getCurriculoById(id)
    if (!curriculo?.file_url) return err('Currículo não encontrado', 404)
    if (!isAllowedCurriculoFileUrl(curriculo.file_url)) {
      return err('URL do arquivo inválida', 400)
    }
    return blobProxyResponse(curriculo.file_url)
  } catch (error) {
    console.error('[curriculos/file]', error instanceof Error ? error.message : error)
    return err(error instanceof Error ? error.message : 'Falha ao abrir arquivo', 500)
  }
}
