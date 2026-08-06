import { PostHog } from 'posthog-node'

let posthogClient: PostHog | null = null

/**
 * Client PostHog do servidor, ou `null` quando não há token configurado.
 *
 * Retorna null de propósito: analytics é opcional e não pode derrubar rota —
 * quem chama trata a ausência, em vez de instanciar com token indefinido.
 */
export function getPostHogClient(): PostHog | null {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim()
  if (!token) return null
  if (!posthogClient) {
    posthogClient = new PostHog(token, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return posthogClient
}
