import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Clipboard, Copy, KeyRound, LoaderCircle, Pause, Plus, Search, ShieldAlert, StickyNote, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CredentialVault } from './components/CredentialVault'
import { NotesBoard } from './components/NotesBoard'
import { RichTextEditor } from './components/RichTextEditor'
import { richTextPlainText } from './features/notes/richText'
import { maskSensitiveContent } from './features/sensitive-content/detector'
import { formatRelativeTime } from './lib/utils'
import { useClipStore } from './store/useClipStore'
import type { Clip } from './types/clip'
import { hideClipNote, setStickyWindow, showClipNote } from './services/nativeService'
import { localImageUrl } from './services/imageService'
import { SmartActionsPanel, SmartPreview, SmartTypeBadge } from './components/SmartActionsPanel'
import { JsonInlineView } from './components/JsonInlineView'
import { actionEngine } from './features/smart-actions/actionEngine'
import { searchClips } from './features/search/search'

function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function formatDay(value: string) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date)
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function displayContent(clip: Clip) {
  if (!clip.isSensitive) return clip.rawContent
  return clip.contentType === 'otp' ? `One-time code · ${maskSensitiveContent(clip.rawContent)}` : `Sensitive clipboard item · ${maskSensitiveContent(clip.rawContent)}`
}

function isWrittenNote(clip: Clip) {
  return clip.sourceApplication === 'Note' || clip.sourceApplication === 'Mobile note' || clip.sourceApplication === 'Daily note'
}

export default function App() {
  const clips = useClipStore((state) => state.clips)
  const isMonitoring = useClipStore((state) => state.isMonitoring)
  const isReady = useClipStore((state) => state.isReady)
  const error = useClipStore((state) => state.error)
  const toast = useClipStore((state) => state.toast)
  const initialize = useClipStore((state) => state.initialize)
  const setMonitoring = useClipStore((state) => state.setMonitoring)
  const saveStickyNote = useClipStore((state) => state.saveStickyNote)
  const copyClip = useClipStore((state) => state.copyClip)
  const copyText = useClipStore((state) => state.copyText)
  const addActionResult = useClipStore((state) => state.addActionResult)
  const moveToTrash = useClipStore((state) => state.moveToTrash)
  const clearToast = useClipStore((state) => state.clearToast)
  const [note, setNote] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [openClipId, setOpenClipId] = useState<string>()
  const [stickyMode, setStickyMode] = useState(false)
  const [clipboardView, setClipboardView] = useState(false)
  const [clipboardQuery, setClipboardQuery] = useState('')
  const [credentialsView, setCredentialsView] = useState(false)
  const [noteDirty, setNoteDirty] = useState(false)
  const [stickyPickerOpen, setStickyPickerOpen] = useState(false)
  const todayNoteId = useRef<string | undefined>(undefined)
  const lastEditedNoteRef = useRef<string | undefined>(undefined)
  const editVersion = useRef(0)
  const stickyNotes = useMemo(() => clips
    .filter((clip) => !clip.deletedAt && !clip.isSnippet && isWrittenNote(clip))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [clips])
  const timeline = useMemo(() => {
    const groups = new Map<string, Clip[]>()
    searchClips(clips, 'all', clipboardQuery, false).clips.filter((clip) => {
      if (clip.deletedAt || clip.isSnippet) return false
      return !isWrittenNote(clip)
    }).forEach((clip) => {
      const day = formatDay(clip.createdAt)
      groups.set(day, [...(groups.get(day) ?? []), clip])
    })
    return [...groups.entries()]
  }, [clips, clipboardQuery])
  const openClip = useMemo(() => clips.find((clip) => clip.id === openClipId && !clip.deletedAt), [clips, openClipId])
  const openClipDetection = useMemo(() => openClip && openClip.contentType !== 'image' ? actionEngine.detect(openClip.rawContent) : undefined, [openClip])
  const toggleStickyMode = useCallback(async () => {
    const next = !stickyMode
    await setStickyWindow(next)
    setStickyMode(next)
    if (next) setClipboardView(false)
    if (next) setCredentialsView(false)
  }, [stickyMode])
  const openStickyNote = useCallback(async () => {
    const targetId = lastEditedNoteRef.current
    const target = targetId ? clips.find((c) => c.id === targetId) : undefined
    if (target) {
      editVersion.current += 1
      setNote(target.rawContent)
      setNoteTitle(target.title)
      todayNoteId.current = target.id
      lastEditedNoteRef.current = target.id
      setNoteDirty(false)
    } else {
      editVersion.current += 1
      setNote('')
      setNoteTitle('')
      todayNoteId.current = undefined
      setNoteDirty(false)
    }
    setStickyPickerOpen(false)
    await setStickyWindow(true)
    setStickyMode(true)
    setClipboardView(false)
    setCredentialsView(false)
    await showClipNote()
  }, [clips])
  const startNewStickyNote = () => {
    editVersion.current += 1
    todayNoteId.current = undefined
    lastEditedNoteRef.current = undefined
    setNote('')
    setNoteTitle('')
    setNoteDirty(false)
    setStickyPickerOpen(false)
  }
  const selectStickyNote = (clip: Clip) => {
    editVersion.current += 1
    todayNoteId.current = clip.id
    lastEditedNoteRef.current = clip.id
    setNote(clip.rawContent)
    setNoteTitle(clip.title)
    setNoteDirty(false)
    setStickyPickerOpen(false)
  }
  const openClipboardHistory = useCallback(async () => {
    await setStickyWindow(true)
    setStickyMode(false)
    setClipboardView(true)
    setCredentialsView(false)
    await showClipNote()
  }, [])
  const openDailyNotebook = useCallback(async () => {
    await setStickyWindow(false)
    setStickyMode(false)
    setClipboardView(false)
    setCredentialsView(false)
  }, [])
  const openCredentials = useCallback(async () => {
    await setStickyWindow(true)
    setStickyMode(false)
    setClipboardView(false)
    setCredentialsView(true)
    await showClipNote()
  }, [])

  const toggleShortcutView = useCallback(async (view: 'sticky' | 'clipboard' | 'credentials') => {
    const alreadyOpen = view === 'sticky' ? stickyMode : view === 'clipboard' ? clipboardView : credentialsView
    if (alreadyOpen && await getCurrentWindow().isVisible()) {
      await hideClipNote()
      return
    }
    if (view === 'sticky') await openStickyNote()
    else if (view === 'clipboard') await openClipboardHistory()
    else await openCredentials()
  }, [clipboardView, credentialsView, openClipboardHistory, openCredentials, openStickyNote, stickyMode])

  useEffect(() => { void initialize() }, [initialize])
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(clearToast, 1800)
    return () => window.clearTimeout(timeout)
  }, [toast, clearToast])
  useEffect(() => {
    if (!noteDirty || (!note.trim() && !todayNoteId.current)) return
    const version = editVersion.current
    const timeout = window.setTimeout(() => {
      void saveStickyNote(note, todayNoteId.current, noteTitle).then((id) => {
        if (id) { todayNoteId.current = id; lastEditedNoteRef.current = id }
        if (editVersion.current === version) setNoteDirty(false)
      })
    }, 180)
    return () => window.clearTimeout(timeout)
  }, [note, noteTitle, noteDirty, saveStickyNote])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenClipId(undefined)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    const unlisteners: Array<() => void> = []
    const addListener = async (event: string, handler: () => void) => {
      const unlisten = await listen(event, handler)
      if (disposed) unlisten()
      else unlisteners.push(unlisten)
    }
    void addListener('clipnote://toggle-monitoring', () => setMonitoring(!useClipStore.getState().isMonitoring))
    void addListener('clipnote://open-sticky', () => void toggleShortcutView('sticky'))
    void addListener('clipnote://open-clipboard', () => void toggleShortcutView('clipboard'))
    void addListener('clipnote://open-credentials', () => void toggleShortcutView('credentials'))
    return () => {
      disposed = true
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [setMonitoring, toggleShortcutView])

  const deleteLocally = (clip: Clip) => {
    void moveToTrash(clip.id)
    setOpenClipId(undefined)
  }
  const changeNote = (value: string) => {
    editVersion.current += 1
    setNote(value)
    setNoteDirty(true)
  }
  const changeNoteTitle = (value: string) => {
    editVersion.current += 1
    setNoteTitle(value)
    setNoteDirty(true)
  }
  if (!isReady) return <div className="boot-screen"><div className="boot-mark"><LoaderCircle size={23} /></div><span>Opening ClipNote…</span></div>

  return <main className={credentialsView ? 'notepad-shell is-credentials-compact' : stickyMode ? 'notepad-shell is-sticky' : clipboardView ? 'notepad-shell is-clipboard-compact' : 'notepad-shell'}>
    {credentialsView ? <CredentialVault onClose={() => void openDailyNotebook()} /> : stickyMode ? <section className="sticky-note-surface" aria-label="Sticky note">
      <div className="sticky-note-tools">
        <button className="sticky-note-switcher" onClick={() => setStickyPickerOpen((open) => !open)} aria-haspopup="listbox" aria-expanded={stickyPickerOpen} title="Switch note"><StickyNote size={12} /> {noteTitle.trim() || 'Untitled'}</button>
        <button className="sticky-note-new" onClick={startNewStickyNote} title="New note"><Plus size={13} /></button>
      </div>
      <input className="sticky-title-input" value={noteTitle} onChange={(event) => changeNoteTitle(event.target.value)} placeholder="Title…" aria-label="Sticky note title" />
      <RichTextEditor autoFocus value={note} onChange={changeNote} placeholder="Write anything…" ariaLabel="Sticky note" className="sticky-rich-text" />
      <button className="sticky-exit-tab" onClick={() => void toggleStickyMode()} title="Open full timeline"><StickyNote size={15} /></button>
      {stickyPickerOpen ? <div className="sticky-note-picker" role="listbox" aria-label="Notes">
        {stickyNotes.length === 0 ? <p className="sticky-note-picker-empty">No notes yet.</p> : stickyNotes.map((clip) => <button key={clip.id} role="option" aria-selected={clip.id === todayNoteId.current} className={clip.id === todayNoteId.current ? 'is-current' : ''} onClick={() => selectStickyNote(clip)}><strong>{clip.title || 'Untitled'}</strong><span>{richTextPlainText(clip.rawContent)}</span></button>)}
      </div> : null}
    </section> : <>
      <section className={clipboardView ? 'notepad-page is-clipboard-view' : 'notepad-page'} aria-label={clipboardView ? 'Clipboard history' : 'Daily notebook'}>
      {clipboardView && !isMonitoring ? <p className="notepad-paused"><Pause size={14} fill="currentColor" /> Clipboard monitoring is paused. <button onClick={() => setMonitoring(true)}>Resume</button></p> : null}
      {clipboardView ? <><div className="clipboard-smart-search"><Search size={14} /><input value={clipboardQuery} onChange={(event) => setClipboardQuery(event.target.value)} placeholder="Search text, type, domain, or metadata" aria-label="Search clipboard history" />{clipboardQuery ? <button onClick={() => setClipboardQuery('')} aria-label="Clear search"><X size={13} /></button> : null}</div><div className="timeline">
        {timeline.map(([day, entries]) => <section key={day} className="day-group"><h2>{day}</h2>{entries.map((clip) => { const detection = clip.contentType === 'image' ? undefined : actionEngine.detect(clip.rawContent); return <article key={clip.id} className={clip.isSensitive ? 'timeline-entry is-sensitive' : 'timeline-entry'} role="button" tabIndex={0} onClick={() => setOpenClipId(clip.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpenClipId(clip.id) } }}><time dateTime={clip.updatedAt}>{formatTime(clip.updatedAt)}</time><div className="timeline-copy"><div className="timeline-entry-meta">Copied{detection ? <SmartTypeBadge detection={detection} /> : null}{clip.isSensitive ? <span><ShieldAlert size={12} /> Protected</span> : null}</div>{detection ? <SmartPreview detection={detection} /> : null}{clip.contentType === 'image' && clip.imagePath ? <img className="timeline-image" src={localImageUrl(clip.imagePath)} alt={clip.title} /> : <p>{displayContent(clip)}</p>}<small>{clip.copyCount > 1 ? `Copied ${clip.copyCount} times · ` : ''}{formatRelativeTime(clip.lastCopiedAt)}</small></div><div className="entry-actions"><button onClick={(event) => { event.stopPropagation(); void copyClip(clip.id) }} title="Copy"><Copy size={14} /></button><button onClick={(event) => { event.stopPropagation(); deleteLocally(clip) }} title="Delete"><Trash2 size={14} /></button></div></article> })}</section>)}
        {timeline.length === 0 ? <div className="timeline-empty"><Clipboard size={22} /><p>{clipboardQuery ? 'No clipboard items match this search.' : 'Copy something and it will appear here automatically.'}</p></div> : null}
      </div></> : <NotesBoard onOpenClip={(clip) => setOpenClipId(clip.id)} onOpenClipboard={() => void openClipboardHistory()} onOpenSticky={() => void openStickyNote()} />}
    </section>
    <button className="sticky-mode-tab" onClick={() => void openStickyNote()}><StickyNote size={15} /> Sticky Note</button>
    <button className="clipboard-mode-tab" onClick={() => { if (clipboardView) void openDailyNotebook(); else void openClipboardHistory() }}>{clipboardView ? <><StickyNote size={15} /> Daily Note</> : <><Clipboard size={15} /> Clipboard</>}</button>
    <button className="credentials-mode-tab" onClick={() => void openCredentials()} title="Open Creds (Shift + Command + ,)"><KeyRound size={15} /> Creds</button>
    </>}
    {error ? <div className="app-error">{error}</div> : null}
    {toast ? <div className="toast"><Copy size={15} />{toast}</div> : null}
    {openClip ? <div className="clip-modal-backdrop" role="presentation" onMouseDown={() => setOpenClipId(undefined)}><section className="clip-modal" role="dialog" aria-modal="true" aria-label="Clipboard note" onMouseDown={(event) => event.stopPropagation()}><header><div className="clip-modal-header-text"><strong className="clip-modal-title">{openClip.title || 'Untitled'}</strong><time dateTime={openClip.lastCopiedAt}>{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(openClip.lastCopiedAt))}</time></div><button onClick={() => setOpenClipId(undefined)} aria-label="Close note"><X size={20} /></button></header><div className="clip-modal-content">{openClip.contentType === 'image' && openClip.imagePath ? <img className="clip-modal-image" src={localImageUrl(openClip.imagePath)} alt={openClip.title} /> : openClipDetection?.type === 'json' ? <JsonInlineView content={openClip.rawContent} /> : <><p>{displayContent(openClip)}</p><SmartActionsPanel clip={openClip} onCopyText={copyText} onCreateResult={addActionResult} /></>}</div><footer><button onClick={() => void copyClip(openClip.id)}><Copy size={15} /> Copy</button><button className="modal-delete" onClick={() => deleteLocally(openClip)}><Trash2 size={15} /> Delete</button></footer></section></div> : null}
  </main>
}
