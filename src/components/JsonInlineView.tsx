import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

function isContainer(value: JsonValue): value is JsonValue[] | { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object'
}

function valueType(value: JsonValue) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return typeof value
}

function valuePreview(value: JsonValue) {
  if (Array.isArray(value)) return `Array(${value.length})`
  if (value && typeof value === 'object') return `Object(${Object.keys(value).length})`
  return JSON.stringify(value)
}

function JsonPreviewNode({ label, value, depth = 0 }: { label: string; value: JsonValue; depth?: number }) {
  const container = isContainer(value)
  const [expanded, setExpanded] = useState(depth === 0)
  const entries = Array.isArray(value)
    ? value.map((child, index) => [`[${index}]`, child] as const)
    : value && typeof value === 'object'
      ? Object.entries(value)
      : []
  return <li className="json-inline-node" role="treeitem" aria-expanded={container ? expanded : undefined}>
    <div className="json-inline-row" style={{ paddingLeft: `${depth * 13}px` }}>
      {container ? <button onClick={() => setExpanded((current) => !current)} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}>{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span />}
      <span className="json-inline-key">{label}</span><span className={`json-inline-type type-${valueType(value)}`}>{valueType(value)}</span><code>{valuePreview(value)}</code>
    </div>
    {container && expanded ? <ul role="group">{entries.map(([key, child]) => <JsonPreviewNode key={key} label={key} value={child} depth={depth + 1} />)}</ul> : null}
  </li>
}

export function JsonInlineView({ content }: { content: string }) {
  const parsed = useMemo(() => {
    try { return { value: JSON.parse(content) as JsonValue } }
    catch (error) { return { error: error instanceof Error ? error.message : 'Invalid JSON' } }
  }, [content])
  const [view, setView] = useState<'pretty' | 'raw'>('pretty')

  if ('error' in parsed) return <section className="json-inline-view"><div className="json-inline-tabs"><button className="is-active">Raw</button></div><p className="json-inline-error">Invalid JSON · {parsed.error}</p><pre className="json-inline-raw">{content}</pre></section>

  return <section className="json-inline-view" aria-label="JSON response viewer">
    <div className="json-inline-tabs"><button className={view === 'pretty' ? 'is-active' : ''} onClick={() => setView('pretty')}>Pretty</button><button className={view === 'raw' ? 'is-active' : ''} onClick={() => setView('raw')}>Raw</button></div>
    {view === 'pretty' ? <div className="json-inline-preview"><ul role="tree"><JsonPreviewNode label="root" value={parsed.value} /></ul></div> : <pre className="json-inline-raw">{content}</pre>}
  </section>
}
