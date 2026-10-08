import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { canUseCurriculos } from '@/lib/curriculos/access'
import {
  CURRICULO_ALLOWED_CONTENT_TYPES,
  CURRICULO_MAX_BYTES,
} from '@/lib/curriculos/file'

export async function POST(request: NextRequest) {
  const auth = await requireSession(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }
  if (!canUseCurriculos(auth.session)) {
    return NextResponse.json({ error: 'Acesso restrito a Currículos' }, { status: 403 })
  }

  const body = (await request.json()) as HandleUploadBody

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: 'Upload indisponível: BLOB_READ_WRITE_TOKEN não configurado' },
        { status: 503 },
      )
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...CURRICULO_ALLOWED_CONTENT_TYPES],
        addRandomSuffix: true,
        maximumSizeInBytes: CURRICULO_MAX_BYTES,
      }),
    })
    return NextResponse.json(jsonResponse)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro no upload'
    console.error('[curriculos/upload]', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
