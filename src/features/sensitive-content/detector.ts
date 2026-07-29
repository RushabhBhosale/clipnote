export type SensitiveKind = 'otp' | 'password' | 'api-key' | 'access-token' | 'jwt' | 'private-key' | 'credit-card' | 'connection-string'

export interface SensitiveMatch {
  isSensitive: boolean
  kind?: SensitiveKind
  expiresInSeconds?: number
}

const otpPattern = /^\d{6}$/
const jwtPattern = /^eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}$/
const privateKeyPattern = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/
const connectionStringPattern = /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|sqlserver):\/\/[^\s]+/i
const githubTokenPattern = /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/
const apiKeyPattern = /\b(?:sk|pk|rk|AIza)[_-][A-Za-z0-9_-]{16,}\b|\bAKIA[0-9A-Z]{16}\b/i
const accessTokenPattern = /\b(?:access[_-]?token|bearer)\s*[:=]?\s*["']?[A-Za-z0-9._~+\/-]{20,}/i
const labeledPasswordPattern = /\b(?:password|passwd|pwd|secret)\s*[:=]\s*\S+/i

function validCardNumber(value: string) {
  const digits = value.replace(/[\s-]/g, '')
  if (!/^\d{13,19}$/.test(digits)) return false
  let sum = 0
  let doubleDigit = false
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index])
    if (doubleDigit) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    doubleDigit = !doubleDigit
  }
  return sum % 10 === 0
}

export function detectSensitiveContent(input: string): SensitiveMatch {
  const value = input.trim()
  if (!value) return { isSensitive: false }
  if (privateKeyPattern.test(value)) return { isSensitive: true, kind: 'private-key', expiresInSeconds: 300 }
  if (jwtPattern.test(value)) return { isSensitive: true, kind: 'jwt', expiresInSeconds: 300 }
  if (connectionStringPattern.test(value)) return { isSensitive: true, kind: 'connection-string', expiresInSeconds: 300 }
  if (githubTokenPattern.test(value) || apiKeyPattern.test(value)) return { isSensitive: true, kind: 'api-key', expiresInSeconds: 300 }
  if (accessTokenPattern.test(value)) return { isSensitive: true, kind: 'access-token', expiresInSeconds: 300 }
  if (otpPattern.test(value)) return { isSensitive: true, kind: 'otp', expiresInSeconds: 120 }
  if (validCardNumber(value)) return { isSensitive: true, kind: 'credit-card', expiresInSeconds: 60 }
  if (labeledPasswordPattern.test(value)) return { isSensitive: true, kind: 'password', expiresInSeconds: 30 }
  return { isSensitive: false }
}

export function maskSensitiveContent(value: string) {
  if (!value) return ''
  const visible = Math.min(4, Math.max(1, Math.floor(value.length / 5)))
  return `${'•'.repeat(Math.max(4, value.length - visible))}${value.slice(-visible)}`
}

export function hasExpired(clip: { isFavorite: boolean; expiresAt?: string }) {
  return Boolean(!clip.isFavorite && clip.expiresAt && new Date(clip.expiresAt).getTime() <= Date.now())
}
