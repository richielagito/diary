import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { MOOD_EMOJI, MOODS, type Mood } from '../../domain/types'

export function MoodPicker({ value, onChange }: { value: Mood | null; onChange: (m: Mood | null) => void }) {
  const { t } = useTranslation()
  return (
    <div className="mood-picker" role="group" aria-label={t('day.moodLabel')}>
      {MOODS.map((m) => (
        <button
          key={m}
          type="button"
          aria-label={t(`mood.${m}`)}
          title={t(`mood.${m}`)}
          aria-pressed={value === m}
          onClick={() => onChange(value === m ? null : m)}
          style={{ '--mood': `var(--mood-${m})` } as CSSProperties}
        >
          {MOOD_EMOJI[m]}
        </button>
      ))}
    </div>
  )
}
