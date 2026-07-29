import { MemoryCache } from '@/lib/cache'
import { ttlDelete } from '@/lib/ttl-cache'

/**
 * Invalida caches de operações após webhook Avec ou sync.
 * MemoryCache + ttl-cache vivem no mesmo isolate — sem isso Contatos/Hoje
 * podem servir lista velha por até ~30–45s mesmo com dado novo no Postgres.
 */
export function invalidateOpsCaches() {
  MemoryCache.deletePrefix('contacts:')
  MemoryCache.deletePrefix('pipeline:')
  MemoryCache.deletePrefix('relatorios:')
  MemoryCache.deletePrefix('avec:sync-meta:')
  MemoryCache.deletePrefix('onboarding:')
  ttlDelete('hoje:*')
  ttlDelete('kpis:*')
  ttlDelete('estoque:kpis:*')
  ttlDelete('financeiro:*')
}
