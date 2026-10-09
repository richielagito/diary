import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { useRepos } from '../../app/RepoContext'
import { dateKey } from '../../domain/date'
import type { DayEntry } from '../../domain/types'
import { computeStats, type PeriodStats } from '../../stats/computeStats'
import { comparePeriods, parsePeriodId, periodContaining, periodId, shiftPeriod } from '../../stats/range'
import { ConsistencyCards, MoodSection, TagSection } from './StatCards'
import { periodLabel } from './format'
import { Heatmap } from './Heatmap'
import { moodWash } from '../wrapped/WrappedPage'
import { useShareCard } from '../wrapped/useShareCard'
import { ArrowPath, ChevronLeft, ChevronRight, PaperAirplane } from '../../app/icons'

const WRAPPED_MIN_DAYS = 7

export function StatsPage() {
  const { t, i18n } = useTranslation()
  const { diary } = useRepos()
  const [today] = useState(() => dateKey())
  const [entries, setEntries] = useState<DayEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  /** Raised by "Coba lagi" after a failed load, to read the diary again. */
  const [attempt, setAttempt] = useState(0)
  // The period lives in the URL (?p=2026-10 or ?p=2026): Back from a day or from Wrapped (yearly) returns to it.
  // The page reads its own state and the URL follows: URL changes run as transitions, and a second click before
  // the redraw would start from the period last drawn.
  const [params, setParams] = useSearchParams()
  const [period, setPeriod] = useState(() => {
    const p = params.get('p') ? parsePeriodId(params.get('p')!) : null
    return p && comparePeriods(p, periodContaining(p.kind, today)) <= 0 ? p : periodContaining('month', today)
  })
  useEffect(() => {
    const id = periodId(period)
    // A first visit keeps its plain address: no ?p= for the current month.
    if ((params.get('p') ?? periodId(periodContaining('month', today))) !== id) setParams({ p: id }, { replace: true })
  }, [params, setParams, period, today])

  useEffect(() => {
    let cancelled = false
    diary.list().then(
      (list) => {
        if (!cancelled) setEntries(list)
      },
      (err: unknown) => {
        console.error(err)
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [diary, attempt])

  const stats = useMemo(() => (entries && entries.length > 0 ? computeStats(entries, period, today) : null), [entries, period, today])
  if (failed) {
    return (
      <div className="banner error" role="alert">
        <span>{t('stats.loadFailed')}</span>
        <button
          type="button"
          onClick={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }}
        >
          <ArrowPath />
          {t('common.retry')}
        </button>
      </div>
    )
  }
  if (entries === null) return null

  const language = i18n.language
  const label = periodLabel(period, language)

  const setKind = (kind: 'month' | 'year') => {
    if (kind === period.kind) return
    if (kind === 'year') setPeriod({ kind: 'year', year: period.year })
    else {
      const now = periodContaining('year', today)
      setPeriod(period.year === now.year ? periodContaining('month', today) : { kind: 'month', year: period.year, month: 12 })
    }
  }

  if (!stats) {
    return (
      <section className="empty-state">
        <h1 className="visually-hidden">{t('nav.stats')}</h1>
        <p>{t('stats.emptyAll')}</p>
        <Link to="/">{t('stats.writeToday')}</Link>
      </section>
    )
  }

  const firstDate = entries.reduce((min, e) => (e.date < min ? e.date : min), entries[0].date)
  const canNext = comparePeriods(period, periodContaining(period.kind, today)) < 0
  const canPrev = comparePeriods(period, periodContaining(period.kind, firstDate)) > 0

  return (
    <section className="stats">
      <div className="stats-header">
        <div className="stats-mode">
          <button type="button" aria-pressed={period.kind === 'month'} onClick={() => setKind('month')}>
            {t('stats.month')}
          </button>
          <button type="button" aria-pressed={period.kind === 'year'} onClick={() => setKind('year')}>
            {t('stats.year')}
          </button>
        </div>
        <div className="month-nav">
          <button type="button" className="icon-btn" aria-label={t('stats.previous')} disabled={!canPrev} onClick={() => setPeriod((p) => shiftPeriod(p, -1))}>
            <ChevronLeft />
          </button>
          <h1>{label}</h1>
          <button type="button" className="icon-btn" aria-label={t('stats.next')} disabled={!canNext} onClick={() => setPeriod((p) => shiftPeriod(p, 1))}>
            <ChevronRight />
          </button>
        </div>
      </div>
      <Heatmap cells={stats.heatmap} weeks={stats.weeks} mode={period.kind} scrollToToday={stats.range.isCurrent} />
      {/* Periode tanpa tulisan: hanya heatmap kosong dan satu kalimat */}
      {stats.daysWritten > 0 ? (
        <>
          {/* "How have I been?" first, then the writing habit, then tags. */}
          <MoodSection stats={stats} />
          <ConsistencyCards stats={stats} />
          <TagSection stats={stats} />
        </>
      ) : (
        <p className="muted">{t('stats.emptyPeriod')}</p>
      )}
      {/* Wrapped is yearly, so it stays special; and a celebration needs something to celebrate: a week's worth of recorded days. */}
      {/* A month has no Wrapped, but its share image can still be saved; a year's lives at the end of Wrapped. */}
      {period.kind === 'month' && stats.daysWritten > 0 && <ShareStats stats={stats} />}
      {period.kind === 'year' &&
        (stats.daysWritten >= WRAPPED_MIN_DAYS ? (
          <Link className="wrapped-link" style={moodWash(stats.mood.distribution)} to={`/wrapped/${periodId(period)}`}>
            {t('stats.openWrapped', { period: label })}
          </Link>
        ) : (
          <button
            type="button"
            className="wrapped-link"
            style={moodWash(stats.mood.distribution)}
            disabled
            title={t('stats.wrappedLater', { min: WRAPPED_MIN_DAYS, count: stats.daysWritten })}
          >
            {t('stats.openWrapped', { period: label })}
          </button>
        ))}
    </section>
  )
}

function ShareStats({ stats }: { stats: PeriodStats }) {
  const { t } = useTranslation()
  const { busy, failed, save } = useShareCard(stats)
  return (
    <>
      <button type="button" className="share-stats primary" disabled={busy} onClick={() => void save()}>
        <PaperAirplane />
        {t('stats.share')}
      </button>
      {failed && <p role="alert">{t('wrapped.saveFailed')}</p>}
    </>
  )
}
