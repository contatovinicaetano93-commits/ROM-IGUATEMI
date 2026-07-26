/**
 * Helpers de exportação: CSV download + PDF via impressão do browser
 * (Salvar como PDF) — mesmo padrão de /relatorios e /dashboard.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Parse simples de linha CSV com `;` e aspas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ';') {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/csv;charset=utf-8',
) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Abre HTML e dispara diálogo de impressão (Salvar como PDF). */
export function openPrintHtml(html: string): boolean {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}

/**
 * Converte CSV (;) em HTML imprimível.
 * Linhas `=== TÍTULO ===` viram seções; demais viram tabelas.
 */
export function csvTextToPrintHtml(title: string, csv: string, subtitle?: string): string {
  const raw = csv.replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/)
  const parts: string[] = []
  let tableOpen = false

  const closeTable = () => {
    if (tableOpen) {
      parts.push('</table>')
      tableOpen = false
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      closeTable()
      continue
    }
    const section = trimmed.match(/^===?\s*(.+?)\s*===?$/)
    if (section) {
      closeTable()
      parts.push(`<h2>${escapeHtml(section[1]!.replace(/^=+\s*|\s*=+$/g, '').trim())}</h2>`)
      continue
    }
    const cells = splitCsvLine(line)
    if (!tableOpen) {
      parts.push('<table>')
      tableOpen = true
    }
    const isHeaderish =
      cells.length >= 2 &&
      cells.every((c) => c.length < 40) &&
      !/^R\$\s/.test(cells[1] ?? '') &&
      cells.some((c) => /^(Indicador|Métrica|Método|Forma|Dia|Data|Nome|Profissional|Termo|Campo|Serviço|Canal|Pacote)/i.test(c))
    if (isHeaderish) {
      parts.push(
        `<tr>${cells.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`,
      )
    } else {
      parts.push(
        `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`,
      )
    }
  }
  closeTable()

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; margin: 32px; line-height: 1.4; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; margin: 24px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
  td, th { text-align: left; padding: 4px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; color: #666; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${subtitle ? `<div class="meta">${escapeHtml(subtitle)}</div>` : ''}
  ${parts.join('\n')}
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
</body>
</html>`
}

/** Baixa CSV e, em seguida, pode abrir o mesmo conteúdo como PDF. */
export async function openCsvAsPdf(title: string, csv: string, subtitle?: string): Promise<boolean> {
  return openPrintHtml(csvTextToPrintHtml(title, csv, subtitle))
}
