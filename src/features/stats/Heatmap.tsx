import type { TFunction } from 'i18next'
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { dateKey, parseDateKey } from '../../domain/date'
import { MOOD_EMOJI } from '../../domain/types'
import type { HeatCell } from '../../stats/computeStats'
import { LEVEL_OPACITY } from '../../stats/wordLevels'
import { MoodLegend } from './MoodLegend'

/** Label sel (dipakai untuk title dan aria-label). */
export function heatCellLabel(cell: HeatCell, t: TFunction, language: string): string {
  const date = new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    parseDateKey(cell.date),
  )
  if (cell.future) return `${date}: ${t('stats.cellFuture')}`
  if (!cell.entry) return `${date}: ${t('stats.cellNoEntry')}`
  const words = t('stats.cellWords', { count: cell.entry.words, words: new Intl.NumberFormat(language).format(cell.entry.words) })
  const mood = cell.entry.mood === null ? t('stats.noMood').toLowerCase() : `${MOOD_EMOJI[cell.entry.mood]} ${t(`mood.${cell.entry.mood}`)}`
  return `${date}: ${mood}, ${words}`
}

function cellStyle(cell: HeatCell): CSSProperties | undefined {
  if (!cell.entry) return undefined
  const opacity = LEVEL_OPACITY[cell.entry.level]
  // Tanpa mood: cincin, bukan isian, supaya tidak terbaca sebagai mood 3.
  return cell.entry.mood === null ? { opacity } : { background: `var(--mood-${cell.entry.mood})`, borderColor: 'transparent', opacity }
}

function cellClass(cell: HeatCell): string {
  return cell.entry && cell.entry.mood === null ? 'heat-cell heat-nomood' : 'heat-cell'
}

interface HeatmapProps {
  cells: HeatCell[]
  weeks: number
  mode: 'month' | 'year'
  compact?: boolean
  /** Periode berjalan (stats.range.isCurrent): mode tahun di-scroll ke minggu ini. */
  scrollToToday?: boolean
}

export function Heatmap({ cells, weeks, mode, compact = false, scrollToToday = false }: HeatmapProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const scroller = useRef<HTMLDivElement>(null)
  /** Tepi yang masih menyimpan sel di luar layar; tepi itu dipudarkan supaya terlihat bisa digeser. */
  const [edges, setEdges] = useState({ start: false, end: false })
  const updateEdges = () => {
    const el = scroller.current
    if (!el) return
    const start = el.scrollLeft > 1
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }))
  }

  const today = dateKey()
  // Sel terakhir yang sudah lewat = hari ini di periode berjalan
  const current = mode === 'year' && scrollToToday ? (cells.filter((c) => c.inRange && !c.future).at(-1)?.date ?? null) : null
  useEffect(() => {
    const el = scroller.current
    const cell = current ? el?.querySelector<HTMLElement>('[data-current]') : null
    // Kolom hari ini berhenti satu sel dari tepi kanan, bukan di akhir tahun yang masih kosong
    if (el && cell) el.scrollLeft = Math.max(0, cell.offsetLeft + 2 * cell.offsetWidth - el.clientWidth)
    updateEdges()
  }, [current])

  // One tab stop for the whole map, like the Archive calendar: today, else the last day that has passed.
  const past = cells.filter((c) => c.inRange && !c.future)
  const focusDate = past.some((c) => c.date === today) ? today : past.at(-1)?.date
  // Cells run day by day (down the columns in a year, along the rows in a month), so a day is ±1 and a week ±7.
  const steps: Record<string, number> =
    mode === 'year' ? { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 } : { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = steps[e.key]
    if (!step) return
    const all = [...e.currentTarget.children] as HTMLElement[]
    const at = all.indexOf(document.activeElement as HTMLElement)
    const target = all[at + step]
    if (at < 0 || target?.tagName !== 'A') return
    e.preventDefault()
    target.focus()
  }

  const renderCell = (cell: HeatCell) => {
    if (!cell.inRange) return <span key={cell.date} className="heat-cell heat-pad" aria-hidden="true" />
    const label = heatCellLabel(cell, t, language)
    const mark = cell.date === current ? '' : undefined
    if (cell.future) return <span key={cell.date} className="heat-cell heat-future" role="img" aria-label={label} title={label} />
    if (compact) return <span key={cell.date} className={cellClass(cell)} role="img" aria-label={label} style={cellStyle(cell)} data-current={mark} />
    return (
      <Link
        key={cell.date}
        to={`/day/${cell.date}`}
        className={cellClass(cell)}
        aria-label={label}
        title={label}
        style={cellStyle(cell)}
        data-current={mark}
        data-today={cell.date === today ? '' : undefined}
        tabIndex={cell.date === focusDate ? 0 : -1}
      />
    )
  }

  const monthName = new Intl.DateTimeFormat(language, { month: 'short' })
  const weekday = new Intl.DateTimeFormat(language, { weekday: 'short' })

  return (
    <div
      className={`heatmap heatmap-${mode}${compact ? ' heatmap-compact' : ''}`}
      role="group"
      aria-label={t('stats.heatmapLabel')}
      style={{ '--weeks': weeks } as CSSProperties}
    >
      {mode === 'year' ? (
        <div
          className="heat-scroll"
          ref={scroller}
          onScroll={updateEdges}
          data-fade-start={edges.start || undefined}
          data-fade-end={edges.end || undefined}
        >
          <div className="heat-inner">
            {!compact && (
              <div className="heat-months" aria-hidden="true">
                {cells.map((c, i) =>
                  c.inRange && c.date.endsWith('-01') ? (
                    <span key={c.date} className="heat-month" style={{ gridColumn: Math.floor(i / 7) + 1 }}>
                      {monthName.format(parseDateKey(c.date))}
                    </span>
                  ) : null,
                )}
              </div>
            )}
            {/* Ringkas (Wrapped): kolom mengisi lebar slide, tanpa scroll */}
            <div className="heat-grid" onKeyDown={onKeyDown}>
              {cells.map(renderCell)}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="heat-weekdays" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <span key={d}>{weekday.format(new Date(2024, 0, 1 + d))}</span>
            ))}
          </div>
          <div className="heat-grid" onKeyDown={onKeyDown}>
            {cells.map(renderCell)}
          </div>
        </>
      )}
      {!compact && <MoodLegend note={t('stats.legendWords')} />}
    </div>
  )
}
