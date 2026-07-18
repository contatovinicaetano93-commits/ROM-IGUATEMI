import { z } from 'zod'

// Auth Schemas
/** Aceita `user` (API) ou `username` (form legado) — evita "expected string, received undefined". */
export const LoginRequestSchema = z
  .object({
    user: z.string().optional(),
    username: z.string().optional(),
    password: z.string().min(1, 'Senha é obrigatória'),
    token: z.string().optional(),
  })
  .transform((data) => ({
    user: (data.user ?? data.username ?? '').trim(),
    password: data.password,
    token: data.token,
  }))
  .refine((data) => data.user.length > 0, {
    message: 'Usuário é obrigatório',
    path: ['user'],
  })
export type LoginRequest = z.infer<typeof LoginRequestSchema>

export const LogoutRequestSchema = z.object({})
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>

// KPI Query Schemas
export const KpiQuerySchema = z.object({
  layer: z.enum(['p1', 'p2', 'p3']).optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
})
export type KpiQuery = z.infer<typeof KpiQuerySchema>

// Finance Schemas
export const FinanceReportQuerySchema = z.object({
  start: z.string().date().optional(),
  end: z.string().date().optional(),
  category: z.string().optional(),
})
export type FinanceReportQuery = z.infer<typeof FinanceReportQuerySchema>

// Stock Schemas
export const StockProductQuerySchema = z.object({
  category: z.string().optional(),
  brand: z.string().optional(),
  location: z.string().optional(),
  search: z.string().optional(),
})
export type StockProductQuery = z.infer<typeof StockProductQuerySchema>

export const StockMovementSchema = z.object({
  product_id: z.number(),
  type: z.enum(['entrada', 'saida', 'ajuste_manual']),
  quantity: z.number().positive(),
  cost: z.number().optional(),
  reason: z.string().optional(),
})
export type StockMovement = z.infer<typeof StockMovementSchema>

// Health Schemas
export const HealthQuerySchema = z.object({
  verbose: z.string().optional().transform((v) => v === 'true'),
})
export type HealthQuery = z.infer<typeof HealthQuerySchema>

// Cron Webhook Schemas
export const CronWebhookSchema = z.object({
  secret: z.string(),
})
export type CronWebhook = z.infer<typeof CronWebhookSchema>

// Validation Helpers
export function parseRequestBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  return schema.parse(body)
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, query: Record<string, any>): z.infer<T> {
  return schema.parse(query)
}

export function validateRequest<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): { valid: true; data: z.infer<T> } | { valid: false; error: string } {
  try {
    return { valid: true, data: schema.parse(data) }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { valid: false, error: e.issues[0]?.message || 'Validation error' }
    }
    return { valid: false, error: 'Unknown validation error' }
  }
}
