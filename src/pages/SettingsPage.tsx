import { Download, FolderOpen, Monitor, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ClipSettings } from '../types/clip'

interface SettingsPageProps {
  settings: ClipSettings
  onUpdate: (patch: Partial<ClipSettings>) => void
  onClearHistory: () => Promise<void>
  onExportJson: () => void
  onExportMarkdown: () => void
  onImport: (file: File) => Promise<void>
  onOpenDataFolder: () => Promise<void>
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="setting-row"><div><strong>{label}</strong>{hint ? <p>{hint}</p> : null}</div>{children}</div>
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button className={`switch ${checked ? 'is-checked' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>
}

export function SettingsPage({ settings, onUpdate, onClearHistory, onExportJson, onExportMarkdown, onImport, onOpenDataFolder }: SettingsPageProps) {
  const importRef = useRef<HTMLInputElement>(null)
  const [excludedApplication, setExcludedApplication] = useState('')
  const [actionError, setActionError] = useState<string>()
  const addExcludedApplication = () => {
    const next = excludedApplication.trim()
    if (!next || settings.excludedApplications.some((entry) => entry.toLocaleLowerCase() === next.toLocaleLowerCase())) return setExcludedApplication('')
    onUpdate({ excludedApplications: [...settings.excludedApplications, next] })
    setExcludedApplication('')
  }
  const importFile = async (file?: File) => {
    if (!file) return
    try { setActionError(undefined); await onImport(file) } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not import that backup.') }
  }
  const openFolder = async () => {
    try { setActionError(undefined); await onOpenDataFolder() } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not open the local data folder.') }
  }
  return <main className="settings-page"><header className="settings-title"><p className="eyebrow">ClipNote</p><h1>Settings</h1><p>ClipNote stores your clipboard history locally on this device.</p></header>
    <section className="settings-section"><h2>General</h2><div className="settings-group"><SettingRow label="Launch at startup" hint="Saved as a desktop preference; native launch-on-login is reserved for the next platform pass."><Switch checked={false} onChange={() => undefined} label="Launch at startup" /></SettingRow><SettingRow label="Minimize to tray"><Switch checked={settings.minimizeToTray} onChange={(minimizeToTray) => onUpdate({ minimizeToTray })} label="Minimize to tray" /></SettingRow><SettingRow label="Start monitoring automatically"><Switch checked={settings.startMonitoring} onChange={(startMonitoring) => onUpdate({ startMonitoring })} label="Start monitoring automatically" /></SettingRow><SettingRow label="Theme"><select value={settings.theme} onChange={(event) => onUpdate({ theme: event.target.value as ClipSettings['theme'] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></SettingRow></div></section>
    <section className="settings-section"><h2>History</h2><div className="settings-group"><SettingRow label="Maximum number of clips"><input className="number-input" type="number" min="25" max="10000" value={settings.maxClips} onChange={(event) => onUpdate({ maxClips: Math.max(25, Number(event.target.value)) })} /></SettingRow><SettingRow label="Delete clips older than"><select value={settings.retentionDays ?? 'never'} onChange={(event) => onUpdate({ retentionDays: event.target.value === 'never' ? null : Number(event.target.value) })}><option value="never">Never</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></SettingRow><SettingRow label="Keep favorites forever"><Switch checked={settings.keepFavorites} onChange={(keepFavorites) => onUpdate({ keepFavorites })} label="Keep favorites forever" /></SettingRow><SettingRow label="Keep snippets forever"><Switch checked={settings.keepSnippets} onChange={(keepSnippets) => onUpdate({ keepSnippets })} label="Keep snippets forever" /></SettingRow></div></section>
    <section className="settings-section"><h2>Privacy</h2><div className="settings-group"><SettingRow label="Sensitive content detection" hint="OTPs, tokens, passwords, and card numbers are automatically protected."><Switch checked={settings.sensitiveDetection} onChange={(sensitiveDetection) => onUpdate({ sensitiveDetection })} label="Sensitive content detection" /></SettingRow><SettingRow label="Default sensitive expiration"><select value={settings.defaultSensitiveExpirySeconds} onChange={(event) => onUpdate({ defaultSensitiveExpirySeconds: Number(event.target.value) })}><option value="30">30 seconds</option><option value="60">1 minute</option><option value="120">2 minutes</option><option value="300">5 minutes</option></select></SettingRow><SettingRow label="Excluded applications" hint="ClipNote ignores clipboard updates identified as coming from these apps."><div className="excluded-editor"><input value={excludedApplication} onChange={(event) => setExcludedApplication(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addExcludedApplication() } }} placeholder="e.g. 1Password" /><button className="outline-button" onClick={addExcludedApplication}>Add</button></div></SettingRow>{settings.excludedApplications.length ? <div className="excluded-list">{settings.excludedApplications.map((entry) => <button key={entry} onClick={() => onUpdate({ excludedApplications: settings.excludedApplications.filter((item) => item !== entry) })}>{entry} ×</button>)}</div> : null}<SettingRow label="Do not save images"><Switch checked={!settings.saveImages} onChange={(enabled) => onUpdate({ saveImages: !enabled })} label="Do not save images" /></SettingRow><SettingRow label="Clear all clipboard history" hint="This permanently removes locally stored clips."><button className="danger-button" onClick={() => void onClearHistory()}><Trash2 size={15} /> Clear history</button></SettingRow></div></section>
    <section className="settings-section"><h2>Advanced</h2><div className="settings-group"><SettingRow label="Enable regex search"><Switch checked={settings.regexSearch} onChange={(regexSearch) => onUpdate({ regexSearch })} label="Enable regex search" /></SettingRow><SettingRow label="Show source application"><Switch checked={settings.showSourceApplication} onChange={(showSourceApplication) => onUpdate({ showSourceApplication })} label="Show source application" /></SettingRow><SettingRow label="Source application detection" hint="Unavailable on this platform until native app detection is enabled."><span className="settings-status"><Monitor size={14} /> Graceful fallback</span></SettingRow><SettingRow label="Open local data folder"><button className="outline-button" onClick={() => void openFolder()}><FolderOpen size={15} /> Open folder</button></SettingRow><SettingRow label="Export data"><span className="button-pair"><button className="outline-button" onClick={onExportJson}><Download size={15} /> JSON</button><button className="outline-button" onClick={onExportMarkdown}><Download size={15} /> Markdown</button></span></SettingRow><SettingRow label="Import data"><button className="outline-button" onClick={() => importRef.current?.click()}><Upload size={15} /> Import backup</button></SettingRow></div></section>
    <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { void importFile(event.target.files?.[0]); event.currentTarget.value = '' }} />
    {actionError ? <p className="settings-action-error">{actionError}</p> : null}
    <footer className="settings-footer"><ShieldCheck size={16} /> No accounts, analytics, cloud sync, or tracking.</footer>
  </main>
}
