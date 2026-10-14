import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest, NextResponse } from 'next/server'
import { requireFinance } from '@/lib/auth'
import { rewriteBlobUploadError } from '@/lib/blob/access'
import { assertFinanceReceiptBlobPathname } from '@/lib/finance/receipt-url'

export async function POST(request: NextRequest) {
  const auth = await requireFinance(request)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        assertFinanceReceiptBlobPathname(pathname)
        return {
          allowedContentTypes: [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/heic',
            'application/pdf',
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 8 * 1024 * 1024,
        }
      },
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(jsonResponse)
  } catch (e) {
    return NextResponse.json(
      { error: rewriteBlobUploadError(e).message },
      { status: 400 },
    )
  }
}
