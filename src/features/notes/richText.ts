export const richTextPrefix = 'clipnote:rich:v1:'

export function isRichText(value: string) {
  return value.startsWith(richTextPrefix)
}

function decodeCodePoint(match: string, code: string, radix: number) {
  const point = Number.parseInt(code, radix)
  return Number.isNaN(point) || point < 0 || point > 0x10ffff ? match : String.fromCodePoint(point)
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (match, code: string) => decodeCodePoint(match, code, 16))
    .replace(/&#(\d+);/g, (match, code: string) => decodeCodePoint(match, code, 10))
}

/** Returns readable note text while leaving older plain-text notes untouched. */
export function richTextPlainText(value: string) {
  if (!isRichText(value)) return value
  const html = value.slice(richTextPrefix.length)
  return decodeHtml(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
