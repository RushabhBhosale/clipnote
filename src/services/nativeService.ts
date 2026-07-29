import { invoke } from '@tauri-apps/api/core'

function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function openLocalDataFolder() {
  if (!isTauri()) throw new Error('The local data folder is available in the desktop app.')
  await invoke('open_data_folder')
}

export async function setStickyWindow(enabled: boolean) {
  if (!isTauri()) return
  await invoke('set_sticky_mode', { enabled })
}
