import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { canUseCurriculos } from '@/lib/curriculos/access'

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
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/webp',
        ],
        addRandomSuffix: true,
        maximumSizeInBytes: 10 * 1024 * 1024,
      }),
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(jsonResponse)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro no upload' },
      { status: 400 },
    )
  }
}
