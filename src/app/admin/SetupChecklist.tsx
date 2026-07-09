'use client'

import { useState } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'
import { SETUP_ITEMS, isItemConfigured } from '@/lib/setup-checklist'

interface HealthForSetup {
  database: { connected: boolean }
  claude: { configured: boolean }
  avec: { token: boolean; mock: boolean; webhook_secret?: boolean }
  whatsapp: { configured: boolean }
  telegram: { configured: boolean }
  cron: { configured: boolean }
  auth: { enabled: boolean }
  deployment?: { panel: string }
  validation?: { ok: boolean }
  webhooks?: { avec_secret?: boolean }
}

const PRIORITY_LABEL = {
  agora: 'Fazer agora',
  quando_tiver: 'Quando tiver credencial',
  opcional: 'Opcional',
} as const

export function SetupChecklist({ health }: { health: HealthForSetup }) {
  const pending = SETUP_ITEMS.filter((item) => !isItemConfigured(item.id, health))
  const [openId, setOpenId] = useState<string | null>(pending[0]?.id ?? null)

  if (pending.length === 0) {
    return (
      <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
        Tudo configurado. Integrações prontas para uso.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        {pending.length} item(ns) pendente(s) — clique para ver como resolver na Vercel.
      </p>
      {pending.map((item) => {
        const open = openId === item.id
        return (
          <div key={item.id} className="rounded-xl border border-border bg-surface/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : item.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm"
            >
              <span>
                <span className="font-medium">{item.label}</span>
                <span className="ml-2 text-[0.65rem] text-warning">Pendente</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="rounded-full bg-border px-2 py-0.5 text-[0.6rem] text-muted">
                  {PRIORITY_LABEL[item.priority]}
                </span>
                <ChevronDown size={16} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
              </span>
            </button>
            {open && (
              <div className="border-t border-border px-4 py-3 text-xs text-muted">
                <p className="mb-2 font-medium text-foreground/80">
                  Variáveis: <code className="text-gold">{item.envVars.join(', ')}</code>
                </p>
                {item.id === 'avec' && health.avec.mock && (
                  <p className="mb-2 rounded-lg bg-warning/10 px-2 py-1.5 text-warning">
                    AVEC_MOCK está ativo na Vercel — remova ao colocar o token real.
                  </p>
                )}
                <ol className="list-decimal space-y-1.5 pl-4">
                  {item.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                {item.link && (
                  <a
                    href={item.link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-gold hover:underline"
                  >
                    {item.link.label}
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
