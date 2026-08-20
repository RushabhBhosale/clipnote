import type { Clip } from '../../types/clip'

export const clipboardImageRetentionMs = 7 * 24 * 60 * 60 * 1000

export function isClipboardImageExpired(clip: Clip, now = Date.now()) {
  if (clip.contentType !== 'image') return false
  const copiedAt = new Date(clip.lastCopiedAt).getTime()
  return Number.isFinite(copiedAt) && copiedAt <= now - clipboardImageRetentionMs
}
