import type { ClipboardDetector } from '../types'
import { makeAction } from '../types'

function parseIpv4(value: string) {
  const parts = value.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^(?:0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) return undefined
  return parts.map(Number)
}

function validIpv6GroupCount(value: string) {
  if (!value.includes(':') || value.includes(':::') || (value.match(/::/g)?.length ?? 0) > 1) return false
  const sides = value.split('::')
  const groups = sides.flatMap((side) => side ? side.split(':') : [])
  let count = 0
  for (const [index, group] of groups.entries()) {
    if (/^[\da-f]{1,4}$/i.test(group)) count += 1
    else if (index === groups.length - 1 && parseIpv4(group)) count += 2
    else return false
  }
  return sides.length === 2 ? count < 8 : count === 8
}

export function parseIpAddress(content: string) {
  const value = content.trim().replace(/^\[|\]$/g, '')
  const ipv4 = parseIpv4(value)
  if (ipv4) return { value, version: 4 as const, bytes: ipv4 }
  if (validIpv6GroupCount(value)) return { value: value.toLocaleLowerCase(), version: 6 as const }
  return undefined
}

function classifyIpv4(bytes: number[]) {
  if (bytes[0] === 127) return 'Loopback'
  if (bytes[0] === 169 && bytes[1] === 254) return 'Link-local'
  if (bytes[0] === 10 || (bytes[0] === 172 && bytes[1] >= 16 && bytes[1] <= 31) || (bytes[0] === 192 && bytes[1] === 168)) return 'Private'
  return 'Public'
}

function classifyIpv6(value: string) {
  const normalized = value.toLocaleLowerCase()
  if (normalized === '::') return 'Unspecified'
  if (normalized === '::1') return 'Loopback'
  const first = parseInt(normalized.split(':')[0] || '0', 16)
  if ((first & 0xffc0) === 0xfe80) return 'Link-local'
  if ((first & 0xfe00) === 0xfc00) return 'Private'
  return 'Public'
}

export const ipDetector: ClipboardDetector = {
  id: 'ip', priority: 50,
  canDetect: (content) => Boolean(parseIpAddress(content)),
  detect(content) {
    const parsed = parseIpAddress(content)
    if (!parsed) return undefined
    const scope = parsed.version === 4 ? classifyIpv4(parsed.bytes) : classifyIpv6(parsed.value)
    return {
      type: 'ip', confidence: 0.99, badge: 'IP', preview: `${parsed.value} · ${scope} IPv${parsed.version}`,
      metadata: { address: parsed.value, version: parsed.version, scope },
      availableActions: [makeAction('copy-original', 'Copy', 'copy'), makeAction('ip-ping', 'Ping', 'activity', 'command'), makeAction('ip-open-http', 'HTTP', 'globe', 'external'), makeAction('ip-open-https', 'HTTPS', 'lock', 'external')],
      searchText: `ip address ipv${parsed.version} ${scope} ${parsed.value}`,
    }
  },
}
