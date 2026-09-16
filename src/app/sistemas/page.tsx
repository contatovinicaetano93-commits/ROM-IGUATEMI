'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { useClientSession } from '../_components/SessionProvider'
import {
  flowAreaSystems,
  systemGroupLabel,
  systemsForRole,
  type IntranetSystem,
  type IntranetSystemGroup,
} from '@/lib/intranet/systems'
import type { RequestArea } from '@/lib/flow/types'

const GROUPS: IntranetSystemGroup[] = ['intranet', 'operacao', 'gestao', 'flow']

export default function SistemasPage() {
  const { session } = useClientSession()
  const [areaIds, setAreaIds] = useState<RequestArea[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/intranet', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setAreaIds((json.data?.areas as RequestArea[]) ?? [])
      })
      .catch(() => {
        if (!cancelled) setAreaIds([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const items = useMemo(() => {
    const role = session?.role ?? 'staff'
    const modules = !session || (session.auth_enabled && !session.authenticated)
      ? []
      : !session.auth_enabled
        ? systemsForRole('admin')
        : systemsForRole(role)
    return [...modules, ...flowAreaSystems(areaIds)]
  }, [areaIds, session])

  const grouped = GROUPS.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  })).filter((block) => block.items.length > 0)

  return (
    <IntranetPage kicker="Acesso" title="Meus Sistemas">
      <p className="text-sm text-muted">
        Só aparecem as áreas e seções liberadas para o seu perfil nesta unidade.
      </p>
      <div className="mt-6 space-y-8">
        {grouped.map((block) => (
          <section key={block.group}>
            <h2 className="mb-3 text-sm font-semibold">{systemGroupLabel(block.group)}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {block.items.map((item) => (
                <SystemCard key={`${item.group}-${item.href}-${item.label}`} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </IntranetPage>
  )
}

function SystemCard({ item }: { item: IntranetSystem }) {
  return (
    <Link href={item.href} className="rounded-2xl border border-border bg-card p-5">
      <p className="font-medium">{item.label}</p>
      <p className="mt-1 text-sm text-muted">{item.description}</p>
    </Link>
  )
}
