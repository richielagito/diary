import type { CSSProperties, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MOOD_EMOJI, MOODS_SHOWN, type Mood } from '../../domain/types'

export function MoodPicker({ value, onChange, past = false }: { value: Mood | null; onChange: (m: Mood | null) => void; past?: boolean }) {
  const { t } = useTranslation()
  // One tab stop for the five faces (the chosen one, else the first); arrow keys move between them.
  const focusable = value ?? MOODS_SHOWN[0]
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]
    if (!step) return
    const faces = [...e.currentTarget.querySelectorAll('button')]
    const at = faces.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    e.preventDefault()
    faces[(at + step + faces.length) % faces.length]?.focus()
  }
  return (
    <div className="mood-row">
      <div className="mood-picker" role="group" aria-label={t(past ? 'day.moodLabelPast' : 'day.moodLabel')} onKeyDown={onKeyDown}>
        {MOODS_SHOWN.map((m) => (
          <button
            key={m}
            type="button"
            aria-label={t(`mood.${m}`)}
            title={t(`mood.${m}`)}
            aria-pressed={value === m}
            tabIndex={m === focusable ? 0 : -1}
            onClick={() => onChange(value === m ? null : m)}
            style={{ '--mood': `var(--mood-${m})` } as CSSProperties}
          >
            {MOOD_EMOJI[m]}
          </button>
        ))}
      </div>
      {/* Shown above the faces (CSS order) but read and tabbed after them: the faces come first for a keyboard. */}
      {value ? (
        <p className="mood-caption">
          <span aria-hidden="true">{t(`mood.${value}`)}</span>
          <button type="button" className="quiet" onClick={() => onChange(null)}>
            {t('day.clearMood')}
          </button>
        </p>
      ) : (
        <p className="mood-caption">{t(past ? 'day.moodPromptPast' : 'day.moodPrompt')}</p>
      )}
    </div>
  )
}
