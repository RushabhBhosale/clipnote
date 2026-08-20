import type { ClipboardDetector } from '../types'
import { makeAction } from '../types'

const minimumTimestamp = Date.UTC(2000, 0, 1)
const maximumTimestamp = Date.UTC(2100, 0, 1)

export function parseClipboardDate(content: string) {
  const value = content.trim()
  let kind: 'Unix seconds' | 'Unix milliseconds' | 'ISO 8601' | undefined
  let milliseconds: number | undefined
  if (/^\d{10}$/.test(value)) {
    kind = 'Unix seconds'; milliseconds = Number(value) * 1_000
  } else if (/^\d{13}$/.test(value)) {
    kind = 'Unix milliseconds'; milliseconds = Number(value)
  } else {
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/i)
    if (isoMatch) {
      const [, year, month, day, hour, minute, second = '0'] = isoMatch
      const calendarProbe = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)))
      const isRealCalendarValue = calendarProbe.getUTCFullYear() === Number(year)
        && calendarProbe.getUTCMonth() === Number(month) - 1
        && calendarProbe.getUTCDate() === Number(day)
        && calendarProbe.getUTCHours() === Number(hour)
        && calendarProbe.getUTCMinutes() === Number(minute)
        && calendarProbe.getUTCSeconds() === Number(second)
      if (isRealCalendarValue) {
        kind = 'ISO 8601'
        milliseconds = Date.parse(value)
      }
    }
  }
  if (!kind || milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < minimumTimestamp || milliseconds >= maximumTimestamp) return undefined
  return { kind, date: new Date(milliseconds) }
}

export const dateDetector: ClipboardDetector = {
  id: 'date', priority: 40,
  canDetect: (content) => Boolean(parseClipboardDate(content)),
  detect(content) {
    const parsed = parseClipboardDate(content)
    if (!parsed) return undefined
    const unixMilliseconds = parsed.date.getTime()
    const unixSeconds = Math.floor(unixMilliseconds / 1_000)
    const iso = parsed.date.toISOString()
    const local = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'long' }).format(parsed.date)
    const utc = parsed.date.toUTCString()
    return {
      type: 'date', confidence: parsed.kind === 'ISO 8601' ? 0.98 : 0.94, badge: 'DATE', preview: local,
      metadata: { sourceType: parsed.kind, local, utc, iso, unixSeconds, unixMilliseconds },
      availableActions: [makeAction('date-copy-local', 'Local', 'clock'), makeAction('date-copy-iso', 'ISO', 'calendar'), makeAction('date-copy-unix', 'Unix', 'binary'), makeAction('date-copy-utc', 'UTC', 'globe')],
      searchText: `date timestamp time ${parsed.kind} ${local} ${utc} ${iso} ${unixSeconds} ${unixMilliseconds}`,
    }
  },
}
