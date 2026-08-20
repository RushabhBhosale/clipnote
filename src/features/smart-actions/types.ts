export type ClipboardContentType =
  | 'url'
  | 'json'
  | 'color'
  | 'date'
  | 'email'
  | 'ip'
  | 'uuid'
  | 'jwt'
  | 'base64'
  | 'terminal-error'
  | 'command'
  | 'code'
  | 'text'

export type ActionRiskLevel = 'safe' | 'external' | 'command' | 'destructive'

export interface ClipboardAction {
  id: string
  title: string
  icon: string
  riskLevel: ActionRiskLevel
}

export interface ClipboardDetectionResult {
  type: ClipboardContentType
  confidence: number
  metadata: Record<string, unknown>
  availableActions: ClipboardAction[]
  badge: string
  preview: string
  searchText: string
}

export interface ClipboardDetector {
  id: string
  priority: number
  canDetect(content: string): boolean
  detect(content: string): ClipboardDetectionResult | undefined
}

export type ClipboardActionEffect =
  | { kind: 'copy'; text: string; message: string }
  | { kind: 'create-clip'; text: string; title: string; message: string }
  | { kind: 'display'; title: string; content: string }
  | { kind: 'open'; target: string; privateMode?: boolean; externalDisclosure?: boolean }
  | { kind: 'qr'; content: string }
  | { kind: 'save'; filename: string; content: string }
  | { kind: 'terminal'; command: string; destructive: boolean; label: string }

export function makeAction(id: string, title: string, icon: string, riskLevel: ActionRiskLevel = 'safe'): ClipboardAction {
  return { id, title, icon, riskLevel }
}
