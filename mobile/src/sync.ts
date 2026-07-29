import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { createClient, type RealtimeChannel, type User } from '@supabase/supabase-js'
import type { Clip, ContentType } from './types'

type ClipRow = {
  id: string; user_id: string; title: string; raw_content: string; normalized_content: string; content_type: ContentType
  source_application: string | null; created_at: string; updated_at: string; last_copied_at: string; copy_count: number
  is_favorite: boolean; is_sensitive: boolean; expires_at: string | null; tags: string[] | null; detected_language: string | null
  image_path: string | null; ocr_text: string | null; deleted_at: string | null; is_snippet: boolean | null
}

const extra = Constants.expoConfig?.extra as { supabaseUrl?: string, supabasePublishableKey?: string } | undefined
const supabase = extra?.supabaseUrl && extra?.supabasePublishableKey
  ? createClient(extra.supabaseUrl, extra.supabasePublishableKey, { auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : undefined

let channel: RealtimeChannel | undefined
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function fromRow(row: ClipRow): Clip {
  return {
    id: row.id, title: row.title, rawContent: row.raw_content, normalizedContent: row.normalized_content,
    contentType: row.content_type, sourceApplication: row.source_application ?? undefined, createdAt: row.created_at,
    updatedAt: row.updated_at, lastCopiedAt: row.last_copied_at, copyCount: row.copy_count, isFavorite: row.is_favorite,
    isSensitive: row.is_sensitive, expiresAt: row.expires_at ?? undefined, tags: Array.isArray(row.tags) ? row.tags : [],
    detectedLanguage: row.detected_language ?? undefined, imagePath: row.image_path ?? undefined, ocrText: row.ocr_text ?? undefined,
    deletedAt: row.deleted_at ?? undefined, isSnippet: row.is_snippet ?? false,
  }
}

function toRow(clip: Clip, userId: string): ClipRow {
  return {
    id: clip.id, user_id: userId, title: clip.title, raw_content: clip.rawContent, normalized_content: clip.normalizedContent,
    content_type: clip.contentType, source_application: clip.sourceApplication ?? null, created_at: clip.createdAt, updated_at: clip.updatedAt,
    last_copied_at: clip.lastCopiedAt, copy_count: clip.copyCount, is_favorite: clip.isFavorite, is_sensitive: false,
    expires_at: null, tags: clip.tags, detected_language: clip.detectedLanguage ?? null, image_path: clip.imagePath ?? null,
    ocr_text: clip.ocrText ?? null, deleted_at: clip.deletedAt ?? null, is_snippet: clip.isSnippet ?? false,
  }
}

async function user() {
  if (!supabase) return undefined
  const { data } = await supabase.auth.getUser()
  return data.user ?? undefined
}

export function isConfigured() { return Boolean(supabase) }

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Sync configuration is missing.')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Sync configuration is missing.')
  const { error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
}

export async function signOut() { await supabase?.auth.signOut() }

export async function sessionUser(): Promise<User | undefined> { return user() }

export async function pull() {
  if (!supabase) return []
  const current = await user()
  if (!current) return []
  const { data, error } = await supabase.from('clip_items').select('*').eq('user_id', current.id).is('deleted_at', null).order('updated_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as ClipRow[]).map(fromRow)
}

export async function push(clips: Clip[]) {
  if (!supabase) return
  const current = await user()
  if (!current || !clips.length) return
  const eligible = clips.filter((clip) => !clip.isSensitive && clip.contentType !== 'image' && !clip.expiresAt && !clip.deletedAt)
  if (!eligible.length) return
  if (eligible.some((clip) => !uuidPattern.test(clip.id))) throw new Error('A local note could not be prepared for sync.')
  const syncable = eligible
  const { error } = await supabase.from('clip_items').upsert(syncable.map((clip) => toRow(clip, current.id)), { onConflict: 'id' })
  if (error) throw error
}

export async function listen(onClips: (clips: Clip[]) => void, onUser: (current?: User) => void) {
  if (!supabase) return () => undefined
  const start = async (current?: User) => {
    await channel?.unsubscribe()
    channel = undefined
    if (!current) return
    channel = supabase.channel(`clipnote:mobile:${current.id}`).on('postgres_changes', {
      event: '*', schema: 'public', table: 'clip_items', filter: `user_id=eq.${current.id}`,
    }, (payload) => {
      if (payload.eventType !== 'DELETE' && payload.new) {
        const clip = fromRow(payload.new as ClipRow)
        if (!clip.deletedAt) onClips([clip])
      }
    }).subscribe()
  }
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    onUser(session?.user)
    void start(session?.user)
  })
  const current = await user()
  onUser(current)
  await start(current)
  return () => { subscription.unsubscribe(); void channel?.unsubscribe(); channel = undefined }
}
