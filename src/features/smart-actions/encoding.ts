const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function decodeBase64Bytes(input: string) {
  const normalized = input.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!normalized || normalized.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(normalized) || !/={0,2}$/.test(normalized)) {
    throw new Error('Invalid Base64 value')
  }
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const bytes: number[] = []
  for (let index = 0; index < padded.length; index += 4) {
    const values = [...padded.slice(index, index + 4)].map((character) => character === '=' ? 0 : alphabet.indexOf(character))
    if (values.some((value) => value < 0)) throw new Error('Invalid Base64 value')
    const block = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3]
    bytes.push((block >> 16) & 0xff)
    if (padded[index + 2] !== '=') bytes.push((block >> 8) & 0xff)
    if (padded[index + 3] !== '=') bytes.push(block & 0xff)
  }
  return new Uint8Array(bytes)
}

export function decodeBase64Text(input: string) {
  return new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64Bytes(input))
}

export function decodeBase64UrlJson(input: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(decodeBase64Text(input))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object')
  return parsed as Record<string, unknown>
}

export function encodeBase64Text(input: string) {
  const bytes = new TextEncoder().encode(input)
  let result = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    const block = (first << 16) | ((second ?? 0) << 8) | (third ?? 0)
    result += alphabet[(block >> 18) & 63]
    result += alphabet[(block >> 12) & 63]
    result += second === undefined ? '=' : alphabet[(block >> 6) & 63]
    result += third === undefined ? '=' : alphabet[block & 63]
  }
  return result
}
