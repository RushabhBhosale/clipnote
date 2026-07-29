export const clipContentTypes = [
  'text',
  'code',
  'link',
  'email',
  'phone',
  'otp',
  'password',
  'file',
  'json',
  'command',
  'image',
  'other',
] as const

export type ContentType = (typeof clipContentTypes)[number]
export type ClipSection = 'all' | 'favorites' | 'text' | 'code' | 'links' | 'images' | 'sensitive' | 'trash' | 'snippets'
export type Theme = 'system' | 'light' | 'dark'

export interface Clip {
  id: string
  title: string
  rawContent: string
  normalizedContent: string
  contentType: ContentType
  sourceApplication?: string
  createdAt: string
  updatedAt: string
  lastCopiedAt: string
  copyCount: number
  isFavorite: boolean
  isSensitive: boolean
  expiresAt?: string
  tags: string[]
  detectedLanguage?: string
  imagePath?: string
  ocrText?: string
  deletedAt?: string
  isSnippet?: boolean
}

export interface ClipDraft extends Omit<Clip, 'id' | 'createdAt' | 'updatedAt' | 'lastCopiedAt' | 'copyCount'> {
  id?: string
  createdAt?: string
  updatedAt?: string
  lastCopiedAt?: string
  copyCount?: number
}

export interface ClipSettings {
  theme: Theme
  startMonitoring: boolean
  minimizeToTray: boolean
  maxClips: number
  retentionDays: number | null
  keepFavorites: boolean
  keepSnippets: boolean
  sensitiveDetection: boolean
  defaultSensitiveExpirySeconds: number
  excludedApplications: string[]
  saveImages: boolean
  regexSearch: boolean
  showSourceApplication: boolean
}

export const defaultSettings: ClipSettings = {
  theme: 'system',
  startMonitoring: true,
  minimizeToTray: true,
  maxClips: 1000,
  retentionDays: null,
  keepFavorites: true,
  keepSnippets: true,
  sensitiveDetection: true,
  defaultSensitiveExpirySeconds: 300,
  excludedApplications: [],
  saveImages: true,
  regexSearch: false,
  showSourceApplication: true,
}
