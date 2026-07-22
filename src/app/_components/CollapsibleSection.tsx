'use client'

import { ChevronDown } from 'lucide-react'
import { usePersistedBool } from '@/lib/use-persisted-bool'

export function useSectionOpen(storageKey: string, defaultOpen = false) {
  return usePersistedBool(storageKey, defaultOpen)
}

/** Header button + optional aside (e.g. “Nova despesa”) that does not toggle. */
export function SectionToggleHeader({
  title,
  badge,
  open,
  onToggle,
  aside,
  titleClassName = 'text-sm font-medium',
}: {
  title: React.ReactNode
  badge?: React.ReactNode
  open: boolean
  onToggle: () => void
  aside?: React.ReactNode
  titleClassName?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl py-0.5 text-left active:opacity-90"
      >
        <h2 className={`min-w-0 truncate ${titleClassName}`}>{title}</h2>
        <span className="flex shrink-0 items-center gap-2">
          {badge}
          <ChevronDown
            size={16}
            className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {aside}
    </div>
  )
}

export function CollapsibleBody({
  open,
  children,
  className = '',
}: {
  open: boolean
  children: React.ReactNode
  className?: string
}) {
  if (!open) return null
  return <div className={className}>{children}</div>
}
