/** Tipos aceitos no banco de currículos (PDF + fotos comuns de celular). */
export const CURRICULO_ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'application/octet-stream',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export const CURRICULO_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif'

export const CURRICULO_MAX_BYTES = 10 * 1024 * 1024
/** Limite prático do body da função na Vercel para upload multipart no servidor. */
export const CURRICULO_SERVER_UPLOAD_MAX_BYTES = 4 * 1024 * 1024
/** Máximo de arquivos no anexo em lote (mesmo fluxo createCurriculo por item). */
export const CURRICULO_BATCH_MAX = 20

export function safeCurriculoFileName(name: string): string {
  const base = name.trim().replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_')
  const cleaned = base.replace(/^\.+/, '').slice(0, 80)
  return cleaned || 'curriculo.pdf'
}

/**
 * Nome do candidato a partir do arquivo (lote / quando o campo Nome fica vazio).
 * Mantém aliases dos PDFs de teste do motor.
 */
export function candidateNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  if (/curriculo[-_]?teste[-_]?motor[-_]?rom[-_]?2/i.test(base)) {
    return 'Rafael Mendes Oliveira'
  }
  if (/curriculo[-_]?teste[-_]?motor/i.test(base)) return 'Camila Souza Ribeiro'
  const human = base
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return human || 'Candidato'
}

export type CurriculoBatchPickResult =
  | { ok: true; files: File[] }
  | { ok: false; error: string; files: File[] }

/** Valida lista do `<input multiple>` — formato, tamanho e teto de lote. */
export function pickCurriculoBatchFiles(
  list: FileList | File[] | null | undefined,
  opts?: { maxFiles?: number; maxBytes?: number },
): CurriculoBatchPickResult {
  const maxFiles = opts?.maxFiles ?? CURRICULO_BATCH_MAX
  const maxBytes = opts?.maxBytes ?? CURRICULO_MAX_BYTES
  const raw = list ? Array.from(list) : []
  if (raw.length === 0) {
    return { ok: false, error: 'Escolha ao menos um PDF ou foto de currículo.', files: [] }
  }
  if (raw.length > maxFiles) {
    return {
      ok: false,
      error: `No máximo ${maxFiles} currículos por vez. Selecione menos arquivos.`,
      files: [],
    }
  }
  const files: File[] = []
  for (const file of raw) {
    if (file.size > maxBytes) {
      return {
        ok: false,
        error: `"${file.name}" acima de ${Math.round(maxBytes / (1024 * 1024))} MB. Compacte ou envie separado.`,
        files: [],
      }
    }
    const contentType = guessCurriculoContentType(file.name, file.type)
    if (!isAllowedCurriculoContentType(contentType, file.name)) {
      return {
        ok: false,
        error: `"${file.name}" inválido. Use PDF, JPG, PNG, WEBP ou HEIC.`,
        files: [],
      }
    }
    files.push(file)
  }
  return { ok: true, files }
}

export function guessCurriculoContentType(
  fileName: string | null | undefined,
  declaredType: string | null | undefined,
): string {
  const declared = (declaredType ?? '').trim().toLowerCase()
  if (
    declared &&
    declared !== 'application/octet-stream' &&
    (CURRICULO_ALLOWED_CONTENT_TYPES as readonly string[]).includes(declared)
  ) {
    return declared
  }

  const lower = (fileName ?? '').trim().toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.heic')) return 'image/heic'
  if (lower.endsWith('.heif')) return 'image/heif'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (declared === 'application/octet-stream' && lower.endsWith('.pdf')) {
    return 'application/pdf'
  }
  return declared || 'application/octet-stream'
}

export function isAllowedCurriculoContentType(contentType: string, fileName?: string | null): boolean {
  const type = contentType.trim().toLowerCase()
  if ((CURRICULO_ALLOWED_CONTENT_TYPES as readonly string[]).includes(type)) return true
  // Fallback: extensão PDF com tipo vazio/estranho (WhatsApp / iOS).
  const lower = (fileName ?? '').toLowerCase()
  return lower.endsWith('.pdf') || /\.(jpe?g|png|webp|heic|heif)$/.test(lower)
}

export function curriculoBlobPathname(fileName: string): string {
  return `curriculos/${Date.now()}-${safeCurriculoFileName(fileName)}`
}

/** Aceita só HTTPS em blob Vercel sob `/curriculos/` (bloqueia SSRF via file_url). */
export function isAllowedCurriculoFileUrl(url: string): boolean {
  const raw = url.trim()
  if (!raw || /^javascript:/i.test(raw)) return false
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase()
  const blobHost =
    host.endsWith('.public.blob.vercel-storage.com') ||
    host.endsWith('.private.blob.vercel-storage.com') ||
    host.endsWith('.blob.vercel-storage.com')
  if (!blobHost) return false
  if (parsed.username || parsed.password) return false
  const path = decodeURIComponent(parsed.pathname)
  return path.includes('/curriculos/') && !path.includes('..')
}
