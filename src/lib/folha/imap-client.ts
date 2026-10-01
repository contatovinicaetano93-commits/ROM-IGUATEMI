/**
 * Cliente IMAP mínimo (LOGIN / SELECT / SEARCH / FETCH / STORE \Seen / LOGOUT)
 * só para a caixa da Folha — sem dependência externa.
 */

import { connect as tlsConnect, type TLSSocket } from 'node:tls'

export type FolhaImapConfig = {
  host: string
  port: number
  user: string
  pass: string
  /** default INBOX */
  mailbox?: string
  /** rejeitar cert inválido? default true em prod */
  rejectUnauthorized?: boolean
}

export type FolhaImapMessage = {
  uid: number
  subject: string
  body: string
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
  return {
    host,
    port,
    user,
    pass,
    mailbox: env.FOLHA_IMAP_MAILBOX?.trim() || 'INBOX',
    rejectUnauthorized: env.FOLHA_IMAP_TLS_INSECURE === '1' ? false : true,
  }
}

function quoteImapString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

class ImapSession {
  private sock: TLSSocket
  private buf = ''
  private tagSeq = 0

  constructor(sock: TLSSocket) {
    this.sock = sock
  }

  static async connect(cfg: FolhaImapConfig): Promise<ImapSession> {
    const sock = await new Promise<TLSSocket>((resolve, reject) => {
      const s = tlsConnect(
        {
          host: cfg.host,
          port: cfg.port,
          servername: cfg.host,
          rejectUnauthorized: cfg.rejectUnauthorized !== false,
        },
        () => resolve(s),
      )
      s.setEncoding('utf8')
      s.on('error', reject)
      s.setTimeout(25_000, () => {
        s.destroy(new Error('IMAP timeout'))
      })
    })
    const session = new ImapSession(sock)
    await session.readUntilReady()
    return session
  }

  private readChunk(): Promise<string> {
    return new Promise((resolve, reject) => {
      const onData = (chunk: string | Buffer) => {
        cleanup()
        resolve(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
      }
      const onErr = (err: Error) => {
        cleanup()
        reject(err)
      }
      const onEnd = () => {
        cleanup()
        reject(new Error('IMAP connection closed'))
      }
      const cleanup = () => {
        this.sock.off('data', onData)
        this.sock.off('error', onErr)
        this.sock.off('end', onEnd)
      }
      this.sock.on('data', onData)
      this.sock.on('error', onErr)
      this.sock.on('end', onEnd)
    })
  }

  private async readUntilReady() {
    // greeting
    for (;;) {
      if (this.buf.includes('\n')) break
      this.buf += await this.readChunk()
    }
  }

  private async command(cmd: string): Promise<string> {
    this.tagSeq += 1
    const tag = `A${this.tagSeq}`
    this.sock.write(`${tag} ${cmd}\r\n`)
    for (;;) {
      const done = new RegExp(`^${tag} (OK|NO|BAD)\\b`, 'm')
      if (done.test(this.buf)) {
        const idx = this.buf.search(done)
        const m = this.buf.slice(idx).match(done)
        const status = m?.[1]
        const end = this.buf.indexOf('\n', idx)
        const block = this.buf.slice(0, end >= 0 ? end + 1 : this.buf.length)
        this.buf = this.buf.slice(end >= 0 ? end + 1 : this.buf.length)
        if (status !== 'OK') {
          throw new Error(`IMAP ${status}: ${cmd.split(' ')[0]} — ${block.trim()}`)
        }
        return block
      }
      this.buf += await this.readChunk()
    }
  }

  async login(user: string, pass: string) {
    await this.command(`LOGIN ${quoteImapString(user)} ${quoteImapString(pass)}`)
  }

  async select(mailbox: string) {
    await this.command(`SELECT ${quoteImapString(mailbox)}`)
  }

  private async searchUids(criteria: string): Promise<number[]> {
    const raw = await this.command(`UID SEARCH ${criteria}`)
    const m = raw.match(/\* SEARCH[^\n]*/i)
    if (!m) return []
    return (m[0].match(/\d+/g) ?? []).map(Number).filter((n) => n > 0)
  }

  /** UIDs não lidos com DARF ou DAS no assunto. */
  async searchTaxUnseen(): Promise<number[]> {
    const a = await this.searchUids('UNSEEN SUBJECT DARF')
    const b = await this.searchUids('UNSEEN SUBJECT DAS')
    const c = await this.searchUids('UNSEEN SUBJECT "Simples Nacional"')
    return [...new Set([...a, ...b, ...c])].sort((x, y) => x - y)
  }

  async fetchMessage(uid: number): Promise<FolhaImapMessage> {
    this.tagSeq += 1
    const tag = `A${this.tagSeq}`
    this.sock.write(
      `${tag} UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (SUBJECT)] BODY.PEEK[TEXT])\r\n`,
    )
    for (;;) {
      const done = new RegExp(`^${tag} (OK|NO|BAD)\\b`, 'm')
      if (done.test(this.buf)) {
        const idx = this.buf.search(done)
        const statusMatch = this.buf.slice(idx).match(done)
        const block = this.buf.slice(0, idx)
        this.buf = this.buf.slice(this.buf.indexOf('\n', idx) + 1)
        if (statusMatch?.[1] !== 'OK') {
          throw new Error(`IMAP FETCH failed uid=${uid}`)
        }
        return parseFetchBlock(uid, block)
      }
      this.buf += await this.readChunk()
    }
  }

  async markSeen(uid: number) {
    await this.command(`UID STORE ${uid} +FLAGS (\\Seen)`)
  }

  async logout() {
    try {
      await this.command('LOGOUT')
    } catch {
      // ignore
    }
    this.sock.destroy()
  }
}

function decodeMimeWord(raw: string): string {
  // =?UTF-8?B?...?= / =?UTF-8?Q?...?=
  return raw.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_m, _cs, enc, data) => {
    try {
      if (String(enc).toUpperCase() === 'B') {
        return Buffer.from(data, 'base64').toString('utf8')
      }
      const q = String(data)
        .replace(/_/g, ' ')
        .replace(/=([0-9A-Fa-f]{2})/g, (_: string, h: string) =>
          String.fromCharCode(parseInt(h, 16)),
        )
      return q
    } catch {
      return raw
    }
  })
}

function parseFetchBlock(uid: number, block: string): FolhaImapMessage {
  let subject = ''
  let body = ''

  const headerLiteral = block.match(
    /BODY\[HEADER\.FIELDS \(SUBJECT\)\]\s*\{(\d+)\}\r?\n([\s\S]*)/i,
  )
  if (headerLiteral) {
    const len = Number(headerLiteral[1])
    const rest = headerLiteral[2] ?? ''
    const header = rest.slice(0, len)
    const subj = header.match(/^Subject:\s*(.*)$/im)
    subject = decodeMimeWord((subj?.[1] ?? '').trim())
    const after = rest.slice(len)
    const textLiteral = after.match(/BODY\[TEXT\]\s*\{(\d+)\}\r?\n([\s\S]*)/i)
    if (textLiteral) {
      const tlen = Number(textLiteral[1])
      body = (textLiteral[2] ?? '').slice(0, tlen)
    }
  } else {
    const subj = block.match(/Subject:\s*([^\r\n]+)/i)
    subject = decodeMimeWord((subj?.[1] ?? '').trim())
    body = block
  }

  return { uid, subject, body: body.trim() }
}

/** Busca e-mails fiscais não lidos. Sempre faz LOGOUT. */
export async function fetchUnseenFolhaTaxEmails(
  cfg: FolhaImapConfig,
): Promise<FolhaImapMessage[]> {
  const session = await ImapSession.connect(cfg)
  try {
    await session.login(cfg.user, cfg.pass)
    await session.select(cfg.mailbox || 'INBOX')
    const uids = await session.searchTaxUnseen()
    const out: FolhaImapMessage[] = []
    for (const uid of uids.slice(0, 40)) {
      out.push(await session.fetchMessage(uid))
    }
    return out
  } finally {
    await session.logout()
  }
}

export async function markFolhaTaxEmailsSeen(
  cfg: FolhaImapConfig,
  uids: number[],
): Promise<void> {
  if (uids.length === 0) return
  const session = await ImapSession.connect(cfg)
  try {
    await session.login(cfg.user, cfg.pass)
    await session.select(cfg.mailbox || 'INBOX')
    for (const uid of uids) {
      await session.markSeen(uid)
    }
  } finally {
    await session.logout()
  }
}
