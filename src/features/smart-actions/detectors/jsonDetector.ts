import type { ClipboardDetector } from '../types'
import { makeAction } from '../types'

function nestingDepth(value: unknown, depth = 0): number {
  if (depth >= 100 || !value || typeof value !== 'object') return depth
  const children = Array.isArray(value) ? value : Object.values(value)
  if (!children.length) return depth + 1
  return Math.max(...children.map((child) => nestingDepth(child, depth + 1)))
}

function parseErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'The value is not valid JSON.'
  return error.message.replace(/^JSON\.parse:\s*/i, '').slice(0, 220)
}

export const jsonDetector: ClipboardDetector = {
  id: 'json',
  priority: 70,
  canDetect(content) {
    const value = content.trim()
    return (value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))
  },
  detect(content) {
    if (!this.canDetect(content)) return undefined
    try {
      const parsed: unknown = JSON.parse(content)
      const topLevelType = Array.isArray(parsed) ? 'Array' : 'Object'
      const itemCount = Array.isArray(parsed) ? parsed.length : Object.keys(parsed as Record<string, unknown>).length
      return {
        type: 'json', confidence: 0.98, badge: 'JSON', preview: `${topLevelType} · ${itemCount} ${Array.isArray(parsed) ? 'items' : 'keys'}`,
        metadata: { valid: true, topLevelType, itemCount, depth: nestingDepth(parsed), parsed },
        availableActions: [
          makeAction('json-pretty', 'Pretty', 'align-left'), makeAction('json-validate', 'Validate', 'check-circle'),
          makeAction('json-minify', 'Minify', 'shrink'), makeAction('json-save', 'Save', 'save'),
          makeAction('json-copy-formatted', 'Copy Formatted', 'copy'),
        ],
        searchText: `json valid ${topLevelType} ${itemCount} keys items nesting`,
      }
    } catch (error) {
      const parseError = parseErrorMessage(error)
      return {
        type: 'json', confidence: 0.86, badge: 'JSON', preview: 'Invalid JSON',
        metadata: { valid: false, parseError },
        availableActions: [makeAction('json-validate', 'Validate', 'alert-circle'), makeAction('copy-original', 'Copy', 'copy')],
        searchText: `json invalid parse error ${parseError}`,
      }
    }
  },
}
