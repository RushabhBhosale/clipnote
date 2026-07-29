export type ContentType = 'text' | 'code' | 'link' | 'email' | 'phone' | 'otp' | 'password' | 'file' | 'json' | 'command' | 'image' | 'other'

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
