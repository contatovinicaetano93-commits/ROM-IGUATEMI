import { describe, expect, it } from 'vitest'
import { readFolhaImapConfig } from '@/lib/folha/imap-client'

describe('readFolhaImapConfig', () => {
  it('null sem host/user/pass', () => {
    expect(readFolhaImapConfig({})).toBeNull()
    expect(
      readFolhaImapConfig({
        FOLHA_IMAP_HOST: 'imap.example.com',
        FOLHA_IMAP_USER: 'u',
      } as NodeJS.ProcessEnv),
    ).toBeNull()
  })

  it('lê config completa', () => {
    const cfg = readFolhaImapConfig({
      FOLHA_IMAP_HOST: 'imap.example.com',
      FOLHA_IMAP_PORT: '993',
      FOLHA_IMAP_USER: 'folha@x.com',
      FOLHA_IMAP_PASS: 'secret',
      FOLHA_IMAP_MAILBOX: 'INBOX/Fiscal',
    } as NodeJS.ProcessEnv)
    expect(cfg).toEqual({
      host: 'imap.example.com',
      port: 993,
      user: 'folha@x.com',
      pass: 'secret',
      mailbox: 'INBOX/Fiscal',
      rejectUnauthorized: true,
    })
  })
})
