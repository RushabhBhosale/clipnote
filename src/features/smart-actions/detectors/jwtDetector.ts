import { decodeBase64UrlJson } from '../encoding'
import type { ClipboardDetector } from '../types'
import { makeAction } from '../types'

export function parseJwt(content: string) {
  const token = content.trim()
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return undefined
  try {
    const header = decodeBase64UrlJson(parts[0])
    const payload = decodeBase64UrlJson(parts[1])
    if (typeof header.alg !== 'string') return undefined
    const issuedAt = typeof payload.iat === 'number' && Number.isFinite(payload.iat) ? new Date(payload.iat * 1_000) : undefined
    const expiresAt = typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? new Date(payload.exp * 1_000) : undefined
    if (issuedAt && Number.isNaN(issuedAt.getTime()) || expiresAt && Number.isNaN(expiresAt.getTime())) return undefined
    return { token, header, payload, issuedAt, expiresAt, isExpired: expiresAt ? expiresAt.getTime() <= Date.now() : undefined }
  } catch {
    return undefined
  }
}

function expiryPreview(expiresAt?: Date, isExpired?: boolean) {
  if (!expiresAt) return 'JWT · no expiration'
  if (isExpired) return 'JWT · expired'
  const minutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000))
  return minutes >= 120 ? `JWT · expires in ${Math.round(minutes / 60)}h` : `JWT · expires in ${minutes}m`
}

export const jwtDetector: ClipboardDetector = {
  id: 'jwt', priority: 100,
  canDetect: (content) => Boolean(parseJwt(content)),
  detect(content) {
    const parsed = parseJwt(content)
    if (!parsed) return undefined
    return {
      type: 'jwt', confidence: 0.99, badge: 'JWT', preview: expiryPreview(parsed.expiresAt, parsed.isExpired),
      metadata: {
        header: parsed.header, payload: parsed.payload, algorithm: parsed.header.alg,
        issuedAt: parsed.issuedAt?.toISOString(), expiresAt: parsed.expiresAt?.toISOString(),
        status: parsed.isExpired === undefined ? 'No expiration' : parsed.isExpired ? 'Expired' : 'Active', signatureStatus: 'Signature not verified',
      },
      availableActions: [makeAction('jwt-decode', 'Decode', 'braces'), makeAction('jwt-copy-header', 'Header', 'copy'), makeAction('jwt-copy-payload', 'Payload', 'copy')],
      searchText: `jwt token ${String(parsed.header.alg)} ${parsed.isExpired ? 'expired' : 'active'} signature not verified`,
    }
  },
}
