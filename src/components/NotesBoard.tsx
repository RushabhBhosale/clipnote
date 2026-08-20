import { Palette, Pencil, Plus, StickyNote, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { RichTextEditor } from './RichTextEditor'
import { richTextPlainText } from '../features/notes/richText'
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

export function NotesBoard() {
  const clips = useClipStore((state) => state.clips)
  const createNote = useClipStore((state) => state.createNote)
  const moveToTrash = useClipStore((state) => state.moveToTrash)
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState<Clip>()
  const [pendingDelete, setPendingDelete] = useState<Clip>()
  const notes = useMemo(() => clips
    .filter((clip) => !clip.deletedAt && !clip.isSnippet && isWrittenNote(clip))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [clips])
  const saveDraft = (draft: NoteDraft) => {
    void createNote(draft.text, draft.title, draft.color)
    setComposing(false)
  }
  return (
    <div className="notes-board">
      <div className="notes-board-header">
        <div>
          <p className="eyebrow">Notebook</p>
          <h1>Notes</h1>
        </div>
        <button className="notes-add-button" onClick={() => setComposing(true)}><Plus size={15} /> Add note</button>
      </div>
      {composing ? <NoteComposer onCancel={() => setComposing(false)} onSave={saveDraft} /> : null}
      <div className="notes-grid">
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} onOpen={setEditing} onDelete={setPendingDelete} />
        ))}
      </div>
      {notes.length === 0 && !composing ? (
        <div className="notes-empty"><StickyNote size={22} /><p>No notes yet. Click <strong>Add note</strong> to start writing.</p></div>
      ) : null}
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
