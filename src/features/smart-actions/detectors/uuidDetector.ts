import type { ClipboardDetector } from '../types'
import { makeAction } from '../types'

const uuidPattern = /^([0-9a-f]{8})-([0-9a-f]{4})-([1-8][0-9a-f]{3})-([89ab][0-9a-f]{3})-([0-9a-f]{12})$/i

export const uuidDetector: ClipboardDetector = {
  id: 'uuid', priority: 45,
  canDetect: (content) => uuidPattern.test(content.trim()),
  detect(content) {
    const uuid = content.trim().toLocaleLowerCase()
    const match = uuid.match(uuidPattern)
    if (!match) return undefined
    const version = Number(match[3][0])
    return {
      type: 'uuid', confidence: 0.99, badge: 'UUID', preview: `UUID · Version ${version}`,
      metadata: { uuid, version },
      availableActions: [makeAction('copy-original', 'Copy', 'copy'), makeAction('uuid-generate', 'Generate New', 'refresh-cw')],
      searchText: `uuid guid version ${version} ${uuid}`,
    }
  },
}
