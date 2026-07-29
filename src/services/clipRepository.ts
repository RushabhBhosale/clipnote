import { invoke } from '@tauri-apps/api/core'
import type { Clip, ClipDraft } from '../types/clip'

export interface ClipboardRepository {
  list(): Promise<Clip[]>
  upsert(clip: Clip): Promise<Clip>
  removePermanently(id: string): Promise<void>
  clear(): Promise<void>
}

const storageKey = 'clipnote:clips:v1'

function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function sortClips(clips: Clip[]) {
  return [...clips].sort((a, b) => new Date(b.lastCopiedAt).getTime() - new Date(a.lastCopiedAt).getTime())
}

const browserRepository: ClipboardRepository = {
  async list() {
    if (typeof localStorage === 'undefined') return []
    try {
      return sortClips(JSON.parse(localStorage.getItem(storageKey) ?? '[]') as Clip[])
    } catch {
      return []
    }
  },
  async upsert(clip) {
    const current = await this.list()
    const next = sortClips([clip, ...current.filter((entry) => entry.id !== clip.id)])
    localStorage.setItem(storageKey, JSON.stringify(next))
    return clip
  },
  async removePermanently(id) {
    const current = await this.list()
    localStorage.setItem(storageKey, JSON.stringify(current.filter((entry) => entry.id !== id)))
  },
  async clear() {
    localStorage.removeItem(storageKey)
  },
}

const tauriRepository: ClipboardRepository = {
  async list() {
    return invoke<Clip[]>('clips_list')
  },
  async upsert(clip) {
    return invoke<Clip>('clips_upsert', { clip: clip satisfies ClipDraft })
  },
  async removePermanently(id) {
    await invoke('clips_remove_permanently', { id })
  },
  async clear() {
    await invoke('clips_clear')
  },
}

export const clipRepository: ClipboardRepository = isTauri() ? tauriRepository : browserRepository
