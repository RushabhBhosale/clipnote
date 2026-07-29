import { Check, Copy, CopyPlus, ExternalLink, Image as ImageIcon, Info, Pencil, RotateCcw, ShieldAlert, Star, Tag, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Clip } from '../types/clip'
import { domainFromUrl, formatRelativeTime } from '../lib/utils'
import { ContentTypeIcon } from './ContentTypeIcon'

interface ClipDetailProps {
  clip?: Clip
  onUpdate: (id: string, patch: Partial<Clip>) => Promise<void>
  onCopy: (id: string) => Promise<void>
  onToggleFavorite: (id: string) => Promise<void>
  onDuplicate: (id: string) => Promise<void>
  onMoveToTrash: (id: string) => Promise<void>
  onRestore: (id: string) => Promise<void>
  onRemovePermanently: (id: string) => Promise<void>
  onSnippet: (id: string) => Promise<void>
}

const labels: Record<Clip['contentType'], string> = {
  text: 'Text', code: 'Code', link: 'Link', email: 'Email', phone: 'Phone number', otp: 'One-time code', password: 'Sensitive text', file: 'File path', json: 'JSON', command: 'Command', image: 'Image', other: 'Other',
}

function SyntaxCode({ value }: { value: string }) {
  const tokens = value.split(/(\/\/[^\n]*|\b(?:const|let|var|function|return|import|from|export|class|interface|type|async|await|if|else|true|false|null)\b|(?:"[^"\n]*"|'[^'\n]*'|`[^`]*`)|\b\d+(?:\.\d+)?\b)/g)
  return <pre className="syntax-code">{tokens.map((token, index) => {
    const className = token.startsWith('//') ? 'comment' : /^(const|let|var|function|return|import|from|export|class|interface|type|async|await|if|else|true|false|null)$/.test(token) ? 'keyword' : /^("|\'|`)/.test(token) ? 'string' : /^\d/.test(token) ? 'number' : undefined
    return <span key={`${token}-${index}`} className={className}>{token}</span>
  })}</pre>
}

function expirationSelection(expiresAt?: string) {
  if (!expiresAt) return 'never'
  const seconds = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000))
  if (seconds <= 45) return '30'
  if (seconds <= 90) return '60'
  if (seconds <= 180) return '120'
  if (seconds <= 600) return '300'
  return '1800'
}

export function ClipDetail({ clip, onUpdate, onCopy, onToggleFavorite, onDuplicate, onMoveToTrash, onRestore, onRemovePermanently, onSnippet }: ClipDetailProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tag, setTag] = useState('')
  const [editingCode, setEditingCode] = useState(false)
  useEffect(() => {
    setTitle(clip?.title ?? '')
    setContent(clip?.rawContent ?? '')
    setTag('')
    setEditingCode(false)
  }, [clip?.id])

  if (!clip) return <section className="detail-empty"><div className="detail-empty-icon"><Copy size={25} /></div><h2>Select a clip</h2><p>Choose an item from the list to view and edit it.</p></section>
  const isCode = ['code', 'json', 'command'].includes(clip.contentType)
  const domain = clip.contentType === 'link' ? domainFromUrl(clip.rawContent) : undefined
  const isTrashed = Boolean(clip.deletedAt)
  const saveTitle = () => title.trim() && title !== clip.title && void onUpdate(clip.id, { title: title.trim() })
  const saveContent = () => content !== clip.rawContent && void onUpdate(clip.id, { rawContent: content, normalizedContent: content.trim().replace(/\s+/g, ' ') })
  const addTag = () => {
    const next = tag.trim().replace(/^#/, '')
    if (!next || clip.tags.includes(next)) return setTag('')
    void onUpdate(clip.id, { tags: [...clip.tags, next] })
    setTag('')
  }
  return (
    <section className="clip-detail" aria-label="Selected clipboard entry">
      <header className="detail-header">
        <span className="detail-type"><ContentTypeIcon type={clip.contentType} /> {labels[clip.contentType]}</span>
        <div className="detail-actions">
          {isTrashed ? <>
            <button className="icon-button" onClick={() => void onRestore(clip.id)} title="Restore"><RotateCcw size={17} /></button>
            <button className="icon-button destructive" onClick={() => void onRemovePermanently(clip.id)} title="Delete permanently"><Trash2 size={17} /></button>
          </> : <>
            <button className="icon-button" onClick={() => void onCopy(clip.id)} title="Copy again"><Copy size={17} /></button>
            <button className={clip.isFavorite ? 'icon-button is-favorite' : 'icon-button'} onClick={() => void onToggleFavorite(clip.id)} title="Favorite"><Star size={17} fill={clip.isFavorite ? 'currentColor' : 'none'} /></button>
            <button className="icon-button" onClick={() => void onDuplicate(clip.id)} title="Duplicate"><CopyPlus size={17} /></button>
            <button className="icon-button destructive" onClick={() => void onMoveToTrash(clip.id)} title="Move to Trash"><Trash2 size={17} /></button>
          </>}
        </div>
      </header>
      {clip.isSensitive ? <div className="sensitive-notice"><ShieldAlert size={17} /><span>This may contain sensitive information{clip.expiresAt ? '. It will be permanently removed when it expires.' : '.'}</span></div> : null}
      <input className="detail-title" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={saveTitle} aria-label="Clip title" />
      {clip.isSnippet ? <span className="snippet-pill">Snippet</span> : null}
      {clip.contentType === 'image' ? <div className="image-preview"><ImageIcon size={38} /><span>Local image preview</span></div> : null}
      {isCode && !editingCode ? <div className="code-block-wrap"><SyntaxCode value={clip.rawContent} /><button className="subtle-edit" onClick={() => setEditingCode(true)}><Pencil size={14} /> Edit code</button></div> : null}
      {(!isCode || editingCode) && clip.contentType !== 'image' ? <textarea className={isCode ? 'clip-content code-editor' : 'clip-content'} value={content} onChange={(event) => setContent(event.target.value)} onBlur={saveContent} aria-label="Clip content" spellCheck={!isCode} /> : null}
      {isCode && editingCode ? <button className="finish-edit" onClick={() => { saveContent(); setEditingCode(false) }}><Check size={15} /> Done</button> : null}
      {domain ? <div className="link-card"><span><LinkMark /> {domain}</span><button onClick={() => window.open(clip.rawContent, '_blank', 'noopener,noreferrer')}>Open Link <ExternalLink size={14} /></button></div> : null}
      {clip.contentType === 'image' ? <div className="ocr-block"><span>OCR text</span><p>{clip.ocrText || 'OCR is not available in this local build yet.'}</p></div> : null}
      <div className="metadata-grid">
        <div><span>Created</span><strong>{formatRelativeTime(clip.createdAt)}</strong></div>
        <div><span>Last copied</span><strong>{formatRelativeTime(clip.lastCopiedAt)}</strong></div>
        <div><span>Copies</span><strong>{clip.copyCount}</strong></div>
        <div><span>Source app</span><strong>{clip.sourceApplication || 'Not available'}</strong></div>
      </div>
      <div className="detail-section"><label><Tag size={15} /> Tags</label><div className="tags-row">{clip.tags.map((entry) => <button key={entry} className="tag-chip" onClick={() => void onUpdate(clip.id, { tags: clip.tags.filter((tagName) => tagName !== entry) })}>{entry}<X size={12} /></button>)}<input value={tag} onChange={(event) => setTag(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag() } }} onBlur={addTag} placeholder="Add a tag" aria-label="Add tag" /></div></div>
      <div className="detail-section expiration-row"><label><Info size={15} /> Expiration</label><select value={clip.isFavorite ? 'never' : expirationSelection(clip.expiresAt)} disabled={clip.isFavorite} onChange={(event) => { const value = event.target.value; void onUpdate(clip.id, { expiresAt: value === 'never' ? undefined : new Date(Date.now() + Number(value) * 1000).toISOString() }) }}><option value="never">{clip.isFavorite ? 'Never (favorite)' : 'Never'}</option><option value="30">30 seconds</option><option value="60">1 minute</option><option value="120">2 minutes</option><option value="300">5 minutes</option><option value="1800">30 minutes</option></select></div>
      {!isTrashed ? <footer className="detail-footer"><button className="quiet-button" onClick={() => void onSnippet(clip.id)}>{clip.isSnippet ? <Check size={15} /> : <CopyPlus size={15} />}{clip.isSnippet ? 'Saved as snippet' : 'Save as snippet'}</button><span>Stored locally</span></footer> : null}
    </section>
  )
}

function LinkMark() { return <ExternalLink size={15} /> }
