import { useTranslation } from 'react-i18next'
import { MOOD_EMOJI, type Mood } from '../../domain/types'
import { mostFrequentMoods } from '../../stats/computeStats'

/** "Paling sering: 🙂 Baik · 12 hari"; on a tie every top mood is named, with the shared count. */
export function MostFrequentMood({ distribution, className, label = true }: { distribution: Record<Mood, number>; className: string; label?: boolean }) {
  const { t, i18n } = useTranslation()
  const { moods, days } = mostFrequentMoods(distribution)
  if (moods.length === 0) return null
  const names = new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(moods.map((m) => t(`mood.${m}`)))
  return (
    <p className={className}>
      {label && <span>{t('stats.mostFrequent')}: </span>}
      <strong>
        <span aria-hidden="true">{moods.map((m) => MOOD_EMOJI[m]).join(' ')}</span> {names}
      </strong>
      {/* A no-break space ties the dot to the names, so a wrapped line never starts with it. */}
      <span>{'\u00a0'}· {moods.length > 1 ? t('stats.eachDays', { count: days }) : t('stats.moodDays', { count: days })}</span>
    </p>
  )
}
