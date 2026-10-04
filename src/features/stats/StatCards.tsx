import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { MOOD_EMOJI, MOODS } from '../../domain/types'
import type { PeriodStats } from '../../stats/computeStats'
import { formatMood, formatNumber, monthKeyLabel, trendLabel } from './format'
import { MoodBars } from './MoodBars'
import { MostFrequentMood } from './MostFrequentMood'

export function ConsistencyCards({ stats }: { stats: PeriodStats }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  return (
    <div className="stat-cards">
      <div className="stat-card">
        <span>{t('stats.daysWritten')}</span>
        <strong>
          {t('stats.daysWrittenValue', {
            count: stats.range.elapsedDays,
            days: formatNumber(stats.daysWritten, lang),
            total: formatNumber(stats.range.elapsedDays, lang),
            percent: formatNumber(Math.round(stats.writtenRatio * 100), lang),
          })}
        </strong>
      </div>
      <div className="stat-card">
        <span>{t('stats.currentStreak')}</span>
        <strong>{t('stats.streakDays', { count: stats.currentStreak })}</strong>
      </div>
      <div className="stat-card">
        <span>{t('stats.longestStreak')}</span>
        <strong>{t('stats.streakDays', { count: stats.longestStreak })}</strong>
      </div>
    </div>
  )
}

export function MoodSection({ stats }: { stats: PeriodStats }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { mood } = stats
  return (
    <section className="stat-section">
      <h2>{t('stats.moodTitle')}</h2>
      {mood.count === 0 || mood.average === null ? (
        <p>{t('stats.noMoodYet')}</p>
      ) : (
        <>
          <MostFrequentMood className="mood-average" distribution={mood.distribution} />
          {stats.period.kind === 'year' && (mood.brightest || mood.heaviest) && (
            <p className="mood-extremes">
              {mood.brightest && <span>{t('stats.brightest', { month: monthKeyLabel(mood.brightest, lang) })}</span>}
              {mood.heaviest && <span>{t('stats.heaviest', { month: monthKeyLabel(mood.heaviest, lang) })}</span>}
            </p>
          )}
          <h3>{t('stats.moodDistribution')}</h3>
          <ul className="mood-dist">
            {MOODS.map((m) => (
              <li key={m}>
                <span aria-hidden="true">{MOOD_EMOJI[m]}</span>
                <span className="dist-label">{t(`mood.${m}`)}</span>
                <span className="dist-bar">
                  <span style={{ width: `${(mood.distribution[m] / mood.count) * 100}%`, background: `var(--mood-${m})` }} />
                </span>
                <span className="dist-count">{t('stats.moodDays', { count: mood.distribution[m] })}</span>
              </li>
            ))}
          </ul>
          {/* One point is not a trend. */}
          {mood.trend.filter((p) => p.average !== null).length >= 2 && (
            <>
              <h3>{t('stats.moodTrend')}</h3>
              <MoodBars points={mood.trend.map((p) => ({ label: trendLabel(p, stats.period.kind, lang), average: p.average }))} />
            </>
          )}
        </>
      )}
    </section>
  )
}

export function TagSection({ stats, showFresh = true, linked = true }: { stats: PeriodStats; showFresh?: boolean; linked?: boolean }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { tags } = stats
  // A tag opens its days in Archive search; inside Wrapped it stays plain so taps keep moving the story.
  const tagName = (tag: string) => (linked ? <Link to={`/archive?q=${encodeURIComponent(`#${tag}`)}`}>#{tag}</Link> : <span>#{tag}</span>)
  // "New" only says something when it differs from the top tags right above it.
  const top = new Set(tags.top.map((x) => x.tag))
  const fresh = tags.fresh.filter((tag) => !top.has(tag))
  return (
    <section className="stat-section">
      <h2>{t('stats.tagsTitle')}</h2>
      {tags.top.length === 0 ? (
        <p>{t('stats.noTagsYet')}</p>
      ) : (
        <>
          <h3>{t('stats.topTags')}</h3>
          <ul className="tag-stats">
            {tags.top.map((x) => (
              <li key={x.tag}>
                {tagName(x.tag)} <span className="muted">{t('stats.tagDays', { count: x.days })}</span>
              </li>
            ))}
          </ul>
          {tags.moodLift.length > 0 && (
            <>
              <h3>{t('stats.moodLift')}</h3>
              <ul className="tag-stats">
                {tags.moodLift.map((x) => (
                  <li key={x.tag}>
                    {tagName(x.tag)} <span className="muted">+{formatMood(x.lift, lang)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {showFresh && fresh.length > 0 && (
            <>
              <h3>{t('stats.freshTags')}</h3>
              <ul className="tag-stats">
                {fresh.map((tag) => (
                  <li key={tag}>
                    {tagName(tag)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}
