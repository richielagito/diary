import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useRepos } from '../../app/RepoContext'
import { dateKey } from '../../domain/date'
import type { DayEntry } from '../../domain/types'
import { computeStats } from '../../stats/computeStats'
import { comparePeriods, periodContaining, periodId, shiftPeriod, type StatsPeriod } from '../../stats/range'
import { ConsistencyCards, MoodSection, TagSection } from './StatCards'
import { periodLabel } from './format'
import { Heatmap } from './Heatmap'

export function StatsPage() {
  const { t, i18n } = useTranslation()
  const { diary } = useRepos()
  const [today] = useState(() => dateKey())
  const [entries, setEntries] = useState<DayEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [period, setPeriod] = useState<StatsPeriod>(() => periodContaining('month', today))

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
  }, [diary])

  const stats = useMemo(() => (entries && entries.length > 0 ? computeStats(entries, period, today) : null), [entries, period, today])
  if (failed) return <p role="alert">{t('stats.loadFailed')}</p>
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
      <section>
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
          <button type="button" aria-label={t('stats.previous')} disabled={!canPrev} onClick={() => setPeriod((p) => shiftPeriod(p, -1))}>
            ‹
          </button>
          <h1>{label}</h1>
          <button type="button" aria-label={t('stats.next')} disabled={!canNext} onClick={() => setPeriod((p) => shiftPeriod(p, 1))}>
            ›
          </button>
        </div>
      </div>
      <Heatmap cells={stats.heatmap} weeks={stats.weeks} mode={period.kind} scrollToToday={stats.range.isCurrent} />
      {/* Periode tanpa tulisan: hanya heatmap kosong dan satu kalimat */}
      {stats.daysWritten > 0 ? (
        <>
          <ConsistencyCards stats={stats} />
          <MoodSection stats={stats} />
          <TagSection stats={stats} />
          <Link className="wrapped-link" to={`/wrapped/${periodId(period)}`}>
            {t('stats.openWrapped', { period: label })}
          </Link>
        </>
      ) : (
        <p>{t('stats.emptyPeriod')}</p>
      )}
    </section>
  )
}
