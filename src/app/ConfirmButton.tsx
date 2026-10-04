import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * A destructive action that asks in place, in the page's own type and language: the first press shows what
 * will happen with "yes" and "cancel" beside it. Replaces the browser's confirm popup.
 */
export function ConfirmButton({ label, question, confirmLabel, onConfirm, className }: { label: string; question: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const { t } = useTranslation()
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <p className={className}>
        <button type="button" className="quiet danger" onClick={() => setAsking(true)}>
          {label}
        </button>
      </p>
    )
  }
  return (
    <div className={['confirm', className].filter(Boolean).join(' ')} role="group" aria-label={label}>
      <p>{question}</p>
      <p>
        <button
          type="button"
          className="danger"
          autoFocus
          onClick={() => {
            setAsking(false)
            onConfirm()
          }}
        >
          {confirmLabel}
        </button>{' '}
        <button type="button" className="quiet" onClick={() => setAsking(false)}>
          {t('common.cancel')}
        </button>
      </p>
    </div>
  )
}
