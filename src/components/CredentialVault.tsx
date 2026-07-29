import { ArrowLeft, Copy, Eye, EyeOff, KeyRound, LoaderCircle, Plus, Save, StickyNote, Trash2, UserRound } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { copyCredentialSecret, systemClipboardProvider } from '../services/clipboardProvider'
import { deleteCredential, getCredential, listCredentials, saveCredential, type Credential, type CredentialSummary } from '../services/credentialService'

function emptyCredential(): Credential {
  return {
    id: crypto.randomUUID(),
    label: '',
    url: '',
    username: '',
    password: '',
    updatedAt: new Date().toISOString(),
  }
}

function compactUrl(value: string) {
  if (!value) return ''
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname
  } catch {
    return value
  }
}

export function CredentialVault({ onClose }: { onClose: () => void }) {
  const [credentials, setCredentials] = useState<CredentialSummary[]>([])
  const [draft, setDraft] = useState<Credential>()
  const [revealPassword, setRevealPassword] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string>()
  const [busy, setBusy] = useState(true)
  const [notice, setNotice] = useState<string>()

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      setCredentials(await listCredentials())
      setNotice(undefined)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const edit = async (id: string) => {
    setBusy(true)
    try {
      setDraft(await getCredential(id))
      setRevealPassword(false)
      setPendingDeleteId(undefined)
      setNotice(undefined)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft?.label.trim() || !draft.password) {
      setNotice('Add a name and password.')
      return
    }
    setBusy(true)
    try {
      await saveCredential({ ...draft, label: draft.label.trim(), url: draft.url.trim(), username: draft.username.trim(), updatedAt: new Date().toISOString() })
      setDraft(undefined)
      setRevealPassword(false)
      await refresh()
      setNotice('Saved in macOS Keychain.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
      setBusy(false)
    }
  }

  const copyValue = async (id: string, field: 'username' | 'password') => {
    try {
      const credential = await getCredential(id)
      const value = credential[field]
      if (!value) {
        setNotice(`No ${field} saved.`)
        return
      }
      if (field === 'password') await copyCredentialSecret(value)
      else await systemClipboardProvider.write(value)
      setNotice(field === 'password' ? 'Password copied for 60 seconds. Not added to history.' : 'Username copied. Not added to history.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  const remove = async (id: string) => {
    if (pendingDeleteId !== id) {
      setPendingDeleteId(id)
      setNotice('Click Delete again to remove it permanently.')
      return
    }
    setBusy(true)
    try {
      await deleteCredential(id)
      setPendingDeleteId(undefined)
      await refresh()
      setNotice('Credential deleted.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
      setBusy(false)
    }
  }

  return <section className="credential-vault" aria-label="Credentials">
    <div className="credential-toolbar">
      <div><KeyRound size={15} /><strong>Creds</strong><span>macOS Keychain</span></div>
      <div>
        {!draft ? <button onClick={() => { setDraft(emptyCredential()); setNotice(undefined) }} title="Add credential"><Plus size={16} /></button> : null}
        <button onClick={onClose} title="Open daily note"><StickyNote size={15} /></button>
      </div>
    </div>

    {draft ? <form className="credential-form" onSubmit={(event) => void submit(event)}>
      <div className="credential-form-title"><button type="button" onClick={() => { setDraft(undefined); setRevealPassword(false); setNotice(undefined) }} aria-label="Back"><ArrowLeft size={15} /></button><strong>{credentials.some((item) => item.id === draft.id) ? 'Edit credential' : 'New credential'}</strong></div>
      <label>Website or app<input autoFocus autoComplete="off" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="My dev app" /></label>
      <label>Website URL<input inputMode="url" autoComplete="url" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="example.com" /></label>
      <label>Username or email<input autoComplete="username" value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} placeholder="developer@example.com" /></label>
      <label>Password<div className="credential-password-input"><input type={revealPassword ? 'text' : 'password'} autoComplete="current-password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder="Password" /><button type="button" onClick={() => setRevealPassword(!revealPassword)} aria-label={revealPassword ? 'Hide password' : 'Show password'}>{revealPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>
      <button className="credential-save" type="submit" disabled={busy}><Save size={14} /> Save to Keychain</button>
    </form> : <div className="credential-list">
      {busy ? <div className="credential-empty"><LoaderCircle className="credential-spinner" size={20} /> Opening Keychain…</div> : null}
      {!busy && credentials.length === 0 ? <div className="credential-empty"><KeyRound size={22} /><strong>No credentials yet</strong><span>Add a website or dev app login.</span><button onClick={() => setDraft(emptyCredential())}><Plus size={14} /> Add credential</button></div> : null}
      {!busy ? credentials.map((credential) => <article className="credential-row" key={credential.id}>
        <button className="credential-row-main" onClick={() => void edit(credential.id)}>
          <span className="credential-row-icon"><KeyRound size={15} /></span>
          <span><strong>{credential.label}</strong><small>{credential.username || compactUrl(credential.url) || 'Saved login'}</small>{credential.username && credential.url ? <em>{compactUrl(credential.url)}</em> : null}</span>
        </button>
        <div className="credential-row-actions">
          {credential.username ? <button onClick={() => void copyValue(credential.id, 'username')} title="Copy username"><UserRound size={14} /></button> : null}
          <button onClick={() => void copyValue(credential.id, 'password')} title="Copy password"><Copy size={14} /></button>
          <button className={pendingDeleteId === credential.id ? 'is-confirming' : ''} onClick={() => void remove(credential.id)} title={pendingDeleteId === credential.id ? 'Delete permanently' : 'Delete'}>{pendingDeleteId === credential.id ? 'Delete?' : <Trash2 size={14} />}</button>
        </div>
      </article>) : null}
    </div>}
    <div className={notice?.toLowerCase().includes('unable') || notice?.toLowerCase().includes('invalid') ? 'credential-notice is-error' : 'credential-notice'}>{notice ?? 'Credentials stay local on this Mac and never sync.'}</div>
  </section>
}
