import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Clipboard, Cloud, Copy, History, KeyRound, LoaderCircle, LogOut, Pause, ShieldAlert, Smartphone, StickyNote, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { CredentialVault } from './components/CredentialVault'
import { maskSensitiveContent } from './features/sensitive-content/detector'
import { formatRelativeTime } from './lib/utils'
import { isCloudSyncConfigured, pullCloudClips, pushCloudClips, signInWithPassword, signOutOfCloudSync, signUpWithPassword, subscribeToCloudSync } from './services/syncService'
import { useClipStore } from './store/useClipStore'
import type { Clip } from './types/clip'
import { hideClipNote, setStickyWindow, showClipNote } from './services/nativeService'
import { localImageUrl } from './services/imageService'

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

function isToday(value: string) {
  return new Date(value).toDateString() === new Date().toDateString()
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
  const saveStickyNote = useClipStore((state) => state.saveStickyNote)
  const consolidateDailyNotes = useClipStore((state) => state.consolidateDailyNotes)
  const copyClip = useClipStore((state) => state.copyClip)
  const moveToTrash = useClipStore((state) => state.moveToTrash)
  const mergeRemoteClips = useClipStore((state) => state.mergeRemoteClips)
  const clearToast = useClipStore((state) => state.clearToast)
  const [note, setNote] = useState('')
  const [openClipId, setOpenClipId] = useState<string>()
  const [stickyMode, setStickyMode] = useState(false)
  const [clipboardView, setClipboardView] = useState(false)
  const [credentialsView, setCredentialsView] = useState(false)
  const [showStickyHistory, setShowStickyHistory] = useState(false)
  const [cloudUser, setCloudUser] = useState<User>()
  const [cloudReady, setCloudReady] = useState(false)
  const [showSyncPanel, setShowSyncPanel] = useState(false)
  const [noteDirty, setNoteDirty] = useState(false)
  const todayNoteId = useRef<string | undefined>(undefined)
  const editVersion = useRef(0)
  const uploadedRevisions = useRef(new Map<string, string>())
  const dailyDuplicates = useMemo(() => {
    const counts = new Map<string, number>()
    clips.filter((clip) => !clip.deletedAt && !clip.isSnippet && isWrittenNote(clip)).forEach((clip) => {
      const day = new Date(clip.createdAt).toDateString()
      counts.set(day, (counts.get(day) ?? 0) + 1)
    })
    return [...counts.values()].some((count) => count > 1)
  }, [clips])
  const todayNote = useMemo(() => clips
    .filter((clip) => !clip.deletedAt && !clip.isSnippet && isWrittenNote(clip) && isToday(clip.createdAt))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0], [clips])
  const timeline = useMemo(() => {
    const groups = new Map<string, Clip[]>()
    clips.filter((clip) => {
      if (clip.deletedAt || clip.isSnippet) return false
      if (clipboardView) return !isWrittenNote(clip)
      return isWrittenNote(clip) && clip.id !== todayNote?.id
    }).forEach((clip) => {
      const day = formatDay(clip.createdAt)
      groups.set(day, [...(groups.get(day) ?? []), clip])
    })
    return [...groups.entries()]
  }, [clipboardView, clips, todayNote?.id])
  const openClip = useMemo(() => clips.find((clip) => clip.id === openClipId && !clip.deletedAt), [clips, openClipId])
  const toggleStickyMode = useCallback(async () => {
    const next = !stickyMode
    await setStickyWindow(next)
    setStickyMode(next)
    if (next) setClipboardView(false)
    if (next) setCredentialsView(false)
    setShowStickyHistory(false)
  }, [stickyMode])
  const openStickyNote = useCallback(async () => {
    await setStickyWindow(true)
    setStickyMode(true)
    setClipboardView(false)
    setCredentialsView(false)
    setShowStickyHistory(false)
    await showClipNote()
  }, [])
  const openClipboardHistory = useCallback(async () => {
    await setStickyWindow(true)
    setStickyMode(false)
    setShowStickyHistory(false)
    setClipboardView(true)
    setCredentialsView(false)
    await showClipNote()
  }, [])
  const openDailyNotebook = useCallback(async () => {
    await setStickyWindow(false)
    setStickyMode(false)
    setShowStickyHistory(false)
    setClipboardView(false)
    setCredentialsView(false)
  }, [])
  const openCredentials = useCallback(async () => {
    await setStickyWindow(true)
    setStickyMode(false)
    setClipboardView(false)
    setShowStickyHistory(false)
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
  useEffect(() => { if (dailyDuplicates) void consolidateDailyNotes() }, [consolidateDailyNotes, dailyDuplicates])
  useEffect(() => {
    if (!todayNote) {
      todayNoteId.current = undefined
      if (!noteDirty) setNote('')
      return
    }
    const changedDocument = todayNoteId.current !== todayNote.id
    todayNoteId.current = todayNote.id
    if (changedDocument || !noteDirty) setNote(todayNote.rawContent)
  }, [noteDirty, todayNote?.id, todayNote?.rawContent, todayNote?.updatedAt])
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
    const interval = window.setInterval(() => { void reconcile() }, 2_000)
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void reconcile() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', reconcile)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', reconcile)
    }
  }, [cloudUser, isReady, mergeRemoteClips])
  useEffect(() => {
    if (!cloudReady) return
    const changed = clips.filter((clip) => !clip.isSensitive && clip.contentType !== 'image' && uploadedRevisions.current.get(clip.id) !== clip.updatedAt)
    if (!changed.length) return
    const timeout = window.setTimeout(() => {
      void pushCloudClips(changed).then(() => changed.forEach((clip) => uploadedRevisions.current.set(clip.id, clip.updatedAt))).catch(() => undefined)
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [clips, cloudReady])
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(clearToast, 1800)
    return () => window.clearTimeout(timeout)
  }, [toast, clearToast])
  useEffect(() => {
    if (!noteDirty || (!note.trim() && !todayNoteId.current)) return
    const version = editVersion.current
    const timeout = window.setTimeout(() => {
      void saveStickyNote(note, todayNoteId.current).then((id) => {
        if (id) todayNoteId.current = id
        if (editVersion.current === version) setNoteDirty(false)
      })
    }, 180)
    return () => window.clearTimeout(timeout)
  }, [note, noteDirty, saveStickyNote])
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
  if (!isReady) return <div className="boot-screen"><div className="boot-mark"><LoaderCircle size={23} /></div><span>Opening ClipNote…</span></div>

  return <main className={credentialsView ? 'notepad-shell is-credentials-compact' : stickyMode ? 'notepad-shell is-sticky' : clipboardView ? 'notepad-shell is-clipboard-compact' : 'notepad-shell'}>
    {credentialsView ? <CredentialVault onClose={() => void openDailyNotebook()} /> : stickyMode ? <section className="sticky-note-surface" aria-label="Sticky note">
      <textarea autoFocus value={note} onChange={(event) => changeNote(event.target.value)} placeholder="Write anything…" aria-label="Sticky note" />
      <button className="sticky-history-tab" onClick={() => setShowStickyHistory(!showStickyHistory)} aria-pressed={showStickyHistory}><History size={15} /> History</button>
      <button className="sticky-exit-tab" onClick={() => void toggleStickyMode()} title="Open full timeline"><StickyNote size={15} /></button>
      {showStickyHistory ? <div className="sticky-history-panel">{clips.filter((clip) => !clip.deletedAt && !clip.isSnippet && !isWrittenNote(clip)).slice(0, 8).map((clip) => <div key={clip.id}><time>{formatTime(clip.lastCopiedAt)}</time><span>{clip.isSensitive ? 'Sensitive item' : clip.contentType === 'image' ? clip.title : clip.rawContent}</span></div>)}{clips.filter((clip) => !clip.deletedAt && !isWrittenNote(clip)).length === 0 ? <p>No copied items yet.</p> : null}</div> : null}
    </section> : <>
    <section className={clipboardView ? 'notepad-page is-clipboard-view' : 'notepad-page'} aria-label={clipboardView ? 'Clipboard history' : 'Daily notebook'}>
      {!clipboardView ? <>
      <div className="daily-note-label"><strong>Today</strong><span>{cloudReady ? 'Saved automatically' : 'Saving locally'}</span></div>
      <div className="note-composer daily-note-composer">
        <textarea value={note} onChange={(event) => changeNote(event.target.value)} placeholder="Start writing…" aria-label="Today’s note" />
      </div>
      </> : null}
      {clipboardView && !isMonitoring ? <p className="notepad-paused"><Pause size={14} fill="currentColor" /> Clipboard monitoring is paused. <button onClick={() => setMonitoring(true)}>Resume</button></p> : null}
      <div className="timeline">
        {timeline.map(([day, entries]) => <section key={day} className="day-group"><h2>{day}</h2>{entries.map((clip) => <article key={clip.id} className={clip.isSensitive ? 'timeline-entry is-sensitive' : 'timeline-entry'} role="button" tabIndex={0} onClick={() => setOpenClipId(clip.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpenClipId(clip.id) } }}><time dateTime={clip.updatedAt}>{formatTime(clip.updatedAt)}</time><div className="timeline-copy"><div className="timeline-entry-meta">{isWrittenNote(clip) ? 'Daily note' : 'Copied'}{clip.isSensitive ? <span><ShieldAlert size={12} /> Protected</span> : null}</div>{clip.contentType === 'image' && clip.imagePath ? <img className="timeline-image" src={localImageUrl(clip.imagePath)} alt={clip.title} /> : <p>{displayContent(clip)}</p>}<small>{isWrittenNote(clip) ? `Updated ${formatRelativeTime(clip.updatedAt)}` : `${clip.copyCount > 1 ? `Copied ${clip.copyCount} times · ` : ''}${formatRelativeTime(clip.lastCopiedAt)}`}</small></div><div className="entry-actions"><button onClick={(event) => { event.stopPropagation(); void copyClip(clip.id) }} title="Copy"><Copy size={14} /></button><button onClick={(event) => { event.stopPropagation(); deleteLocally(clip) }} title="Delete"><Trash2 size={14} /></button></div></article>)}</section>)}
        {timeline.length === 0 && (clipboardView || !todayNote) ? <div className="timeline-empty"><Clipboard size={22} /><p>{clipboardView ? 'Copy something and it will appear here automatically.' : 'Previous daily notes will appear here.'}</p></div> : null}
      </div>
    </section>
    <button className="sticky-mode-tab" onClick={() => void toggleStickyMode()}><StickyNote size={15} /> Sticky Note</button>
    <button className="clipboard-mode-tab" onClick={() => { if (clipboardView) void openDailyNotebook(); else void openClipboardHistory() }}>{clipboardView ? <><StickyNote size={15} /> Daily Note</> : <><Clipboard size={15} /> Clipboard</>}</button>
    {isCloudSyncConfigured() ? <button className="sync-mode-tab" onClick={() => setShowSyncPanel(true)}><Smartphone size={15} />{cloudUser ? (cloudReady ? 'Synced' : 'Connecting…') : 'Sync phone'}</button> : null}
    <button className="credentials-mode-tab" onClick={() => void openCredentials()} title="Open Creds (Shift + Command + ,)"><KeyRound size={15} /> Creds</button>
    </>}
    {error ? <div className="app-error">{error}</div> : null}
    {toast ? <div className="toast"><Copy size={15} />{toast}</div> : null}
    {openClip ? <div className="clip-modal-backdrop" role="presentation" onMouseDown={() => setOpenClipId(undefined)}><section className="clip-modal" role="dialog" aria-modal="true" aria-label="Clipboard note" onMouseDown={(event) => event.stopPropagation()}><header><time dateTime={openClip.lastCopiedAt}>{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(openClip.lastCopiedAt))}</time><button onClick={() => setOpenClipId(undefined)} aria-label="Close note"><X size={20} /></button></header><div className="clip-modal-content">{openClip.contentType === 'image' && openClip.imagePath ? <img className="clip-modal-image" src={localImageUrl(openClip.imagePath)} alt={openClip.title} /> : <p>{displayContent(openClip)}</p>}</div><footer><button onClick={() => void copyClip(openClip.id)}><Copy size={15} /> Copy</button><button className="modal-delete" onClick={() => deleteLocally(openClip)}><Trash2 size={15} /> Delete</button></footer></section></div> : null}
    {showSyncPanel ? <SyncPanel user={cloudUser} onClose={() => setShowSyncPanel(false)} /> : null}
  </main>
}
