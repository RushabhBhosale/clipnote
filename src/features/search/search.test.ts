import { describe, expect, it } from 'vitest'
import { searchClips, validateRegex } from './search'
import type { Clip } from '../../types/clip'

const clip: Clip = {
  id: 'one', title: 'Read Tauri docs', rawContent: 'https://v2.tauri.app', normalizedContent: 'https://v2.tauri.app', contentType: 'link',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', lastCopiedAt: '2026-01-01T00:00:00.000Z', copyCount: 1,
  isFavorite: false, isSensitive: false, tags: ['reference'],
}

describe('search', () => {
  it('searches tags and validates regex expressions', () => {
    expect(searchClips([clip], 'all', 'reference', false).clips).toHaveLength(1)
    expect(searchClips([clip], 'all', '^https', true).clips).toHaveLength(1)
    expect(validateRegex('[')).toBeTruthy()
  })

  it('searches locally derived content types and URL domains without replacing text search', () => {
    const jsonClip = { ...clip, id: 'json', title: 'Payload', rawContent: '{"active":true}', contentType: 'json' as const }
    const errorClip = { ...clip, id: 'error', title: 'Build output', rawContent: 'npm ERR! command failed', contentType: 'text' as const }
    expect(searchClips([jsonClip], 'all', 'json', false).clips).toHaveLength(1)
    expect(searchClips([clip], 'all', 'tauri.app', false).clips).toHaveLength(1)
    expect(searchClips([errorClip], 'all', 'error', false).clips).toHaveLength(1)
    expect(searchClips([clip], 'all', 'Read Tauri', false).clips).toHaveLength(1)
  })
})
