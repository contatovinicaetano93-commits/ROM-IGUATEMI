// Normalização defensiva — colunas dos relatórios Avec variam por unidade/versão.

function pick(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v === null || v === undefined) continue
    const s = String(v).trim()
    if (s) return s
  }
  // Fallback case-insensitive (Excel/export Avec às vezes manda "Cliente", "E-mail")
  const lowerMap = new Map<string, unknown>()
  for (const [rk, rv] of Object.entries(row)) {
    lowerMap.set(rk.toLowerCase().trim(), rv)
  }
  for (const k of keys) {
    const v = lowerMap.get(k.toLowerCase())
    if (v === null || v === undefined) continue
    const s = String(v).trim()
    if (s) return s
  }
  return null
}

/**
 * Como pick(), mas preserva o tipo original (sem stringificar) — usado para
 * valores monetários, onde a API JSON da Avec manda number puro (ex: 1234.56)
 * e uma string BR (ex: "1.234,56") tem que ser tratada de forma diferente.
 */
function pickRaw(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k]
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && v.trim() === '') continue
    return v
  }
  const lowerMap = new Map<string, unknown>()
  for (const [rk, rv] of Object.entries(row)) {
    lowerMap.set(rk.toLowerCase().trim(), rv)
  }
  for (const k of keys) {
    const v = lowerMap.get(k.toLowerCase())
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && v.trim() === '') continue
    return v
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
  price: number | null
  status: string | null
}

export interface NormalizedAvecAttendance {
  avecClientId: string | null
  clientName: string | null
  phone: string | null
  serviceName: string | null
  attendedAt: string | null
  professional: string | null
  price: number | null
  /** Início/fim reais do atendimento — só preenchido se a Avec mandar os dois (Sprint 1 TM). */
  startedAt: string | null
  endedAt: string | null
  /** null quando não dá pra calcular (falta início/fim, ou intervalo fora do razoável). */
  durationMinutes: number | null
}

/**
 * Duração só é aceita entre 1 min e 8h — fora disso é mais provável erro de
 * dado (ex: fim sem data, cruzando meia-noite mal parseado) do que atendimento real.
 */
const MIN_DURATION_MINUTES = 1
const MAX_DURATION_MINUTES = 8 * 60

function computeDurationMinutes(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null
  const start = new Date(startedAt).getTime()
  const end = new Date(endedAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  const minutes = (end - start) / 60000
  if (minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) return null
  return Math.round(minutes)
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
  const price = parseOptionalMoney(
    pickRaw(row, ['valor', 'preco', 'preço', 'valor_servico', 'valor_serviço', 'price', 'amount', 'total'])
  )
  const status = pick(row, ['status', 'situacao', 'situação'])

  if (!avecClientId && !clientName && !phone) return null

  return { avecClientId, clientName, phone, email, serviceName, scheduledAt, professional, price, status }
}

export function normalizeAttendanceRow(row: Record<string, unknown>): NormalizedAvecAttendance | null {
  const avecClientId = pick(row, ['cliente_id', 'client_id', 'id_cliente', 'codigo_cliente'])
  const clientName = pick(row, ['cliente', 'nome', 'nome_cliente', 'cliente_nome'])
  const phone = normalizePhone(pick(row, ['celular', 'telefone', 'phone']))
  const serviceName = pick(row, ['servico', 'serviço', 'procedimento', 'service', 'item', 'descricao'])
  const datePart = pick(row, ['data', 'data_atendimento', 'data_realizacao', 'dia', 'date'])
  const timePart = pick(row, ['hora', 'horario', 'horário'])
  const attendedAt = parseAvecDateTime(datePart, timePart)
  const professional = pick(row, ['profissional', 'profissional_nome', 'nome_profissional'])
  const price = parseOptionalMoney(
    pickRaw(row, ['valor', 'preco', 'preço', 'valor_servico', 'valor_serviço', 'price', 'amount', 'total'])
  )

  // Nomes especulativos — a Avec pode não mandar nenhum destes hoje (é exatamente
  // a dúvida do Sprint 1). Se não vier, startedAt/endedAt ficam null e durationMinutes
  // também — sem inventar dado.
  const startTimePart = pick(row, [
    'hora_inicio',
    'horario_inicio',
    'horário_inicio',
    'inicio',
    'início',
    'check_in',
    'checkin',
    'hora_entrada',
    'hora_chegada',
    'entrada',
  ])
  const endTimePart = pick(row, [
    'hora_fim',
    'horario_fim',
    'horário_fim',
    'fim',
    'termino',
    'término',
    'check_out',
    'checkout',
    'hora_saida',
    'hora_saída',
    'saida',
    'saída',
    'hora_conclusao',
    'hora_conclusão',
  ])
  const startedAt = startTimePart ? parseAvecDateTime(datePart, startTimePart) : null
  const endedAt = endTimePart ? parseAvecDateTime(datePart, endTimePart) : null
  const durationMinutes = computeDurationMinutes(startedAt, endedAt)

  if (!avecClientId && !clientName && !phone) return null

  return {
    avecClientId,
    clientName,
    phone,
    serviceName,
    attendedAt,
    professional,
    price,
    startedAt,
    endedAt,
    durationMinutes,
  }
}

function parseMoney(raw: unknown): number {
  return parseOptionalMoney(raw) ?? 0
}

/**
 * Preço unitário — null se ausente ou inválido (não trata 0 como valor).
 * Aceita number puro (API JSON da Avec) sem tratar o ponto decimal como
 * separador de milhar, e string BR ("1.234,56") vinda de export/planilha.
 */
export function parseOptionalMoney(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null
  }
  const str = String(raw).trim()
  if (str === '') return null
  const cleaned = str.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function normalizeRevenueRow(row: Record<string, unknown>): NormalizedAvecRevenue | null {
  const revenue = parseMoney(
    pickRaw(row, ['valor', 'total', 'faturamento', 'receita', 'valor_total', 'amount', 'liquido'])
  )
  const attended = Number(pick(row, ['atendimentos', 'qtd', 'quantidade', 'count']) ?? 0) || 0
  const datePart = pick(row, ['data', 'dia', 'date', 'periodo'])
  const day = datePart ? parseAvecDateTime(datePart)?.slice(0, 10) ?? null : null
  if (revenue <= 0 && attended <= 0) return null
  return { day, revenue, attended }
}

export function normalizeCancellationRow(row: Record<string, unknown>): NormalizedAvecCancellation | null {
  const status = (pick(row, ['status', 'situacao', 'situação']) ?? '').toLowerCase()
  const datePart = pick(row, ['data', 'data_agendamento', 'dia', 'date'])
  const day = datePart ? parseAvecDateTime(datePart)?.slice(0, 10) ?? null : null
  const isNoShow = status.includes('falta') || status.includes('no-show') || status.includes('noshow')
  const isCancelled = status.includes('cancel')

  // Relatório 0052: uma linha por agendamento cancelado — sem status → conta como cancelado
  if (!status && (datePart || pick(row, ['cliente_id', 'cliente', 'nome', 'nome_cliente']))) {
    return { day, cancelled: 1, noShow: 0 }
  }

  if (!isCancelled && !isNoShow) return null
  return { day, cancelled: isCancelled && !isNoShow ? 1 : 0, noShow: isNoShow ? 1 : 0 }
}

/** Serviço de unha / manicure / pedicure — usado para preferência de manicure. */
export function isNailService(name: string | null | undefined): boolean {
  if (!name) return false
  const n = name.toLowerCase()
  return (
    n.includes('mani') ||
    n.includes('pedi') ||
    n.includes('unha') ||
    n.includes('nail') ||
    n.includes('esmalte') ||
    n.includes('gel') ||
    n.includes('fibra') ||
    n.includes('blindagem') ||
    n.includes('spa dos pés') ||
    n.includes('spa das mãos')
  )
}

/** Serviço de cabelo — usado para preferência de cabeleireiro. */
export function isHairService(name: string | null | undefined): boolean {
  if (!name) return false
  if (isNailService(name)) return false
  const n = name.toLowerCase()
  return (
    n.includes('corte') ||
    n.includes('cabeleir') ||
    n.includes('color') ||
    n.includes('mecha') ||
    n.includes('tintura') ||
    n.includes('luzes') ||
    n.includes('balayage') ||
    n.includes('escova') ||
    n.includes('hidrat') ||
    n.includes('nutri') ||
    n.includes('progressiva') ||
    n.includes('botox') ||
    n.includes('selagem') ||
    n.includes('penteado') ||
    n.includes('finaliza') ||
    n.includes('shampoo') ||
    n.includes('barba') ||
    n.includes('bigode')
  )
}


function parsePct(raw: string | null): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/%/g, '').replace(',', '.').trim()
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return n > 1 ? n / 100 : n
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

/** 0021 — faturamento / ticket por profissional */
export function normalizeP1ProfessionalRevenueRow(
  row: Record<string, unknown>,
): NormalizedP1Professional | null {
  const name = pick(row, ['profissional', 'nome', 'nome_profissional', 'colaborador', 'funcionario'])
  if (!name) return null
  const revenue = parseMoney(
    pickRaw(row, ['faturamento', 'valor', 'total', 'receita', 'valor_total', 'amount']),
  )
  const attended =
    Number(pick(row, ['atendimentos', 'comandas', 'qtd', 'quantidade', 'clientes', 'count']) ?? 0) || 0
  const ticketRaw = parseMoney(pickRaw(row, ['ticket', 'ticket_medio', 'ticket médio', 'media', 'média']))
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
  const revenue = parseMoney(pickRaw(row, ['faturamento', 'valor', 'total', 'receita', 'valor_total']))
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
  const revenue = parseMoney(pickRaw(row, ['faturamento', 'valor', 'total', 'receita', 'valor_total']))
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
  const amount = parseMoney(pickRaw(row, ['valor', 'total', 'faturamento', 'amount', 'receita']))
  if (amount <= 0) return null
  return { method, amount }
}

/** 0001 — aniversariantes (conta linhas) */
export function normalizeP2BirthdayRow(row: Record<string, unknown>): boolean {
  return Boolean(
    pick(row, ['cliente', 'nome', 'nome_cliente', 'cliente_id', 'id', 'telefone', 'celular']),
  )
}

/** Linha de cliente do relatório 0011 (lista de reativação / sem retorno). */
export interface Normalized0011Client {
  name: string
  email: string | null
  phone: string | null
  mobile: string | null
  gender: string | null
  lastVisit: string | null // YYYY-MM-DD
  professional: string | null
  /** Taxa agregada se a linha for resumo (0..1). */
  returnRate: number | null
}

function parseIsoDateOnly(raw: string | null): string | null {
  if (!raw) return null
  const iso = raw.match(/(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]!
  const br = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (br) {
    let y = Number(br[3])
    if (y < 100) y += 2000
    return `${y}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`
  }
  const dt = parseAvecDateTime(raw)
  return dt ? dt.slice(0, 10) : null
}

/** 0011 — cliente a reativar (ou linha de resumo com taxa). */
export function normalize0011ReactivationRow(
  row: Record<string, unknown>,
): Normalized0011Client | null {
  const returnRate = parsePct(
    pick(row, [
      'taxa_retorno',
      'taxa de retorno',
      'retorno',
      'taxa',
      'percentual',
      'percent',
      'rate',
    ]),
  )

  const name = pick(row, [
    'cliente',
    'nome',
    'nome_cliente',
    'cliente_nome',
    'name',
  ])
  const professional = pick(row, [
    'profissional',
    'profissional_nome',
    'nome_profissional',
    'colaborador',
    'funcionario',
  ])

  // Linha só de taxa (sem cliente)
  if (!name && returnRate != null) {
    return {
      name: professional ?? '—',
      email: null,
      phone: null,
      mobile: null,
      gender: null,
      lastVisit: null,
      professional,
      returnRate,
    }
  }

  if (!name) return null

  const email = pick(row, ['email', 'e_mail', 'e-mail'])
  const phoneRaw = pick(row, ['telefone', 'phone', 'fone', 'tel'])
  const mobileRaw = pick(row, ['celular', 'mobile', 'cel'])
  const gender = pick(row, ['sexo', 'genero', 'gênero', 'gender'])
  const lastVisit = parseIsoDateOnly(
    pick(row, [
      'data_ultima_comanda',
      'data ultima comanda',
      'ultima_comanda',
      'última comanda',
      'ultima_visita',
      'última visita',
      'last_visit',
      'data',
      'dt_ultima',
    ]),
  )

  return {
    name,
    email,
    phone: phoneRaw,
    mobile: mobileRaw,
    gender,
    lastVisit,
    professional,
    returnRate,
  }
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
  const revenue = parseMoney(pickRaw(row, ['faturamento', 'valor', 'total', 'receita', 'amount']))
  if (!day || revenue < 0) return null
  if (revenue === 0 && !dayRaw) return null
  return { day, revenue }
}

// Mapeia nome de serviço Avec → categoria ROM (heurística simples).
export function guessServiceCategory(name: string): 'corte' | 'tratamento' | 'coloracao' | 'bem_estar' | 'outro' {
  const n = name.toLowerCase()
  if (n.includes('corte') || n.includes('cabeleir')) return 'corte'
  if (n.includes('color') || n.includes('mecha') || n.includes('tintura')) return 'coloracao'
  if (isNailService(n) || n.includes('massag') || n.includes('spa')) return 'bem_estar'
  if (n.includes('hidrat') || n.includes('nutri') || n.includes('trat') || n.includes('escova')) return 'tratamento'
  return 'outro'
}
