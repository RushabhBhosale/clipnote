import {
  Clipboard, Code2, Image, Link2, Pause, Play, Settings, ShieldAlert, Star, StickyNote, Trash2,
} from 'lucide-react'
import type { Clip, ClipSection } from '../types/clip'
import { cn } from '../lib/utils'

interface SidebarProps {
  clips: Clip[] 
  section: ClipSection
  isMonitoring: boolean
  onSectionChange: (section: ClipSection) => void
  onSettings: () => void
  onToggleMonitoring: () => void
}

const sections: Array<{ id: ClipSection; label: string; Icon: typeof Clipboard }> = [
  { id: 'all', label: 'All Clips', Icon: Clipboard },
  { id: 'favorites', label: 'Favorites', Icon: Star },
  { id: 'text', label: 'Text', Icon: StickyNote },
  { id: 'code', label: 'Code', Icon: Code2 },
  { id: 'links', label: 'Links', Icon: Link2 },
  { id: 'images', label: 'Images', Icon: Image },
  { id: 'sensitive', label: 'Sensitive', Icon: ShieldAlert },
  { id: 'trash', label: 'Trash', Icon: Trash2 },
  { id: 'snippets', label: 'Snippets', Icon: StickyNote },
]

function countForSection(clips: Clip[], section: ClipSection) {
  if (section === 'trash') return clips.filter((clip) => clip.deletedAt).length
  if (section === 'favorites') return clips.filter((clip) => !clip.deletedAt && clip.isFavorite).length
  if (section === 'snippets') return clips.filter((clip) => !clip.deletedAt && clip.isSnippet).length
  if (section === 'sensitive') return clips.filter((clip) => !clip.deletedAt && clip.isSensitive).length
  return undefined
}

export function Sidebar({ clips, section, isMonitoring, onSectionChange, onSettings, onToggleMonitoring }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Clip collections">
      <div className="brand" aria-label="ClipNote">
        <span className="brand-mark"><Clipboard size={18} strokeWidth={2.3} /></span>
        <span>ClipNote</span>
      </div>
      <nav className="sidebar-nav">
        {sections.map(({ id, label, Icon }) => {
          const count = countForSection(clips, id)
          return (
            <button key={id} className={cn('sidebar-item', section === id && 'is-active')} onClick={() => onSectionChange(id)}>
              <Icon size={17} strokeWidth={1.9} />
              <span>{label}</span>
              {count !== undefined && count > 0 ? <small>{count}</small> : null}
            </button>
          )
        })}
      </nav>
      <div className="sidebar-footer">
        <button className="sidebar-item" onClick={onSettings}>
          <Settings size={17} strokeWidth={1.9} />
          <span>Settings</span>
        </button>
        <button className={cn('monitor-toggle', !isMonitoring && 'is-paused')} onClick={onToggleMonitoring}>
          {isMonitoring ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          <span>{isMonitoring ? 'Pause Monitoring' : 'Resume Monitoring'}</span>
        </button>
      </div>
    </aside>
  )
}
