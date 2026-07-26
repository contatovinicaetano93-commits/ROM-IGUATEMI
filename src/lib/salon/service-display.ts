/** Exibição honesta de serviços Avec (nome com preço de tabela ≠ ticket real). */

/** Remove sufixo de preço de tabela ("CORTE P - 400,00" → "CORTE P"). */
export function displayServiceName(name: string): string {
  const cleaned = String(name ?? '')
    .replace(/\s*[-–—]\s*R?\$?\s*[\d.]+,\d{2}\s*$/i, '')
    .replace(/\s*[-–—]\s*R?\$?\s*[\d.]+(?:\.\d{2})?\s*$/i, '')
    .trim()
  return cleaned || String(name ?? '').trim()
}

/** Ticket médio real = faturamento ÷ quantidade (não o preço no nome). */
export function serviceTicketAvg(revenue: number, quantity: number): number | null {
  const q = Number(quantity) || 0
  const r = Number(revenue) || 0
  if (q <= 0 || r < 0) return null
  return Math.round((r / q) * 100) / 100
}
