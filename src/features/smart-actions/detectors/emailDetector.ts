import type { ClipboardDetector } from '../types'
import { makeAction } from '../types'

const emailPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@([A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+)$/i

export const emailDetector: ClipboardDetector = {
  id: 'email', priority: 80,
  canDetect: (content) => emailPattern.test(content.trim()),
  detect(content) {
    const email = content.trim()
    const match = email.match(emailPattern)
    if (!match) return undefined
    const domain = match[1].toLocaleLowerCase()
    return {
      type: 'email', confidence: 0.99, badge: 'EMAIL', preview: domain,
      metadata: { email, domain },
      availableActions: [makeAction('copy-original', 'Copy', 'copy'), makeAction('email-compose', 'Compose', 'mail', 'external'), makeAction('email-copy-domain', 'Domain', 'globe')],
      searchText: `email mail ${email} ${domain}`,
    }
  },
}
