import { describe, expect, it } from 'vitest'
import { csvTextToPrintHtml } from './csv-print'

describe('csvTextToPrintHtml', () => {
  it('gera HTML com título e tabela a partir do CSV', () => {
    const csv = ['=== RESUMO ===', 'Indicador;Valor', 'Receita;1000', 'Atendidos;12'].join('\n')
    const html = csvTextToPrintHtml('Teste PDF', csv, 'sub')
    expect(html).toContain('<h1>Teste PDF</h1>')
    expect(html).toContain('<h2>RESUMO</h2>')
    expect(html).toContain('<th>Indicador</th>')
    expect(html).toContain('<td>Receita</td>')
    expect(html).toContain('window.print()')
  })
})
