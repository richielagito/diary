import { useTranslation } from 'react-i18next'
import { mostFrequentMoods, type PeriodStats } from '../../../stats/computeStats'
import { monthKeyLabel, trendLabel } from '../../stats/format'
import { Heatmap } from '../../stats/Heatmap'
import { MoodBars } from '../../stats/MoodBars'
import { MostFrequentMood } from '../../stats/MostFrequentMood'

export function MoodSlide({ stats }: { stats: PeriodStats }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { mood } = stats
  const kind = stats.period.kind
  const bright = mood.distribution[4] + mood.distribution[5]
  return (
    <div className="slide-body">
      <h2 className="slide-title">{t('wrapped.moodTitle')}</h2>
      <MostFrequentMood className="slide-lead mood-average" distribution={mood.distribution} />
      {/* A heavy period still had its bright days; they are named, not hidden under the most frequent mood. */}
      {bright > 0 && !mostFrequentMoods(mood.distribution).moods.some((m) => m >= 4) && (
        <p className="slide-lead slide-quiet">{t('wrapped.brightDays', { count: bright })}</p>
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
