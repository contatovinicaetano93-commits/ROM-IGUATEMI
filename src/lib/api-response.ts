import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { Logger } from '@/lib/logger'
import { isProduction } from '@/lib/env'
import { isNeonQuotaError, neonQuotaUserMessage } from '@/lib/avec/neon-errors'

const logger = new Logger('API')

export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  return NextResponse.json({ data, meta: meta ?? null }, { status })
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function handleError(e: unknown) {
  if (e instanceof ZodError) {
    return err(e.issues.map((i) => i.message).join(', '), 422)
  }
  if (isNeonQuotaError(e)) {
    logger.error('Neon quota blocked request', {
      message: e instanceof Error ? e.message : String(e),
    })
    return err(neonQuotaUserMessage(e), 503)
  }
  if (e instanceof Error) {
    // Log full error server-side, return generic message to client
    logger.error('Unhandled error in API route', {
      message: e.message,
      stack: e.stack,
      name: e.name,
    })
    const clientMessage = isProduction() ? 'Erro interno do servidor' : e.message
    return err(clientMessage, 500)
  }
  logger.error('Unknown error in API route', { error: String(e) })
  return err('Erro desconhecido', 500)
}
