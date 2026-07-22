// Dados fictícios para testar sync sem AVEC_API_TOKEN (AVEC_MOCK=1).

export const MOCK_CLIENTS = [
  {
    cliente_id: 'mock-001',
    nome: 'Ana Paula Silva',
    celular: '11987654321',
    email: 'ana.demo@email.com',
  },
  {
    cliente_id: 'mock-002',
    nome: 'Carlos Mendes',
    celular: '11976543210',
    email: 'carlos.demo@email.com',
  },
  {
    cliente_id: 'mock-003',
    nome: 'Juliana Costa',
    celular: '11965432109',
    email: 'juliana.demo@email.com',
  },
]

export function mockAppointments() {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(14, 0, 0, 0)
  const d = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}/${tomorrow.getFullYear()}`

  return [
    {
      cliente_id: 'mock-001',
      nome_cliente: 'Ana Paula Silva',
      celular: '11987654321',
      servico: 'Hidratação profunda',
      data: d,
      hora: '14:00',
      profissional: 'Dani Mariniello',
      valor: '280,00',
      status: 'agendado',
    },
    {
      cliente_id: 'mock-002',
      nome_cliente: 'Carlos Mendes',
      celular: '11976543210',
      servico: 'Corte masculino',
      data: d,
      hora: '16:30',
      profissional: 'Walter',
      valor: '120,00',
      status: 'agendado',
    },
  ]
}

export function mockAttendances() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const d = `${String(yesterday.getDate()).padStart(2, '0')}/${String(yesterday.getMonth() + 1).padStart(2, '0')}/${yesterday.getFullYear()}`

  return [
    {
      cliente_id: 'mock-003',
      nome_cliente: 'Juliana Costa',
      celular: '11965432109',
      servico: 'Coloração completa',
      data: d,
      hora: '11:00',
      profissional: 'Dani Mariniello',
      valor: '450,00',
    },
  ]
}

export function mockRevenue() {
  const today = new Date()
  const d = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
  return [{ data: d, faturamento: '4.280,00', atendimentos: '8' }]
}

export function mockCancellations() {
  const today = new Date()
  const d = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
  return [
    { data: d, status: 'cancelado' },
    { data: d, status: 'falta' },
  ]
}

export function mockPayments() {
  return [
    { forma_pagamento: 'Pix', valor: '1.200,00' },
    { forma_pagamento: 'Cartão', valor: '2.500,00' },
    { forma_pagamento: 'Dinheiro', valor: '580,00' },
  ]
}

export function getMockReport(reportId: string, page = 1) {
  if (page > 1) return { data: [] }

  if (reportId === '0004') return { data: MOCK_CLIENTS }
  if (reportId === '0051') return { data: mockAppointments() }
  if (reportId === '0002') return { data: mockAttendances() }
  if (reportId === '0081') return { data: mockPayments() }
  if (reportId === 'revenue' || reportId === process.env.AVEC_REPORT_REVENUE) return { data: mockRevenue() }
  if (reportId === 'cancellations' || reportId === process.env.AVEC_REPORT_CANCELLATIONS)
    return { data: mockCancellations() }
  return { data: [] }
}
