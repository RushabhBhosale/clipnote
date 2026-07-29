import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Clip } from './types'

const storageKey = 'clipnote.mobile.clips.v1'

function order(clips: Clip[]) {
  return [...clips].sort((a, b) => Date.parse(b.lastCopiedAt) - Date.parse(a.lastCopiedAt))
}

export async function loadClips() {
  try {
    const raw = await AsyncStorage.getItem(storageKey)
    return raw ? order(JSON.parse(raw) as Clip[]) : []
  } catch {
    return []
  }
}

export async function saveClips(clips: Clip[]) {
  await AsyncStorage.setItem(storageKey, JSON.stringify(order(clips)))
}
