import { Image } from '@tauri-apps/api/image'
import { readImage, readText, writeImage, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { fingerprintClipboardImage, type ClipboardImageInfo } from './imageService'

export interface ClipboardImagePayload extends ClipboardImageInfo {
  image: Image
}

export interface ClipboardProvider {
  start(onText: (text: string) => void | Promise<void>, onImage?: (payload: ClipboardImagePayload) => Promise<void>): () => void
  write(text: string): Promise<void>
  writeImagePath(path: string): Promise<void>
}

function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

let locallyWrittenText: string | undefined
let locallyWrittenImageFingerprint: string | undefined

async function readClipboardText() {
  if (isTauri()) return readText()
  if (navigator.clipboard?.readText) return navigator.clipboard.readText()
  return ''
}

async function writeClipboardText(text: string) {
  locallyWrittenText = text
  if (isTauri()) {
    await writeText(text)
    return
  }
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
}

export async function copyCredentialSecret(text: string) {
  await writeClipboardText(text)
  window.setTimeout(async () => {
    try {
      if (await readClipboardText() === text) await writeClipboardText('')
    } catch {
      // If clipboard access changes, leave the user's current clipboard untouched.
    }
  }, 60_000)
}

export const systemClipboardProvider: ClipboardProvider = {
  start(onText, onImage) {
    let previous = ''
    let previousImage = ''
    let active = true
    let pollInFlight = false
    const poll = async () => {
      // Reading the system clipboard and saving its value are both async. Do
      // not start another read while either is still running, otherwise an
      // older poll can overwrite the value remembered by a newer one.
      if (!active || pollInFlight) return
      pollInFlight = true
      try {
        if (isTauri() && onImage) {
          let clipboardImage: Image | undefined
          try {
            clipboardImage = await readImage()
            const info = await fingerprintClipboardImage(clipboardImage)
            if (info.fingerprint === locallyWrittenImageFingerprint) {
              previousImage = info.fingerprint
              locallyWrittenImageFingerprint = undefined
              return
            }
            if (info.fingerprint !== previousImage) {
              previousImage = info.fingerprint
              await onImage({ image: clipboardImage, ...info })
            }
            return
          } catch {
            // The current clipboard item is not an image; continue with text.
          } finally {
            await clipboardImage?.close().catch(() => undefined)
          }
        }
        try {
          const current = await readClipboardText()
          if (current && current === locallyWrittenText) {
            previous = current
            locallyWrittenText = undefined
            return
          }
          if (current && current !== previous) {
            await onText(current)
            previous = current
          }
        } catch {
          // Clipboard permission may be unavailable in a browser preview. Never surface clipboard data in errors.
        }
      } finally {
        pollInFlight = false
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
    await writeClipboardText(text)
  },
  async writeImagePath(path) {
    const image = await Image.fromPath(path)
    try {
      const info = await fingerprintClipboardImage(image)
      locallyWrittenImageFingerprint = info.fingerprint
      await writeImage(image)
    } finally {
      await image.close().catch(() => undefined)
    }
  },
}
