import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { occupancyMergeKey } from '@/lib/director-report/match-pro'
import { listDirectorReportProfessionals } from '@/lib/director-report/professionals'
import { listEmployees } from '@/lib/employees'

/**
 * Roster de piso da unidade (cabelo/maquiagem) para vincular acesso na Gestão de usuário.
 * Marca quem já tem `professional_name` ligado a um colaborador.
 */
export async function GET(_req: NextRequest) {
  const auth = await requireSession(_req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (auth.session.role !== 'admin') return err('Apenas admin', 403)

  const roster = listDirectorReportProfessionals(true)
  const employees = await listEmployees()
  const linkedByKey = new Map<string, { employee_id: string; email: string; name: string }>()
  for (const person of employees) {
    const key = person.professional_name ? occupancyMergeKey(person.professional_name) : ''
    if (!key || linkedByKey.has(key)) continue
    linkedByKey.set(key, {
      employee_id: person.id,
      email: person.email,
      name: person.name,
    })
  }

  const professionals = roster
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((pro) => {
      const linked = linkedByKey.get(occupancyMergeKey(pro.name)) ?? null
      return {
        id: pro.id,
        name: pro.name,
        avec_pro_id: pro.avec_pro_id,
        role: pro.role,
        linked_employee_id: linked?.employee_id ?? null,
        linked_email: linked?.email ?? null,
        linked_name: linked?.name ?? null,
      }
    })

  return ok({ professionals })
}
