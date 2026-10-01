import { NextRequest } from 'next/server'
import { z } from 'zod'
import { err, handleError, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getRomPanelId } from '@/lib/brand'
import { canAccessFolha } from '@/lib/folha/access'
import { patchFolhaLine } from '@/lib/folha/service'

const extrasSchema = z.object({
  parc: z.number().nullable().optional(),
  darf: z.number().nullable().optional(),
  das: z.number().nullable().optional(),
  div_ativa: z.number().nullable().optional(),
  mensalidade_contabilidade: z.number().nullable().optional(),
  descontos_diversos: z.number().nullable().optional(),
  produtos_black: z.number().nullable().optional(),
  servicos_assistente_como_pro: z.number().nullable().optional(),
  valor_a_pagar_profissional: z.number().nullable().optional(),
  taxa_servicos: z.number().nullable().optional(),
  taxa_adm_assistente: z.number().nullable().optional(),
  taxa_administrativa: z.number().nullable().optional(),
  esteticista_bonus: z.number().nullable().optional(),
  /** Acumulado mensal assistente Romeu → faixa 30/40/50. */
  acumulado_mes: z.number().nullable().optional(),
  romeu_comissao_parcela: z.number().nullable().optional(),
})

const bodySchema = z.object({
  period_id: z.string().min(1),
  professional_name: z.string().min(1),
  extras: extrasSchema,
})

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)
    if (!canAccessFolha(auth.session)) return err('Acesso restrito à Folha de pagamento', 403)

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return err(parsed.error.issues.map((i) => i.message).join(', '), 422)

    const { draft, period } = await patchFolhaLine(getRomPanelId(), {
      periodId: parsed.data.period_id,
      professionalName: parsed.data.professional_name,
      extras: parsed.data.extras,
      actor: auth.session.user,
    })

    return ok({ draft, period_id: period.id, period_status: period.status })
  } catch (e) {
    if (e instanceof Error && /não encontrado|já pago/i.test(e.message)) {
      return err(e.message, 400)
    }
    return handleError(e)
  }
}
