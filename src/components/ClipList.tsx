import { AlertCircle, Search, SlidersHorizontal, Star } from 'lucide-react'
import type { Clip } from '../types/clip'
import { maskSensitiveContent } from '../features/sensitive-content/detector'
import { formatRelativeTime, cn } from '../lib/utils'
import { ContentTypeIcon } from './ContentTypeIcon'

interface ClipListProps {
  title: string
  clips: Clip[]
  selectedId?: string
  query: string
  regexMode: boolean
  searchError?: string
  monitoringPaused: boolean
  onQueryChange: (query: string) => void
  onRegexModeChange: (enabled: boolean) => void
  onSelect: (id: string) => void
  searchInputRef: React.RefObject<HTMLInputElement | null>
}

function preview(clip: Clip) {
  if (clip.contentType === 'image') return clip.ocrText || 'Copied image'
  if (clip.isSensitive) return maskSensitiveContent(clip.rawContent)
  return clip.rawContent
}

export function ClipList({ title, clips, selectedId, query, regexMode, searchError, monitoringPaused, onQueryChange, onRegexModeChange, onSelect, searchInputRef }: ClipListProps) {
  const emptyCopy = monitoringPaused ? 'Clipboard monitoring is paused.' : query ? 'No matching clips found.' : 'Copy something and it will appear here.'
  return (
    <section className="clip-list-panel" aria-label={`${title} clips`}>
      <header className="list-header">
        <div>
          <p className="eyebrow">Library</p>
          <h1>{title}</h1>
        </div>
        <span className="list-count">{clips.length}</span>
      </header>
      <div className="search-wrap">
        <Search size={17} aria-hidden="true" />
        <input ref={searchInputRef} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search clips" aria-label="Search clips" />
        <button className={cn('regex-toggle', regexMode && 'is-on')} onClick={() => onRegexModeChange(!regexMode)} title="Use regular expression search" aria-pressed={regexMode}>.*</button>
      </div>
      {searchError ? <p className="search-error"><AlertCircle size={14} /> {searchError}</p> : null}
      <div className="filter-note"><SlidersHorizontal size={13} /> {regexMode ? 'Regex search is on' : 'Newest first'}</div>
      <div className="clip-list" role="listbox" aria-label="Clipboard entries">
        {clips.map((clip) => (
          <button key={clip.id} className={cn('clip-row', selectedId === clip.id && 'is-selected')} onClick={() => onSelect(clip.id)} role="option" aria-selected={selectedId === clip.id}>
            <span className={cn('type-icon', `type-${clip.contentType}`, clip.isSensitive && 'type-sensitive')}><ContentTypeIcon type={clip.contentType} /></span>
            <span className="clip-row-main">
              <span className="clip-row-title">{clip.isSensitive ? 'Sensitive clip' : clip.title}</span>
              <span className={cn('clip-row-preview', clip.isSensitive && 'is-masked')}>{preview(clip)}</span>
              <span className="clip-row-meta">
                <span>{formatRelativeTime(clip.lastCopiedAt)}</span>
                {clip.sourceApplication ? <span>{clip.sourceApplication}</span> : null}
                {clip.isSensitive && clip.expiresAt ? <span className="expires-label">Expires soon</span> : null}
              </span>
            </span>
            {clip.isFavorite ? <Star className="favorite-indicator" size={14} fill="currentColor" aria-label="Favorite" /> : null}
          </button>
        ))}
        {clips.length === 0 ? <div className="empty-list"><span className="empty-list-icon"><Search size={19} /></span><p>{emptyCopy}</p></div> : null}
      </div>
    </section>
  )
}
