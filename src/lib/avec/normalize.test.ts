import { describe, expect, it } from 'vitest'
import {
  isHairService,
  isNailService,
  normalize0011ReactivationRow,
  normalizeAppointmentRow,
  normalizeAttendanceRow,
  normalizeP1AcquisitionRow,
  normalizeP1OccupancyRow,
  normalizePhone,
  parseOptionalMoney,
  parseServiceTempoMinutes,
} from '@/lib/avec/normalize'

describe('normalizePhone', () => {
  it('normaliza celular BR com DDD', () => {
    expect(normalizePhone('(11) 99999-8888')).toBe('+5511999998888')
  })

  it('mantém número já com código do país', () => {
    expect(normalizePhone('+5511988887777')).toBe('+5511988887777')
  })

  it('retorna null para número curto', () => {
    expect(normalizePhone('12345')).toBeNull()
  })
})

describe('parseOptionalMoney', () => {
  it('parseia valor BR (string)', () => {
    expect(parseOptionalMoney('R$ 450,00')).toBe(450)
  })

  it('parseia number puro sem tratar o ponto como separador de milhar (API Avec)', () => {
    expect(parseOptionalMoney(1234.56)).toBe(1234.56)
    expect(parseOptionalMoney(120)).toBe(120)
  })

  it('retorna null quando ausente ou inválido', () => {
    expect(parseOptionalMoney(null)).toBeNull()
    expect(parseOptionalMoney('')).toBeNull()
    expect(parseOptionalMoney(0)).toBeNull()
    expect(parseOptionalMoney(-5)).toBeNull()
  })
})

describe('normalizeAppointmentRow price/professional', () => {
  it('extrai profissional e preço (string BR)', () => {
    const row = normalizeAppointmentRow({
      cliente_id: '1',
      nome_cliente: 'Ana',
      servico: 'Corte',
      data: '10/03/2026',
      hora: '14:00',
      profissional: 'Dani',
      valor: '120,00',
    })
    expect(row?.professional).toBe('Dani')
    expect(row?.price).toBe(120)
  })

  it('extrai preço quando a API manda number puro', () => {
    const row = normalizeAppointmentRow({
      cliente_id: '1',
      nome_cliente: 'Ana',
      servico: 'Corte',
      data: '10/03/2026',
      hora: '14:00',
      profissional: 'Dani',
      valor: 120.5,
    })
    expect(row?.price).toBe(120.5)
  })
})

describe('normalizeAttendanceRow price', () => {
  it('extrai preço quando presente', () => {
    const row = normalizeAttendanceRow({
      cliente_id: '1',
      nome_cliente: 'Ana',
      servico: 'Coloração',
      data: '10/03/2026',
      valor: '450,00',
      profissional: 'Walter',
    })
    expect(row?.price).toBe(450)
    expect(row?.professional).toBe('Walter')
  })

  it('lê total_visitas e ultima_visita do 0002', () => {
    const row = normalizeAttendanceRow({
      nome: 'ANA SILVIA',
      celular: '11912710555',
      total_visitas: 3,
      total_faturado: 1500,
      ultima_visita: '2026-07-24',
    })
    expect(row?.totalVisits).toBe(3)
    expect(row?.lastVisitDay).toBe('2026-07-24')
  })
})

describe('normalizeAppointmentRow 0051/0248', () => {
  it('converte hora_ini em minutos e status 0.6 → Faltou', () => {
    const row = normalizeAppointmentRow({
      salao_cliente_id: 123,
      cliente_nome: 'Maiara',
      data: '2026-07-18',
      hora_ini: 1020,
      status: 0.6,
      apelido: 'DIEGO',
      servico: 'ESCOVA - 220,00',
    })
    expect(row?.status).toBe('Faltou')
    expect(row?.professional).toBe('DIEGO')
    expect(row?.scheduledAt).toBeTruthy()
    const d = new Date(row!.scheduledAt!)
    expect(d.getHours()).toBe(17)
    expect(d.getMinutes()).toBe(0)
  })
})

describe('parseServiceTempoMinutes', () => {
  it('aceita minutos e hh:mm', () => {
    expect(parseServiceTempoMinutes(45)).toBe(45)
    expect(parseServiceTempoMinutes('1:30')).toBe(90)
    expect(parseServiceTempoMinutes(null)).toBeNull()
    expect(parseServiceTempoMinutes(0)).toBeNull()
  })
})

describe('isNailService', () => {
  it('reconhece manicure e pedicure', () => {
    expect(isNailService('Manicure completa')).toBe(true)
    expect(isNailService('Pedicure spa')).toBe(true)
    expect(isNailService('Blindagem de unhas')).toBe(true)
    expect(isNailService('Corte feminino')).toBe(false)
  })
})

describe('isHairService', () => {
  it('reconhece corte e coloração, não unha', () => {
    expect(isHairService('Corte feminino')).toBe(true)
    expect(isHairService('Coloração completa')).toBe(true)
    expect(isHairService('Escova modelada')).toBe(true)
    expect(isHairService('Manicure completa')).toBe(false)
  })
})

describe('normalize0011ReactivationRow', () => {
  it('extrai cliente no formato Excel 0011 (Title Case)', () => {
    const row = normalize0011ReactivationRow({
      Cliente: 'GABRIELLA VASSOLER',
      'E-mail': '',
      Telefone: '',
      Celular: '11964541122',
      Sexo: 'NAO ESPECIFICADO',
      'Data ultima comanda': '13/03/2026',
      Profissional: 'Dani Mariniello',
    })
    expect(row?.name).toBe('GABRIELLA VASSOLER')
    expect(row?.lastVisit).toBe('2026-03-13')
    expect(row?.professional).toBe('Dani Mariniello')
  })

  it('extrai cliente com chaves lower/snake', () => {
    const row = normalize0011ReactivationRow({
      cliente: 'GABRIELLA VASSOLER',
      email: null,
      telefone: null,
      celular: '11964541122',
      sexo: 'NAO ESPECIFICADO',
      data_ultima_comanda: '13/03/2026',
      profissional: 'Dani Mariniello',
    })
    expect(row?.name).toBe('GABRIELLA VASSOLER')
    expect(row?.mobile).toBe('11964541122')
    expect(row?.lastVisit).toBe('2026-03-13')
    expect(row?.professional).toBe('Dani Mariniello')
  })

  it('aceita linha só com taxa', () => {
    const row = normalize0011ReactivationRow({
      profissional: 'Vitor M',
      taxa_retorno: '42%',
    })
    expect(row?.returnRate).toBeCloseTo(0.42)
    expect(row?.professional).toBe('Vitor M')
  })
})

describe('normalizeP1OccupancyRow 0126', () => {
  it('lê apelido + ocupacao percentual', () => {
    const row = normalizeP1OccupancyRow({
      apelido: 'DIEGO',
      ocupacao: 67.79,
    })
    expect(row?.name).toBe('DIEGO')
    expect(row?.occupancy).toBeCloseTo(0.6779)
  })
})

describe('normalizeP1AcquisitionRow 0003', () => {
  it('usa Não informado quando canal vazio mas há clientes', () => {
    const row = normalizeP1AcquisitionRow({
      como_conheceu: null,
      qtd_clientes: 12,
    })
    expect(row).toEqual({ channel: 'Não informado', clients: 12 })
  })

  it('descarta linha sem clientes', () => {
    expect(normalizeP1AcquisitionRow({ como_conheceu: 'Instagram', qtd_clientes: 0 })).toBeNull()
  })
})
