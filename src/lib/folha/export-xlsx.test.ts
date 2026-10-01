import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import type { FolhaDraft } from '@/lib/folha/draft-from-8123'
import {
  buildFolhaWorkbook,
  exportMagnitude,
  folhaExportFilename,
  folhaLineToExportRow,
  FOLHA_EXPORT_HEADERS,
} from '@/lib/folha/export-xlsx'
import { quinzenaForDay } from '@/lib/folha/period'

const sampleDraft: FolhaDraft = {
  source: '8123',
  reference_day: '2026-09-30',
  quinzena: quinzenaForDay('2026-09-20'),
  panel: 'brasil',
  line_count: 2,
  total_proposed_pay: 6032.64,
  lines: [
    {
      name: 'JEFFERSON POLICARPO DOS SANTOS',
      cargo_raw: 'MULTIPLICADOR',
      cargo: 'multiplicador',
      avec: {
        charged: 12000,
        service_share: null,
        product_share: null,
        house_share: 4000,
        card_fee: null,
        admin_fee: null,
        assistant_discount: -150,
        product_spend: -114.12,
        other_discounts: -707.19,
        tip: 50,
        net_payable: 6032.64,
      },
      meio_a_meio: 75,
      meio_a_meio_rate: 0.5,
      taxa_administrativa: null,
      taxa_administrativa_rate: null,
      taxa_administrativa_source: null,
      outros_descontos: 707.19,
      rateio_apos_cartao: null,
      exception_id: 'romeu_assistant',
      folha_extras: {
        parc: null,
        darf: null,
        das: null,
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
      proposed_pay: 6032.64,
      formula_y_preview: null,
      flags: ['assistente_com_desconto', 'assistente_romeu', 'excecao_nomeada'],
    },
    {
      name: 'Sem Pagamento',
      cargo_raw: 'Manicure',
      cargo: 'manicure',
      avec: {
        charged: 100,
        service_share: null,
        product_share: null,
        house_share: null,
        card_fee: null,
        admin_fee: null,
        assistant_discount: null,
        product_spend: null,
        other_discounts: null,
        tip: null,
        net_payable: null,
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
      proposed_pay: null,
      formula_y_preview: null,
      flags: ['sem_a_pagar'],
    },
  ],
}

describe('exportMagnitude', () => {
  it('abs de negativo; null permanece null', () => {
    expect(exportMagnitude(-150)).toBe(150)
    expect(exportMagnitude(null)).toBeNull()
  })
})

describe('folhaLineToExportRow', () => {
  it('mapeia colunas Maykon + extras', () => {
    const row = folhaLineToExportRow(sampleDraft.lines[0]!)
    expect(row).toHaveLength(FOLHA_EXPORT_HEADERS.length)
    expect(row[0]).toBe('JEFFERSON POLICARPO DOS SANTOS')
    expect(row[7]).toBe(150) // Assistente
    expect(row[8]).toBe(75) // Meio a meio
    expect(row[10]).toBe(707.19) // Outros (olerite)
    expect(row[20]).toBeNull() // Acumulado mês Romeu
    expect(row[21]).toBeNull() // Parcela Romeu
    expect(row[22]).toBe(6032.64) // Líquido
    expect(row[23]).toBe('romeu_assistant')
  })
})

describe('buildFolhaWorkbook', () => {
  it('gera xlsx legível com header e filtro onlyWithPay', async () => {
    expect(folhaExportFilename(sampleDraft, 'brasil')).toBe(
      `folha-brasil-${sampleDraft.quinzena.id}.xlsx`,
    )

    const all = await buildFolhaWorkbook(sampleDraft, { panel: 'brasil' })
    expect(all.filename).toMatch(/\.xlsx$/)
    expect(all.buffer.byteLength).toBeGreaterThan(1000)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(all.buffer)
    const ws = wb.getWorksheet('Olerite')
    expect(ws).toBeTruthy()
    expect(ws!.getRow(3).getCell(1).value).toBe('Profissional')
    // title + meta + header + 2 lines + total = 6 rows
    expect(ws!.rowCount).toBe(6)

    const filtered = await buildFolhaWorkbook(sampleDraft, {
      panel: 'brasil',
      onlyWithPay: true,
    })
    const wb2 = new ExcelJS.Workbook()
    await wb2.xlsx.load(filtered.buffer)
    const ws2 = wb2.getWorksheet('Olerite')!
    // title + meta + header + 1 line + total = 5
    expect(ws2.rowCount).toBe(5)
    expect(ws2.getRow(4).getCell(1).value).toBe('JEFFERSON POLICARPO DOS SANTOS')
  })
})
