import type { Clip, ClipSection } from '../../types/clip'
import { detectionSearchText } from '../smart-actions/actionEngine'

export interface SearchResult {
  clips: Clip[]
  error?: string
}

export function validateRegex(query: string) {
  try {
    new RegExp(query, 'i')
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid regular expression'
  }
}

function matchesSection(clip: Clip, section: ClipSection) {
  if (section === 'all') return !clip.deletedAt && !clip.isSnippet
  if (section === 'favorites') return !clip.deletedAt && clip.isFavorite
  if (section === 'text') return !clip.deletedAt && ['text', 'email', 'phone', 'otp', 'password', 'json', 'command', 'file', 'other'].includes(clip.contentType) && !clip.isSnippet
  if (section === 'code') return !clip.deletedAt && ['code', 'json', 'command'].includes(clip.contentType) && !clip.isSnippet
  if (section === 'links') return !clip.deletedAt && clip.contentType === 'link' && !clip.isSnippet
  if (section === 'images') return !clip.deletedAt && clip.contentType === 'image' && !clip.isSnippet
  if (section === 'sensitive') return !clip.deletedAt && clip.isSensitive
  if (section === 'trash') return Boolean(clip.deletedAt)
  return !clip.deletedAt && Boolean(clip.isSnippet)
}

export function searchClips(clips: Clip[], section: ClipSection, query: string, regexMode: boolean): SearchResult {
  const scoped = clips.filter((clip) => matchesSection(clip, section))
  const trimmed = query.trim()
  if (!trimmed) return { clips: scoped }
  if (regexMode) {
    const error = validateRegex(trimmed)
    if (error) return { clips: [], error }
    const regex = new RegExp(trimmed, 'i')
    return { clips: scoped.filter((clip) => regex.test(`${clip.rawContent}\n${clip.ocrText ?? ''}\n${detectionSearchText(clip.rawContent)}`)) }
  }
  const needle = trimmed.toLocaleLowerCase()
  return {
    clips: scoped.filter((clip) => [clip.title, clip.rawContent, clip.ocrText, clip.tags.join(' '), clip.sourceApplication, detectionSearchText(clip.rawContent)]
      .filter(Boolean)
      .join('\n')
      .toLocaleLowerCase()
      .includes(needle)),
  }
}
