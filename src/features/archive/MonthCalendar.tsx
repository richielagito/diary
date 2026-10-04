import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { buildMonthGrid, type YearMonth } from '../../domain/calendar'
import { dateKey, parseDateKey } from '../../domain/date'
import type { DateKey, DayEntry } from '../../domain/types'

const MONDAY = new Date(2024, 0, 1) // Senin

export function MonthCalendar({ ym, entries }: { ym: YearMonth; entries: Map<DateKey, DayEntry> }) {
  const { t, i18n } = useTranslation()
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' })
  const today = dateKey()
  const full = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })

  // A grid moves by arrows: left and right by a day, up and down by a week (only between days that can be opened).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (!step) return
    const days = [...e.currentTarget.querySelectorAll<HTMLElement>('a, .future, .empty')]
    const at = days.indexOf(document.activeElement as HTMLElement)
    const target = days[at + step]
    if (at < 0 || target?.tagName !== 'A') return
    e.preventDefault()
    target.focus()
  }

  return (
    <div className="calendar" role="grid" onKeyDown={onKeyDown}>
      <div role="row" style={{ display: 'contents' }}>
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} role="columnheader" className="weekday">
            {weekday.format(new Date(2024, 0, MONDAY.getDate() + i))}
          </span>
        ))}
      </div>
      {buildMonthGrid(ym).map((week, w) => (
        <div key={w} role="row" style={{ display: 'contents' }}>
          {week.map((date, i) => {
            if (!date) return <span key={i} role="gridcell" className="empty" />
            const entry = entries.get(date)
            const day = parseDateKey(date)
            let label = full.format(day)
            if (entry) label += `, ${entry.mood ? t(`mood.${entry.mood}`) : t('archive.noMood')}`
            return (
              <span key={date} role="gridcell" style={{ display: 'contents' }}>
                {date > today ? (
                  // Days that have not happened yet are shown, not opened.
                  <span className="future" role="img" aria-label={label}>
                    {day.getDate()}
                  </span>
                ) : (
                  <Link to={date === today ? '/' : `/day/${date}`} aria-label={label} aria-current={date === today ? 'date' : undefined}>
                    {day.getDate()}
                    <span
                      className={entry && entry.mood === null ? 'dot dot-none' : 'dot'}
                      style={entry?.mood ? { background: `var(--mood-${entry.mood})` } : undefined}
                    />
                  </Link>
                )}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}
