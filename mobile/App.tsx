import * as Clipboard from 'expo-clipboard'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AppState, Pressable, SafeAreaView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native'
import type { User } from '@supabase/supabase-js'
import { loadClips, saveClips } from './src/storage'
import { isConfigured, listen, pull, push, sessionUser, signIn, signOut, signUp } from './src/sync'
import type { Clip, ContentType } from './src/types'

const ink = '#292a2d'
const muted = '#78787d'
const paper = '#fffefd'
const border = '#e7e4df'
const accent = '#426fae'

function order(clips: Clip[]) {
  return [...clips].sort((a, b) => Date.parse(b.lastCopiedAt) - Date.parse(a.lastCopiedAt))
}

function normalized(value: string) { return value.trim().replace(/\s+/g, ' ') }

function contentType(text: string): ContentType {
  if (/^https?:\/\//i.test(text.trim())) return 'link'
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(text.trim())) return 'email'
  if (/^\s*[\[{]/.test(text)) return 'json'
  if (/\n|\b(const|let|function|class|import)\b/.test(text)) return 'code'
  return 'text'
}

function titleFor(text: string) {
  const firstLine = normalized(text).split('\n')[0] ?? 'Untitled note'
  return firstLine.slice(0, 90) || 'Untitled note'
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function newId() {
  const nativeUuid = globalThis.crypto?.randomUUID?.()
  if (nativeUuid) return nativeUuid
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

function repairLocalIds(clips: Clip[]) {
  const now = new Date().toISOString()
  return clips.map((clip) => uuidPattern.test(clip.id) ? clip : { ...clip, id: newId(), updatedAt: now })
}

function makeClip(text: string, sourceApplication = 'Mobile note'): Clip {
  const now = new Date().toISOString()
  return {
    id: newId(), title: titleFor(text), rawContent: text, normalizedContent: normalized(text), contentType: contentType(text),
    sourceApplication, createdAt: now, updatedAt: now, lastCopiedAt: now, copyCount: 1, isFavorite: false,
    isSensitive: false, tags: [], isSnippet: false,
  }
}

function dayLabel(value: string) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }).format(date)
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function AuthScreen({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string>()
  const [busy, setBusy] = useState(false)
  const submit = async (mode: 'sign-in' | 'sign-up') => {
    if (!email.trim() || password.length < 6) return setMessage('Enter an email and a password of at least 6 characters.')
    setBusy(true)
    setMessage(undefined)
    try {
      if (mode === 'sign-in') await signIn(email.trim(), password)
      else {
        await signUp(email.trim(), password)
        setMessage('Account created. Confirm your email if asked, then sign in here and on your laptop.')
      }
      onDone()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not connect your account.')
    } finally { setBusy(false) }
  }
  return <SafeAreaView style={styles.authPage}>
    <StatusBar style="dark" />
    <View style={styles.authCard}>
      <View style={styles.mark}><Text style={styles.markText}>⌘</Text></View>
      <Text style={styles.authTitle}>ClipNote</Text>
      <Text style={styles.authText}>Sign in with the same account you use on your laptop. Your notes will stay in sync automatically.</Text>
      <TextInput style={styles.input} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#9c9ca1" />
      <TextInput style={styles.input} autoCapitalize="none" autoComplete="password" secureTextEntry value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#9c9ca1" />
      {message ? <Text style={styles.formMessage}>{message}</Text> : null}
      <Pressable disabled={busy} style={[styles.primaryButton, busy && styles.disabled]} onPress={() => void submit('sign-in')}><Text style={styles.primaryButtonText}>{busy ? 'Connecting…' : 'Sign in'}</Text></Pressable>
      <Pressable disabled={busy} style={styles.secondaryButton} onPress={() => void submit('sign-up')}><Text style={styles.secondaryButtonText}>Create account</Text></Pressable>
      <Text style={styles.privacyText}>Sensitive clipboard entries and temporary codes never sync to the cloud.</Text>
    </View>
  </SafeAreaView>
}

export default function App() {
  const [user, setUser] = useState<User>()
  const [clips, setClips] = useState<Clip[]>([])
  const [localReady, setLocalReady] = useState(false)
  const [cloudReady, setCloudReady] = useState(false)
  const [draft, setDraft] = useState('')
  const [syncNoteId, setSyncNoteId] = useState<string>()
  const clipsRef = useRef<Clip[]>([])
  const uploadedRevisions = useRef(new Map<string, string>())

  const commit = useCallback((next: Clip[]) => {
    const ordered = order(next)
    clipsRef.current = ordered
    setClips(ordered)
    void saveClips(ordered)
  }, [])

  const mergeRemote = useCallback((incoming: Clip[]) => {
    const byId = new Map(clipsRef.current.map((clip) => [clip.id, clip]))
    for (const remote of incoming) {
      if (remote.isSensitive || remote.expiresAt) continue
      const local = byId.get(remote.id)
      if (!local || Date.parse(remote.updatedAt) > Date.parse(local.updatedAt)) byId.set(remote.id, remote)
    }
    commit([...byId.values()])
  }, [commit])

  useEffect(() => {
    // Earlier Android builds could create non-UUID IDs, which Supabase rejected.
    // Re-key those offline notes once so the first reconciliation uploads them.
    void loadClips().then((saved) => { commit(repairLocalIds(saved)); setLocalReady(true) })
    let stop = () => {}
    void listen(mergeRemote, setUser).then((unsubscribe) => { stop = unsubscribe })
    return () => stop()
  }, [commit, mergeRemote])

  useEffect(() => {
    if (!localReady || !user) { setCloudReady(false); return }
    let cancelled = false
    let syncing = false
    uploadedRevisions.current.clear()
    setCloudReady(false)
    const reconcile = async () => {
      if (cancelled || syncing) return
      syncing = true
      try {
        // Realtime is immediate when available; this keeps both timelines
        // current after a backgrounded phone or a transient connection drop.
        mergeRemote(await pull())
        if (!cancelled) setCloudReady(true)
      } catch {
        if (!cancelled) setCloudReady(false)
      } finally { syncing = false }
    }
    void reconcile()
    const interval = setInterval(() => { void reconcile() }, 5_000)
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void reconcile() })
    return () => { cancelled = true; clearInterval(interval); appState.remove() }
  }, [localReady, mergeRemote, user])

  useEffect(() => {
    if (!cloudReady) return
    const changed = clips.filter((clip) => !clip.isSensitive && !clip.expiresAt && uploadedRevisions.current.get(clip.id) !== clip.updatedAt)
    if (!changed.length) return
    const timeout = setTimeout(() => { void push(changed).then(() => changed.forEach((clip) => uploadedRevisions.current.set(clip.id, clip.updatedAt))).catch(() => setCloudReady(false)) }, 350)
    return () => clearTimeout(timeout)
  }, [clips, cloudReady])

  useEffect(() => {
    if (!draft.trim()) return
    const timeout = setTimeout(() => {
      const current = syncNoteId ? clipsRef.current.find((clip) => clip.id === syncNoteId) : undefined
      const now = new Date().toISOString()
      const saved = current
        ? { ...current, rawContent: draft, normalizedContent: normalized(draft), title: titleFor(draft), updatedAt: now }
        : makeClip(draft)
      if (!current) setSyncNoteId(saved.id)
      commit([saved, ...clipsRef.current.filter((clip) => clip.id !== saved.id)])
      void push([saved]).then(() => uploadedRevisions.current.set(saved.id, saved.updatedAt)).catch(() => setCloudReady(false))
    }, 550)
    return () => clearTimeout(timeout)
  }, [commit, draft, syncNoteId])

  const captureClipboard = async () => {
    const text = await Clipboard.getStringAsync()
    if (!text.trim()) return Alert.alert('Nothing to save', 'Copy something first, then return here and tap Paste clipboard.')
    const clip = makeClip(text, 'Mobile clipboard')
    commit([clip, ...clipsRef.current])
    void push([clip]).then(() => uploadedRevisions.current.set(clip.id, clip.updatedAt)).catch(() => setCloudReady(false))
  }

  const copyClip = async (clip: Clip) => {
    await Clipboard.setStringAsync(clip.rawContent)
    const now = new Date().toISOString()
    const updated = { ...clip, lastCopiedAt: now, updatedAt: now, copyCount: clip.copyCount + 1 }
    commit([updated, ...clipsRef.current.filter((entry) => entry.id !== clip.id)])
    void push([updated]).then(() => uploadedRevisions.current.set(updated.id, updated.updatedAt)).catch(() => setCloudReady(false))
  }

  const trashClip = (clip: Clip) => {
    const updated = { ...clip, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    commit([updated, ...clipsRef.current.filter((entry) => entry.id !== clip.id)])
    void push([updated]).then(() => uploadedRevisions.current.set(updated.id, updated.updatedAt)).catch(() => setCloudReady(false))
  }

  const confirmTrash = (clip: Clip) => {
    Alert.alert('Move note to Trash?', 'You can restore it later from the same account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move to Trash', style: 'destructive', onPress: () => trashClip(clip) },
    ])
  }

  const sections = useMemo(() => {
    const groups = new Map<string, Clip[]>()
    clips.filter((clip) => !clip.deletedAt && !clip.isSnippet).forEach((clip) => {
      const day = dayLabel(clip.lastCopiedAt)
      groups.set(day, [...(groups.get(day) ?? []), clip])
    })
    return [...groups.entries()].map(([title, data]) => ({ title, data }))
  }, [clips])

  if (!isConfigured()) return <SafeAreaView style={styles.authPage}><Text style={styles.authTitle}>ClipNote needs sync configuration.</Text></SafeAreaView>
  if (!user) return <AuthScreen onDone={() => void sessionUser().then(setUser)} />

  return <SafeAreaView style={styles.page}>
    <StatusBar style="dark" />
    <View style={styles.topbar}>
      <View><Text style={styles.title}>ClipNote</Text><Text style={styles.subtitle}>{cloudReady ? 'Synced with your laptop' : 'Saving locally…'}</Text></View>
      <Pressable style={styles.signOut} onPress={() => void signOut()}><Text style={styles.signOutText}>Sign out</Text></Pressable>
    </View>
    <View style={styles.composer}>
      <TextInput value={draft} onChangeText={setDraft} placeholder="Write a note…" placeholderTextColor="#8b8b90" multiline style={styles.composerInput} textAlignVertical="top" />
      <View style={styles.composerFooter}><Text style={styles.savedHint}>{draft.trim() ? 'Saving as you type' : 'Notes sync automatically'}</Text><Pressable onPress={() => { setDraft(''); setSyncNoteId(undefined) }}><Text style={styles.newNote}>New note</Text></Pressable></View>
    </View>
    <View style={styles.actions}><Pressable style={styles.clipboardButton} onPress={() => void captureClipboard()}><Text style={styles.clipboardButtonText}>Paste clipboard</Text></Pressable><Text style={styles.actionsHint}>Save copied text while ClipNote is open</Text></View>
    <SectionList sections={sections} keyExtractor={(item) => item.id} contentContainerStyle={sections.length ? styles.list : styles.emptyList}
      renderSectionHeader={({ section }) => <Text style={styles.dayTitle}>{section.title}</Text>}
      renderItem={({ item }) => <View style={styles.entry}><Text style={styles.entryTime}>{timeLabel(item.lastCopiedAt)}</Text><Pressable style={styles.entryBody} onPress={() => void copyClip(item)}><Text style={styles.entryMeta}>{item.sourceApplication === 'Mobile note' || item.sourceApplication === 'Note' ? 'Note' : 'Copied'}</Text><Text numberOfLines={4} style={styles.entryContent}>{item.rawContent}</Text><Text style={styles.entryHint}>Tap to copy</Text></Pressable><Pressable hitSlop={10} onPress={() => confirmTrash(item)}><Text style={styles.delete}>Delete</Text></Pressable></View>}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Your shared notebook is empty.</Text><Text style={styles.emptyText}>Write here or paste your clipboard. It will appear on your laptop right away.</Text></View>}
    />
  </SafeAreaView>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8f7f4' }, authPage: { flex: 1, justifyContent: 'center', backgroundColor: '#f8f7f4', padding: 24 },
  authCard: { width: '100%', maxWidth: 420, alignSelf: 'center', borderWidth: 1, borderColor: border, borderRadius: 18, backgroundColor: paper, padding: 25 },
  mark: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#eaf1fb' }, markText: { color: accent, fontSize: 20, fontWeight: '700' },
  authTitle: { color: ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.7, marginTop: 17 }, authText: { color: muted, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 20 },
  input: { borderWidth: 1, borderColor: border, borderRadius: 9, color: ink, fontSize: 15, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 10, backgroundColor: '#fff' },
  formMessage: { color: '#8f6727', fontSize: 12, lineHeight: 17, marginVertical: 6 }, primaryButton: { alignItems: 'center', borderRadius: 9, backgroundColor: accent, paddingVertical: 12, marginTop: 8 }, primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderRadius: 9, borderWidth: 1, borderColor: border, paddingVertical: 11, marginTop: 9 }, secondaryButtonText: { color: ink, fontSize: 14, fontWeight: '600' }, disabled: { opacity: 0.6 }, privacyText: { color: muted, fontSize: 11, lineHeight: 16, marginTop: 19 },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 19, paddingTop: 15, paddingBottom: 13, backgroundColor: paper, borderBottomWidth: 1, borderBottomColor: border }, title: { color: ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 }, subtitle: { color: muted, fontSize: 11, marginTop: 2 }, signOut: { paddingVertical: 7, paddingHorizontal: 9 }, signOutText: { color: muted, fontSize: 12, fontWeight: '600' },
  composer: { margin: 16, marginBottom: 9, borderWidth: 1, borderColor: border, borderRadius: 11, overflow: 'hidden', backgroundColor: paper }, composerInput: { minHeight: 114, color: ink, fontSize: 16, lineHeight: 23, padding: 15 }, composerFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: border, paddingVertical: 9, paddingHorizontal: 13 }, savedHint: { color: muted, fontSize: 11 }, newNote: { color: accent, fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 7 }, clipboardButton: { borderRadius: 8, borderWidth: 1, borderColor: '#ccd9ed', backgroundColor: '#f0f5fd', paddingVertical: 7, paddingHorizontal: 10 }, clipboardButtonText: { color: accent, fontWeight: '700', fontSize: 12 }, actionsHint: { color: muted, fontSize: 10, flexShrink: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 42 }, dayTitle: { color: muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', borderBottomWidth: 1, borderBottomColor: border, paddingTop: 23, paddingBottom: 8 }, entry: { flexDirection: 'row', gap: 10, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: border }, entryTime: { width: 56, color: muted, fontSize: 11, paddingTop: 2 }, entryBody: { flex: 1 }, entryMeta: { color: muted, fontSize: 10, fontWeight: '600' }, entryContent: { color: ink, fontSize: 15, lineHeight: 21, marginTop: 5 }, entryHint: { color: muted, fontSize: 10, marginTop: 5 }, delete: { color: '#b35d59', fontSize: 10, fontWeight: '600', paddingTop: 2 },
  emptyList: { flexGrow: 1 }, empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 45, paddingBottom: 80 }, emptyTitle: { color: ink, fontSize: 17, fontWeight: '700', textAlign: 'center' }, emptyText: { color: muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
})
