import { Bold, Italic, List, ListOrdered, Strikethrough } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef } from 'react'
import { richTextPlainText, richTextPrefix } from '../features/notes/richText'

type InlineFormat = 'strong' | 'em' | 's'
type ListFormat = 'ul' | 'ol'

const allowedTags = new Set(['strong', 'b', 'em', 'i', 's', 'strike', 'del', 'ul', 'ol', 'li', 'p', 'div', 'br'])

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeRichHtml(html: string) {
  const documentFragment = new DOMParser().parseFromString(html, 'text/html')
  const cleanNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml((node.textContent ?? '').replace(/\u200b/g, ''))
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const element = node as HTMLElement
    const tag = element.tagName.toLowerCase()
    const children = [...element.childNodes].map(cleanNode).join('')
    if (!allowedTags.has(tag)) return children
    if (tag === 'br') return '<br>'
    const canonicalTag = tag === 'b' ? 'strong' : tag === 'i' ? 'em' : tag === 'strike' || tag === 'del' ? 's' : tag
    return `<${canonicalTag}>${children}</${canonicalTag}>`
  }

  return [...documentFragment.body.childNodes].map(cleanNode).join('')
}

function editorHtml(value: string) {
  if (value.startsWith(richTextPrefix)) return sanitizeRichHtml(value.slice(richTextPrefix.length))
  return escapeHtml(value).replace(/\r?\n/g, '<br>')
}

function storedValue(html: string) {
  const cleanHtml = sanitizeRichHtml(html)
  return richTextPlainText(`${richTextPrefix}${cleanHtml}`).trim() ? `${richTextPrefix}${cleanHtml}` : ''
}

function editorRange(editor: HTMLDivElement) {
  const selection = window.getSelection()
  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0)
    if (editor.contains(range.commonAncestorContainer)) return { selection, range }
  }

  editor.focus()
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  const nextSelection = window.getSelection()
  nextSelection?.removeAllRanges()
  nextSelection?.addRange(range)
  return nextSelection ? { selection: nextSelection, range } : undefined
}

function selectContents(selection: Selection, node: Node, collapse = false) {
  const range = document.createRange()
  range.selectNodeContents(node)
  if (collapse) range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function closestFormatAncestor(node: Node, editor: HTMLDivElement, tag: InlineFormat) {
  let current: Element | null = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
  while (current && current !== editor) {
    if (current.tagName.toLowerCase() === tag) return current
    current = current.parentElement
  }
  return undefined
}

function unwrapSelectedFormat(range: Range, selection: Selection, wrapper: Element) {
  const documentRange = document.createRange()
  documentRange.selectNodeContents(wrapper)

  const beforeRange = documentRange.cloneRange()
  beforeRange.setEnd(range.startContainer, range.startOffset)
  const afterRange = documentRange.cloneRange()
  afterRange.setStart(range.endContainer, range.endOffset)
  const before = beforeRange.cloneContents()
  const selected = range.cloneContents()
  const after = afterRange.cloneContents()
  const replacement = document.createDocumentFragment()
  const wrap = (content: DocumentFragment) => {
    if (!content.childNodes.length) return
    const retainedFormat = wrapper.cloneNode(false) as Element
    retainedFormat.append(content)
    replacement.append(retainedFormat)
  }

  wrap(before)
  if (range.collapsed) {
    const marker = document.createTextNode('\u200b')
    replacement.append(marker)
    wrap(after)
    wrapper.replaceWith(replacement)
    const caret = document.createRange()
    caret.setStart(marker, 0)
    caret.collapse(true)
    selection.removeAllRanges()
    selection.addRange(caret)
    return
  }

  const selectedNodes = [...selected.childNodes]
  replacement.append(selected)
  wrap(after)
  wrapper.replaceWith(replacement)
  if (!selectedNodes.length) return
  const nextRange = document.createRange()
  nextRange.setStartBefore(selectedNodes[0])
  nextRange.setEndAfter(selectedNodes.at(-1)!)
  selection.removeAllRanges()
  selection.addRange(nextRange)
}

function toggleInlineFormat(editor: HTMLDivElement, tag: InlineFormat) {
  const activeRange = editorRange(editor)
  if (!activeRange) return
  const { range, selection } = activeRange
  const startFormat = closestFormatAncestor(range.startContainer, editor, tag)
  const endFormat = closestFormatAncestor(range.endContainer, editor, tag)
  if (startFormat && startFormat === endFormat) {
    unwrapSelectedFormat(range, selection, startFormat)
    return
  }

  const wrapper = document.createElement(tag)

  if (range.collapsed) {
    const marker = document.createTextNode('\u200b')
    wrapper.append(marker)
    range.insertNode(wrapper)
    const caret = document.createRange()
    caret.setStart(marker, marker.length)
    caret.collapse(true)
    selection.removeAllRanges()
    selection.addRange(caret)
    return
  }

  wrapper.append(range.extractContents())
  range.insertNode(wrapper)
  selectContents(selection, wrapper)
}

function makeList(editor: HTMLDivElement, tag: ListFormat) {
  const activeRange = editorRange(editor)
  if (!activeRange) return
  const { range, selection } = activeRange
  const list = document.createElement(tag)
  const lines = range.collapsed ? ['\u200b'] : range.toString().split(/\r?\n/).filter((line) => line.length > 0)

  for (const line of lines.length ? lines : ['\u200b']) {
    const item = document.createElement('li')
    item.textContent = line
    list.append(item)
  }
  range.deleteContents()
  range.insertNode(list)

  if (range.collapsed) {
    const marker = list.firstChild?.firstChild
    if (marker) {
      const caret = document.createRange()
      caret.setStart(marker, marker.textContent?.length ?? 0)
      caret.collapse(true)
      selection.removeAllRanges()
      selection.addRange(caret)
    }
    return
  }
  selectContents(selection, list)
}

function insertPlainText(editor: HTMLDivElement, value: string) {
  const activeRange = editorRange(editor)
  if (!activeRange) return
  const { range, selection } = activeRange
  const fragment = document.createDocumentFragment()
  const lines = value.replace(/\r\n/g, '\n').split('\n')
  lines.forEach((line, index) => {
    if (index) fragment.append(document.createElement('br'))
    fragment.append(document.createTextNode(line))
  })
  const inserted = [...fragment.childNodes]
  range.deleteContents()
  range.insertNode(fragment)
  const lastNode = inserted.at(-1)
  if (lastNode) {
    const caret = document.createRange()
    caret.setStartAfter(lastNode)
    caret.collapse(true)
    selection.removeAllRanges()
    selection.addRange(caret)
  }
}

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel: string
  className?: string
  autoFocus?: boolean
}

export function RichTextEditor({ value, onChange, placeholder, ariaLabel, className, autoFocus }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastValueRef = useRef<string | undefined>(undefined)

  useLayoutEffect(() => {
    if (!editorRef.current || lastValueRef.current === value) return
    editorRef.current.innerHTML = editorHtml(value)
    lastValueRef.current = value
  }, [value])

  const publish = useCallback(() => {
    if (!editorRef.current) return
    const next = storedValue(editorRef.current.innerHTML)
    lastValueRef.current = next
    onChange(next)
  }, [onChange])

  const formatInline = useCallback((tag: InlineFormat) => {
    if (!editorRef.current) return
    toggleInlineFormat(editorRef.current, tag)
    publish()
  }, [publish])

  const formatList = useCallback((tag: ListFormat) => {
    if (!editorRef.current) return
    makeList(editorRef.current, tag)
    publish()
  }, [publish])

  const pastePlainText = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!editorRef.current) return
    insertPlainText(editorRef.current, event.clipboardData.getData('text/plain'))
    publish()
  }

  const toolbar = [
    { label: 'Bold (Command-B)', icon: Bold, apply: () => formatInline('strong') },
    { label: 'Italic (Command-I)', icon: Italic, apply: () => formatInline('em') },
    { label: 'Strikethrough (Command-Shift-X)', icon: Strikethrough, apply: () => formatInline('s') },
    { label: 'Bulleted list (Command-Shift-8)', icon: List, apply: () => formatList('ul') },
    { label: 'Numbered list (Command-Shift-7)', icon: ListOrdered, apply: () => formatList('ol') },
  ]

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return
    if (event.key.toLowerCase() === 'b') {
      event.preventDefault()
      formatInline('strong')
    } else if (event.key.toLowerCase() === 'i') {
      event.preventDefault()
      formatInline('em')
    } else if (event.shiftKey && event.key.toLowerCase() === 'x') {
      event.preventDefault()
      formatInline('s')
    } else if (event.shiftKey && event.code === 'Digit8') {
      event.preventDefault()
      formatList('ul')
    } else if (event.shiftKey && event.code === 'Digit7') {
      event.preventDefault()
      formatList('ol')
    }
  }

  return (
    <div className={`rich-text-editor${className ? ` ${className}` : ''}`}>
      <div className="rich-text-toolbar" role="toolbar" aria-label="Text formatting">
        {toolbar.map(({ label, icon: Icon, apply }) => (
          <button
            key={label}
            type="button"
            className="rich-text-format-button"
            title={label}
            aria-label={label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={apply}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        className="rich-text-surface"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        data-placeholder={placeholder}
        autoFocus={autoFocus}
        onInput={publish}
        onPaste={pastePlainText}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}
