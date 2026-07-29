import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { Image, transformImage } from '@tauri-apps/api/image'

export interface ClipboardImageInfo {
  fingerprint: string
  width: number
  height: number
}

export async function fingerprintClipboardImage(image: Image) {
  return invoke<ClipboardImageInfo>('clipboard_image_fingerprint', { image: transformImage(image) })
}

export async function saveClipboardImage(id: string, image: Image) {
  return invoke<string>('clipboard_image_save', { id, image: transformImage(image) })
}

export function localImageUrl(path: string) {
  return convertFileSrc(path)
}
