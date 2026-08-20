import { describe, expect, it } from 'vitest'
import { clipboardImageRetentionMs, isClipboardImageExpired } from './imageRetention'
import type { Clip } from '../../types/clip'

const now = Date.parse('2026-08-20T12:00:00.000Z')
const image: Clip = {
  id: 'image-1', title: 'Image', rawContent: 'Copied image', normalizedContent: 'fingerprint', contentType: 'image',
  createdAt: '2026-08-13T12:00:00.000Z', updatedAt: '2026-08-13T12:00:00.000Z', lastCopiedAt: '2026-08-13T12:00:00.000Z', copyCount: 1,
  isFavorite: false, isSensitive: false, tags: [], imagePath: '/local/image.png',
}

describe('clipboard image retention', () => {
  it('expires images exactly seven days after their most recent copy', () => {
    expect(isClipboardImageExpired(image, now)).toBe(true)
    expect(isClipboardImageExpired({ ...image, lastCopiedAt: new Date(now - clipboardImageRetentionMs + 1).toISOString() }, now)).toBe(false)
  })

  it('does not expire text clips', () => {
    expect(isClipboardImageExpired({ ...image, contentType: 'text' }, now)).toBe(false)
  })
})
