import { classifyContent, suggestedTitle } from './classifier'
import { detectSensitiveContent } from '../sensitive-content/detector'
import type { Clip } from '../../types/clip'

function makeSample(id: string, content: string, minutesAgo: number, tags: string[] = []): Clip {
  const now = new Date(Date.now() - minutesAgo * 60_000).toISOString()
  const classification = classifyContent(content)
  const sensitive = detectSensitiveContent(content)
  return {
    id,
    title: suggestedTitle(content, classification.contentType),
    rawContent: content,
    normalizedContent: content.trim().replace(/\s+/g, ' '),
    contentType: classification.contentType,
    createdAt: now,
    updatedAt: now,
    lastCopiedAt: now,
    copyCount: 1,
    isFavorite: id === 'sample-code',
    isSensitive: sensitive.isSensitive,
    expiresAt: sensitive.expiresInSeconds ? new Date(Date.now() + sensitive.expiresInSeconds * 1000).toISOString() : undefined,
    tags,
    detectedLanguage: classification.detectedLanguage,
  }
}

export const sampleClips: Clip[] = [
  makeSample('sample-code', 'const formatName = (name: string) => name.trim().replace(/\\s+/g, \' \');', 2, ['utility', 'typescript']),
  makeSample('sample-command', 'git checkout -b feature/clip-search && git push -u origin feature/clip-search', 7, ['terminal']),
  makeSample('sample-link', 'https://v2.tauri.app/plugin/clipboard/', 16, ['reference']),
  makeSample('sample-json', '{\n  "theme": "system",\n  "monitoring": true\n}', 31, ['settings']),
  makeSample('sample-note', 'Remember to send the draft before Friday afternoon.', 55, ['work']),
  makeSample('sample-otp', '482916', 1, ['temporary']),
  makeSample('sample-key', 'sk_demo_4yQF2b6LWj0rC5sN8vZx3pKd', 4, ['development']),
]
