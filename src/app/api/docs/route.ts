import { NextResponse } from 'next/server'
import { openAPISpec } from '@/lib/openapi'

export function GET() {
  return NextResponse.json(openAPISpec, {
    headers: { 'Content-Type': 'application/json' },
  })
}
