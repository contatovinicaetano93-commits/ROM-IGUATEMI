import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  buildFolhaTaxSpreadsheetTemplate,
  parseFolhaTaxSpreadsheet,
  parseFolhaTaxSpreadsheetAmount,
} from '@/lib/folha/tax-spreadsheet'

describe('parseFolhaTaxSpreadsheetAmount', () => {
  it('aceita número, BR e US', () => {
    expect(parseFolhaTaxSpreadsheetAmount(100.5)).toBe(100.5)
    expect(parseFolhaTaxSpreadsheetAmount('1.234,56')).toBe(1234.56)
    expect(parseFolhaTaxSpreadsheetAmount('1234,56')).toBe(1234.56)
    expect(parseFolhaTaxSpreadsheetAmount('R$ 87,90')).toBe(87.9)
    expect(parseFolhaTaxSpreadsheetAmount('')).toBeNull()
  })
})

describe('parseFolhaTaxSpreadsheet', () => {
  it('lê Profissional + DARF/DAS/Mensalidade e ignora sentinelas', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Impostos')
    ws.addRow(['Profissional', 'DARF', 'DAS', 'Mensalidade'])
    ws.addRow(['ALAN FERNADO DE ALBUQUERQUE', 100, 86.05, 120])
    ws.addRow(['Brunna Fabricio', 11.11, 22.22, 33.33]) // sentinelas
    ws.addRow(['Sem imposto', null, null, null])
    const buf = Buffer.from(await wb.xlsx.writeBuffer())

    const parsed = await parseFolhaTaxSpreadsheet(buf)
    expect(parsed.mapped.darf).toMatch(/DARF/i)
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]?.professionalName).toMatch(/ALAN/i)
    expect(parsed.rows[0]?.darf).toBe(100)
    expect(parsed.rows[0]?.das).toBe(86.05)
    expect(parsed.rows[0]?.mensalidade_contabilidade).toBe(120)
  })

  it('aceita aliases Nome / Contabilidade', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('x')
    ws.addRow(['Nome', 'Contabilidade', 'DAS'])
    ws.addRow(['Beto Fortes', 50, 200])
    const buf = Buffer.from(await wb.xlsx.writeBuffer())
    const parsed = await parseFolhaTaxSpreadsheet(buf)
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]?.mensalidade_contabilidade).toBe(50)
    expect(parsed.rows[0]?.das).toBe(200)
  })
})

describe('buildFolhaTaxSpreadsheetTemplate', () => {
  it('gera xlsx com cabeçalho canônico', async () => {
    const { buffer, filename } = await buildFolhaTaxSpreadsheetTemplate()
    expect(filename).toMatch(/\.xlsx$/)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as never)
    const row = wb.worksheets[0]?.getRow(1)
    expect(row?.getCell(1).value).toBe('Profissional')
    expect(row?.getCell(3).value).toBe('DARF')
    expect(row?.getCell(5).value).toBe('Mensalidade')
  })
})
