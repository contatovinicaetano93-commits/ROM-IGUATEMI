import 'server-only'

import { put } from '@vercel/blob'
import type { StoredFile } from '@/lib/flow/types'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_DATA_URL_CHARS = 1_400_000

function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'arquivo'
}

export function publicStoredFile(file: StoredFile | null): StoredFile | null {
  if (!file) return null
  if (file.url) {
    return { name: file.name, size: file.size, type: file.type, url: file.url }
  }
  return file
}

export async function persistStoredFile(file: StoredFile | null, folder: string): Promise<StoredFile | null> {
  if (!file) return null
  if (file.url) return publicStoredFile(file)
  if (!file.dataUrl) throw new Error('Arquivo inválido.')
  if (!blobEnabled()) {
    if (file.dataUrl.length > MAX_DATA_URL_CHARS) {
      throw new Error('Este arquivo está grande demais. Envie um PDF menor ou uma foto.')
    }
    return file
  }
  const comma = file.dataUrl.indexOf(',')
  const base64 = comma >= 0 ? file.dataUrl.slice(comma + 1) : file.dataUrl
  const body = Buffer.from(base64, 'base64')
  const contentType = file.type || 'application/octet-stream'
  const blob = await put(`romflow/${folder}/${crypto.randomUUID()}-${safeName(file.name)}`, body, {
    access: 'public',
    addRandomSuffix: true,
    contentType,
  })
  return { name: file.name, size: file.size, type: contentType, url: blob.url }
}

export { MAX_UPLOAD_BYTES }
