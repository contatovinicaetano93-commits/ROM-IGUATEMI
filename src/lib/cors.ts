import { NextResponse } from 'next/server'

export const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://rom.dev'
).split(',').map(o => o.trim())

export const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
export const ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'X-Requested-With']

export function setCorsHeaders(response: NextResponse, origin?: string): NextResponse {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }

  response.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '))
  response.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '))
  response.headers.set('Access-Control-Max-Age', '86400')
  response.headers.set('Access-Control-Allow-Credentials', 'true')

  return response
}

export function handleCorsPreFlight(request: Request): NextResponse | null {
  if (request.method !== 'OPTIONS') return null

  const response = new NextResponse(null, { status: 200 })
  return setCorsHeaders(response, request.headers.get('origin') || undefined)
}
