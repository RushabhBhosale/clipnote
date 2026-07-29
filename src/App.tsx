import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { Clipboard, Cloud, Copy, History, LoaderCircle, LogOut, Pause, Plus, ShieldAlert, Smartphone, StickyNote, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { maskSensitiveContent } from './features/sensitive-content/detector'
import { formatRelativeTime } from './lib/utils'
import { isCloudSyncConfigured, pullCloudClips, pushCloudClips, signInWithPassword, signOutOfCloudSync, signUpWithPassword, subscribeToCloudSync } from './services/syncService'
import { useClipStore } from './store/useClipStore'
import type { Clip } from './types/clip'
import { setStickyWindow } from './services/nativeService'

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

function SyncPanel({ user, onClose }: { user?: User, onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<string>()
  const [busy, setBusy] = useState(false)

  const submit = async (mode: 'sign-in' | 'sign-up') => {
    if (!email.trim() || !password) return setStatus('Enter your email and password.')
    setBusy(true)
    setStatus(undefined)
    try {
      if (mode === 'sign-in') await signInWithPassword(email.trim(), password)
      else {
        await signUpWithPassword(email.trim(), password)
        setStatus('Account created. Check your email if confirmation is enabled, then sign in on both devices.')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not connect your account.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="sync-panel-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="sync-panel" role="dialog" aria-modal="true" aria-label="Sync with your phone" onMouseDown={(event) => event.stopPropagation()}>
      <button className="sync-panel-close" onClick={onClose} aria-label="Close sync panel"><X size={18} /></button>
      <div className="sync-panel-icon"><Cloud size={19} /></div>
      <h2>{user ? 'Your notes are syncing' : 'Sync with your phone'}</h2>
      {user ? <>
        <p>Signed in as {user.email}. Use this same account in the ClipNote mobile app.</p>
        <button className="sync-sign-out" onClick={() => void signOutOfCloudSync()}><LogOut size={15} /> Sign out</button>
      </> : <>
        <p>Sign in with the same account on your laptop and phone. New notes appear on both devices automatically.</p>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" /></label>
        {status ? <p className="sync-panel-status">{status}</p> : null}
        <div className="sync-panel-actions"><button disabled={busy} onClick={() => void submit('sign-in')}>Sign in</button><button disabled={busy} className="secondary" onClick={() => void submit('sign-up')}>Create account</button></div>
      </>}
      <small>Protected clipboard items and temporary codes stay only on the device that captured them.</small>
    </section>
  </div>
}

export default function App() {
  const clips = useClipStore((state) => state.clips)
  const isMonitoring = useClipStore((state) => state.isMonitoring)
  const isReady = useClipStore((state) => state.isReady)
  const error = useClipStore((state) => state.error)
  const toast = useClipStore((state) => state.toast)
  const initialize = useClipStore((state) => state.initialize)
  const setMonitoring = useClipStore((state) => state.setMonitoring)
  const addNote = useClipStore((state) => state.addNote)
  const saveStickyNote = useClipStore((state) => state.saveStickyNote)
  const copyClip = useClipStore((state) => state.copyClip)
  const moveToTrash = useClipStore((state) => state.moveToTrash)
  const mergeRemoteClips = useClipStore((state) => state.mergeRemoteClips)
  const clearToast = useClipStore((state) => state.clearToast)
  const [note, setNote] = useState('')
  const [openClipId, setOpenClipId] = useState<string>()
  const [stickyMode, setStickyMode] = useState(false)
  const [showStickyHistory, setShowStickyHistory] = useState(false)
  const [cloudUser, setCloudUser] = useState<User>()
  const [cloudReady, setCloudReady] = useState(false)
  const [showSyncPanel, setShowSyncPanel] = useState(false)
  const stickyNoteId = useRef<string | undefined>(undefined)
  const uploadedRevisions = useRef(new Map<string, string>())
  const timeline = useMemo(() => {
    const groups = new Map<string, Clip[]>()
    clips.filter((clip) => !clip.deletedAt && !clip.isSnippet).forEach((clip) => {
      const day = formatDay(clip.lastCopiedAt)
      groups.set(day, [...(groups.get(day) ?? []), clip])
    })
    return [...groups.entries()]
  }, [clips])
  const openClip = useMemo(() => clips.find((clip) => clip.id === openClipId && !clip.deletedAt), [clips, openClipId])
  const toggleStickyMode = useCallback(async () => {
    const next = !stickyMode
    await setStickyWindow(next)
    setStickyMode(next)
    setShowStickyHistory(false)
    setNote('')
    stickyNoteId.current = undefined
  }, [stickyMode])

  useEffect(() => { void initialize() }, [initialize])
  useEffect(() => {
    let stop: () => void = () => {}
    void subscribeToCloudSync((incoming) => { void mergeRemoteClips(incoming) }, setCloudUser).then((unsubscribe) => { stop = unsubscribe })
    return () => stop()
  }, [mergeRemoteClips])
  useEffect(() => {
    if (!isReady || !cloudUser) {
      setCloudReady(false)
      return
    }
    let cancelled = false
    let syncing = false
    uploadedRevisions.current.clear()
    setCloudReady(false)
    const reconcile = async () => {
      if (syncing || cancelled) return
      syncing = true
      try {
        // Realtime is the fast path. This quiet reconciliation is the safety
        // net for a sleeping network/WebSocket and never needs user input.
        await mergeRemoteClips(await pullCloudClips())
        if (!cancelled) setCloudReady(true)
      } catch {
        if (!cancelled) setCloudReady(false)
      } finally {
        syncing = false
      }
    }
    void reconcile()
    const interval = window.setInterval(() => { void reconcile() }, 5_000)
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void reconcile() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [cloudUser, isReady, mergeRemoteClips])
  useEffect(() => {
    if (!cloudReady) return
    const changed = clips.filter((clip) => !clip.isSensitive && uploadedRevisions.current.get(clip.id) !== clip.updatedAt)
    if (!changed.length) return
    const timeout = window.setTimeout(() => {
      void pushCloudClips(changed).then(() => changed.forEach((clip) => uploadedRevisions.current.set(clip.id, clip.updatedAt))).catch(() => undefined)
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [clips, cloudReady])
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(clearToast, 1800)
    return () => window.clearTimeout(timeout)
  }, [toast, clearToast])
  useEffect(() => {
    if (!stickyMode || !note.trim()) return
    const timeout = window.setTimeout(() => {
      void saveStickyNote(note, stickyNoteId.current).then((id) => { if (id) stickyNoteId.current = id })
    }, 450)
    return () => window.clearTimeout(timeout)
  }, [note, saveStickyNote, stickyMode])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenClipId(undefined)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  useEffect(() => {
    if (!isTauri()) return
    let unlistenMonitoring: (() => void) | undefined
    void listen('clipnote://toggle-monitoring', () => setMonitoring(!useClipStore.getState().isMonitoring)).then((unlisten) => { unlistenMonitoring = unlisten })
    void register('CommandOrControl+Shift+V', async () => {
      const currentWindow = getCurrentWindow()
      await currentWindow.show()
      await currentWindow.setFocus()
    })
    void register('CommandOrControl+Shift+N', () => void toggleStickyMode())
    return () => { unlistenMonitoring?.(); void unregister('CommandOrControl+Shift+V'); void unregister('CommandOrControl+Shift+N') }
  }, [setMonitoring, toggleStickyMode])

  const saveNote = () => {
    if (!note.trim()) return
    void addNote(note)
    setNote('')
  }
  const deleteLocally = (clip: Clip) => {
    void moveToTrash(clip.id)
    setOpenClipId(undefined)
  }
  if (!isReady) return <div className="boot-screen"><div className="boot-mark"><LoaderCircle size={23} /></div><span>Opening ClipNote…</span></div>

  return <main className={stickyMode ? 'notepad-shell is-sticky' : 'notepad-shell'}>
    {stickyMode ? <section className="sticky-note-surface" aria-label="Sticky note">
      <textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder="Write anything…" aria-label="Sticky note" />
      <button className="sticky-history-tab" onClick={() => setShowStickyHistory(!showStickyHistory)} aria-pressed={showStickyHistory}><History size={15} /> History</button>
      <button className="sticky-exit-tab" onClick={() => void toggleStickyMode()} title="Open full timeline"><StickyNote size={15} /></button>
      {showStickyHistory ? <div className="sticky-history-panel">{clips.filter((clip) => !clip.deletedAt && !clip.isSnippet).slice(0, 8).map((clip) => <div key={clip.id}><time>{formatTime(clip.lastCopiedAt)}</time><span>{clip.isSensitive ? 'Sensitive item' : clip.rawContent}</span></div>)}{clips.length === 0 ? <p>No history yet.</p> : null}</div> : null}
    </section> : <>
    <section className="notepad-page" aria-label="Clipboard notebook">
      <div className="note-composer">
        <textarea value={note} onChange={(event) => setNote(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); saveNote() } }} placeholder="Write a note…" aria-label="Write a note" />
        <div><span>⌘/Ctrl + Enter to save</span><button onClick={saveNote}><Plus size={15} /> Save note</button></div>
      </div>
      {!isMonitoring ? <p className="notepad-paused"><Pause size={14} fill="currentColor" /> Clipboard monitoring is paused. <button onClick={() => setMonitoring(true)}>Resume</button></p> : null}
      <div className="timeline">
        {timeline.map(([day, entries]) => <section key={day} className="day-group"><h2>{day}</h2>{entries.map((clip) => <article key={clip.id} className={clip.isSensitive ? 'timeline-entry is-sensitive' : 'timeline-entry'} role="button" tabIndex={0} onClick={() => setOpenClipId(clip.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpenClipId(clip.id) } }}><time dateTime={clip.lastCopiedAt}>{formatTime(clip.lastCopiedAt)}</time><div className="timeline-copy"><div className="timeline-entry-meta">{clip.sourceApplication === 'Note' || clip.sourceApplication === 'Mobile note' ? 'Note' : 'Copied'}{clip.isSensitive ? <span><ShieldAlert size={12} /> Protected</span> : null}</div><p>{displayContent(clip)}</p><small>{clip.copyCount > 1 ? `Copied ${clip.copyCount} times · ` : ''}{formatRelativeTime(clip.lastCopiedAt)}</small></div><div className="entry-actions"><button onClick={(event) => { event.stopPropagation(); void copyClip(clip.id) }} title="Copy"><Copy size={14} /></button><button onClick={(event) => { event.stopPropagation(); deleteLocally(clip) }} title="Move to Trash"><Trash2 size={14} /></button></div></article>)}</section>)}
        {timeline.length === 0 ? <div className="timeline-empty"><Clipboard size={22} /><p>Copy something and it will appear here.</p></div> : null}
      </div>
    </section>
    <button className="sticky-mode-tab" onClick={() => void toggleStickyMode()}><StickyNote size={15} /> Sticky Note</button>
    {isCloudSyncConfigured() ? <button className="sync-mode-tab" onClick={() => setShowSyncPanel(true)}><Smartphone size={15} />{cloudUser ? (cloudReady ? 'Synced' : 'Connecting…') : 'Sync phone'}</button> : null}
    </>}
    {error ? <div className="app-error">{error}</div> : null}
    {toast ? <div className="toast"><Copy size={15} />{toast}</div> : null}
    {openClip ? <div className="clip-modal-backdrop" role="presentation" onMouseDown={() => setOpenClipId(undefined)}><section className="clip-modal" role="dialog" aria-modal="true" aria-label="Clipboard note" onMouseDown={(event) => event.stopPropagation()}><header><time dateTime={openClip.lastCopiedAt}>{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(openClip.lastCopiedAt))}</time><button onClick={() => setOpenClipId(undefined)} aria-label="Close note"><X size={20} /></button></header><div className="clip-modal-content"><p>{displayContent(openClip)}</p></div><footer><button onClick={() => void copyClip(openClip.id)}><Copy size={15} /> Copy</button><button className="modal-delete" onClick={() => deleteLocally(openClip)}><Trash2 size={15} /> Delete</button></footer></section></div> : null}
    {showSyncPanel ? <SyncPanel user={cloudUser} onClose={() => setShowSyncPanel(false)} /> : null}
  </main>
}
