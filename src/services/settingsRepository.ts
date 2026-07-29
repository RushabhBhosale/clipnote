import { defaultSettings, type ClipSettings } from '../types/clip'

const settingsKey = 'clipnote:settings:v1'

export function loadSettings(): ClipSettings {
  try {
    const saved = localStorage.getItem(settingsKey)
    if (!saved) return defaultSettings
    const parsed = JSON.parse(saved) as Partial<ClipSettings>
    // Older builds could leave an unusable history limit behind. Never let an
    // invalid value silently trash a whole notebook.
    const maxClips = typeof parsed.maxClips === 'number' && Number.isFinite(parsed.maxClips) && parsed.maxClips >= 25
      ? Math.floor(parsed.maxClips)
      : defaultSettings.maxClips
    return { ...defaultSettings, ...parsed, maxClips }
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: ClipSettings) {
  localStorage.setItem(settingsKey, JSON.stringify(settings))
}
