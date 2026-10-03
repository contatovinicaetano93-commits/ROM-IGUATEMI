import { describe, expect, it } from 'vitest'
import {
  isInboxMailbox,
  shouldSyncMailbox,
  sortWorkMailboxes,
} from '@/lib/folha/imap-mailbox'

describe('shouldSyncMailbox', () => {
  it('mantém INBOX e pastas de contabilidade', () => {
    expect(shouldSyncMailbox({ path: 'INBOX', name: 'INBOX' })).toBe(true)
    expect(shouldSyncMailbox({ path: 'INBOX.Yamada', name: 'Yamada' })).toBe(true)
    expect(shouldSyncMailbox({ path: 'INBOX.Contbell', name: 'Contbell' })).toBe(true)
  })

  it('pula enviadas/lixo/rascunho/resolvido', () => {
    expect(
      shouldSyncMailbox({
        path: 'INBOX.enviadas',
        name: 'enviadas',
        specialUse: '\\Sent',
      }),
    ).toBe(false)
    expect(
      shouldSyncMailbox({ path: 'INBOX.lixo', name: 'lixo', specialUse: '\\Trash' }),
    ).toBe(false)
    expect(shouldSyncMailbox({ path: 'INBOX.Resolvido', name: 'Resolvido' })).toBe(
      false,
    )
  })
})

describe('sortWorkMailboxes', () => {
  it('INBOX por último', () => {
    const sorted = sortWorkMailboxes([
      { path: 'INBOX', name: 'INBOX' },
      { path: 'INBOX.Yamada', name: 'Yamada' },
    ])
    expect(sorted.map((b) => b.path)).toEqual(['INBOX.Yamada', 'INBOX'])
    expect(isInboxMailbox('INBOX')).toBe(true)
  })
})
