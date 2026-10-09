import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PeriodStats } from '../../stats/computeStats'
import { periodId } from '../../stats/range'
import { formatNumber, periodLabel } from '../stats/format'
import { renderShareCard, type ShareCardData } from './shareCard'
import { shareImage } from './shareImage'

/** The period's share image: Wrapped's closing slide for a year, the Stats page for a month. */
export function useShareCard(stats: PeriodStats) {
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const save = async () => {
    const lang = i18n.language
    setBusy(true)
    setFailed(false)
    try {
      const data: ShareCardData = {
        periodLabel: periodLabel(stats.period, lang),
        subtitle: stats.range.isCurrent ? t('wrapped.soFar') : '',
        stats: [
          { label: t('stats.daysWritten'), value: formatNumber(stats.daysWritten, lang) },
          { label: t('wrapped.shareWords'), value: formatNumber(stats.totalWords, lang) },
          { label: t('stats.longestStreak'), value: t('stats.streakDays', { count: stats.longestStreak }) },
        ],
        distribution: stats.mood.distribution,
        heatmap: stats.heatmap,
        weeks: stats.weeks,
        mode: stats.period.kind,
        topTags: stats.tags.top.slice(0, 3).map((x) => x.tag),
        appName: 'Diary',
      }
      const blob = await renderShareCard(data)
      const name = `diary-${stats.period.kind === 'year' ? 'wrapped' : 'stats'}-${periodId(stats.period)}.png`
      await shareImage(new File([blob], name, { type: 'image/png' }))
    } catch (err) {
      console.error(err)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return { busy, failed, save }
}
