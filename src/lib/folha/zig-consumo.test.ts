import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import type { FolhaDraftLine } from '@/lib/folha/draft-from-8123'
import {
  aggregateZigEmployeeConsumo,
  isZigEmployeeConsumoTx,
  matchZigSpendToFolhaName,
  planZigConsumoBaruExtras,
  stripProfissionalTag,
  zigBaruAlreadyEmbeddedIn8123,
  zigCentsToReais,
  ZIG_PLACE_ID_BY_PANEL,
} from '@/lib/folha/zig-consumo'
import { zigWindowForQuinzenaDays } from '@/lib/folha/zig-client'

describe('zigCentsToReais / tags', () => {
  it('converte centavos e limpa tag profissional', () => {
    expect(zigCentsToReais(21924)).toBe(219.24)
    expect(stripProfissionalTag('Vitória Farias ( profissional)')).toBe(
      'Vitória Farias',
    )
  })
})

describe('isZigEmployeeConsumoTx', () => {
  it('aceita tag profissional e desconto ~15%', () => {
    expect(
      isZigEmployeeConsumoTx({
        date: '2026-09-20T12:00:00',
        name: 'Pedro Diello (profissional)',
        value: 1000,
      }),
    ).toBe(true)
    expect(
      isZigEmployeeConsumoTx({
        date: '2026-09-20T12:00:00',
        name: 'Cliente',
        value: 1729,
        grossValue: 2034,
        discount: 305,
      }),
    ).toBe(true)
    expect(
      isZigEmployeeConsumoTx({
        date: '2026-09-20T12:00:00',
        name: 'Cliente',
        value: 1000,
        isRefunded: true,
      }),
    ).toBe(false)
  })
})

describe('aggregate + match', () => {
  it('soma por profissional e casa com nome Folha', () => {
    const spends = aggregateZigEmployeeConsumo(
      [
        {
          date: '2026-09-20T10:00:00',
          name: 'VITÓRIA FARIAS ( profissional)',
          value: 10000,
        },
        {
          date: '2026-09-21T10:00:00',
          name: 'VITÓRIA FARIAS (profissional)',
          value: 11924,
        },
        {
          date: '2026-09-10T10:00:00',
          name: 'VITÓRIA FARIAS (profissional)',
          value: 5000,
        },
      ],
      { fromIso: '2026-09-16', toIso: '2026-09-30' },
    )
    expect(spends).toHaveLength(1)
    expect(spends[0]!.paidReais).toBeCloseTo(219.24, 2)
    const hit = matchZigSpendToFolhaName(
      'VITORIA CAROLINA FARIAS LAVRADOR',
      spends,
    )
    expect(hit?.paidReais).toBeCloseTo(219.24, 2)
  })
})

describe('planZigConsumoBaruExtras', () => {
  const baseLine = {
    name: 'VITORIA CAROLINA FARIAS LAVRADOR',
    cargo_raw: 'Manicure',
    cargo: 'manicure' as const,
    avec: {
      charged: 1000,
      service_share: null,
      product_share: null,
      house_share: null,
      card_fee: null,
      admin_fee: null,
      assistant_discount: null,
      product_spend: null,
      other_discounts: null,
      tip: null,
      net_payable: 800,
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
      darf: null,
      das: null,
      div_ativa: null,
      mensalidade_contabilidade: null,
      descontos_diversos: null,
      consumo_baru: null,
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
    proposed_pay: 800,
    formula_y_preview: null,
    flags: [],
  } satisfies FolhaDraftLine

  it('aplica consumo_baru e pula embutido / manual', () => {
    const spends = aggregateZigEmployeeConsumo([
      {
        date: '2026-09-20T10:00:00',
        name: 'VITÓRIA FARIAS (profissional)',
        value: 21924,
      },
    ])
    const { patches, report } = planZigConsumoBaruExtras([baseLine], spends)
    expect(patches[0]?.extras.consumo_baru).toBe(219.24)
    expect(report.applied).toHaveLength(1)

    const manual = {
      ...baseLine,
      folha_extras: { ...baseLine.folha_extras, consumo_baru: 10 },
    }
    const skipManual = planZigConsumoBaruExtras([manual], spends)
    expect(skipManual.patches).toHaveLength(0)
    expect(skipManual.report.skipped_manual).toContain(baseLine.name)

    const embedded = {
      ...baseLine,
      outros_descontos: 219.24,
    }
    expect(zigBaruAlreadyEmbeddedIn8123(embedded, 219.24)).toBe(true)
    const embPlan = planZigConsumoBaruExtras([embedded], spends)
    // Preenche coluna Baru mesmo embutido; motor não reabate no rebuild.
    expect(embPlan.patches[0]?.extras.consumo_baru).toBe(219.24)
    expect(embPlan.report.skipped_embedded).toContain(baseLine.name)
    expect(embPlan.report.applied).toHaveLength(0)
  })
})

describe('zigWindowForQuinzenaDays', () => {
  it('abre 03:00 no from e fecha 02:59 no dia seguinte ao to', () => {
    expect(zigWindowForQuinzenaDays('2026-09-16', '2026-09-30')).toEqual({
      sinceIso: '2026-09-16T03:00:00.000',
      untilIso: '2026-10-01T02:59:59.999',
    })
  })
})

describe('place ids', () => {
  it('mapeia painéis para places dos samples', () => {
    expect(ZIG_PLACE_ID_BY_PANEL.brasil).toMatch(/^d5340303/)
    expect(ZIG_PLACE_ID_BY_PANEL.iguatemi).toMatch(/^eb40fde9/)
  })
})

describe('sample detailed-transactions IG Q2 (se upload presente)', () => {
  const samplePath =
    '/home/ubuntu/.cursor/projects/agent/uploads/detailed-transactions-samples_dc0d.json'
  const itf = existsSync(samplePath) ? it : it.skip

  itf('agrega Vitória Farias = 219.24 na janela Q2', () => {
    const all = JSON.parse(readFileSync(samplePath, 'utf8')) as Record<
      string,
      { data: Array<Record<string, unknown>> }
    >
    const ig = ZIG_PLACE_ID_BY_PANEL.iguatemi
    const txs = (all[ig]?.data ?? []).map((t) => ({
      date: String(t.date ?? ''),
      name: t.name as string | null,
      value: t.value as number | null,
      grossValue: t.grossValue as number | null,
      discount: t.discount as number | null,
      isRefunded: t.isRefunded as boolean | null,
    }))
    const spends = aggregateZigEmployeeConsumo(txs, {
      fromIso: '2026-09-16',
      toIso: '2026-09-30',
    })
    const vitoria = matchZigSpendToFolhaName(
      'VITORIA CAROLINA FARIAS LAVRADOR',
      spends,
    )
    expect(vitoria?.paidReais).toBeCloseTo(219.24, 2)
  })
})
