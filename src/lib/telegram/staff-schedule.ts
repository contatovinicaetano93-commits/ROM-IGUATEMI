import { getSql } from '@/lib/db'
import { listTodayScheduleForProfessional } from '@/lib/services'
import { CATEGORY_LABEL } from '@/lib/salon/constants'

/** Vínculo chat_id (Telegram) ↔ profissional — cadastro manual (sem tela de admin por enquanto). */
export async function getLinkedProfessional(chatId: string): Promise<string | null> {
  const sql = getSql()
  const rows = (await sql`
    select professional_name from telegram_staff_links where chat_id = ${chatId} limit 1
  `) as { professional_name: string }[]
  return rows[0]?.professional_name ?? null
}

export async function formatTodayAgenda(professionalName: string): Promise<string> {
  const rows = await listTodayScheduleForProfessional(professionalName)

  if (rows.length === 0) {
    return `📅 Agenda de hoje — ${professionalName}\n\nSem atendimentos agendados para hoje.`
  }

  const lines = rows.map((r) => {
    const time = r.scheduled_at
      ? new Date(r.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '--:--'
    const category = CATEGORY_LABEL[r.category] ?? r.category
    return `${time} — ${r.contact_name ?? 'Cliente sem nome'} (${r.name}${category ? ` · ${category}` : ''})`
  })

  return `📅 Agenda de hoje — ${professionalName}\n\n${lines.join('\n')}`
}
