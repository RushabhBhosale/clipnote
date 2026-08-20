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

export async function dismissAfterCopy() {
  if (!isTauri()) return
  await invoke('dismiss_after_copy')
}

export async function hideClipNote() {
  if (!isTauri()) return
  await invoke('hide_clipnote')
}

export async function showClipNote() {
  if (!isTauri()) return
  await invoke('show_clipnote')
}

export async function openExternalTarget(target: string, privateMode = false) {
  if (!isTauri()) {
    window.open(target, '_blank', 'noopener,noreferrer')
    return
  }
  await invoke('open_external_target', { target, privateMode })
}

export async function saveLocalTextFile(filename: string, content: string) {
  if (!isTauri()) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
    return filename
  }
  return invoke<string>('save_local_text_file', { filename, content })
}

export async function runTerminalCommand(command: string, allowDestructive: boolean) {
  if (!isTauri()) throw new Error('Terminal actions are available in the desktop app.')
  await invoke('run_terminal_command', { command, allowDestructive })
}
