import type { ClipboardDetector } from '../types'
import { makeAction } from '../types'

const trackingParameters = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'])

export function parseHttpUrl(content: string) {
  try {
    const url = new URL(content.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}

export function cleanTrackingParameters(value: string) {
  const url = parseHttpUrl(value)
  if (!url) return value.trim()
  for (const key of [...url.searchParams.keys()]) {
    if (trackingParameters.has(key.toLocaleLowerCase())) url.searchParams.delete(key)
  }
  return url.toString()
}

export function youtubeVideoId(url: URL) {
  const hostname = url.hostname.replace(/^www\./, '').toLocaleLowerCase()
  if (hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0]?.match(/^[\w-]{11}$/)?.[0]
  if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
    const queryId = url.searchParams.get('v')
    if (queryId?.match(/^[\w-]{11}$/)) return queryId
    const pathMatch = url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})(?:\/|$)/)
    return pathMatch?.[1]
  }
  return undefined
}

export const urlDetector: ClipboardDetector = {
  id: 'url',
  priority: 90,
  canDetect: (content) => Boolean(parseHttpUrl(content)),
  detect(content) {
    const url = parseHttpUrl(content)
    if (!url) return undefined
    const cleanUrl = cleanTrackingParameters(url.toString())
    const videoId = youtubeVideoId(url)
    const domain = url.hostname.replace(/^www\./, '')
    const actions = [
      makeAction('url-open', 'Open', 'external-link', 'external'),
      makeAction('copy-original', 'Copy', 'copy'),
      makeAction('url-copy-clean', 'Clean URL', 'sparkles'),
      makeAction('url-open-private', 'Private', 'shield', 'external'),
      makeAction('url-qr', 'QR', 'qr-code'),
      makeAction('url-copy-domain', 'Domain', 'globe'),
    ]
    if (cleanUrl !== url.toString()) actions.splice(3, 0, makeAction('url-remove-tracking', 'Remove Tracking', 'eraser'))
    if (videoId) actions.push(makeAction('url-copy-video-id', 'Video ID', 'video'))
    return {
      type: 'url', confidence: 0.99, badge: 'URL', preview: domain,
      metadata: { url: url.toString(), cleanUrl, domain, protocol: url.protocol.replace(':', ''), videoId },
      availableActions: actions,
      searchText: `url link ${domain} ${url.pathname} ${videoId ?? ''}`,
    }
  },
}
