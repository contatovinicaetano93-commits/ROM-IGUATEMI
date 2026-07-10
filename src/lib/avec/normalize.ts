// Normalização defensiva — colunas dos relatórios Avec variam por unidade/versão.

function pick(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v === null || v === undefined) continue
    const s = String(v).trim()
    if (s) return s
  }
  return null
}

function pickNested(row: Record<string, unknown>, paths: string[][]): string | null {
  for (const path of paths) {
    let cur: unknown = row
    for (const p of path) {
      if (!cur || typeof cur !== 'object') {
        cur = null
        break
      }
      cur = (cur as Record<string, unknown>)[p]
    }
    if (cur !== null && cur !== undefined) {
      const s = String(cur).trim()
      if (s) return s
    }
  }
  return null
}

export function normalizePhone(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  if (digits.length === 11 || digits.length === 10) return `+55${digits}`
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`
  return `+${digits}`
}

export interface NormalizedAvecClient {
  avecClientId: string
  name: string | null
  email: string | null
  phone: string | null
}

export interface NormalizedAvecAppointment {
  avecClientId: string | null
  clientName: string | null
  phone: string | null
  email: string | null
  serviceName: string | null
  scheduledAt: string | null
  professional: string | null
  status: string | null
}

export interface NormalizedAvecAttendance {
  avecClientId: string | null
  clientName: string | null
  phone: string | null
  serviceName: string | null
  attendedAt: string | null
}

export interface NormalizedAvecRevenue {
  day: string | null
  revenue: number
  attended: number
}

export interface NormalizedAvecCancellation {
  day: string | null
  cancelled: number
  noShow: number
}

export interface NormalizedP1Professional {
  name: string
  revenue: number
  attended: number
  ticketAvg: number
  occupancy: number | null
}

export interface NormalizedP1Service {
  name: string
  quantity: number
  revenue: number
}

export interface NormalizedP1Acquisition {
  channel: string
  clients: number
}

// Tenta parsear data/hora em formatos comuns BR + ISO.
export function parseAvecDateTime(datePart: string | null, timePart?: string | null): string | null {
  if (!datePart) return null
  const d = datePart.trim()
  const t = timePart?.trim()

  if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
    const iso = t ? `${d.split('T')[0]}T${t}` : d
    const parsed = new Date(iso)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/)
  if (m) {
    const day = Number(m[1])
    const month = Number(m[2]) - 1
    let year = Number(m[3])
    if (year < 100) year += 2000
    const time = t ?? m[4] ?? '10:00'
    const [hh, mm, ss] = time.split(':').map(Number)
    const parsed = new Date(year, month, day, hh || 10, mm || 0, ss || 0)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  const parsed = new Date(d)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function normalizeClientRow(row: Record<string, unknown>): NormalizedAvecClient | null {
  const avecClientId =
    pick(row, [
      'cliente_id',
      'client_id',
      'id_cliente',
      'codigo_cliente',
      'cod_cliente',
      'id',
      'codigo',
      'importacao_id',
    ]) ?? pickNested(row, [['cliente', 'id'], ['client', 'id']])

  if (!avecClientId) return null

  const name = pick(row, ['nome', 'name', 'cliente', 'nome_cliente', 'cliente_nome'])
  const email = pick(row, ['email', 'e_mail', 'e-mail'])
  const phone = normalizePhone(
    pick(row, ['celular', 'telefone', 'phone', 'mobile', 'fone', 'tel']) ??
      pickNested(row, [['cliente', 'celular'], ['cliente', 'telefone']])
  )

  return { avecClientId, name, email, phone }
}

export function normalizeAppointmentRow(row: Record<string, unknown>): NormalizedAvecAppointment | null {
  const avecClientId = pick(row, ['cliente_id', 'client_id', 'id_cliente', 'codigo_cliente', 'cod_cliente'])
  const clientName = pick(row, ['cliente', 'nome', 'nome_cliente', 'cliente_nome', 'name'])
  const phone = normalizePhone(pick(row, ['celular', 'telefone', 'phone', 'fone']))
  const email = pick(row, ['email', 'e_mail'])
  const serviceName = pick(row, [
    'servico',
    'serviço',
    'procedimento',
    'service',
    'nome_servico',
    'servico_nome',
    'descricao',
  ])
  const datePart = pick(row, ['data', 'data_agendamento', 'agendamento', 'dia', 'date'])
  const timePart = pick(row, ['hora', 'horario', 'horário', 'time', 'hora_agendamento'])
  const scheduledAt = parseAvecDateTime(datePart, timePart)
  const professional = pick(row, ['profissional', 'profissional_nome', 'nome_profissional'])
  const status = pick(row, ['status', 'situacao', 'situação'])

  if (!avecClientId && !clientName && !phone) return null

  return { avecClientId, clientName, phone, email, serviceName, scheduledAt, professional, status }
}

export function normalizeAttendanceRow(row: Record<string, unknown>): NormalizedAvecAttendance | null {
  const avecClientId = pick(row, ['cliente_id', 'client_id', 'id_cliente', 'codigo_cliente'])
  const clientName = pick(row, ['cliente', 'nome', 'nome_cliente', 'cliente_nome'])
  const phone = normalizePhone(pick(row, ['celular', 'telefone', 'phone']))
  const serviceName = pick(row, ['servico', 'serviço', 'procedimento', 'service', 'item', 'descricao'])
  const datePart = pick(row, ['data', 'data_atendimento', 'data_realizacao', 'dia', 'date'])
  const timePart = pick(row, ['hora', 'horario', 'horário'])
  const attendedAt = parseAvecDateTime(datePart, timePart)

  if (!avecClientId && !clientName && !phone) return null

  return { avecClientId, clientName, phone, serviceName, attendedAt }
}

function parseMoney(raw: string | null): number {
  if (!raw) return 0
  const cleaned = raw.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

export function normalizeRevenueRow(row: Record<string, unknown>): NormalizedAvecRevenue | null {
  const revenue = parseMoney(
    pick(row, ['valor', 'total', 'faturamento', 'receita', 'valor_total', 'amount', 'liquido'])
  )
  const attended = Number(pick(row, ['atendimentos', 'qtd', 'quantidade', 'count']) ?? 0) || 0
  const datePart = pick(row, ['data', 'dia', 'date', 'periodo'])
  const day = datePart ? parseAvecDateTime(datePart)?.slice(0, 10) ?? null : null
  if (revenue <= 0 && attended <= 0) return null
  return { day, revenue, attended }
}

export function normalizeCancellationRow(row: Record<string, unknown>): NormalizedAvecCancellation | null {
  const status = (pick(row, ['status', 'situacao', 'situação']) ?? '').toLowerCase()
  const datePart = pick(row, [
    'data',
    'data_agendamento',
    'data_cancelamento',
    'dia',
    'date',
  ])
  const day = datePart ? parseAvecDateTime(datePart)?.slice(0, 10) ?? null : null
  const isNoShow =
    status.includes('falta') || status.includes('no-show') || status.includes('noshow')
  const isCancelled = status.includes('cancel')

  // Relatório 0052: uma linha por agendamento cancelado — sem status → conta como cancelado
  if (!status && (datePart || pick(row, ['cliente_id', 'cliente', 'nome', 'nome_cliente']))) {
    return { day, cancelled: 1, noShow: 0 }
  }

  if (!isCancelled && !isNoShow) return null
  return { day, cancelled: isCancelled && !isNoShow ? 1 : 0, noShow: isNoShow ? 1 : 0 }
}

function parsePct(raw: string | null): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/%/g, '').replace(',', '.').trim()
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return n > 1 ? n / 100 : n
}

/** 0021 — faturamento / ticket por profissional */
export function normalizeP1ProfessionalRevenueRow(
  row: Record<string, unknown>,
): NormalizedP1Professional | null {
  const name = pick(row, ['profissional', 'nome', 'nome_profissional', 'colaborador', 'funcionario'])
  if (!name) return null
  const revenue = parseMoney(
    pick(row, ['faturamento', 'valor', 'total', 'receita', 'valor_total', 'amount']),
  )
  const attended =
    Number(pick(row, ['atendimentos', 'comandas', 'qtd', 'quantidade', 'clientes', 'count']) ?? 0) || 0
  const ticketRaw = parseMoney(pick(row, ['ticket', 'ticket_medio', 'ticket médio', 'media', 'média']))
  const ticketAvg = ticketRaw > 0 ? ticketRaw : attended > 0 ? revenue / attended : 0
  if (revenue <= 0 && attended <= 0) return null
  return { name, revenue, attended, ticketAvg, occupancy: null }
}

/** 0126 — ocupação / produtividade por profissional */
export function normalizeP1OccupancyRow(
  row: Record<string, unknown>,
): Pick<NormalizedP1Professional, 'name' | 'occupancy'> | null {
  const name = pick(row, ['profissional', 'nome', 'nome_profissional', 'colaborador'])
  if (!name) return null
  const occupancy = parsePct(
    pick(row, ['ocupacao', 'ocupação', 'produtividade', 'taxa', 'percentual', 'percent']),
  )
  return { name, occupancy }
}

/** 0032 — serviços mais vendidos */
export function normalizeP1ServiceRow(row: Record<string, unknown>): NormalizedP1Service | null {
  const name = pick(row, ['servico', 'serviço', 'nome', 'procedimento', 'item', 'descricao'])
  if (!name) return null
  const quantity =
    Number(pick(row, ['quantidade', 'qtd', 'vendas', 'count', 'atendimentos']) ?? 0) || 0
  const revenue = parseMoney(pick(row, ['faturamento', 'valor', 'total', 'receita', 'valor_total']))
  if (quantity <= 0 && revenue <= 0) return null
  return { name, quantity, revenue }
}

/** 0003 — como nos conheceram */
export function normalizeP1AcquisitionRow(
  row: Record<string, unknown>,
): NormalizedP1Acquisition | null {
  const channel = pick(row, [
    'como_conheceu',
    'como conheceu',
    'origem',
    'canal',
    'fonte',
    'indicacao',
    'indicação',
    'descricao',
    'nome',
  ])
  if (!channel) return null
  const clients =
    Number(pick(row, ['clientes', 'quantidade', 'qtd', 'total', 'count']) ?? 0) || 0
  if (clients <= 0) return null
  return { channel, clients }
}

export interface NormalizedP2Channel {
  channel: string
  count: number
}

export interface NormalizedP2Package {
  name: string
  quantity: number
  revenue: number
}

export interface NormalizedP2Rating {
  score: number
  count: number
}

export interface NormalizedP2Payment {
  method: string
  amount: number
}

/** 0056 — agendamentos por canal */
export function normalizeP2ChannelRow(row: Record<string, unknown>): NormalizedP2Channel | null {
  const channel = pick(row, [
    'canal',
    'origem',
    'fonte',
    'meio',
    'tipo',
    'descricao',
    'nome',
    'channel',
  ])
  if (!channel) return null
  const count =
    Number(pick(row, ['quantidade', 'qtd', 'agendamentos', 'total', 'count', 'clientes']) ?? 0) || 0
  if (count <= 0) return null
  return { channel, count }
}

/** 0061 — pacotes vendidos */
export function normalizeP2PackageRow(row: Record<string, unknown>): NormalizedP2Package | null {
  const name = pick(row, ['pacote', 'nome', 'descricao', 'produto', 'item', 'servico', 'serviço'])
  if (!name) return null
  const quantity =
    Number(pick(row, ['quantidade', 'qtd', 'vendas', 'vendidos', 'ativos', 'count']) ?? 0) || 0
  const revenue = parseMoney(pick(row, ['faturamento', 'valor', 'total', 'receita', 'valor_total']))
  if (quantity <= 0 && revenue <= 0) return null
  return { name, quantity: quantity || 1, revenue }
}

/** 0104 — avaliações */
export function normalizeP2RatingRow(row: Record<string, unknown>): NormalizedP2Rating | null {
  const scoreRaw = pick(row, [
    'nota',
    'avaliacao',
    'avaliação',
    'score',
    'rating',
    'media',
    'média',
    'estrelas',
  ])
  const score = scoreRaw ? Number(String(scoreRaw).replace(',', '.')) : NaN
  if (!Number.isFinite(score) || score <= 0) return null
  const count =
    Number(pick(row, ['quantidade', 'qtd', 'total', 'count', 'avaliacoes', 'avaliações']) ?? 1) || 1
  return { score, count }
}

/** 0081 — formas de pagamento */
export function normalizeP2PaymentRow(row: Record<string, unknown>): NormalizedP2Payment | null {
  const method = pick(row, [
    'forma_pagamento',
    'forma de pagamento',
    'pagamento',
    'metodo',
    'método',
    'tipo',
    'descricao',
    'nome',
  ])
  if (!method) return null
  const amount = parseMoney(pick(row, ['valor', 'total', 'faturamento', 'amount', 'receita']))
  if (amount <= 0) return null
  return { method, amount }
}

/** 0001 — aniversariantes (conta linhas) */
export function normalizeP2BirthdayRow(row: Record<string, unknown>): boolean {
  return Boolean(
    pick(row, ['cliente', 'nome', 'nome_cliente', 'cliente_id', 'id', 'telefone', 'celular']),
  )
}

/** 0007 — taxa de retorno (0..1) */
export function normalizeP3ReturnRateRow(row: Record<string, unknown>): number | null {
  const raw = pick(row, [
    'taxa_retorno',
    'taxa de retorno',
    'retorno',
    'taxa',
    'percentual',
    'percent',
    'rate',
    'media',
    'média',
  ])
  const pct = parsePct(raw)
  if (pct == null || pct < 0) return null
  return pct
}

/** 0017 — novos clientes no período (contagem por linha ou campo) */
export function normalizeP3NewClientsRow(row: Record<string, unknown>): number | null {
  const countRaw = pick(row, [
    'novos',
    'novos_clientes',
    'quantidade',
    'qtd',
    'total',
    'count',
    'clientes',
  ])
  if (countRaw) {
    const n = Number(String(countRaw).replace(/\D/g, '')) || Number(countRaw)
    if (Number.isFinite(n) && n > 0) return n
  }
  // Lista: 1 cliente por linha
  if (pick(row, ['cliente', 'nome', 'nome_cliente', 'cliente_id', 'id', 'telefone'])) return 1
  return null
}

/** 0088 — evolução diária do faturamento */
export function normalizeP3CurveRow(
  row: Record<string, unknown>,
): { day: string; revenue: number } | null {
  const dayRaw = pick(row, ['data', 'dia', 'day', 'date', 'periodo', 'período'])
  let day: string | null = null
  if (dayRaw) {
    const m = dayRaw.match(/(\d{4}-\d{2}-\d{2})/)
    if (m) day = m[1]!
    else {
      const br = dayRaw.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      if (br) day = `${br[3]}-${br[2]}-${br[1]}`
    }
  }
  const revenue = parseMoney(pick(row, ['faturamento', 'valor', 'total', 'receita', 'amount']))
  if (!day || revenue < 0) return null
  if (revenue === 0 && !dayRaw) return null
  return { day, revenue }
}

// Mapeia nome de serviço Avec → categoria ROM (heurística simples).
export function guessServiceCategory(name: string): 'corte' | 'tratamento' | 'coloracao' | 'bem_estar' | 'outro' {
  const n = name.toLowerCase()
  if (n.includes('corte') || n.includes('cabeleir')) return 'corte'
  if (n.includes('color') || n.includes('mecha') || n.includes('tintura')) return 'coloracao'
  if (n.includes('massag') || n.includes('spa') || n.includes('pedi')) return 'bem_estar'
  if (n.includes('hidrat') || n.includes('nutri') || n.includes('trat') || n.includes('escova')) return 'tratamento'
  return 'outro'
}
