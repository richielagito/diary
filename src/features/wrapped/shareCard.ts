import { MOOD_EMOJI, type Mood } from '../../domain/types'
import type { HeatCell } from '../../stats/computeStats'
import { LEVEL_OPACITY } from '../../stats/wordLevels'

export interface SharePalette {
  bg: string
  surface: string
  text: string
  muted: string
  border: string
  mood: Record<Mood | 'none', string>
}
export interface ShareCardData {
  periodLabel: string
  subtitle: string // mis. '(sejauh ini)' atau ''
  stats: { label: string; value: string }[] // 3 item, sudah diformat
  distribution: Record<Mood, number>
  heatmap: HeatCell[]
  weeks: number
  mode: 'month' | 'year'
  topTags: string[] // maks 3, tanpa '#'
  appName: string
}
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'globalAlpha'
  | 'lineWidth'
  | 'fillRect'
  | 'strokeRect'
  | 'fillText'
  | 'beginPath'
  | 'roundRect'
  | 'rect'
  | 'fill'
  | 'stroke'
>

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1920
const MARGIN = 80
const CONTENT_WIDTH = CARD_WIDTH - MARGIN * 2
const FONT = 'system-ui, sans-serif'
/** Huruf tulisan aplikasi (dimuat dulu di renderShareCard); judul dan angka memakainya. */
const FONT_TEXT = 'Literata, Georgia, serif'
const MOODS: Mood[] = [5, 4, 3, 2, 1]

/** maxWidth: teks dipersempit supaya tidak keluar dari kartu. */
function text(ctx: Ctx2D, s: string, x: number, y: number, size: number, color: string, bold = false, maxWidth?: number, family = FONT) {
  ctx.font = `${bold ? '600 ' : ''}${size}px ${family}`
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  if (maxWidth === undefined) ctx.fillText(s, x, y)
  else ctx.fillText(s, x, y, maxWidth)
}

/** Path persegi bersudut bulat; browser lama tanpa roundRect mendapat persegi biasa. */
function roundedRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, radius: number) {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, radius)
  else ctx.rect(x, y, w, h)
}

/** Menggambar heatmap dan mengembalikan jumlah sel dalam periode yang digambar. */
export function drawHeatmap(ctx: Ctx2D, data: ShareCardData, palette: SharePalette, x: number, y: number, width: number): number {
  const year = data.mode === 'year'
  const columns = year ? data.weeks : 7
  const gap = year ? 3 : 8
  const size = Math.min((width - gap * (columns - 1)) / columns, year ? 24 : 72)
  let drawn = 0
  data.heatmap.forEach((cell, i) => {
    if (!cell.inRange) return
    const week = Math.floor(i / 7)
    const day = i % 7
    const cx = x + (year ? week : day) * (size + gap)
    const cy = y + (year ? day : week) * (size + gap)
    roundedRect(ctx, cx, cy, size, size, size / 5)
    if (cell.entry && cell.entry.mood !== null) {
      ctx.globalAlpha = LEVEL_OPACITY[cell.entry.level]
      ctx.fillStyle = palette.mood[cell.entry.mood]
      ctx.fill()
      ctx.globalAlpha = 1
    } else if (cell.entry) {
      // Tanpa mood: cincin, seperti di aplikasi.
      ctx.globalAlpha = LEVEL_OPACITY[cell.entry.level]
      ctx.strokeStyle = palette.mood.none
      ctx.lineWidth = year ? 2 : 4
      ctx.stroke()
      ctx.globalAlpha = 1
    } else {
      ctx.strokeStyle = palette.border
      ctx.lineWidth = 2
      ctx.stroke()
    }
    drawn++
  })
  return drawn
}

export function drawShareCard(ctx: Ctx2D, data: ShareCardData, palette: SharePalette): void {
  ctx.globalAlpha = 1
  ctx.fillStyle = palette.bg
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  text(ctx, data.appName, MARGIN, 120, 36, palette.muted)
  text(ctx, data.periodLabel, MARGIN, 250, 88, palette.text, false, undefined, FONT_TEXT)
  if (data.subtitle) text(ctx, data.subtitle, MARGIN, 310, 40, palette.muted)

  data.stats.forEach((s, i) => {
    const y = 470 + i * 140
    text(ctx, s.value, MARGIN, y, 96, palette.text, false, undefined, FONT_TEXT)
    text(ctx, s.label, MARGIN, y + 44, 36, palette.muted)
  })

  const max = Math.max(1, ...MOODS.map((m) => data.distribution[m]))
  const barX = MARGIN + 80
  const barMax = CONTENT_WIDTH - 80 - 120
  MOODS.forEach((m, i) => {
    const y = 930 + i * 62
    text(ctx, MOOD_EMOJI[m], MARGIN, y + 36, 40, palette.text)
    const count = data.distribution[m]
    if (count > 0) {
      roundedRect(ctx, barX, y, Math.max(12, (barMax * count) / max), 44, 12)
      ctx.fillStyle = palette.mood[m]
      ctx.fill()
    }
    text(ctx, String(count), barX + barMax + 24, y + 36, 36, palette.muted)
  })

  drawHeatmap(ctx, data, palette, MARGIN, 1290, CONTENT_WIDTH)

  if (data.topTags.length > 0) {
    text(ctx, data.topTags.map((t) => `#${t}`).join('  '), MARGIN, 1840, 44, palette.text, false, CONTENT_WIDTH)
  }
}

export function readPalette(el: Element = document.documentElement): SharePalette {
  const style = getComputedStyle(el)
  const v = (name: string) => style.getPropertyValue(name).trim()
  return {
    bg: v('--bg'),
    surface: v('--surface'),
    text: v('--text'),
    muted: v('--muted'),
    border: v('--border'),
    mood: { 1: v('--mood-1'), 2: v('--mood-2'), 3: v('--mood-3'), 4: v('--mood-4'), 5: v('--mood-5'), none: v('--mood-none') },
  }
}

export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  // Canvas tidak menunggu webfont: tanpa ini judul bisa tergambar dengan huruf cadangan.
  await document.fonts?.load(`88px ${FONT_TEXT}`).catch(() => undefined)
  drawShareCard(ctx, data, readPalette())
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png')
  })
}
