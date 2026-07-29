import { describe, expect, it } from 'vitest'
import { classifyContent, isJson } from './classifier'

describe('content classifier', () => {
  it('detects links, OTPs, and JSON deterministically', () => {
    expect(classifyContent('https://clipnote.local').contentType).toBe('link')
    expect(classifyContent('482916').contentType).toBe('otp')
    expect(classifyContent('{"enabled":true}').contentType).toBe('json')
    expect(isJson('[1, 2, 3]')).toBe(true)
  })
})
