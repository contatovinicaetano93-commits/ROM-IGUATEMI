/** Pastas IMAP da caixa fiscal — mesmas regras de skip do romprofcont, sem Base Mestre. */

export type FolhaMailboxLike = {
  path: string
  name?: string
  specialUse?: string
  flags?: Set<string> | string[]
  delimiter?: string
}

const SKIP_SPECIAL_USE = new Set([
  '\\Sent',
  '\\Trash',
  '\\Junk',
  '\\Drafts',
  '\\All',
  '\\Archive',
  '\\Flagged',
])

const SKIP_LEAF_NAMES = new Set([
  'enviadas',
  'lixo',
  'rascunho',
  'mala direta',
  'maladireta',
  'resolvido',
  'sent',
  'trash',
  'junk',
  'drafts',
  'spam',
  'deleted',
])

export function normalizeMailboxName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function mailboxLeafName(path: string, delimiter = '.'): string {
  const parts = path.split(delimiter || '.')
  return parts.at(-1) || path
}

export function shouldSyncMailbox(mailbox: FolhaMailboxLike): boolean {
  const flags =
    mailbox.flags instanceof Set ? mailbox.flags : new Set(mailbox.flags ?? [])
  if (flags.has('\\Noselect') || flags.has('\\NonExistent')) return false
  if (mailbox.specialUse && SKIP_SPECIAL_USE.has(mailbox.specialUse)) return false
  const leaf = normalizeMailboxName(
    mailbox.name ?? mailboxLeafName(mailbox.path, mailbox.delimiter ?? '.'),
  )
  if (SKIP_LEAF_NAMES.has(leaf)) return false
  return true
}

export function isInboxMailbox(path: string, name?: string): boolean {
  const leaf = normalizeMailboxName(name ?? mailboxLeafName(path))
  return leaf === 'inbox' || normalizeMailboxName(path) === 'inbox'
}

/** Contabilidades primeiro; INBOX por último (guias costumam cair nas pastas). */
export function sortWorkMailboxes<T extends FolhaMailboxLike>(boxes: T[]): T[] {
  return [...boxes].sort((a, b) => {
    const aIn = isInboxMailbox(a.path, a.name) ? 1 : 0
    const bIn = isInboxMailbox(b.path, b.name) ? 1 : 0
    if (aIn !== bIn) return aIn - bIn
    return a.path.localeCompare(b.path)
  })
}
