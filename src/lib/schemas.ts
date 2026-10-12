import { z } from 'zod'

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
