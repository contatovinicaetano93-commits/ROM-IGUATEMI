/**
 * IMAP Folha: pastas de trabalho + lookback (não UNSEEN) + RFC822/PDF.
 */

import { ImapFlow } from 'imapflow'
import { simpleParser, type Attachment } from 'mailparser'
import {
  isInboxMailbox,
  shouldSyncMailbox,
  sortWorkMailboxes,
} from '@/lib/folha/imap-mailbox'
import { extractPdfText } from '@/lib/folha/imap-pdf'

export const FOLHA_IMAP_FETCH_CAP = 40

export type FolhaImapConfig = {
  host: string
  port: number
  user: string
  pass: string
  mailbox?: string
  rejectUnauthorized?: boolean
  lookbackDays: number
}

export type FolhaImapCandidate = {
  mailbox: string
  uid: number
}

export type FolhaImapMessage = FolhaImapCandidate & {
  messageId: string | null
  subject: string
  body: string
  filenames: string[]
}

export function readFolhaImapConfig(
  env: NodeJS.ProcessEnv = process.env,
): FolhaImapConfig | null {
  const host = env.FOLHA_IMAP_HOST?.trim()
  const user = env.FOLHA_IMAP_USER?.trim()
  const pass = env.FOLHA_IMAP_PASS?.trim()
  if (!host || !user || !pass) return null
  const portRaw = env.FOLHA_IMAP_PORT?.trim()
  const port = portRaw ? Number(portRaw) : 993
  if (!Number.isFinite(port) || port <= 0) return null
  const lookbackRaw = Number(env.FOLHA_IMAP_LOOKBACK_DAYS ?? '14')
  const lookbackDays =
    Number.isFinite(lookbackRaw) && lookbackRaw > 0 ? Math.min(lookbackRaw, 60) : 14
  return {
    host,
    port,
    user,
    pass,
    mailbox: env.FOLHA_IMAP_MAILBOX?.trim() || 'INBOX',
    rejectUnauthorized: env.FOLHA_IMAP_TLS_INSECURE === '1' ? false : true,
    lookbackDays,
  }
}

export function canonicalFolhaImapSource(mailbox: string, uid: number): string {
  return `imap:${mailbox}:${uid}`
}

export function folhaImapSourceKeys(
  mailbox: string,
  uid: number,
  messageId?: string | null,
): string[] {
  const keys = [canonicalFolhaImapSource(mailbox, uid)]
  if (isInboxMailbox(mailbox)) keys.push(`imap:${uid}`)
  const mid = messageId?.replace(/[<>]/g, '').trim()
  if (mid) keys.push(`imap:mid:${mid}`)
  return [...new Set(keys)]
}

function createClient(cfg: FolhaImapConfig): ImapFlow {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    disableAutoIdle: true,
    tls: { rejectUnauthorized: cfg.rejectUnauthorized !== false },
  })
}

async function withImap<T>(
  cfg: FolhaImapConfig,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = createClient(cfg)
  await client.connect()
  try {
    return await fn(client)
  } finally {
    try {
      await client.logout()
    } catch {
      client.close()
    }
  }
}

function searchSince(cfg: FolhaImapConfig): Date {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - cfg.lookbackDays)
  return since
}

export async function listFolhaImapCandidates(
  cfg: FolhaImapConfig,
): Promise<FolhaImapCandidate[]> {
  return withImap(cfg, async (client) => {
    const listed = await client.list()
    const folders = sortWorkMailboxes(
      listed.filter((box) =>
        shouldSyncMailbox({
          path: box.path,
          name: box.name,
          specialUse: box.specialUse,
          flags: box.flags,
          delimiter: box.delimiter,
        }),
      ),
    )
    const since = searchSince(cfg)
    const out: FolhaImapCandidate[] = []
    for (const folder of folders) {
      const lock = await client.getMailboxLock(folder.path)
      try {
        const uids = await client.search({ since }, { uid: true })
        const newest = [...(uids || [])]
          .map(Number)
          .filter((n) => n > 0)
          .sort((a, b) => b - a)
        for (const uid of newest) out.push({ mailbox: folder.path, uid })
      } finally {
        lock.release()
      }
    }
    return out
  })
}

async function attachmentBlob(attachment: Attachment): Promise<{
  text: string
  fileName: string
} | null> {
  const fileName = attachment.filename?.trim() || 'anexo'
  const content = attachment.content
  if (!content || !Buffer.isBuffer(content) || content.length === 0) return null
  if (/\.pdf$/i.test(fileName) || /pdf/i.test(attachment.contentType || '')) {
    return extractPdfText(content, fileName)
  }
  return null
}

async function parseRawMessage(
  mailbox: string,
  uid: number,
  source: Buffer,
  envelopeSubject?: string | null,
  envelopeMessageId?: string | null,
): Promise<FolhaImapMessage> {
  const parsed = await simpleParser(source)
  const filenames: string[] = []
  const texts: string[] = []
  if (parsed.text?.trim()) texts.push(parsed.text.trim())
  for (const att of parsed.attachments ?? []) {
    const blob = await attachmentBlob(att)
    if (!blob) continue
    filenames.push(blob.fileName)
    if (blob.text.trim()) texts.push(blob.text.trim())
    else texts.push(blob.fileName)
  }
  const subject =
    (parsed.subject || envelopeSubject || '').trim() ||
    filenames[0] ||
    ''
  return {
    mailbox,
    uid,
    messageId: (parsed.messageId || envelopeMessageId || '').trim() || null,
    subject,
    body: texts.join('\n\n'),
    filenames,
  }
}

export async function fetchFolhaImapMessages(
  cfg: FolhaImapConfig,
  targets: FolhaImapCandidate[],
): Promise<FolhaImapMessage[]> {
  if (targets.length === 0) return []
  return withImap(cfg, async (client) => {
    const byBox = new Map<string, number[]>()
    for (const t of targets) {
      const list = byBox.get(t.mailbox) ?? []
      list.push(t.uid)
      byBox.set(t.mailbox, list)
    }
    const out: FolhaImapMessage[] = []
    for (const [mailbox, uids] of byBox) {
      const lock = await client.getMailboxLock(mailbox)
      try {
        for (const uid of uids) {
          const fetched = await client.fetchOne(
            String(uid),
            { source: true, envelope: true, uid: true },
            { uid: true },
          )
          if (!fetched?.source) continue
          const source = Buffer.isBuffer(fetched.source)
            ? fetched.source
            : Buffer.from(fetched.source)
          out.push(
            await parseRawMessage(
              mailbox,
              uid,
              source,
              fetched.envelope?.subject,
              fetched.envelope?.messageId,
            ),
          )
        }
      } finally {
        lock.release()
      }
    }
    return out
  })
}

export async function markFolhaTaxEmailsSeen(
  cfg: FolhaImapConfig,
  items: FolhaImapCandidate[],
): Promise<void> {
  if (items.length === 0) return
  await withImap(cfg, async (client) => {
    const byBox = new Map<string, number[]>()
    for (const t of items) {
      const list = byBox.get(t.mailbox) ?? []
      list.push(t.uid)
      byBox.set(t.mailbox, list)
    }
    for (const [mailbox, uids] of byBox) {
      const lock = await client.getMailboxLock(mailbox)
      try {
        await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true })
      } finally {
        lock.release()
      }
    }
  })
}
