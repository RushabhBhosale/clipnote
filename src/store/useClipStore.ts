import { create } from 'zustand'
import { classifyContent, suggestedTitle } from '../features/clipboard/classifier'
import { moveToTrash as markTrashed, restoreFromTrash as untrash, updateRepeatedCopy } from '../features/clipboard/history'
import { isClipboardImageExpired } from '../features/clipboard/imageRetention'
import { richTextPlainText } from '../features/notes/richText'
import { detectSensitiveContent, hasExpired } from '../features/sensitive-content/detector'
import { makeId, toIsoDate } from '../lib/utils'
import { systemClipboardProvider, type ClipboardImagePayload } from '../services/clipboardProvider'
import { dismissAfterCopy } from '../services/nativeService'
import { clipRepository } from '../services/clipRepository'
import { saveClipboardImage } from '../services/imageService'
import { loadSettings, saveSettings } from '../services/settingsRepository'
import { defaultSettings, type Clip, type ClipSettings } from '../types/clip'

let stopMonitoring: (() => void) | undefined
let imagePurgeTimer: number | undefined

interface ClipState {
  clips: Clip[]
  settings: ClipSettings
  isMonitoring: boolean
  isReady: boolean
  error?: string
  toast?: string
  initialize: () => Promise<void>
  setMonitoring: (enabled: boolean) => void
  ingestText: (text: string, sourceApplication?: string) => Promise<void>
  ingestImage: (payload: ClipboardImagePayload, sourceApplication?: string) => Promise<void>
  addNote: (text: string) => Promise<string | undefined>
  addActionResult: (text: string, title: string) => Promise<string | undefined>
  copyText: (text: string) => Promise<boolean>
  createNote: (text: string, title?: string, color?: string) => Promise<string | undefined>
  saveStickyNote: (text: string, id?: string, title?: string) => Promise<string | undefined>
  consolidateDailyNotes: () => Promise<void>
  updateClip: (id: string, patch: Partial<Clip>) => Promise<void>
  copyClip: (id: string) => Promise<void>
  duplicateClip: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  convertToSnippet: (id: string) => Promise<void>
  moveToTrash: (id: string) => Promise<void>
  restoreFromTrash: (id: string) => Promise<void>
  removePermanently: (id: string) => Promise<void>
  emptyTrash: () => Promise<void>
  clearHistory: () => Promise<void>
  importClips: (entries: unknown[]) => Promise<void>
  mergeRemoteClips: (entries: Clip[]) => Promise<void>
  purgeExpiredImages: () => Promise<void>
  updateSettings: (patch: Partial<ClipSettings>) => void
  clearToast: () => void
}

function activeClips(clips: Clip[]) {
  return clips.filter((clip) => !clip.deletedAt)
}

function orderClips(clips: Clip[]) {
  return [...clips].sort((a, b) => new Date(b.lastCopiedAt).getTime() - new Date(a.lastCopiedAt).getTime())
}

async function persist(clip: Clip) {
  await clipRepository.upsert(clip)
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function isWrittenNote(clip: Clip) {
  return clip.sourceApplication === 'Note' || clip.sourceApplication === 'Mobile note' || clip.sourceApplication === 'Daily note'
}

function localDayKey(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function createClip(text: string, settings: ClipSettings, sourceApplication?: string): Clip {
  const now = toIsoDate()
  const classification = classifyContent(text)
  const sensitive = settings.sensitiveDetection ? detectSensitiveContent(text) : { isSensitive: false }
  const contentType = sensitive.kind === 'otp' ? 'otp' : sensitive.isSensitive ? 'password' : classification.contentType
  const expiresAt = sensitive.isSensitive && sensitive.expiresInSeconds
    ? new Date(Date.now() + sensitive.expiresInSeconds * 1000).toISOString()
    : undefined
  return {
    id: makeId(),
    title: suggestedTitle(text, contentType),
    rawContent: text,
    normalizedContent: normalize(text),
    contentType,
    sourceApplication,
    createdAt: now,
    updatedAt: now,
    lastCopiedAt: now,
    copyCount: 1,
    isFavorite: false,
    isSensitive: sensitive.isSensitive,
    expiresAt,
    tags: [],
    detectedLanguage: classification.detectedLanguage,
  }
}

async function trimHistory(clips: Clip[], settings: ClipSettings) {
  const removable = activeClips(clips)
    // Notes are intentional writing, not disposable clipboard history. They
    // must never disappear merely because the clipboard retention limit runs.
    .filter((clip) => !clip.isFavorite && !clip.isSnippet && clip.sourceApplication !== 'Note' && clip.sourceApplication !== 'Mobile note')
    .sort((a, b) => new Date(b.lastCopiedAt).getTime() - new Date(a.lastCopiedAt).getTime())
  const overflow = removable.slice(settings.maxClips)
  await Promise.all(overflow.map((clip) => persist({ ...clip, deletedAt: toIsoDate(), updatedAt: toIsoDate() })))
  return overflow.map((clip) => clip.id)
}

async function removeExpiredImageClips(clips: Clip[]) {
  const expired = clips.filter((clip) => isClipboardImageExpired(clip))
  if (!expired.length) return clips
  const results = await Promise.allSettled(expired.map((clip) => clipRepository.removePermanently(clip.id)))
  const removedIds = new Set(expired.flatMap((clip, index) => results[index].status === 'fulfilled' ? [clip.id] : []))
  return clips.filter((clip) => !removedIds.has(clip.id))
}

export const useClipStore = create<ClipState>((set, get) => ({
  clips: [],
  settings: defaultSettings,
  isMonitoring: true,
  isReady: false,
  async initialize() {
    const settings = loadSettings()
    try {
      const clips = await clipRepository.list()
      const fresh = clips.filter((clip) => !hasExpired(clip))
      const expired = clips.filter((clip) => hasExpired(clip))
      await Promise.all(expired.map((clip) => clipRepository.removePermanently(clip.id)))
      const retained = await removeExpiredImageClips(fresh)
      set({ clips: orderClips(retained), settings, isMonitoring: settings.startMonitoring, isReady: true })
      if (settings.startMonitoring) get().setMonitoring(true)
      if (imagePurgeTimer === undefined) {
        imagePurgeTimer = window.setInterval(() => { void get().purgeExpiredImages() }, 60_000)
      }
    } catch {
      set({ error: 'ClipNote could not open local clipboard history.', settings, isReady: true })
    }
  },
  setMonitoring(enabled) {
    stopMonitoring?.()
    stopMonitoring = undefined
    if (enabled) {
      stopMonitoring = systemClipboardProvider.start(
        (text) => get().ingestText(text),
        (payload) => get().ingestImage(payload),
      )
    }
    set({ isMonitoring: enabled })
  },
  async ingestText(text, sourceApplication) {
    const { settings, clips } = get()
    if (!text.trim() || !get().isMonitoring) return
    if (sourceApplication && settings.excludedApplications.some((entry) => entry.toLocaleLowerCase() === sourceApplication.toLocaleLowerCase())) return
    const now = toIsoDate()
    const existing = clips.find((entry) => !entry.deletedAt && !entry.isSnippet && entry.rawContent === text)
    if (existing) {
      const updated = updateRepeatedCopy(existing, now)
      await persist(updated)
      set({ clips: orderClips([updated, ...clips.filter((entry) => entry.id !== existing.id)]) })
      return
    }
    const clip = createClip(text, settings, sourceApplication)
    await persist(clip)
    const next = [clip, ...clips]
    const overflowIds = await trimHistory(next, settings)
    set({ clips: orderClips(next.map((entry) => overflowIds.includes(entry.id) ? { ...entry, deletedAt: now } : entry)) })
  },
  async ingestImage(payload, sourceApplication) {
    const { settings, clips } = get()
    if (!settings.saveImages || !get().isMonitoring) return
    const now = toIsoDate()
    const existing = clips.find((entry) => !entry.deletedAt && !entry.isSnippet && entry.contentType === 'image' && entry.normalizedContent === payload.fingerprint)
    if (existing) {
      const updated = updateRepeatedCopy(existing, now)
      await persist(updated)
      set({ clips: orderClips([updated, ...clips.filter((entry) => entry.id !== existing.id)]) })
      return
    }
    const id = makeId()
    const imagePath = await saveClipboardImage(id, payload.image)
    const clip: Clip = {
      id,
      title: `Image · ${payload.width}×${payload.height}`,
      rawContent: 'Copied image',
      normalizedContent: payload.fingerprint,
      contentType: 'image',
      sourceApplication,
      createdAt: now,
      updatedAt: now,
      lastCopiedAt: now,
      copyCount: 1,
      isFavorite: false,
      isSensitive: false,
      tags: [],
      imagePath,
    }
    await persist(clip)
    const next = [clip, ...clips]
    const overflowIds = await trimHistory(next, settings)
    set({ clips: orderClips(next.map((entry) => overflowIds.includes(entry.id) ? { ...entry, deletedAt: now } : entry)) })
  },
  async addNote(text) {
    return get().saveStickyNote(text)
  },
  async addActionResult(text, title) {
    if (!text.trim()) return undefined
    const result = createClip(text, get().settings, 'ClipNote Action')
    result.title = title.trim() || result.title
    await persist(result)
    const next = [result, ...get().clips]
    const overflowIds = await trimHistory(next, get().settings)
    set({ clips: orderClips(next.map((entry) => overflowIds.includes(entry.id) ? { ...entry, deletedAt: toIsoDate() } : entry)) })
    try {
      await systemClipboardProvider.write(text)
    } catch {
      set({ toast: 'Result saved, but could not update the clipboard' })
    }
    return result.id
  },
  async copyText(text) {
    try {
      await systemClipboardProvider.write(text)
      return true
    } catch {
      set({ toast: 'Could not write to the clipboard' })
      return false
    }
  },
  async createNote(text, title, color) {
    const plainText = richTextPlainText(text)
    if (!plainText.trim()) return undefined
    const note = createClip(text, get().settings, 'Daily note')
    note.title = title && title.trim() ? title.trim() : suggestedTitle(plainText, 'text')
    note.contentType = 'text'
    note.detectedLanguage = undefined
    if (color) note.color = color
    await persist(note)
    set({ clips: orderClips([note, ...get().clips]), toast: 'Note added' })
    return note.id
  },
  async saveStickyNote(text, id, title) {
    const current = id ? get().clips.find((clip) => clip.id === id && isWrittenNote(clip)) : undefined
    const plainText = richTextPlainText(text)
    if (!plainText.trim() && !current) return undefined
    if (current) {
      const now = toIsoDate()
      const updated: Clip = {
        ...current,
        rawContent: text,
        normalizedContent: normalize(plainText),
        title: title !== undefined ? title : (plainText.trim() ? suggestedTitle(plainText, 'text') : 'Today'),
        contentType: 'text',
        detectedLanguage: undefined,
        sourceApplication: 'Daily note',
        updatedAt: now,
        lastCopiedAt: now,
      }
      await persist(updated)
      set({ clips: orderClips(get().clips.map((clip) => clip.id === current.id ? updated : clip)) })
      return current.id
    }
    const note = createClip(text, get().settings, 'Daily note')
    note.title = title !== undefined ? title : (plainText.trim() ? suggestedTitle(plainText, 'text') : 'Today')
    note.contentType = 'text'
    note.detectedLanguage = undefined
    await persist(note)
    set({ clips: orderClips([note, ...get().clips]), toast: 'Note saved' })
    return note.id
  },
  async consolidateDailyNotes() {
    const currentClips = get().clips
    const groups = new Map<string, Clip[]>()
    currentClips.filter((clip) => !clip.deletedAt && !clip.isSnippet && isWrittenNote(clip)).forEach((clip) => {
      const key = localDayKey(clip.createdAt)
      groups.set(key, [...(groups.get(key) ?? []), clip])
    })
    const replacements = new Map<string, Clip>()
    const now = toIsoDate()
    for (const entries of groups.values()) {
      if (entries.length < 2) continue
      const canonical = [...entries].sort((a, b) => {
        const sourceRank = Number(b.sourceApplication === 'Daily note') - Number(a.sourceApplication === 'Daily note')
        return sourceRank || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })[0]
      let rawContent = canonical.rawContent.trim()
      for (const entry of [...entries].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())) {
        const content = entry.rawContent.trim()
        if (!content || entry.id === canonical.id || rawContent.includes(content)) continue
        rawContent += `${rawContent ? '\n\n' : ''}${content}`
      }
      const merged: Clip = {
        ...canonical,
        rawContent,
        normalizedContent: normalize(rawContent),
        title: rawContent ? suggestedTitle(rawContent, 'text') : 'Daily note',
        contentType: 'text',
        sourceApplication: 'Daily note',
        updatedAt: now,
        lastCopiedAt: now,
      }
      replacements.set(merged.id, merged)
      for (const entry of entries) {
        if (entry.id !== merged.id) replacements.set(entry.id, markTrashed(entry, now))
      }
    }
    if (!replacements.size) return
    await Promise.all([...replacements.values()].map(persist))
    set({ clips: orderClips(currentClips.map((clip) => replacements.get(clip.id) ?? clip)) })
  },
  async updateClip(id, patch) {
    const current = get().clips.find((clip) => clip.id === id)
    if (!current) return
    const updated = { ...current, ...patch, updatedAt: toIsoDate() }
    if (patch.rawContent !== undefined) updated.normalizedContent = normalize(isWrittenNote(updated) ? richTextPlainText(updated.rawContent) : updated.rawContent)
    if (updated.isFavorite) updated.expiresAt = undefined
    await persist(updated)
    set({ clips: orderClips(get().clips.map((clip) => clip.id === id ? updated : clip)) })
  },
  async copyClip(id) {
    const current = get().clips.find((clip) => clip.id === id)
    if (!current) return
    try {
      if (current.contentType === 'image' && current.imagePath) await systemClipboardProvider.writeImagePath(current.imagePath)
      else await systemClipboardProvider.write(current.rawContent)
      const updated = { ...current, lastCopiedAt: toIsoDate(), updatedAt: toIsoDate(), copyCount: current.copyCount + 1 }
      await persist(updated)
      set({ clips: orderClips([updated, ...get().clips.filter((clip) => clip.id !== id)]), toast: 'Copied' })
      await dismissAfterCopy()
    } catch {
      set({ toast: 'Could not write to the clipboard' })
    }
  },
  async duplicateClip(id) {
    const current = get().clips.find((clip) => clip.id === id)
    if (!current) return
    const now = toIsoDate()
    const duplicated: Clip = { ...current, id: makeId(), title: `${current.title} copy`, createdAt: now, updatedAt: now, lastCopiedAt: now, copyCount: 0, deletedAt: undefined }
    await persist(duplicated)
    set({ clips: orderClips([duplicated, ...get().clips]), toast: 'Duplicated' })
  },
  async toggleFavorite(id) {
    const current = get().clips.find((clip) => clip.id === id)
    if (!current) return
    await get().updateClip(id, { isFavorite: !current.isFavorite, expiresAt: !current.isFavorite ? undefined : current.expiresAt })
  },
  async convertToSnippet(id) {
    const current = get().clips.find((clip) => clip.id === id)
    if (!current) return
    await get().updateClip(id, { isSnippet: true, deletedAt: undefined })
    set({ toast: 'Saved as a snippet' })
  },
  async moveToTrash(id) {
    const current = get().clips.find((clip) => clip.id === id)
    if (!current) return
    const trashed = markTrashed(current, toIsoDate())
    await persist(trashed)
    set({ clips: orderClips(get().clips.map((clip) => clip.id === id ? trashed : clip)) })
    set({ toast: 'Moved to Trash' })
  },
  async restoreFromTrash(id) {
    const current = get().clips.find((clip) => clip.id === id)
    if (!current) return
    const restored = untrash(current, toIsoDate())
    await persist(restored)
    set({ clips: orderClips(get().clips.map((clip) => clip.id === id ? restored : clip)) })
    set({ toast: 'Restored' })
  },
  async removePermanently(id) {
    await clipRepository.removePermanently(id)
    set({ clips: get().clips.filter((clip) => clip.id !== id), toast: 'Deleted permanently' })
  },
  async emptyTrash() {
    const trash = get().clips.filter((clip) => clip.deletedAt)
    await Promise.all(trash.map((clip) => clipRepository.removePermanently(clip.id)))
    set({ clips: get().clips.filter((clip) => !clip.deletedAt), toast: 'Trash emptied' })
  },
  async clearHistory() {
    await clipRepository.clear()
    set({ clips: [], toast: 'Local clipboard history cleared' })
  },
  async importClips(entries) {
    const current = get().clips
    const knownIds = new Set(current.map((clip) => clip.id))
    const imported: Clip[] = entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const source = entry as Partial<Clip>
      if (typeof source.rawContent !== 'string' || typeof source.title !== 'string' || typeof source.contentType !== 'string') return []
      const draft = createClip(source.rawContent, get().settings, source.sourceApplication)
      const id = typeof source.id === 'string' && !knownIds.has(source.id) ? source.id : draft.id
      const next: Clip = {
        ...draft,
        id,
        title: source.title.slice(0, 512) || draft.title,
        tags: Array.isArray(source.tags) ? source.tags.filter((tag): tag is string => typeof tag === 'string' && tag.length <= 100).slice(0, 50) : [],
        isFavorite: Boolean(source.isFavorite),
        isSnippet: Boolean(source.isSnippet),
        color: typeof source.color === 'string' ? source.color : undefined,
      }
      if (hasExpired(next)) return []
      knownIds.add(id)
      return [next]
    })
    await Promise.all(imported.map(persist))
    set({ clips: orderClips([...imported, ...current]), toast: imported.length ? `${imported.length} clips imported` : 'No valid clips found in that backup' })
  },
  async mergeRemoteClips(entries) {
    const current = get().clips
    const byId = new Map(current.map((clip) => [clip.id, clip]))
    let changed = false
    for (const incoming of entries) {
      if (incoming.isSensitive || incoming.contentType === 'image' || hasExpired(incoming)) continue
      const local = byId.get(incoming.id)
      if (local && new Date(local.updatedAt).getTime() >= new Date(incoming.updatedAt).getTime()) continue
      await persist(incoming)
      byId.set(incoming.id, incoming)
      changed = true
    }
    if (changed) set({ clips: orderClips([...byId.values()]) })
  },
  async purgeExpiredImages() {
    const clips = get().clips
    const retained = await removeExpiredImageClips(clips)
    if (retained.length !== clips.length) set({ clips: orderClips(retained) })
  },
  updateSettings(patch) {
    const settings = { ...get().settings, ...patch }
    saveSettings(settings)
    set({ settings })
    if (patch.startMonitoring !== undefined) get().setMonitoring(patch.startMonitoring)
  },
  clearToast() { set({ toast: undefined }) },
}))
