import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { canAccessFolha } from '@/lib/folha/access'
import type { FolhaShellStatus } from '@/lib/folha/types'

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canAccessFolha(auth.session)) return err('Acesso restrito à Folha de pagamento', 403)

  const payload: FolhaShellStatus = {
    shell_only: true,
    message:
      'Seção criada. Cálculo automático e leitura de DARF entram após o RH confirmar as regras do processo.',
    periods: [],
  }
  return ok(payload)
}
