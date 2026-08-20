import { decodeBase64Text } from '../encoding'
import type { ClipboardDetector } from '../types'
import { makeAction } from '../types'

export function parseBase64(content: string) {
  const encoded = content.trim().replace(/\s+/g, '')
  if (encoded.length < 16 || encoded.length > 2_000_000 || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded)) return undefined
  try {
    const decoded = decodeBase64Text(encoded)
    if (!decoded || decoded.includes('\u0000')) return undefined
    const printable = [...decoded].filter((character) => character === '\n' || character === '\r' || character === '\t' || character >= ' ').length / [...decoded].length
    if (printable < 0.95) return undefined
    return { encoded, decoded }
  } catch {
    return undefined
  }
}

export const base64Detector: ClipboardDetector = {
  id: 'base64', priority: 30,
  canDetect: (content) => Boolean(parseBase64(content)),
  detect(content) {
    const parsed = parseBase64(content)
    if (!parsed) return undefined
    return {
      type: 'base64', confidence: 0.9, badge: 'BASE64', preview: `Base64 · ${parsed.decoded.length} decoded characters`,
      metadata: { decoded: parsed.decoded, decodedLength: parsed.decoded.length },
      availableActions: [makeAction('base64-decode', 'Decode', 'binary'), makeAction('base64-copy-decoded', 'Copy Decoded', 'copy')],
      searchText: `base64 encoded decoded ${parsed.decoded.slice(0, 500)}`,
    }
  },
}
