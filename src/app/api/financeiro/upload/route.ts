import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest, NextResponse } from 'next/server'
import { requireFinance } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const auth = await requireFinance(request)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(jsonResponse)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro no upload' }, { status: 400 })
  }
}
