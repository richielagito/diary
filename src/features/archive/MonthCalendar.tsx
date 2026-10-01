import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { buildMonthGrid, type YearMonth } from '../../domain/calendar'
import { parseDateKey } from '../../domain/date'
import type { DateKey, DayEntry } from '../../domain/types'

const MONDAY = new Date(2024, 0, 1) // Senin

export function MonthCalendar({ ym, entries }: { ym: YearMonth; entries: Map<DateKey, DayEntry> }) {
  const { t, i18n } = useTranslation()
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' })
  const full = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="calendar" role="grid">
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
                <Link to={`/day/${date}`} aria-label={label}>
                  {day.getDate()}
                  <span
                    className="dot"
                    style={{
                      background: entry ? `var(--mood-${entry.mood ?? 'none'})` : 'transparent',
                    }}
                  />
                </Link>
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}
