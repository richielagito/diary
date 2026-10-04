import { useTranslation } from 'react-i18next'
import type { PeriodStats } from '../../../stats/computeStats'
import { TagSection } from '../../stats/StatCards'

export function TagSlide({ stats }: { stats: PeriodStats }) {
  const { t } = useTranslation()
  return (
    <div className="slide-body">
      <h2 className="slide-title">{t('wrapped.tagsTitle')}</h2>
      <TagSection stats={stats} showFresh={stats.period.kind === 'year'} linked={false} />
    </div>
  )
}
