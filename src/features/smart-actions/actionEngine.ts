import { encodeBase64Text } from './encoding'
import { base64Detector } from './detectors/base64Detector'
import { colorDetector } from './detectors/colorDetector'
import { dateDetector } from './detectors/dateDetector'
import { emailDetector } from './detectors/emailDetector'
import { ipDetector } from './detectors/ipDetector'
import { jsonDetector } from './detectors/jsonDetector'
import { jwtDetector } from './detectors/jwtDetector'
import { commandDetector, codeDetector, terminalErrorDetector } from './detectors/terminalDetector'
import { urlDetector } from './detectors/urlDetector'
import { uuidDetector } from './detectors/uuidDetector'
import type { ClipboardActionEffect, ClipboardDetectionResult, ClipboardDetector } from './types'
import { makeAction } from './types'

const detectors: ClipboardDetector[] = [
  jwtDetector, urlDetector, emailDetector, jsonDetector, colorDetector, ipDetector, uuidDetector,
  dateDetector, base64Detector, terminalErrorDetector, commandDetector, codeDetector,
].sort((left, right) => right.priority - left.priority)

function plainTextDetection(content: string): ClipboardDetectionResult {
  return {
    type: 'text', confidence: 1, badge: 'TEXT', preview: content.trim().split(/\r?\n/)[0].slice(0, 120), metadata: {},
    availableActions: [makeAction('copy-original', 'Copy', 'copy'), makeAction('base64-encode', 'Encode Base64', 'binary')],
    searchText: 'plain text',
  }
}

export class ActionEngine {
  detectAll(content: string) {
    const value = content.trim()
    if (!value) return [plainTextDetection(content)]
    return detectors.flatMap((detector) => {
      if (!detector.canDetect(value)) return []
      const result = detector.detect(value)
      return result ? [result] : []
    })
  }

  detect(content: string) {
    return this.detectAll(content)[0] ?? plainTextDetection(content)
  }

  execute(actionId: string, content: string, detection = this.detect(content)): ClipboardActionEffect {
    const metadata = detection.metadata
    switch (actionId) {
      case 'copy-original': return { kind: 'copy', text: content, message: 'Copied' }
      case 'url-open': return { kind: 'open', target: String(metadata.url), externalDisclosure: true }
      case 'url-copy-clean': return { kind: 'copy', text: String(metadata.cleanUrl), message: 'Clean URL copied' }
      case 'url-remove-tracking': return { kind: 'create-clip', text: String(metadata.cleanUrl), title: 'Clean URL', message: 'Clean URL added to history' }
      case 'url-open-private': return { kind: 'open', target: String(metadata.url), privateMode: true, externalDisclosure: true }
      case 'url-qr': return { kind: 'qr', content: String(metadata.url) }
      case 'url-copy-domain': return { kind: 'copy', text: String(metadata.domain), message: 'Domain copied' }
      case 'url-copy-video-id': return { kind: 'copy', text: String(metadata.videoId), message: 'Video ID copied' }
      case 'json-pretty': return { kind: 'create-clip', text: JSON.stringify(metadata.parsed, null, 2), title: 'Pretty JSON', message: 'Pretty JSON added to history' }
      case 'json-minify': return { kind: 'create-clip', text: JSON.stringify(metadata.parsed), title: 'Minified JSON', message: 'Minified JSON added to history' }
      case 'json-copy-formatted': return { kind: 'copy', text: JSON.stringify(metadata.parsed, null, 2), message: 'Formatted JSON copied' }
      case 'json-validate': return { kind: 'display', title: metadata.valid ? 'Valid JSON' : 'Invalid JSON', content: metadata.valid ? 'This is valid JSON.' : String(metadata.parseError) }
      case 'json-save': return { kind: 'save', filename: `clipnote-${Date.now()}.json`, content: JSON.stringify(metadata.parsed, null, 2) }
      case 'color-copy-hex': return { kind: 'copy', text: String(metadata.hex), message: 'HEX copied' }
      case 'color-copy-rgb': return { kind: 'copy', text: String(metadata.rgb), message: 'RGB copied' }
      case 'color-copy-hsl': return { kind: 'copy', text: String(metadata.hsl), message: 'HSL copied' }
      case 'date-copy-local': return { kind: 'copy', text: String(metadata.local), message: 'Local date copied' }
      case 'date-copy-iso': return { kind: 'copy', text: String(metadata.iso), message: 'ISO timestamp copied' }
      case 'date-copy-unix': return { kind: 'copy', text: String(metadata.unixSeconds), message: 'Unix timestamp copied' }
      case 'date-copy-utc': return { kind: 'copy', text: String(metadata.utc), message: 'UTC date copied' }
      case 'email-compose': return { kind: 'open', target: `mailto:${encodeURIComponent(String(metadata.email))}`, externalDisclosure: true }
      case 'email-copy-domain': return { kind: 'copy', text: String(metadata.domain), message: 'Email domain copied' }
      case 'ip-ping': return { kind: 'terminal', command: `ping -c 4 ${String(metadata.address)}`, destructive: false, label: `Ping ${String(metadata.address)}` }
      case 'ip-open-http': return { kind: 'open', target: `http://${metadata.version === 6 ? `[${String(metadata.address)}]` : String(metadata.address)}`, externalDisclosure: true }
      case 'ip-open-https': return { kind: 'open', target: `https://${metadata.version === 6 ? `[${String(metadata.address)}]` : String(metadata.address)}`, externalDisclosure: true }
      case 'uuid-generate': return { kind: 'create-clip', text: crypto.randomUUID(), title: 'Generated UUID', message: 'New UUID added to history' }
      case 'jwt-decode': return { kind: 'display', title: 'Decoded JWT', content: `${JSON.stringify({ header: metadata.header, payload: metadata.payload }, null, 2)}\n\nSignature not verified` }
      case 'jwt-copy-header': return { kind: 'copy', text: JSON.stringify(metadata.header, null, 2), message: 'JWT header copied' }
      case 'jwt-copy-payload': return { kind: 'copy', text: JSON.stringify(metadata.payload, null, 2), message: 'JWT payload copied' }
      case 'base64-decode': return { kind: 'display', title: 'Decoded Base64', content: String(metadata.decoded) }
      case 'base64-copy-decoded': return { kind: 'copy', text: String(metadata.decoded), message: 'Decoded value copied' }
      case 'base64-encode': return { kind: 'create-clip', text: encodeBase64Text(content), title: 'Base64 encoded text', message: 'Base64 added to history' }
      case 'terminal-search': return { kind: 'open', target: `https://www.google.com/search?q=${encodeURIComponent(String(metadata.summary))}`, externalDisclosure: true }
      case 'terminal-save-error': return { kind: 'save', filename: `clipnote-error-${Date.now()}.txt`, content }
      case 'command-run': return { kind: 'terminal', command: String(metadata.command), destructive: Boolean(metadata.destructive), label: 'Run copied command' }
      case 'command-save': return { kind: 'save', filename: `clipnote-command-${Date.now()}.sh`, content: `${String(metadata.command)}\n` }
      default: throw new Error('This action is not available for the selected clipboard item.')
    }
  }
}

export const actionEngine = new ActionEngine()

export function detectionSearchText(content: string) {
  const result = actionEngine.detect(content)
  return `${result.badge} ${result.type} ${result.preview} ${result.searchText}`
}
