import { describe, expect, it } from 'vitest'
import { moveToTrash, restoreFromTrash, updateRepeatedCopy } from './history'
import type { Clip } from '../../types/clip'

const clip: Clip = {
  id: 'duplicate-me', title: 'A note', rawContent: 'Use deterministic tests.', normalizedContent: 'Use deterministic tests.', contentType: 'text',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', lastCopiedAt: '2026-01-01T00:00:00.000Z', copyCount: 1,
  isFavorite: false, isSensitive: false, tags: [],
}

describe('clipboard history mutations', () => {
  it('deduplicates a repeated copy by updating the existing entry', () => {
    const updated = updateRepeatedCopy(clip, '2026-01-01T00:01:00.000Z')
    expect(updated.id).toBe(clip.id)
    expect(updated.copyCount).toBe(2)
    expect(updated.lastCopiedAt).toBe('2026-01-01T00:01:00.000Z')
  })

  it('restores a soft-deleted item from Trash', () => {
    const trashed = moveToTrash(clip, '2026-01-02T00:00:00.000Z')
    expect(trashed.deletedAt).toBeTruthy()
    expect(restoreFromTrash(trashed, '2026-01-03T00:00:00.000Z').deletedAt).toBeUndefined()
  })
})
