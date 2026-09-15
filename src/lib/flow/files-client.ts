import type { StoredFile } from '@/lib/flow/types'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_DATA_URL_CHARS = 1_400_000
const MAX_IMAGE_EDGE = 1600

export function fileHref(file: StoredFile): string {
  return file.url || file.dataUrl || ''
}

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    image.src = src
  })
}

function dataUrlToFile(dataUrl: string, name: string, type: string): File {
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new File([bytes], name, { type })
}

async function compressImage(file: File): Promise<File> {
  const original = await readDataUrl(file)
  const image = await loadImage(original)
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar a imagem.')
  context.drawImage(image, 0, 0, width, height)
  let quality = 0.72
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  while (dataUrl.length > MAX_DATA_URL_CHARS && quality > 0.4) {
    quality -= 0.1
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error('A imagem continua grande demais. Tente outra foto mais leve.')
  }
  const name = `${file.name.replace(/\.[^.]+$/, '') || 'comprovante'}.jpg`
  return dataUrlToFile(dataUrl, name, 'image/jpeg')
}

async function prepareUploadFile(file: File): Promise<File> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('O arquivo deve ter no máximo 10 MB.')
  }
  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
    return compressImage(file)
  }
  const dataUrl = await readDataUrl(file)
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error('Este PDF está grande demais. Envie um arquivo de até 1 MB ou uma foto da nota.')
  }
  return file
}

export async function fileToStored(file: File): Promise<StoredFile> {
  const prepared = await prepareUploadFile(file)
  const dataUrl = await readDataUrl(prepared)
  return {
    name: prepared.name,
    size: prepared.size,
    type: prepared.type || file.type,
    dataUrl,
  }
}
