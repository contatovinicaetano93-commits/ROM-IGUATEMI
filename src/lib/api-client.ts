/** Fetch autenticado — envia cookie de sessão em todas as chamadas internas. */
export function apiFetch(input: string, init?: RequestInit & { timeoutMs?: number }) {
  const timeoutMs = init?.timeoutMs
  const { timeoutMs: _drop, ...rest } = init ?? {}
  if (timeoutMs == null || timeoutMs <= 0) {
    return fetch(input, { ...rest, credentials: 'include' })
  }

  const controller = new AbortController()
  const external = rest.signal
  if (external) {
    if (external.aborted) controller.abort(external.reason)
    else {
      external.addEventListener('abort', () => controller.abort(external.reason), { once: true })
    }
  }
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'AbortError')), timeoutMs)
  return fetch(input, { ...rest, credentials: 'include', signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  )
}
