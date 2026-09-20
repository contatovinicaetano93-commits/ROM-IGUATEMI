import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { allocateAllProductsToAlmox } from '@/lib/stock-points-db'

/** Inventário inicial: joga todo o saldo Avec no Almoxarifado (pisos zeram). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)
    if (auth.session.role !== 'admin' && auth.session.role !== 'estoque') {
      return err('Só admin ou estoque podem resetar o inventário nos pontos', 403)
    }
    const result = await allocateAllProductsToAlmox()
    return ok(result)
  } catch (e) {
    return handleError(e)
  }
}
