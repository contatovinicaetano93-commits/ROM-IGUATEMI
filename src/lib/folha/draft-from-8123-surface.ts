/**
 * Client-safe Folha display helpers.
 * Keep free of db / commission-metrics — the Folha page is 'use client'.
 */

/** Campos da coluna Fat. — estrutural, para não importar o módulo server. */
type FolhaFaturadoLine = {
  folha_extras: { faturado_referencia: number | null }
  avec: { charged: number | null }
}

/**
 * Fat. na UI/export: olerite/Fopag Total Faturado quando o RH/reenrich
 * informou; senão o `valor_cobrado` Avec (8123).
 * Não alimenta adm/meio — só a coluna de conferência.
 */
export function folhaFaturadoDisplay(line: FolhaFaturadoLine): number | null {
  const ref = line.folha_extras.faturado_referencia
  if (ref != null && !Number.isNaN(ref)) return ref
  return line.avec.charged
}
