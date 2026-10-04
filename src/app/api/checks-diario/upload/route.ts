import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { hasPanelModule, parseGrantableModules } from '@/lib/intranet/modules'

function canUseChecks(session: { role: string; modules?: unknown }): boolean {
  const role = session.role as 'admin' | 'staff' | 'financeiro' | 'estoque' | 'mkt'
  return hasPanelModule(role, parseGrantableModules(session.modules), 'checks_diario')
}

export async function POST(request: NextRequest) {
  const auth = await requireSession(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }
  if (!canUseChecks(auth.session)) {
    return NextResponse.json({ error: 'Acesso restrito a Checks diários' }, { status: 403 })
  }

  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
        addRandomSuffix: true,
        maximumSizeInBytes: 8 * 1024 * 1024,
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
