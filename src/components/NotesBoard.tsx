import { ArrowRight, Clipboard, HardDrive, Palette, Pencil, Plus, Search, StickyNote, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RichTextEditor } from './RichTextEditor'
import { richTextPlainText } from '../features/notes/richText'
import { searchClips } from '../features/search/search'
import { formatRelativeTime } from '../lib/utils'
import { useClipStore } from '../store/useClipStore'
import type { Clip } from '../types/clip'

const NOTE_COLORS = ['#fff3b0', '#ffd9b3', '#ffc7c7', '#e3c9f2', '#b5e6d3', '#bfd9f7', '#f7cfe3', '#e8e6d9']
const DEFAULT_NOTE_COLOR = NOTE_COLORS[0]

function isWrittenNote(clip: Clip) {
  return clip.sourceApplication === 'Note' || clip.sourceApplication === 'Mobile note' || clip.sourceApplication === 'Daily note'
}

function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="note-color-swatches" role="group" aria-label="Note color">
      {NOTE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`note-color-swatch ${value === color ? 'is-selected' : ''}`}
          style={{ backgroundColor: color }}
          aria-label={`Color ${color}`}
          aria-pressed={value === color}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  )
}

interface NoteDraft {
  title: string
  text: string
  color: string
}

function NoteComposer({ onCancel, onSave }: { onCancel: () => void; onSave: (draft: NoteDraft) => void }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [color, setColor] = useState(DEFAULT_NOTE_COLOR)
  return (
    <section className="note-composer-card" style={{ backgroundColor: color }} aria-label="New note">
      <input className="note-composer-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title…" aria-label="Note title" />
      <RichTextEditor autoFocus value={text} onChange={setText} placeholder="Write your note…" ariaLabel="Note text" className="note-composer-rich-text" />
      <div className="note-composer-footer">
        <ColorSwatches value={color} onChange={setColor} />
        <div className="note-editor-actions">
          <button className="cancel" onClick={onCancel}>Cancel</button>
          <button className="save" disabled={!richTextPlainText(text).trim()} onClick={() => onSave({ title, text, color })}><Plus size={13} /> Add</button>
        </div>
      </div>
    </section>
  )
}

function NoteCard({ note, onOpen, onDelete }: { note: Clip; onOpen: (note: Clip) => void; onDelete: (note: Clip) => void }) {
  return (
    <article
      className="note-card"
      role="button"
      tabIndex={0}
      style={{ backgroundColor: note.color ?? DEFAULT_NOTE_COLOR }}
      onClick={() => onOpen(note)}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onOpen(note) } }}
    >
      <strong className="note-card-title">{note.title || 'Untitled'}</strong>
      <p className="note-card-excerpt">{richTextPlainText(note.rawContent)}</p>
      <div className="note-card-actions">
        <button onClick={(event) => { event.stopPropagation(); onOpen(note) }} title="Edit note"><Pencil size={13} /></button>
        <button className="delete" onClick={(event) => { event.stopPropagation(); onDelete(note) }} title="Delete note"><Trash2 size={13} /></button>
      </div>
    </article>
  )
}

function ConfirmDeleteDialog({ note, onCancel, onConfirm }: { note: Clip; onCancel: () => void; onConfirm: (id: string) => void }) {
  return (
    <div className="note-confirm-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="note-confirm" role="dialog" aria-modal="true" aria-label="Delete note" onMouseDown={(event) => event.stopPropagation()}>
        <header><strong><Trash2 size={15} /> Delete note?</strong></header>
        <p>Move <strong>{note.title || 'Untitled'}</strong> to Trash?</p>
        <footer>
          <button className="cancel" onClick={onCancel}>Cancel</button>
          <button className="delete" onClick={() => onConfirm(note.id)}>Delete</button>
        </footer>
      </section>
    </div>
  )
}

function NoteEditor({ note, onClose, onRequestDelete }: { note: Clip; onClose: () => void; onRequestDelete: (note: Clip) => void }) {
  const updateClip = useClipStore((state) => state.updateClip)
  const [title, setTitle] = useState(note.title)
  const [text, setText] = useState(note.rawContent)
  const [color, setColor] = useState(note.color ?? DEFAULT_NOTE_COLOR)
  const save = () => {
    void updateClip(note.id, { title: title.trim() || note.title, rawContent: text, color })
    onClose()
  }
  return (
    <div className="note-editor-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="note-editor" role="dialog" aria-modal="true" aria-label="Edit note" style={{ backgroundColor: color }} onMouseDown={(event) => event.stopPropagation()}>
        <header><strong><Palette size={14} /> Edit note</strong><button onClick={onClose} aria-label="Close note editor"><X size={17} /></button></header>
        <input className="note-editor-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title…" aria-label="Note title" />
        <RichTextEditor autoFocus value={text} onChange={setText} placeholder="Write your note…" ariaLabel="Note text" className="note-editor-rich-text" />
        <footer>
          <ColorSwatches value={color} onChange={setColor} />
          <div className="note-editor-actions">
            <button className="delete" onClick={() => onRequestDelete(note)}><Trash2 size={13} /> Delete</button>
            <button className="save" onClick={save}>Save</button>
          </div>
        </footer>
      </section>
    </div>
  )
}

interface NotesBoardProps {
  onOpenClip: (clip: Clip) => void
  onOpenClipboard: () => void
  onOpenSticky: () => void
}

function clipPreview(clip: Clip) {
  if (clip.isSensitive) return 'Protected clipboard item'
  if (clip.contentType === 'image') return 'Copied image'
  return richTextPlainText(clip.rawContent).trim() || clip.title || 'Empty clipboard item'
}

export function NotesBoard({ onOpenClip, onOpenClipboard, onOpenSticky }: NotesBoardProps) {
  const clips = useClipStore((state) => state.clips)
  const isMonitoring = useClipStore((state) => state.isMonitoring)
  const createNote = useClipStore((state) => state.createNote)
  const moveToTrash = useClipStore((state) => state.moveToTrash)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState<Clip>()
  const [pendingDelete, setPendingDelete] = useState<Clip>()
  const dashboard = useMemo(() => {
    const matches = searchClips(clips, 'all', query, false).clips
    const notes = matches
      .filter(isWrittenNote)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    const clipboard = matches
      .filter((clip) => !isWrittenNote(clip))
      .sort((a, b) => new Date(b.lastCopiedAt).getTime() - new Date(a.lastCopiedAt).getTime())
    return { notes, clipboard }
  }, [clips, query])
  const totals = useMemo(() => {
    const active = clips.filter((clip) => !clip.deletedAt && !clip.isSnippet)
    return {
      notes: active.filter(isWrittenNote).length,
      clipboard: active.filter((clip) => !isWrittenNote(clip)).length,
    }
  }, [clips])
  const recentClips = query.trim() ? dashboard.clipboard : dashboard.clipboard.slice(0, 8)
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])
  const saveDraft = (draft: NoteDraft) => {
    void createNote(draft.text, draft.title, draft.color)
    setComposing(false)
  }
  return (
    <div className="notes-board home-dashboard">
      <header className="home-hero">
        <div>
          <span className="home-local-badge"><HardDrive size={12} /> Local only</span>
          <p className="eyebrow">Your workspace</p>
          <h1>Notes and clips, together.</h1>
          <p className="home-hero-copy">Everything is saved on this device. No account, cloud, or sync.</p>
        </div>
        <div className="home-hero-actions">
          <button className="home-secondary-button" onClick={onOpenSticky}><StickyNote size={15} /> Sticky note</button>
          <button className="notes-add-button" onClick={() => setComposing(true)}><Plus size={15} /> Add note</button>
        </div>
      </header>

      <div className="home-search" role="search">
        <Search size={18} aria-hidden="true" />
        <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes and clipboard" aria-label="Search notes and clipboard" />
        {query ? <button onClick={() => setQuery('')} aria-label="Clear dashboard search"><X size={15} /></button> : <kbd>⌘ K</kbd>}
      </div>

      <div className="home-summary" aria-label="Local workspace summary">
        <div><strong>{totals.notes}</strong><span>{totals.notes === 1 ? 'note' : 'notes'}</span></div>
        <div><strong>{totals.clipboard}</strong><span>{totals.clipboard === 1 ? 'saved clip' : 'saved clips'}</span></div>
        <div className={isMonitoring ? 'is-active' : 'is-paused'}><span className="home-status-dot" /><strong>{isMonitoring ? 'Watching' : 'Paused'}</strong><span>clipboard</span></div>
      </div>

      {composing ? <NoteComposer onCancel={() => setComposing(false)} onSave={saveDraft} /> : null}

      <div className="home-content-grid">
        <section className="home-panel home-notes-panel" aria-labelledby="dashboard-notes-title">
          <header className="home-panel-header">
            <div><p className="eyebrow">Notebook</p><h2 id="dashboard-notes-title">Notes</h2></div>
            <span>{dashboard.notes.length}{query ? ' found' : ''}</span>
          </header>
          <div className="notes-grid">
            {dashboard.notes.map((note) => (
              <NoteCard key={note.id} note={note} onOpen={setEditing} onDelete={setPendingDelete} />
            ))}
          </div>
          {dashboard.notes.length === 0 && !composing ? (
            <div className="home-section-empty"><StickyNote size={20} /><p>{query ? 'No notes match your search.' : 'No notes yet.'}</p>{!query ? <button onClick={() => setComposing(true)}>Create your first note</button> : null}</div>
          ) : null}
        </section>

        <section className="home-panel home-recent-panel" aria-labelledby="dashboard-clips-title">
          <header className="home-panel-header">
            <div><p className="eyebrow">Clipboard</p><h2 id="dashboard-clips-title">Recent clips</h2></div>
            <button onClick={onOpenClipboard}>View all <ArrowRight size={13} /></button>
          </header>
          <div className="home-recent-list">
            {recentClips.map((clip) => (
              <button key={clip.id} className="home-recent-item" onClick={() => onOpenClip(clip)}>
                <span className="home-recent-icon"><Clipboard size={14} /></span>
                <span className="home-recent-copy"><strong>{clipPreview(clip)}</strong><small>{clip.contentType} · {formatRelativeTime(clip.lastCopiedAt)}</small></span>
                <ArrowRight size={13} className="home-recent-arrow" />
              </button>
            ))}
          </div>
          {recentClips.length === 0 ? <div className="home-section-empty compact"><Clipboard size={20} /><p>{query ? 'No clips match your search.' : 'Copy something and it will appear here.'}</p></div> : null}
        </section>
      </div>
      {editing ? <NoteEditor note={editing} onClose={() => setEditing(undefined)} onRequestDelete={setPendingDelete} /> : null}
      {pendingDelete ? (
        <ConfirmDeleteDialog
          note={pendingDelete}
          onCancel={() => setPendingDelete(undefined)}
          onConfirm={(id) => { void moveToTrash(id); setPendingDelete(undefined) }}
        />
      ) : null}
    </div>
  )
}
