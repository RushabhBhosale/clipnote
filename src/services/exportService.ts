import { hasExpired } from '../features/sensitive-content/detector'
import type { Clip } from '../types/clip'

function safeClips(clips: Clip[]) {
  return clips.filter((clip) => !clip.deletedAt && !hasExpired(clip))
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export const exportService = {
  exportJson(clips: Clip[]) {
    download(`clipnote-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: 1, clips: safeClips(clips) }, null, 2), 'application/json')
  },
  exportMarkdown(clips: Clip[]) {
    const markdown = safeClips(clips)
      .filter((clip) => clip.contentType !== 'image')
      .map((clip) => `## ${clip.title}\n\n${clip.rawContent}\n\n_Tags: ${clip.tags.join(', ') || 'none'} · Copied: ${clip.lastCopiedAt}_`)
      .join('\n\n---\n\n')
    download(`clipnote-clips-${new Date().toISOString().slice(0, 10)}.md`, markdown, 'text/markdown;charset=utf-8')
  },
  async readImport(file: File): Promise<unknown[]> {
    const parsed: unknown = JSON.parse(await file.text())
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object' && 'clips' in parsed && Array.isArray(parsed.clips)) return parsed.clips
    throw new Error('That file is not a ClipNote JSON backup.')
  },
}
