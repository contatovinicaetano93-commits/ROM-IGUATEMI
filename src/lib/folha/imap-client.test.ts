import { describe, expect, it } from 'vitest'
import {
  canonicalFolhaImapSource,
  folhaImapSourceKeys,
  readFolhaImapConfig,
} from '@/lib/folha/imap-client'

describe('readFolhaImapConfig', () => {
  it('null sem host/user/pass', () => {
    expect(readFolhaImapConfig({} as unknown as NodeJS.ProcessEnv)).toBeNull()
    expect(
      readFolhaImapConfig({
        FOLHA_IMAP_HOST: 'imap.example.com',
        FOLHA_IMAP_USER: 'u',
      } as unknown as NodeJS.ProcessEnv),
    ).toBeNull()
  })

  it('lê config completa + lookback', () => {
    const cfg = readFolhaImapConfig({
      FOLHA_IMAP_HOST: 'imap.example.com',
      FOLHA_IMAP_PORT: '993',
      FOLHA_IMAP_USER: 'folha@x.com',
      FOLHA_IMAP_PASS: 'secret',
      FOLHA_IMAP_MAILBOX: 'INBOX/Fiscal',
    } as unknown as NodeJS.ProcessEnv)
    expect(cfg).toEqual({
      host: 'imap.example.com',
      port: 993,
      user: 'folha@x.com',
      pass: 'secret',
      mailbox: 'INBOX/Fiscal',
      rejectUnauthorized: true,
      lookbackDays: 14,
    })
  })

  it('lookbackDays respeita FOLHA_IMAP_LOOKBACK_DAYS (teto 60)', () => {
    const cfg = readFolhaImapConfig({
      FOLHA_IMAP_HOST: 'imap.example.com',
      FOLHA_IMAP_USER: 'folha@x.com',
      FOLHA_IMAP_PASS: 'secret',
      FOLHA_IMAP_LOOKBACK_DAYS: '90',
    } as unknown as NodeJS.ProcessEnv)
    expect(cfg?.lookbackDays).toBe(60)
  })
})

describe('folha IMAP source keys', () => {
  it('canônico inclui mailbox; INBOX também tem legado imap:{uid}', () => {
    expect(canonicalFolhaImapSource('INBOX.Yamada', 12)).toBe('imap:INBOX.Yamada:12')
    expect(folhaImapSourceKeys('INBOX.Yamada', 12)).toEqual(['imap:INBOX.Yamada:12'])
    expect(folhaImapSourceKeys('INBOX', 99, '<abc@x>')).toEqual([
      'imap:INBOX:99',
      'imap:99',
      'imap:mid:abc@x',
    ])
  })
})
