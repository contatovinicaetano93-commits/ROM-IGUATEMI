import type { DirectorProfessional } from './types'

/**
 * Equipe ROM Iguatemi — PREENCHER com o roster real da unidade.
 * Enquanto vazio, o relatório de diretoria roda em modo mock sem nenhum
 * profissional listado (summary.professionals = 0). Copie o padrão de
 * BRASIL_DIRECTOR_PROFESSIONALS (ROM/src/lib/director-report/professionals.ts)
 * e troque pelos nomes/IDs Avec da equipe do Iguatemi.
 */
export const IGUATEMI_DIRECTOR_PROFESSIONALS: DirectorProfessional[] = []

export function listDirectorProfessionals(activeOnly = true) {
  return IGUATEMI_DIRECTOR_PROFESSIONALS.filter((p) => (activeOnly ? p.active : true))
}
