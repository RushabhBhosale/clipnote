import * as Clipboard from 'expo-clipboard'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { loadClips, saveClips } from './src/storage'
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

function newId() {
  const nativeUuid = globalThis.crypto?.randomUUID?.()
  if (nativeUuid) return nativeUuid
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

function makeClip(text: string, sourceApplication = 'Daily note'): Clip {
  const now = new Date().toISOString()
  return {
    id: newId(), title: titleFor(text), rawContent: text, normalizedContent: normalized(text), contentType: contentType(text),
    sourceApplication, createdAt: now, updatedAt: now, lastCopiedAt: now, copyCount: 1, isFavorite: false,
    isSensitive: false, tags: [], isSnippet: false,
  }
}

function isWrittenNote(clip: Clip) {
  return clip.sourceApplication === 'Note' || clip.sourceApplication === 'Mobile note' || clip.sourceApplication === 'Daily note'
}

function isToday(value: string) {
  return new Date(value).toDateString() === new Date().toDateString()
}

function findTodayNote(clips: Clip[]) {
  return clips
    .filter((clip) => !clip.deletedAt && !clip.isSnippet && isWrittenNote(clip) && isToday(clip.createdAt))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]
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

function ClipNoteApp() {
  const [clips, setClips] = useState<Clip[]>([])
  const [localReady, setLocalReady] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftDirty, setDraftDirty] = useState(false)
  const [draftNoteId, setDraftNoteId] = useState<string>()
  const clipsRef = useRef<Clip[]>([])
  const editVersion = useRef(0)
  const todayNote = useMemo(() => findTodayNote(clips), [clips])

  const commit = useCallback((next: Clip[]) => {
    const ordered = order(next)
    clipsRef.current = ordered
    setClips(ordered)
    void saveClips(ordered)
  }, [])

  useEffect(() => {
    void loadClips().then((saved) => { commit(saved); setLocalReady(true) })
  }, [commit])

  useEffect(() => {
    if (!localReady) return
    if (!todayNote) {
      if (!draftDirty) setDraft('')
      setDraftNoteId(undefined)
      return
    }
    const changedDocument = draftNoteId !== todayNote.id
    setDraftNoteId(todayNote.id)
    if (changedDocument || !draftDirty) setDraft(todayNote.rawContent)
  }, [draftDirty, draftNoteId, localReady, todayNote?.id, todayNote?.rawContent, todayNote?.updatedAt])

  useEffect(() => {
    if (!draftDirty || !localReady || (!draft.trim() && !draftNoteId)) return
    const version = editVersion.current
    const timeout = setTimeout(() => {
      const current = (draftNoteId ? clipsRef.current.find((clip) => clip.id === draftNoteId && isWrittenNote(clip)) : undefined) ?? findTodayNote(clipsRef.current)
      const now = new Date().toISOString()
      const saved = current
        ? { ...current, rawContent: draft, normalizedContent: normalized(draft), title: draft.trim() ? titleFor(draft) : 'Today', sourceApplication: 'Daily note', updatedAt: now, lastCopiedAt: now }
        : makeClip(draft)
      if (!current) setDraftNoteId(saved.id)
      commit([saved, ...clipsRef.current.filter((clip) => clip.id !== saved.id)])
      if (editVersion.current === version) setDraftDirty(false)
    }, 180)
    return () => clearTimeout(timeout)
  }, [commit, draft, draftDirty, draftNoteId, localReady])

  const captureClipboard = async () => {
    const text = await Clipboard.getStringAsync()
    if (!text.trim()) return Alert.alert('Nothing to save', 'Copy something first, then return here and tap Paste clipboard.')
    const saved = makeClip(text, 'Mobile clipboard')
    commit([saved, ...clipsRef.current.filter((clip) => clip.id !== saved.id)])
  }

  const copyClip = async (clip: Clip) => {
    await Clipboard.setStringAsync(clip.rawContent)
    const now = new Date().toISOString()
    const updated = { ...clip, lastCopiedAt: now, updatedAt: now, copyCount: clip.copyCount + 1 }
    commit([updated, ...clipsRef.current.filter((entry) => entry.id !== clip.id)])
  }

  const trashClip = (clip: Clip) => {
    const updated = { ...clip, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    commit([updated, ...clipsRef.current.filter((entry) => entry.id !== clip.id)])
    if (clip.id === draftNoteId) { setDraft(''); setDraftDirty(false); setDraftNoteId(undefined) }
  }

  const confirmTrash = (clip: Clip) => {
    Alert.alert('Delete this note?', 'This removes it from this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move to Trash', style: 'destructive', onPress: () => trashClip(clip) },
    ])
  }

  const sections = useMemo(() => {
    const groups = new Map<string, Clip[]>()
    clips.filter((clip) => !clip.deletedAt && !clip.isSnippet && clip.id !== todayNote?.id).forEach((clip) => {
      const day = dayLabel(clip.createdAt)
      groups.set(day, [...(groups.get(day) ?? []), clip])
    })
    return [...groups.entries()].map(([title, data]) => ({ title, data }))
  }, [clips, todayNote?.id])

  const changeDraft = (value: string) => {
    editVersion.current += 1
    setDraft(value)
    setDraftDirty(true)
  }

  if (!localReady) return <SafeAreaView style={styles.loadingPage} edges={['top', 'bottom', 'left', 'right']}><StatusBar style="dark" /><Text style={styles.loadingText}>Opening ClipNote…</Text></SafeAreaView>

  return <SafeAreaView style={styles.page} edges={['top', 'bottom', 'left', 'right']}>
    <StatusBar style="dark" />
    <View style={styles.topbar}>
      <View><Text style={styles.title}>ClipNote</Text><Text style={styles.subtitle}>Saved only on this device</Text></View>
    </View>
    <View style={styles.composer}>
      <View style={styles.composerHeading}><Text style={styles.composerDay}>Today</Text><Text style={styles.savedHint}>{draftDirty ? 'Saving locally…' : 'Saved locally'}</Text></View>
      <TextInput value={draft} onChangeText={changeDraft} placeholder="Start writing…" placeholderTextColor="#8b8b90" multiline style={styles.composerInput} textAlignVertical="top" />
    </View>
    <View style={styles.actions}><Pressable style={styles.clipboardButton} onPress={() => void captureClipboard()}><Text style={styles.clipboardButtonText}>Paste clipboard</Text></Pressable><Text style={styles.actionsHint}>Save copied text while ClipNote is open</Text></View>
    <SectionList sections={sections} keyExtractor={(item) => item.id} contentContainerStyle={sections.length ? styles.list : styles.emptyList}
      renderSectionHeader={({ section }) => <Text style={styles.dayTitle}>{section.title}</Text>}
      renderItem={({ item }) => <View style={styles.entry}><Text style={styles.entryTime}>{timeLabel(item.updatedAt)}</Text><Pressable style={styles.entryBody} onPress={() => void copyClip(item)}><Text style={styles.entryMeta}>{isWrittenNote(item) ? 'Daily note' : 'Copied'}</Text><Text numberOfLines={8} style={styles.entryContent}>{item.rawContent}</Text><Text style={styles.entryHint}>Tap to copy</Text></Pressable><Pressable hitSlop={10} onPress={() => confirmTrash(item)}><Text style={styles.delete}>Delete</Text></Pressable></View>}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Your local notebook is empty.</Text><Text style={styles.emptyText}>Write here or paste your clipboard. Everything stays on this device.</Text></View>}
    />
  </SafeAreaView>
}

export default function App() {
  return <SafeAreaProvider><ClipNoteApp /></SafeAreaProvider>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8f7f4' },
  loadingPage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f7f4' }, loadingText: { color: muted, fontSize: 14 },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 19, paddingTop: 15, paddingBottom: 13, backgroundColor: paper, borderBottomWidth: 1, borderBottomColor: border }, title: { color: ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 }, subtitle: { color: muted, fontSize: 11, marginTop: 2 },
  composer: { marginBottom: 9, borderTopWidth: 1, borderBottomWidth: 1, borderColor: border, backgroundColor: paper }, composerHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, paddingHorizontal: 16 }, composerDay: { color: ink, fontSize: 12, fontWeight: '700' }, composerInput: { minHeight: 150, color: ink, fontSize: 16, lineHeight: 24, padding: 16, paddingTop: 12 }, savedHint: { color: muted, fontSize: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 7 }, clipboardButton: { borderRadius: 8, borderWidth: 1, borderColor: '#ccd9ed', backgroundColor: '#f0f5fd', paddingVertical: 7, paddingHorizontal: 10 }, clipboardButtonText: { color: accent, fontWeight: '700', fontSize: 12 }, actionsHint: { color: muted, fontSize: 10, flexShrink: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 42 }, dayTitle: { color: muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', borderBottomWidth: 1, borderBottomColor: border, paddingTop: 23, paddingBottom: 8 }, entry: { flexDirection: 'row', gap: 10, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: border }, entryTime: { width: 56, color: muted, fontSize: 11, paddingTop: 2 }, entryBody: { flex: 1 }, entryMeta: { color: muted, fontSize: 10, fontWeight: '600' }, entryContent: { color: ink, fontSize: 15, lineHeight: 21, marginTop: 5 }, entryHint: { color: muted, fontSize: 10, marginTop: 5 }, delete: { color: '#b35d59', fontSize: 10, fontWeight: '600', paddingTop: 2 },
  emptyList: { flexGrow: 1 }, empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 45, paddingBottom: 80 }, emptyTitle: { color: ink, fontSize: 17, fontWeight: '700', textAlign: 'center' }, emptyText: { color: muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
})
