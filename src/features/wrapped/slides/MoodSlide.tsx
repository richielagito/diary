import { useTranslation } from 'react-i18next'
import { MOOD_EMOJI, type Mood } from '../../../domain/types'
import type { PeriodStats } from '../../../stats/computeStats'
import { formatMood, monthKeyLabel, trendLabel } from '../../stats/format'
import { Heatmap } from '../../stats/Heatmap'
import { MoodBars } from '../../stats/MoodBars'

export function MoodSlide({ stats }: { stats: PeriodStats }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { mood } = stats
  const kind = stats.period.kind
  return (
    <div className="slide-body">
      <h2 className="slide-title">{t('wrapped.moodTitle')}</h2>
      {mood.average !== null && (
        <p className="slide-lead">
          <span aria-hidden="true">{MOOD_EMOJI[Math.round(mood.average) as Mood]}</span> {formatMood(mood.average, lang)}
        </p>
      )}
      <MoodBars points={mood.trend.map((p) => ({ label: trendLabel(p, kind, lang), average: p.average }))} />
      {kind === 'year' && (mood.brightest || mood.heaviest) && (
        <p className="mood-extremes">
          {mood.brightest && <span>{t('stats.brightest', { month: monthKeyLabel(mood.brightest, lang) })}</span>}
          {mood.heaviest && <span>{t('stats.heaviest', { month: monthKeyLabel(mood.heaviest, lang) })}</span>}
        </p>
      )}
      <div className={`slide-heatmap slide-heatmap-${kind}`}>
        <Heatmap cells={stats.heatmap} weeks={stats.weeks} mode={kind} compact scrollToToday={stats.range.isCurrent} />
      </div>
    </div>
  )
}
