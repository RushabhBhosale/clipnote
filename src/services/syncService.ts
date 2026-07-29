import { createClient, type RealtimeChannel, type User } from '@supabase/supabase-js'
import { hasExpired } from '../features/sensitive-content/detector'
import type { Clip } from '../types/clip'

type ClipRow = {
  id: string
  user_id: string
  title: string
  raw_content: string
  normalized_content: string
  content_type: Clip['contentType']
  source_application: string | null
  created_at: string
  updated_at: string
  last_copied_at: string
  copy_count: number
  is_favorite: boolean
  is_sensitive: boolean
  expires_at: string | null
  tags: string[] | null
  detected_language: string | null
  image_path: string | null
  ocr_text: string | null
  deleted_at: string | null
  is_snippet: boolean | null
}

const config = import.meta.env as Record<string, string | undefined>
const url = config.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

// The publishable key is designed for client apps. Every row is additionally
// protected by the RLS policies in supabase/migrations/001_clip_sync.sql.
const supabase = url && publishableKey
  ? createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : undefined

let realtimeChannel: RealtimeChannel | undefined

function fromRow(row: ClipRow): Clip {
  return {
    id: row.id,
    title: row.title,
    rawContent: row.raw_content,
    normalizedContent: row.normalized_content,
    contentType: row.content_type,
    sourceApplication: row.source_application ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCopiedAt: row.last_copied_at,
    copyCount: row.copy_count,
    isFavorite: row.is_favorite,
    isSensitive: row.is_sensitive,
    expiresAt: row.expires_at ?? undefined,
    tags: Array.isArray(row.tags) ? row.tags : [],
    detectedLanguage: row.detected_language ?? undefined,
    imagePath: row.image_path ?? undefined,
    ocrText: row.ocr_text ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    isSnippet: row.is_snippet ?? false,
  }
}

function toRow(clip: Clip, userId: string): ClipRow {
  return {
    id: clip.id,
    user_id: userId,
    title: clip.title,
    raw_content: clip.rawContent,
    normalized_content: clip.normalizedContent,
    content_type: clip.contentType,
    source_application: clip.sourceApplication ?? null,
    created_at: clip.createdAt,
    updated_at: clip.updatedAt,
    last_copied_at: clip.lastCopiedAt,
    copy_count: clip.copyCount,
    is_favorite: clip.isFavorite,
    is_sensitive: clip.isSensitive,
    expires_at: clip.expiresAt ?? null,
    tags: clip.tags,
    detected_language: clip.detectedLanguage ?? null,
    image_path: clip.imagePath ?? null,
    ocr_text: clip.ocrText ?? null,
    deleted_at: clip.deletedAt ?? null,
    is_snippet: clip.isSnippet ?? false,
  }
}

function canSync(clip: Clip) {
  // Temporary and sensitive values never leave the device that captured them.
  // Trash is intentionally device-local: a stale or accidental tombstone must
  // never erase a valid note on every other device.
  return !clip.isSensitive && !clip.deletedAt && !hasExpired(clip)
}

async function currentUser(): Promise<User | undefined> {
  if (!supabase) return undefined
  const { data } = await supabase.auth.getUser()
  return data.user ?? undefined
}

export function isCloudSyncConfigured() {
  return Boolean(supabase)
}

export async function pullCloudClips(): Promise<Clip[]> {
  if (!supabase) return []
  const user = await currentUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('clip_items')
    .select('*')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
  if (error) throw new Error('Could not download your synced notes.')
  return ((data ?? []) as ClipRow[]).map(fromRow).filter(canSync)
}

export async function pushCloudClips(clips: Clip[]) {
  if (!supabase) return
  const user = await currentUser()
  if (!user) return
  const rows = clips.filter(canSync).map((clip) => toRow(clip, user.id))
  if (!rows.length) return
  const { error } = await supabase.from('clip_items').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error('Could not upload your latest notes.')
}

export async function signInWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Cloud sync is not configured.')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signUpWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Cloud sync is not configured.')
  const { error } = await supabase.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
}

export async function signOutOfCloudSync() {
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function subscribeToCloudSync(
  onClips: (clips: Clip[]) => void,
  onUser: (user: User | undefined) => void,
) {
  if (!supabase) return () => undefined

  const startRealtime = async (user: User | undefined) => {
    await realtimeChannel?.unsubscribe()
    realtimeChannel = undefined
    if (!user) return
    realtimeChannel = supabase
      .channel(`clipnote:${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'clip_items',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE' || !payload.new) return
        const clip = fromRow(payload.new as ClipRow)
        if (canSync(clip)) onClips([clip])
      })
      .subscribe()
  }

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user
    onUser(user)
    void startRealtime(user)
  })
  const { data: { user } } = await supabase.auth.getUser()
  onUser(user ?? undefined)
  await startRealtime(user ?? undefined)

  return () => {
    subscription.unsubscribe()
    void realtimeChannel?.unsubscribe()
    realtimeChannel = undefined
  }
}
