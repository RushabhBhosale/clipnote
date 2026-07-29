import { Braces, Code2, File, FileText, Hash, Image, KeyRound, Link2, Mail, Phone, Terminal } from 'lucide-react'
import type { ContentType } from '../types/clip'

export function ContentTypeIcon({ type, size = 17 }: { type: ContentType; size?: number }) {
  const props = { size, strokeWidth: 1.9 }
  if (type === 'link') return <Link2 {...props} />
  if (type === 'code') return <Code2 {...props} />
  if (type === 'json') return <Braces {...props} />
  if (type === 'command') return <Terminal {...props} />
  if (type === 'image') return <Image {...props} />
  if (type === 'email') return <Mail {...props} />
  if (type === 'phone') return <Phone {...props} />
  if (type === 'otp') return <Hash {...props} />
  if (type === 'password') return <KeyRound {...props} />
  if (type === 'file') return <File {...props} />
  return <FileText {...props} />
}
