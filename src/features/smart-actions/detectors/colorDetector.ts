import type { ClipboardDetector } from '../types'
import { makeAction } from '../types'

interface RgbaColor { r: number; g: number; b: number; a: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const byte = (value: string) => clamp(Math.round(Number(value)), 0, 255)
const alpha = (value?: string) => value === undefined ? 1 : clamp(Number(value), 0, 1)

function hslToRgb(hue: number, saturation: number, lightness: number): RgbaColor {
  const h = ((hue % 360) + 360) % 360 / 360
  const s = clamp(saturation, 0, 100) / 100
  const l = clamp(lightness, 0, 100) / 100
  if (s === 0) return { r: Math.round(l * 255), g: Math.round(l * 255), b: Math.round(l * 255), a: 1 }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (offset: number) => {
    let t = h + offset
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return { r: Math.round(channel(1 / 3) * 255), g: Math.round(channel(0) * 255), b: Math.round(channel(-1 / 3) * 255), a: 1 }
}

export function parseColor(value: string): RgbaColor | undefined {
  const input = value.trim().toLocaleLowerCase()
  const hex = input.match(/^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i)?.[1]
  if (hex) {
    const expanded = hex.length <= 4 ? [...hex].map((part) => part + part).join('') : hex
    return { r: parseInt(expanded.slice(0, 2), 16), g: parseInt(expanded.slice(2, 4), 16), b: parseInt(expanded.slice(4, 6), 16), a: expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1 }
  }
  const rgb = input.match(/^(rgba?)\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/)
  if (rgb && (rgb[1] === 'rgba') === Boolean(rgb[5]) && [rgb[2], rgb[3], rgb[4]].every((part) => Number(part) <= 255)) return { r: byte(rgb[2]), g: byte(rgb[3]), b: byte(rgb[4]), a: alpha(rgb[5]) }
  const hsl = input.match(/^(hsla?)\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/)
  if (hsl && (hsl[1] === 'hsla') === Boolean(hsl[5]) && Number(hsl[3]) <= 100 && Number(hsl[4]) <= 100) return { ...hslToRgb(Number(hsl[2]), Number(hsl[3]), Number(hsl[4])), a: alpha(hsl[5]) }
  return undefined
}

function rgbToHsl({ r, g, b }: RgbaColor) {
  const red = r / 255; const green = g / 255; const blue = b / 255
  const max = Math.max(red, green, blue); const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(lightness * 100) }
  const delta = max - min
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  const hue = max === red ? (green - blue) / delta + (green < blue ? 6 : 0) : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4
  return { h: Math.round(hue * 60), s: Math.round(saturation * 100), l: Math.round(lightness * 100) }
}

export function colorFormats(color: RgbaColor) {
  const toHex = (value: number) => value.toString(16).padStart(2, '0').toUpperCase()
  const alphaByte = Math.round(color.a * 255)
  const hex = `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}${color.a < 1 ? toHex(alphaByte) : ''}`
  const rgb = color.a < 1 ? `rgba(${color.r}, ${color.g}, ${color.b}, ${Number(color.a.toFixed(3))})` : `rgb(${color.r}, ${color.g}, ${color.b})`
  const hslValue = rgbToHsl(color)
  const hsl = color.a < 1 ? `hsla(${hslValue.h}, ${hslValue.s}%, ${hslValue.l}%, ${Number(color.a.toFixed(3))})` : `hsl(${hslValue.h}, ${hslValue.s}%, ${hslValue.l}%)`
  return { hex, rgb, hsl }
}

export const colorDetector: ClipboardDetector = {
  id: 'color', priority: 60,
  canDetect: (content) => Boolean(parseColor(content)),
  detect(content) {
    const color = parseColor(content)
    if (!color) return undefined
    const formats = colorFormats(color)
    return {
      type: 'color', confidence: 0.98, badge: 'COLOR', preview: formats.hex,
      metadata: { ...formats, swatch: formats.hex, alpha: color.a },
      availableActions: [makeAction('color-copy-hex', 'HEX', 'hash'), makeAction('color-copy-rgb', 'RGB', 'palette'), makeAction('color-copy-hsl', 'HSL', 'sliders')],
      searchText: `color colour ${formats.hex} ${formats.rgb} ${formats.hsl}`,
    }
  },
}
