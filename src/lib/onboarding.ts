import { getSql } from '@/lib/db'

export interface OnboardingPillar {
  id: string
  name: string
  description: string | null
  order_index: number
  active: boolean
  created_at: string
}

export interface OnboardingVideo {
  id: string
  pillar_id: string | null
  title: string
  description: string | null
  video_url: string
  thumbnail_url: string | null
  duration_seconds: number | null
  order_index: number
  active: boolean
  created_at: string
}

export async function listPillars(activeOnly = true): Promise<OnboardingPillar[]> {
  const sql = getSql()
  const rows = activeOnly
    ? await sql`select * from onboarding_pillars where active = true order by order_index asc, name asc`
    : await sql`select * from onboarding_pillars order by order_index asc, name asc`
  return rows as OnboardingPillar[]
}

export async function createPillar(name: string, description?: string | null): Promise<OnboardingPillar> {
  const sql = getSql()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Nome do pilar é obrigatório')

  const existing = (await sql`
    select * from onboarding_pillars where lower(name) = lower(${trimmed}) and active = true limit 1
  `) as OnboardingPillar[]
  if (existing[0]) return existing[0]

  const rows = (await sql`
    insert into onboarding_pillars (name, description) values (${trimmed}, ${description ?? null})
    returning *
  `) as OnboardingPillar[]
  return rows[0]!
}

export async function listVideos(activeOnly = true): Promise<OnboardingVideo[]> {
  const sql = getSql()
  const rows = activeOnly
    ? await sql`select * from onboarding_videos where active = true order by order_index asc, created_at asc`
    : await sql`select * from onboarding_videos order by order_index asc, created_at asc`
  return rows as OnboardingVideo[]
}

export interface CreateVideoInput {
  pillarId: string | null
  title: string
  description?: string | null
  videoUrl: string
  thumbnailUrl?: string | null
  durationSeconds?: number | null
}

export async function createVideo(input: CreateVideoInput): Promise<OnboardingVideo> {
  const sql = getSql()
  const title = input.title.trim()
  if (!title) throw new Error('Título é obrigatório')
  const videoUrl = input.videoUrl.trim()
  if (!videoUrl) throw new Error('URL do vídeo é obrigatória')

  const rows = (await sql`
    insert into onboarding_videos (pillar_id, title, description, video_url, thumbnail_url, duration_seconds)
    values (
      ${input.pillarId}, ${title}, ${input.description ?? null}, ${videoUrl},
      ${input.thumbnailUrl ?? null}, ${input.durationSeconds ?? null}
    )
    returning *
  `) as OnboardingVideo[]
  return rows[0]!
}

export async function deactivateVideo(id: string): Promise<void> {
  const sql = getSql()
  await sql`update onboarding_videos set active = false where id = ${id}`
}
