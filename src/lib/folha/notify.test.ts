import { describe, expect, it } from 'vitest'
import { buildFolhaNotifyHtml, getFolhaNotifyRecipients } from '@/lib/folha/notify'
import type { FolhaDraft } from '@/lib/folha/draft-from-8123'

const draft: FolhaDraft = {
  source: '8123',
  reference_day: '2026-05-15',
  quinzena: {
    id: '2026-05-q1',
    label: '1ª quinzena 05/2026',
    from: '2026-05-01',
    to: '2026-05-15',
    half: 1,
    yearMonth: '2026-05',
    payDate: '2026-05-20',
  },
  panel: 'brasil',
  line_count: 1,
  total_proposed_pay: 1000,
  lines: [
    {
      name: 'Alan',
      cargo_raw: 'Cabeleireiro',
      cargo: 'cabeleireiro',
      avec: {
        charged: 2000,
        service_share: null,
        product_share: null,
        house_share: null,
        card_fee: null,
        admin_fee: null,
        assistant_discount: null,
        product_spend: null,
        other_discounts: null,
        tip: null,
        net_payable: 1000,
      },
      meio_a_meio: null,
      meio_a_meio_rate: 0.5,
      taxa_administrativa: null,
      taxa_administrativa_rate: null,
      taxa_administrativa_source: null,
      outros_descontos: null,
      rateio_apos_cartao: null,
      exception_id: null,
      folha_extras: {
        parc: null,
        darf: 10,
        das: 5,
        div_ativa: null,
        mensalidade_contabilidade: null,
        descontos_diversos: null,
        produtos_black: null,
        servicos_assistente_como_pro: null,
        valor_a_pagar_profissional: null,
        taxa_servicos: null,
        taxa_adm_assistente: null,
        taxa_administrativa: null,
        esteticista_bonus: null,
        acumulado_mes: null,
        romeu_comissao_parcela: null,
      },
      proposed_pay: 985,
      formula_y_preview: null,
      flags: [],
    },
  ],
}

describe('getFolhaNotifyRecipients', () => {
  it('parte e-mails por vírgula', () => {
    const prev = process.env.FOLHA_NOTIFY_EMAIL
    process.env.FOLHA_NOTIFY_EMAIL = 'a@x.com, b@y.com'
    expect(getFolhaNotifyRecipients()).toEqual(['a@x.com', 'b@y.com'])
    process.env.FOLHA_NOTIFY_EMAIL = prev
  })
})

describe('buildFolhaNotifyHtml', () => {
  it('inclui quinzena e total', () => {
    const { subject, html } = buildFolhaNotifyHtml({
      draft,
      status: 'approved',
      actor: 'rh',
    })
    expect(subject).toMatch(/Folha/)
    expect(subject).toMatch(/approved/)
    expect(html).toContain('1ª quinzena')
    expect(html).toContain('Alan')
    expect(html).toContain('DARF')
  })
})
