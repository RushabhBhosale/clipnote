import { describe, expect, it } from 'vitest'
import { richTextPlainText, richTextPrefix } from './richText'

describe('richTextPlainText', () => {
  it('keeps existing plain-text notes unchanged', () => {
    expect(richTextPlainText('A previous plain note\nwith two lines')).toBe('A previous plain note\nwith two lines')
  })

  it('extracts readable text from formatted notes', () => {
    const value = `${richTextPrefix}<div>Hello <strong>there</strong></div><ul><li>First</li><li>Second &amp; final</li></ul>`
    expect(richTextPlainText(value)).toBe('Hello there\nFirst\nSecond & final')
  })
})
