import { describe, expect, it } from 'vitest'
import { detectSensitiveContent, hasExpired } from './detector'

describe('sensitive clipboard detection', () => {
  it('recognizes OTPs, JWTs, and API keys without logging their values', () => {
    expect(detectSensitiveContent('482916')).toMatchObject({ isSensitive: true, kind: 'otp', expiresInSeconds: 120 })
    expect(detectSensitiveContent('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturePart')).toMatchObject({ isSensitive: true, kind: 'jwt' })
    expect(detectSensitiveContent('sk_demo_4yQF2b6LWj0rC5sN8vZx3pKd')).toMatchObject({ isSensitive: true, kind: 'api-key' })
  })

  it('does not expire favorites', () => {
    expect(hasExpired({ isFavorite: true, expiresAt: '2020-01-01T00:00:00.000Z' })).toBe(false)
    expect(hasExpired({ isFavorite: false, expiresAt: '2020-01-01T00:00:00.000Z' })).toBe(true)
  })
})
