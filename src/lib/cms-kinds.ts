export type IntranetPostKind = 'news' | 'event' | 'banner' | 'policy'

export function parseIntranetPostKind(value: unknown): IntranetPostKind {
  if (value === 'news' || value === 'event' || value === 'banner' || value === 'policy') return value
  return 'news'
}
