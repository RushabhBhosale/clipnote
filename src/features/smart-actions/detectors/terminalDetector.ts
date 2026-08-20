import type { ClipboardDetector } from '../types'
import { makeAction } from '../types'

const errorPatterns = [
  /(?:^|\n)npm ERR!/i, /(?:^|\n)(?:BUILD|TASK) FAILED\b/i, /(?:^|\n)(?:TypeError|ReferenceError|SyntaxError|RangeError):/,
  /(?:^|\n)(?:zsh|bash|sh): .*(?:command not found|permission denied|no such file)/i, /(?:^|\n)error(?:\[[A-Z0-9]+\])?:/i,
  /(?:^|\n)Traceback \(most recent call last\):/, /(?:^|\n)Exception in thread /, /\bat .+\([^\n]+:\d+:\d+\)/,
]
const commandPattern = /^(?:\$\s*)?(?:npm|npx|pnpm|yarn|bun|git|cd|ls|cat|curl|wget|docker|kubectl|cargo|python3?|node|brew|chmod|chown|ssh|sudo|rm|mkdir|cp|mv|grep|rg)\b/i
const codePatterns = [/(?:^|\n)\s*(?:const|let|var|function|class|interface|import|export|def|fn|SELECT|CREATE TABLE)\b/, /=>|<\/?[A-Za-z][^>]*>|\{\s*[\w"']+\s*[:=]/]

export function isPotentiallyDestructiveCommand(command: string) {
  return /(?:^|[;&|]\s*|\bsudo\s+)(?:rm\b|mkfs\b|dd\b|shutdown\b|reboot\b|chmod\s+-R\b|chown\s+-R\b)|\b(?:curl|wget)\b[^\n|]*\|\s*(?:ba)?sh\b/i.test(command)
}

export function sanitizedErrorSearch(content: string) {
  const firstUsefulLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? 'terminal error'
  return firstUsefulLine
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(?:eyJ|sk_|pk_|ghp_)[A-Za-z0-9._-]{12,}/g, '[redacted]')
    .slice(0, 180)
}

export const terminalErrorDetector: ClipboardDetector = {
  id: 'terminal-error', priority: 20,
  canDetect: (content) => content.length <= 2_000_000 && errorPatterns.some((pattern) => pattern.test(content)),
  detect(content) {
    if (!this.canDetect(content)) return undefined
    const summary = sanitizedErrorSearch(content)
    return {
      type: 'terminal-error', confidence: 0.91, badge: 'ERROR', preview: summary,
      metadata: { summary },
      availableActions: [makeAction('terminal-search', 'Search', 'search', 'external'), makeAction('terminal-save-error', 'Save Error', 'save'), makeAction('copy-original', 'Copy', 'copy')],
      searchText: `terminal error stack trace failure exception ${summary}`,
    }
  },
}

export const commandDetector: ClipboardDetector = {
  id: 'command', priority: 15,
  canDetect(content) { return content.length <= 20_000 && commandPattern.test(content.trim()) && !content.includes('\n\n') },
  detect(content) {
    if (!this.canDetect(content)) return undefined
    const command = content.trim().replace(/^\$\s*/, '')
    const destructive = isPotentiallyDestructiveCommand(command)
    return {
      type: 'command', confidence: 0.88, badge: 'COMMAND', preview: command.split(/\r?\n/)[0].slice(0, 120),
      metadata: { command, destructive },
      availableActions: [makeAction('copy-original', 'Copy', 'copy'), makeAction('command-run', 'Run in Terminal', 'terminal', destructive ? 'destructive' : 'command'), makeAction('command-save', 'Save Command', 'save')],
      searchText: `terminal shell command ${destructive ? 'dangerous destructive' : ''}`,
    }
  },
}

export const codeDetector: ClipboardDetector = {
  id: 'code', priority: 10,
  canDetect: (content) => content.length <= 2_000_000 && codePatterns.some((pattern) => pattern.test(content)),
  detect(content) {
    if (!this.canDetect(content)) return undefined
    return {
      type: 'code', confidence: 0.74, badge: 'CODE', preview: content.trim().split(/\r?\n/)[0].slice(0, 120),
      metadata: {}, availableActions: [makeAction('copy-original', 'Copy', 'copy')], searchText: 'code snippet source programming',
    }
  },
}
