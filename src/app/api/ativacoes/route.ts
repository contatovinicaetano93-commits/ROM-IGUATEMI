import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { hasPanelModule, parseGrantableModules } from '@/lib/intranet/modules'
import { createBrandActivation, listBrandActivationsForMonth } from '@/lib/ativacoes/store'
import {
  listPeerBrandActivationsForMonth,
  mergeSharedActivations,
} from '@/lib/ativacoes/peer'
import { notifyAtivacoesEvent } from '@/lib/ativacoes/notify'
import {
  isEndOnOrAfterStart,
  isIsoDay,
  isIsoMonth,
  normalizeClockTime,
  parseAtivacaoCondition,
} from '@/lib/ativacoes/types'

function todayMonthBr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7)
}

function canUseAtivacoes(session: { role: string; modules?: unknown }): boolean {
  const role = session.role as 'admin' | 'staff' | 'financeiro' | 'estoque' | 'mkt'
  return hasPanelModule(role, parseGrantableModules(session.modules), 'ativacoes')
}

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseAtivacoes(auth.session)) return err('Acesso restrito a Ativações', 403)

  const monthParam = new URL(req.url).searchParams.get('month')
  const month = isIsoMonth(monthParam) ? monthParam : todayMonthBr()

  try {
    const [local, peer] = await Promise.all([
      listBrandActivationsForMonth(month),
      listPeerBrandActivationsForMonth(month),
    ])
    const activations = mergeSharedActivations(local, peer.activations)
    return ok({
      month,
      activations,
      peer: {
        offline: peer.offline,
        unconfigured: peer.unconfigured,
      },
    })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao listar ativações', 500)
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseAtivacoes(auth.session)) return err('Acesso restrito a Ativações', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)

  const day = isIsoDay(body.day) ? body.day : null
  const start_time = normalizeClockTime(body.start_time)
  const end_time = normalizeClockTime(body.end_time)
  const brand = typeof body.brand === 'string' ? body.brand.trim() : ''
  const condition = parseAtivacaoCondition(body.condition)
  const notes = typeof body.notes === 'string' ? body.notes.trim() : null

  if (!day || !start_time || !end_time || !brand || !condition) {
    return err(
      'Informe data, horário de início, horário de fim, marca e condição (comercial ou serviços)',
      400,
    )
  }
  if (!isEndOnOrAfterStart(start_time, end_time)) {
    return err('Horário de fim deve ser igual ou depois do início', 400)
  }

  const actorName = auth.session.displayName || auth.session.user
  const input = {
    day,
    start_time,
    end_time,
    brand,
    condition,
    notes,
    created_by_employee_id: auth.session.employeeId,
    created_by_name: actorName,
    created_by_role: auth.session.role,
  }

  try {
    const activation = await createBrandActivation(input)
    void notifyAtivacoesEvent({ kind: 'created', activation, actorName }).catch(() => {})
    return ok({ activation }, undefined, 201)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao criar ativação', 500)
  }
}
