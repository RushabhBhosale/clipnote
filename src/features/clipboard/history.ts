import type { Clip } from '../../types/clip'

export function updateRepeatedCopy(clip: Clip, now: string): Clip {
  return { ...clip, lastCopiedAt: now, updatedAt: now, copyCount: clip.copyCount + 1 }
}

export function moveToTrash(clip: Clip, now: string): Clip {
  return { ...clip, deletedAt: now, updatedAt: now }
}

export function restoreFromTrash(clip: Clip, now: string): Clip {
  return { ...clip, deletedAt: undefined, updatedAt: now }
}
