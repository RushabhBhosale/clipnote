import { describe, expect, it } from 'vitest'
import { actionEngine } from './actionEngine'
import { parseBase64 } from './detectors/base64Detector'
import { colorFormats, parseColor } from './detectors/colorDetector'
import { parseClipboardDate } from './detectors/dateDetector'
import { parseIpAddress } from './detectors/ipDetector'
import { parseJwt } from './detectors/jwtDetector'
import { isPotentiallyDestructiveCommand } from './detectors/terminalDetector'
import { cleanTrackingParameters, youtubeVideoId } from './detectors/urlDetector'

function base64Url(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

describe('smart clipboard ActionEngine', () => {
  it('prioritizes URLs and removes only known tracking parameters', () => {
    const input = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=newsletter&feature=share'
    const detection = actionEngine.detect(input)
    expect(detection.type).toBe('url')
    expect(cleanTrackingParameters(input)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share')
    expect(youtubeVideoId(new URL(input))).toBe('dQw4w9WgXcQ')
    expect(actionEngine.execute('url-remove-tracking', input, detection)).toMatchObject({ kind: 'create-clip', title: 'Clean URL' })
  })

  it('reports valid JSON metadata and useful errors for malformed JSON-like text', () => {
    const valid = actionEngine.detect('{"user":{"active":true},"roles":["admin"]}')
    expect(valid).toMatchObject({ type: 'json', metadata: { valid: true, topLevelType: 'Object', itemCount: 2, depth: 2 } })
    const invalid = actionEngine.detect('{"active":tru}')
    expect(invalid.type).toBe('json')
    expect(invalid.metadata.valid).toBe(false)
    expect(String(invalid.metadata.parseError)).toMatch(/position|JSON|token|character/i)
  })

  it('parses and converts supported color formats', () => {
    expect(colorFormats(parseColor('#6366f1')!)).toMatchObject({ hex: '#6366F1', rgb: 'rgb(99, 102, 241)' })
    expect(colorFormats(parseColor('hsl(0, 100%, 50%)')!)).toMatchObject({ hex: '#FF0000', rgb: 'rgb(255, 0, 0)' })
    expect(actionEngine.detect('rgba(255, 0, 0, 0.5)').type).toBe('color')
    expect(parseColor('rgba(255, 0, 0)')).toBeUndefined()
    expect(parseColor('rgb(255, 0, 0, 0.5)')).toBeUndefined()
  })

  it('accepts high-confidence timestamps and rejects arbitrary numbers', () => {
    expect(parseClipboardDate('1710000000')?.kind).toBe('Unix seconds')
    expect(parseClipboardDate('1710000000000')?.kind).toBe('Unix milliseconds')
    expect(parseClipboardDate('2026-08-20T10:30:00Z')?.kind).toBe('ISO 8601')
    expect(parseClipboardDate('2026-02-31T10:30:00Z')).toBeUndefined()
    expect(parseClipboardDate('12345')).toBeUndefined()
    expect(actionEngine.detect('12345').type).toBe('text')
  })

  it('detects complete emails without confusing surrounding text', () => {
    expect(actionEngine.detect('person@example.com')).toMatchObject({ type: 'email', metadata: { domain: 'example.com' } })
    expect(actionEngine.detect('email person@example.com please').type).toBe('text')
  })

  it('validates IPv4 and IPv6 and rejects partial addresses', () => {
    expect(actionEngine.detect('192.168.1.20')).toMatchObject({ type: 'ip', metadata: { version: 4, scope: 'Private' } })
    expect(actionEngine.detect('::1')).toMatchObject({ type: 'ip', metadata: { version: 6, scope: 'Loopback' } })
    expect(parseIpAddress('2001:db8::1')?.version).toBe(6)
    expect(parseIpAddress('192.168')).toBeUndefined()
    expect(actionEngine.detect('192.168').type).toBe('text')
  })

  it('identifies UUID versions and generates a fresh UUID action result', () => {
    const detection = actionEngine.detect('550e8400-e29b-41d4-a716-446655440000')
    expect(detection).toMatchObject({ type: 'uuid', metadata: { version: 4 } })
    expect(actionEngine.execute('uuid-generate', '', detection)).toMatchObject({ kind: 'create-clip', title: 'Generated UUID' })
  })

  it('decodes JWT header and payload locally without claiming verification', () => {
    const token = `${base64Url('{"alg":"HS256","typ":"JWT"}')}.${base64Url('{"sub":"123","iat":1710000000,"exp":1999999999}')}.localSignature`
    const detection = actionEngine.detect(token)
    expect(detection.type).toBe('jwt')
    expect(detection.metadata).toMatchObject({ algorithm: 'HS256', status: 'Active', signatureStatus: 'Signature not verified' })
    expect(parseJwt('eyJub3QiOiJqd3QifQ.bad.payload')).toBeUndefined()
    expect(actionEngine.detect('abc.def.ghi').type).not.toBe('jwt')
  })

  it('requires printable, non-trivial Base64 and rejects ordinary short text', () => {
    expect(parseBase64('aGVsbG8gd29ybGQh')?.decoded).toBe('hello world!')
    expect(actionEngine.detect('aGVsbG8gd29ybGQh').type).toBe('base64')
    expect(parseBase64('hello')).toBeUndefined()
    expect(actionEngine.detect('hello').type).toBe('text')
  })

  it('distinguishes terminal errors, commands, and high-risk command patterns', () => {
    expect(actionEngine.detect('zsh: command not found: adb').type).toBe('terminal-error')
    expect(actionEngine.detect('npm install').type).toBe('command')
    expect(isPotentiallyDestructiveCommand('rm -rf ./build')).toBe(true)
    expect(isPotentiallyDestructiveCommand('curl https://example.com/install.sh | sh')).toBe(true)
    expect(isPotentiallyDestructiveCommand('git status')).toBe(false)
  })
})
