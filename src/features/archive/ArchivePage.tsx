import { startTransition, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { useRepos } from '../../app/RepoContext'
import { useInitial } from '../../app/useInitial'
import { monthRange, shiftMonth, type YearMonth } from '../../domain/calendar'
import { parseDateKey } from '../../domain/date'
import { excerptAround, searchEntries } from '../../domain/filter'
import { MOOD_EMOJI, type DateKey, type DayEntry } from '../../domain/types'
import { ChevronLeft, ChevronRight } from '../../app/icons'
import { MonthCalendar } from './MonthCalendar'
import { MonthEntries } from './MonthEntries'

/** `?m=2026-08`, or the current month when it is missing, malformed or in the future. */
function parseMonth(param: string | null): YearMonth {
  const now = new Date()
  const m = param?.match(/^(\d{4})-(\d{2})$/)
  const asked = m ? { year: Number(m[1]), month: Number(m[2]) } : null
  const current = { year: now.getFullYear(), month: now.getMonth() + 1 }
  const valid = asked && asked.month >= 1 && asked.month <= 12 && asked.year * 12 + asked.month <= current.year * 12 + current.month
  return valid ? asked : current
}

const monthId = (v: YearMonth) => `${v.year}-${String(v.month).padStart(2, '0')}`

export function ArchivePage() {
  const { t, i18n } = useTranslation()
  const { diary } = useRepos()
  const [all, setAll] = useState<DayEntry[] | null>(null)
  // The search and the month live in the URL (?q=#tag&m=2026-08): Back from a day or a result returns to them, and Stats
  // links here with ?q=#tag. The page reads its own state and the URL follows, since URL changes run as transitions:
  // a field fed by one drops fast keystrokes, and a second click before the redraw would not move a month further.
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  const [ym, setYm] = useState(() => parseMonth(params.get('m')))
  useEffect(() => {
    const month = monthId(ym)
    if ((params.get('q') ?? '') === query && monthId(parseMonth(params.get('m'))) === month) return
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (query) n.set('q', query)
        else n.delete('q')
        n.set('m', month)
        return n
      },
      { replace: true },
    )
  }, [params, setParams, query, ym])

  // The month is read before it shows: a new month replaces the old one whole, never an empty calendar first.
  const monthEntries = useInitial(diary, `archive:${monthId(ym)}`, () =>
    diary.list(monthRange(ym)).then(
      (list) => new Map<DateKey, DayEntry>(list.map((e) => [e.date, e])),
      (err: unknown) => {
        console.error(err)
        return new Map<DateKey, DayEntry>()
      },
    ),
  )
  const stepMonth = (by: number) => startTransition(() => setYm((v) => shiftMonth(v, by)))

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
            <button type="button" className="icon-btn" aria-label={t('archive.prevMonth')} onClick={() => stepMonth(-1)}>
              <ChevronLeft />
            </button>
            <h1>{title}</h1>
            <button type="button" className="icon-btn" aria-label={t('archive.nextMonth')} disabled={atCurrentMonth} onClick={() => stepMonth(1)}>
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
