import { getBrand } from '@/lib/brand'
import type { DirectorReport, DirectorReportStage } from './types'
import { reactivationCsv, returnCompareCsv, revenueCompareCsv } from './csv'
import { sendDirectorReportEmail, getDirectorReportRecipients } from './email'
import { slug0011, slug0021 } from './period'
import { sendTelegramDocument, sendTelegramMessage } from '@/lib/telegram/bot'
import { formatCurrency, formatPercent } from '@/lib/salon/format'

function managementChatId() {
  return process.env.TELEGRAM_STAFF_CHAT_IDS?.split(',')[0]?.trim() || null
}

export async function deliverDirectorReport(
  report: DirectorReport,
  stage: DirectorReportStage = 'all'
) {
  const email = await sendDirectorReportEmail(report, stage)
  const unitName = getBrand().displayName

  let telegram: { ok: boolean; error?: string; chat?: string } | null = null
  const chat = managementChatId()
  if (chat && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const lines = [
        report.source === 'mock'
          ? `${unitName} · Relatório diretoria [DEMO / mock — não usar para decisão]`
          : `${unitName} · Relatório diretoria`,
        stage === 'all' ? 'Etapas: 0011 + 0021' : `Etapa: ${stage}`,
      ]
      if (stage === '0011' || stage === 'all') {
        lines.push(`0011: ${report.period.label_0011}`)
        lines.push(`Retorno médio ${formatPercent(report.summary.avg_return_rate, 1)}`)
      }
      if (stage === '0021' || stage === 'all') {
        lines.push(`0021: ${report.period.label_0021}`)
        const revenueLabel = report.period.compare_months ? 'Fat. tri mais recente' : 'Fat.'
        lines.push(`${revenueLabel} ${formatCurrency(report.summary.total_revenue_selected_month)}`)
        lines.push(`Ticket ${formatCurrency(report.summary.avg_ticket_selected_month)}`)
      }
      lines.push(`Data ref.: ${report.period.reference_date}`)
      lines.push(
        email.ok
          ? `E-mail OK → ${email.to.join(', ')}`
          : `E-mail pendente: ${email.error}`
      )

      await sendTelegramMessage(chat, lines.join('\n'))

      if (stage === '0011' || stage === 'all') {
        const s = slug0011(report)
        await sendTelegramDocument(
          chat,
          `0011-comparativo-trimestre_${s}.csv`,
          '\uFEFF' + returnCompareCsv(report),
          `Etapa 1 · 0011 · ${report.period.label_0011}`
        )
        await sendTelegramDocument(
          chat,
          `0011-lista-clientes_${s}.csv`,
          '\uFEFF' + reactivationCsv(report),
          `Etapa 1 · lista clientes · ref. ${report.period.reference_date}`
        )
      }

      if (stage === '0021' || stage === 'all') {
        const s = slug0021(report)
        await sendTelegramDocument(
          chat,
          `0021-comparativo-trimestre_${s}.csv`,
          '\uFEFF' + revenueCompareCsv(report),
          `Etapa 2 · 0021 · ${report.period.label_0021}`
        )
      }

      telegram = { ok: true, chat }
    } catch (e) {
      telegram = { ok: false, chat, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return {
    email,
    telegram,
    recipients: getDirectorReportRecipients(),
    period: report.period,
    stage,
  }
}
