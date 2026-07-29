import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'

export interface ClipboardProvider {
  start(onText: (text: string) => void): () => void
  write(text: string): Promise<void>
}

function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

let locallyWrittenText: string | undefined

async function readClipboardText() {
  if (isTauri()) return readText()
  if (navigator.clipboard?.readText) return navigator.clipboard.readText()
  return ''
}

export const systemClipboardProvider: ClipboardProvider = {
  start(onText) {
    let previous = ''
    let active = true
    const poll = async () => {
      if (!active) return
      try {
        const current = await readClipboardText()
        if (current && current === locallyWrittenText) {
          previous = current
          locallyWrittenText = undefined
          return
        }
        if (current && current !== previous) {
          previous = current
          onText(current)
        }
      } catch {
        // Clipboard permission may be unavailable in a browser preview. Never surface clipboard data in errors.
      }
    }
    void poll()
    const interval = window.setInterval(() => void poll(), 900)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  },
  async write(text) {
    locallyWrittenText = text
    if (isTauri()) {
      await writeText(text)
      return
    }
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
  },
}
