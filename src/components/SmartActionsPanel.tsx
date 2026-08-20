import {
  Activity, AlertTriangle, Binary, Braces, CheckCircle2, Clock3, Copy, ExternalLink, Globe,
  Mail, Palette, QrCode, RefreshCw, Save, Search, Shield, Sparkles, Terminal, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { actionEngine } from '../features/smart-actions/actionEngine'
import type { ClipboardAction, ClipboardActionEffect, ClipboardDetectionResult } from '../features/smart-actions/types'
import { openExternalTarget, runTerminalCommand, saveLocalTextFile } from '../services/nativeService'
import type { Clip } from '../types/clip'

interface SmartActionsPanelProps {
  clip: Clip
  onCopyText: (text: string) => Promise<boolean>
  onCreateResult: (text: string, title: string) => Promise<string | undefined>
}

const iconMap: Record<string, ComponentType<{ size?: number }>> = {
  'external-link': ExternalLink, copy: Copy, sparkles: Sparkles, shield: Shield, 'qr-code': QrCode,
  globe: Globe, save: Save, 'check-circle': CheckCircle2, palette: Palette, clock: Clock3,
  calendar: Clock3, mail: Mail, activity: Activity, 'refresh-cw': RefreshCw, braces: Braces,
  binary: Binary, search: Search, terminal: Terminal,
}

function metadataRows(detection: ClipboardDetectionResult): Array<[string, string]> {
  const value = detection.metadata
  switch (detection.type) {
    case 'url': return [['Domain', String(value.domain)], ['Protocol', String(value.protocol).toUpperCase()], ...(value.videoId ? [['Video ID', String(value.videoId)] as [string, string]] : [])]
    case 'json': return value.valid ? [['Status', 'Valid JSON'], ['Top level', String(value.topLevelType)], ['Keys / items', String(value.itemCount)], ['Nesting depth', String(value.depth)]] : [['Status', 'Invalid JSON'], ['Parse error', String(value.parseError)]]
    case 'color': return [['HEX', String(value.hex)], ['RGB', String(value.rgb)], ['HSL', String(value.hsl)]]
    case 'date': return [['Local', String(value.local)], ['UTC', String(value.utc)], ['ISO 8601', String(value.iso)], ['Unix seconds', String(value.unixSeconds)], ['Unix milliseconds', String(value.unixMilliseconds)]]
    case 'email': return [['Address', String(value.email)], ['Domain', String(value.domain)]]
    case 'ip': return [['Address', String(value.address)], ['Version', `IPv${String(value.version)}`], ['Scope', String(value.scope)]]
    case 'uuid': return [['Type', 'UUID'], ['Version', String(value.version)]]
    case 'jwt': return [['Algorithm', String(value.algorithm)], ['Issued at', value.issuedAt ? String(value.issuedAt) : 'Not present'], ['Expiration', value.expiresAt ? String(value.expiresAt) : 'Not present'], ['Status', String(value.status)], ['Signature', 'Not verified']]
    case 'base64': return [['Status', 'Valid Base64 text'], ['Decoded length', `${String(value.decodedLength)} characters`]]
    case 'terminal-error': return [['Detected', 'Terminal error / stack trace']]
    case 'command': return [['Detected', 'Shell command'], ['Risk check', value.destructive ? 'Potentially destructive' : 'No high-risk pattern found']]
    case 'code': return [['Detected', 'Code snippet']]
    default: return []
  }
}

export function SmartTypeBadge({ detection }: { detection: ClipboardDetectionResult }) {
  if (detection.type === 'text') return null
  const swatch = detection.type === 'color' ? String(detection.metadata.swatch) : undefined
  return <span className={`smart-type-badge type-${detection.type}`}>{swatch ? <i style={{ backgroundColor: swatch }} /> : null}{detection.badge}</span>
}

export function SmartPreview({ detection }: { detection: ClipboardDetectionResult }) {
  if (detection.type === 'text' || detection.type === 'code' || detection.type === 'command') return null
  const swatch = detection.type === 'color' ? String(detection.metadata.swatch) : undefined
  return <span className="smart-preview">{swatch ? <i style={{ backgroundColor: swatch }} /> : null}{detection.preview}</span>
}

export function SmartActionsPanel({ clip, onCopyText, onCreateResult }: SmartActionsPanelProps) {
  const detection = useMemo(() => actionEngine.detect(clip.rawContent), [clip.rawContent])
  const [output, setOutput] = useState<{ title: string; content?: string; qr?: string }>()
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()
  const [pendingCommand, setPendingCommand] = useState<Extract<ClipboardActionEffect, { kind: 'terminal' }>>()
  const [busyAction, setBusyAction] = useState<string>()
  const rows = metadataRows(detection)

  useEffect(() => {
    setOutput(undefined); setNotice(undefined); setError(undefined); setPendingCommand(undefined); setBusyAction(undefined)
  }, [clip.id])

  const applyEffect = useCallback(async (effect: ClipboardActionEffect) => {
    if (effect.kind === 'copy') {
      if (await onCopyText(effect.text)) setNotice(effect.message)
      return
    }
    if (effect.kind === 'create-clip') {
      if (await onCreateResult(effect.text, effect.title)) setNotice(effect.message)
      return
    }
    if (effect.kind === 'display') {
      setOutput({ title: effect.title, content: effect.content })
      return
    }
    if (effect.kind === 'qr') {
      const { default: QRCode } = await import('qrcode')
      setOutput({ title: 'QR code', qr: await QRCode.toDataURL(effect.content, { errorCorrectionLevel: 'M', margin: 1, width: 280 }) })
      return
    }
    if (effect.kind === 'save') {
      const path = await saveLocalTextFile(effect.filename, effect.content)
      setNotice(`Saved to ${path}`)
      return
    }
    if (effect.kind === 'terminal') {
      setPendingCommand(effect)
      return
    }
    await openExternalTarget(effect.target, effect.privateMode)
    setNotice(effect.privateMode ? 'Opened in a private browser window' : 'Opened')
  }, [onCopyText, onCreateResult])

  const runAction = useCallback(async (action: ClipboardAction) => {
    setBusyAction(action.id); setError(undefined); setNotice(undefined)
    try {
      await applyEffect(actionEngine.execute(action.id, clip.rawContent, detection))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The action could not be completed.')
    } finally {
      setBusyAction(undefined)
    }
  }, [applyEffect, clip.rawContent, detection])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return
      const actionIndex = Number(event.key) - 1
      const action = detection.availableActions[actionIndex]
      if (!action || actionIndex < 0 || actionIndex > 2) return
      event.preventDefault()
      void runAction(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detection.availableActions, runAction])

  const confirmCommand = async () => {
    if (!pendingCommand) return
    setBusyAction('terminal-confirm'); setError(undefined)
    try {
      await runTerminalCommand(pendingCommand.command, pendingCommand.destructive)
      setNotice('Command opened in Terminal')
      setPendingCommand(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Terminal could not run the command.')
    } finally {
      setBusyAction(undefined)
    }
  }

  return <section className="smart-actions" aria-label={`${detection.badge} contextual actions`}>
    <header className="smart-actions-header">
      <div><SmartTypeBadge detection={detection} /><span>{detection.preview}</span></div>
      <small>{Math.round(detection.confidence * 100)}% confidence</small>
    </header>
    <div className="smart-action-buttons">
      {detection.availableActions.map((action, index) => {
        const Icon = iconMap[action.icon] ?? Sparkles
        return <button key={action.id} className={action.riskLevel === 'destructive' ? 'is-risky' : ''} disabled={Boolean(busyAction)} onClick={() => void runAction(action)} title={index < 3 ? `${action.title} (⌘${index + 1})` : action.title}><Icon size={13} />{action.title}{index < 3 ? <kbd>⌘{index + 1}</kbd> : null}</button>
      })}
    </div>
    {rows.length ? <dl className="smart-metadata">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
    {pendingCommand ? <div className={pendingCommand.destructive ? 'smart-confirm is-destructive' : 'smart-confirm'}>
      <AlertTriangle size={17} /><div><strong>{pendingCommand.destructive ? 'Potentially destructive command' : 'Run this command in Terminal?'}</strong><p>{pendingCommand.destructive ? 'ClipNote found a high-risk pattern. Review the command carefully before continuing.' : 'Nothing runs until you confirm here.'}</p><code>{pendingCommand.command}</code><span><button onClick={() => setPendingCommand(undefined)}>Cancel</button><button className="confirm-run" disabled={busyAction === 'terminal-confirm'} onClick={() => void confirmCommand()}>{pendingCommand.destructive ? 'I understand, run' : 'Run command'}</button></span></div>
    </div> : null}
    {output ? <div className="smart-output"><header><strong>{output.title}</strong><button onClick={() => setOutput(undefined)} aria-label="Close action result"><X size={14} /></button></header>{output.qr ? <img src={output.qr} alt="QR code generated locally from the selected URL" /> : <pre>{output.content}</pre>}</div> : null}
    {notice ? <p className="smart-action-notice"><CheckCircle2 size={13} />{notice}</p> : null}
    {error ? <p className="smart-action-error"><AlertTriangle size={13} />{error}</p> : null}
    <footer>Processed locally · no clipboard content is logged</footer>
  </section>
}
