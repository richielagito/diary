import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { useRepos } from '../../app/RepoContext'
import { monthRange, shiftMonth, type YearMonth } from '../../domain/calendar'
import { parseDateKey } from '../../domain/date'
import { excerptAround, searchEntries } from '../../domain/filter'
import { MOOD_EMOJI, type DateKey, type DayEntry } from '../../domain/types'
import { ChevronLeft, ChevronRight } from '../../app/icons'
import { MonthCalendar } from './MonthCalendar'
import { MonthEntries } from './MonthEntries'

export function ArchivePage() {
  const { t, i18n } = useTranslation()
  const { diary } = useRepos()
  const [monthEntries, setMonthEntries] = useState<Map<DateKey, DayEntry>>(new Map())
  const [all, setAll] = useState<DayEntry[] | null>(null)
  // The query lives in the URL: Back from a result returns to the same search, and Stats links here with ?q=#tag.
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const setQuery = (q: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (q) n.set('q', q)
        else n.delete('q')
        return n
      },
      { replace: true },
    )
  // The month lives in the URL too (?m=2026-08), so Back from a day returns to the month it was opened from.
  const monthParam = params.get('m')
  const ym = useMemo<YearMonth>(() => {
    const now = new Date()
    const m = monthParam?.match(/^(\d{4})-(\d{2})$/)
    const asked = m ? { year: Number(m[1]), month: Number(m[2]) } : null
    const current = { year: now.getFullYear(), month: now.getMonth() + 1 }
    const valid = asked && asked.month >= 1 && asked.month <= 12 && asked.year * 12 + asked.month <= current.year * 12 + current.month
    return valid ? asked : current
  }, [monthParam])
  const setYm = (f: (v: YearMonth) => YearMonth) => {
    const next = f(ym)
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        n.set('m', `${next.year}-${String(next.month).padStart(2, '0')}`)
        return n
      },
      { replace: true },
    )
  }

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
  const monthFormat = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' })
  const dayFormat = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const searching = query.trim() !== ''
  const now = new Date()
  const atCurrentMonth = ym.year === now.getFullYear() && ym.month === now.getMonth() + 1

  return (
    <section>
      <input
        type="search"
        aria-label={t('archive.searchLabel')}
        placeholder={t('archive.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="archive-search"
      />
      {searching ? (
        <>
          <h1 className="visually-hidden">{t('nav.archive')}</h1>
          <p className="results-count">{results.length ? t('archive.results', { count: results.length }) : t('archive.noResults')}</p>
          <ul className="results" aria-label={t('archive.searchLabel')}>
            {results.map((e, i) => {
              const month = e.date.slice(0, 7)
              const { before, match, after } = excerptAround(e.markdown, query)
              return (
                <li key={e.date}>
                  {/* Results are grouped under their month, inside one list so the count stays honest. */}
                  {month !== results[i - 1]?.date.slice(0, 7) && <h2 className="results-month">{monthFormat.format(parseDateKey(`${month}-01`))}</h2>}
                  <Link to={`/day/${e.date}`}>
                    <strong>
                      <span className="result-mood" role="img" aria-label={e.mood ? t(`mood.${e.mood}`) : t('archive.noMood')}>
                        {e.mood ? MOOD_EMOJI[e.mood] : <span className="dot dot-none" />}
                      </span>
                      {dayFormat.format(parseDateKey(e.date))}
                    </strong>
                    <span className="excerpt">
                      {before}
                      {match && <mark>{match}</mark>}
                      {after}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <>
          <div className="month-nav">
            <button type="button" className="icon-btn" aria-label={t('archive.prevMonth')} onClick={() => setYm((v) => shiftMonth(v, -1))}>
              <ChevronLeft />
            </button>
            <h1>{title}</h1>
            <button type="button" className="icon-btn" aria-label={t('archive.nextMonth')} disabled={atCurrentMonth} onClick={() => setYm((v) => shiftMonth(v, 1))}>
              <ChevronRight />
            </button>
          </div>
          <MonthCalendar ym={ym} entries={monthEntries} />
          <MonthEntries entries={monthEntries} />
        </>
      )}
    </section>
  )
}
