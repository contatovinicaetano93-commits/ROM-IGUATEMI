/** Fetch autenticado — cookie de sessão + cache curto no client para 2ª visita às seções. */

type ApiFetchInit = RequestInit & {
  /**
   * Cache em memória no browser (GET). Default true.
   * false = forçar rede (botão Atualizar).
   */
  clientCache?: boolean
  /** Aborta a request após N ms (AbortError). */
  timeoutMs?: number
}

const CLIENT_GET_TTL_SEC = 45
const MAX_ENTRIES = 80

type Entry = { body: ArrayBuffer; status: number; statusText: string; headers: [string, string][]; expiresAt: number }

const store = new Map<string, Entry>()

function cacheKey(url: string, method: string): string {
  return `${method}:${url}`
}

function pruneExpired() {
  const now = Date.now()
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k)
  }
  while (store.size > MAX_ENTRIES) {
    const first = store.keys().next().value
    if (first == null) break
    store.delete(first)
  }
}

function entryToResponse(entry: Entry): Response {
  return new Response(entry.body.slice(0), {
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
  })
}

/** Limpa cache do client. Prefixo opcional (ex.: '/api/pipeline'). */
export function clearApiClientCache(prefix?: string) {
  if (!prefix) {
    store.clear()
    return
  }
  for (const k of [...store.keys()]) {
    if (k.includes(prefix)) store.delete(k)
  }
}

function invalidateForMutation(url: string) {
  // Qualquer escrita invalida a árvore próxima (lista + detalhe + painéis derivados).
  const path = url.split('?')[0] ?? url
  const roots = [
    path,
    path.replace(/\/[0-9a-f-]{36}(\/.*)?$/i, ''),
    '/api/hoje',
    '/api/pipeline',
    '/api/contacts',
    '/api/kpis',
    '/api/financeiro',
    '/api/estoque',
    '/api/relatorios',
  ]
  const uniq = [...new Set(roots.filter(Boolean))]
  for (const root of uniq) clearApiClientCache(root)
}

function doFetch(input: string, init: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const { timeoutMs, ...rest } = init
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

export function apiFetch(input: string, init?: ApiFetchInit) {
  const { clientCache, timeoutMs, ...rest } = init ?? {}
  const method = (rest.method ?? 'GET').toUpperCase()
  const allowCache = method === 'GET' && clientCache !== false
  const key = cacheKey(input, method)

  if (allowCache) {
    pruneExpired()
    const hit = store.get(key)
    if (hit && hit.expiresAt > Date.now()) {
      return Promise.resolve(entryToResponse(hit))
    }
  }

  return doFetch(input, { ...rest, timeoutMs }).then(async (res) => {
    if (method !== 'GET' && res.ok) {
      invalidateForMutation(input)
    }
    if (allowCache && res.ok) {
      try {
        const body = await res.clone().arrayBuffer()
        const headers: [string, string][] = []
        res.headers.forEach((v, k) => headers.push([k, v]))
        store.set(key, {
          body,
          status: res.status,
          statusText: res.statusText,
          headers,
          expiresAt: Date.now() + CLIENT_GET_TTL_SEC * 1000,
        })
        pruneExpired()
      } catch {
        // ignore cache write failures
      }
    }
    return res
  })
}
