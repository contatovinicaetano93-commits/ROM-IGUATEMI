import 'server-only'

import { getIntranetSql } from '@/lib/db'
import { parseIntranetPostKind, type IntranetPostKind } from '@/lib/cms-kinds'

export type { IntranetPostKind }

export type IntranetPost = {
  id: string
  kind: IntranetPostKind
  title: string
  body: string
  excerpt: string
  image_url: string | null
  href: string | null
  location: string | null
  starts_at: string | null
  ends_at: string | null
  published_at: string | null
  author_name: string
  sort_order: number
}

function isMissingRelation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /intranet_posts|intranet_notifications|does not exist|relation|DATABASE_URL não configurada/i.test(msg)
}

function mapPost(row: Record<string, unknown>): IntranetPost {
  return {
    id: String(row.id),
    kind: parseIntranetPostKind(row.kind),
    title: String(row.title),
    body: String(row.body ?? ''),
    excerpt: String(row.excerpt ?? ''),
    image_url: row.image_url ? String(row.image_url) : null,
    href: row.href ? String(row.href) : null,
    location: row.location ? String(row.location) : null,
    starts_at: row.starts_at ? String(row.starts_at) : null,
    ends_at: row.ends_at ? String(row.ends_at) : null,
    published_at: row.published_at ? String(row.published_at) : null,
    author_name: String(row.author_name ?? ''),
    sort_order: Number(row.sort_order) || 0,
  }
}

export async function listPublishedPosts(kind?: IntranetPostKind): Promise<IntranetPost[]> {
  try {
    const sql = getIntranetSql()
    const rows = kind
      ? ((await sql`
          select * from intranet_posts
          where published_at is not null and kind = ${kind}
          order by sort_order desc, published_at desc
          limit 50
        `) as Record<string, unknown>[])
      : ((await sql`
          select * from intranet_posts
          where published_at is not null
          order by sort_order desc, published_at desc
          limit 50
        `) as Record<string, unknown>[])
    return rows.map(mapPost)
  } catch (error) {
    if (isMissingRelation(error)) return []
    throw error
  }
}

export async function listAllPosts(): Promise<IntranetPost[]> {
  try {
    const sql = getIntranetSql()
    const rows = (await sql`
      select * from intranet_posts
      order by created_at desc
      limit 100
    `) as Record<string, unknown>[]
    return rows.map(mapPost)
  } catch (error) {
    if (isMissingRelation(error)) return []
    throw error
  }
}

export async function createPost(input: {
  kind: IntranetPostKind
  title: string
  body?: string
  excerpt?: string
  image_url?: string | null
  href?: string | null
  location?: string | null
  starts_at?: string | null
  ends_at?: string | null
  publish?: boolean
  author_name: string
  author_id?: string | null
}): Promise<IntranetPost> {
  const sql = getIntranetSql()
  const publishedAt = input.publish === false ? null : new Date().toISOString()
  const rows = (await sql`
    insert into intranet_posts (
      kind, title, body, excerpt, image_url, href, location, starts_at, ends_at,
      published_at, author_name, author_id
    ) values (
      ${input.kind},
      ${input.title.trim()},
      ${input.body?.trim() ?? ''},
      ${input.excerpt?.trim() ?? ''},
      ${input.image_url ?? null},
      ${input.href ?? null},
      ${input.location ?? null},
      ${input.starts_at ?? null},
      ${input.ends_at ?? null},
      ${publishedAt},
      ${input.author_name},
      ${input.author_id ?? null}
    )
    returning *
  `) as Record<string, unknown>[]
  const created = rows[0]
  if (!created) throw new Error('Falha ao publicar.')
  return mapPost(created)
}

export async function listUnreadNotifications(readerKey: string): Promise<
  Array<{ id: string; title: string; body: string; href: string | null; created_at: string }>
> {
  try {
    const sql = getIntranetSql()
    const rows = (await sql`
      select n.id, n.title, n.body, n.href, n.created_at
      from intranet_notifications n
      left join intranet_notification_reads r
        on r.notification_id = n.id and r.reader_key = ${readerKey}
      where r.reader_key is null
      order by n.created_at desc
      limit 20
    `) as Array<{ id: string; title: string; body: string; href: string | null; created_at: string }>
    return rows
  } catch (error) {
    if (isMissingRelation(error)) return []
    throw error
  }
}

export async function markNotificationsRead(readerKey: string): Promise<void> {
  try {
    const sql = getIntranetSql()
    await sql`
      insert into intranet_notification_reads (notification_id, reader_key)
      select n.id, ${readerKey}
      from intranet_notifications n
      on conflict do nothing
    `
  } catch (error) {
    if (isMissingRelation(error)) return
    throw error
  }
}

export async function notifyIntranet(input: {
  title: string
  body?: string
  href?: string | null
  audience_key?: string | null
}): Promise<void> {
  try {
    const sql = getIntranetSql()
    await sql`
      insert into intranet_notifications (audience_key, title, body, href)
      values (${input.audience_key ?? null}, ${input.title}, ${input.body ?? ''}, ${input.href ?? null})
    `
  } catch (error) {
    if (isMissingRelation(error)) return
    throw error
  }
}
