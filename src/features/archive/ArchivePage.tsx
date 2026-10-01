import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useRepos } from '../../app/RepoContext'
import { monthRange, shiftMonth, type YearMonth } from '../../domain/calendar'
import { parseDateKey } from '../../domain/date'
import { excerpt, searchEntries } from '../../domain/filter'
import { MOOD_EMOJI, type DateKey, type DayEntry } from '../../domain/types'
import { MonthCalendar } from './MonthCalendar'

export function ArchivePage() {
  const { t, i18n } = useTranslation()
  const { diary } = useRepos()
  const [ym, setYm] = useState<YearMonth>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const [monthEntries, setMonthEntries] = useState<Map<DateKey, DayEntry>>(new Map())
  const [all, setAll] = useState<DayEntry[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    void diary.list(monthRange(ym)).then((list) => {
      if (!cancelled) setMonthEntries(new Map(list.map((e) => [e.date, e])))
    })
    return () => {
      cancelled = true
    }
  }, [diary, ym])

  // Seluruh entri baru dimuat saat user mulai mencari.
  useEffect(() => {
    if (query.trim() && all === null) void diary.list().then(setAll)
  }, [diary, query, all])

  const results = useMemo(() => (all ? searchEntries(all, query) : []), [all, query])
  const title = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(
    new Date(ym.year, ym.month - 1, 1),
  )
  const dayFormat = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const searching = query.trim() !== ''

  return (
    <section>
      <input
        type="search"
        aria-label={t('archive.searchLabel')}
        placeholder={t('archive.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', marginBottom: 16 }}
      />
      {searching ? (
        <>
          <p>{results.length ? t('archive.results', { count: results.length }) : t('archive.noResults')}</p>
          <ul className="results" aria-label={t('archive.searchLabel')}>
            {results.map((e) => (
              <li key={e.date}>
                <Link to={`/day/${e.date}`}>
                  <strong>
                    {e.mood ? `${MOOD_EMOJI[e.mood]} ` : ''}
                    {dayFormat.format(parseDateKey(e.date))}
                  </strong>
                  <br />
                  <span>{excerpt(e.markdown)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="month-nav">
            <button type="button" aria-label={t('archive.prevMonth')} onClick={() => setYm((v) => shiftMonth(v, -1))}>
              ‹
            </button>
            <h1>{title}</h1>
            <button type="button" aria-label={t('archive.nextMonth')} onClick={() => setYm((v) => shiftMonth(v, 1))}>
              ›
            </button>
          </div>
          <MonthCalendar ym={ym} entries={monthEntries} />
        </>
      )}
    </section>
  )
}
