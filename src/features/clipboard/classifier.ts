import type { ContentType } from '../../types/clip'

const urlPattern = /^https?:\/\/[^\s]+$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phonePattern = /^\+?[\d\s().-]{7,20}$/
const otpPattern = /^\d{6}$/
const windowsPathPattern = /^(?:[a-zA-Z]:\\|\\\\)[^\n]+/
const unixPathPattern = /^(?:~\/|\/)[^\n]+/
const commandPattern = /^(?:\$\s*)?(?:npm|npx|pnpm|yarn|bun|git|cd|ls|cat|curl|wget|docker|kubectl|cargo|python3?|node|brew|chmod|ssh)\b/m
const codePattern = /(?:\b(?:const|let|var|function|class|interface|import|export|def|fn|SELECT|CREATE TABLE)\b|=>|\{\s*[\w"']+\s*[:=]|<\/?[A-Za-z][^>]*>)/

export interface Classification {
  contentType: ContentType
  detectedLanguage?: string
}

export function detectLanguage(value: string): string | undefined {
  if (/^\s*[\[{]/.test(value)) return 'JSON'
  if (/\b(?:const|let|var|function|import|export)\b|=>/.test(value)) return 'JavaScript'
  if (/\b(?:def|import|print|elif)\b/.test(value)) return 'Python'
  if (/\b(?:SELECT|INSERT|UPDATE|CREATE TABLE)\b/i.test(value)) return 'SQL'
  if (/^\s*<\/?[A-Za-z]/.test(value)) return 'HTML'
  if (/\b(?:fn|let mut|impl|pub)\b/.test(value)) return 'Rust'
  if (/^#!\/bin\/(?:ba)?sh|\b(?:echo|fi|then)\b/.test(value)) return 'Shell'
  return undefined
}

export function isJson(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null
  } catch {
    return false
  }
}

export function classifyContent(content: string, isImage = false): Classification {
  const value = content.trim()
  if (isImage) return { contentType: 'image' }
  if (!value) return { contentType: 'text' }
  if (otpPattern.test(value)) return { contentType: 'otp' }
  if (urlPattern.test(value)) return { contentType: 'link' }
  if (emailPattern.test(value)) return { contentType: 'email' }
  if (windowsPathPattern.test(value) || unixPathPattern.test(value)) return { contentType: 'file' }
  if (isJson(value)) return { contentType: 'json', detectedLanguage: 'JSON' }
  if (commandPattern.test(value)) return { contentType: 'command', detectedLanguage: 'Shell' }
  if (phonePattern.test(value) && /\d/.test(value)) return { contentType: 'phone' }
  if (codePattern.test(value)) return { contentType: 'code', detectedLanguage: detectLanguage(value) }
  return { contentType: 'text' }
}

export function suggestedTitle(value: string, type: ContentType) {
  if (type === 'image') return 'Copied image'
  const line = value.split(/\r?\n/).find(Boolean)?.trim() ?? ''
  if (!line) return 'Untitled clip'
  return line.length > 72 ? `${line.slice(0, 71)}…` : line
}
