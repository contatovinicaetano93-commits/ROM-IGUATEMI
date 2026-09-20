'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { useClientSession } from '../_components/SessionProvider'
import {
  flowAreaSystems,
  systemGroupLabel,
  systemsForAccess,
  type IntranetSystem,
  type IntranetSystemGroup,
} from '@/lib/intranet/systems'
import { parseGrantableModules } from '@/lib/intranet/modules'
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
        ? systemsForAccess('admin')
        : systemsForAccess(role, parseGrantableModules(session.modules))
    return [...modules, ...flowAreaSystems(areaIds)]
  }, [areaIds, session])

  const grouped = GROUPS.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  })).filter((block) => block.items.length > 0)

  return (
    <IntranetPage
      kicker="Acesso"
      title="Meus Sistemas"
      subtitle="Só aparecem as áreas e seções liberadas para o seu perfil nesta unidade."
    >
      <div className="space-y-6">
        {grouped.map((block) => (
          <section key={block.group}>
            <h2 className="mb-3 text-sm font-medium">{systemGroupLabel(block.group)}</h2>
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
    <Link href={item.href} className="rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-background">
      <p className="text-sm font-medium">{item.label}</p>
      <p className="mt-1 text-sm text-muted">{item.description}</p>
    </Link>
  )
}
