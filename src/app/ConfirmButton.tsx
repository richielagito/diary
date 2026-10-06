import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * A destructive action that asks in place, in the page's own type and language: the first press shows what
 * will happen with "yes" and "cancel" beside it. Replaces the browser's confirm popup.
 * The question opens on "cancel", so a second Enter never deletes; Escape cancels too.
 */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
  className,
  name,
  muted,
}: {
  label: string
  question: string
  confirmLabel: string
  onConfirm: () => void
  className?: string
  /** What the action applies to, for the accessible name when several such buttons share one label. */
  name?: string
  /** A per-row delete in a list: plain ink at rest, red only once it asks. */
  muted?: boolean
}) {
  const { t } = useTranslation()
  const [asking, setAsking] = useState(false)
  const questionId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  // Cancelling hands focus back to the button that asked, instead of dropping it on the page.
  const refocus = useRef(false)
  useEffect(() => {
    if (!asking && refocus.current) trigger.current?.focus()
    refocus.current = false
  }, [asking])
  const cancel = () => {
    refocus.current = true
    setAsking(false)
  }

  if (!asking) {
    return (
      <p className={className}>
        <button
          ref={trigger}
          type="button"
          className={muted ? 'quiet' : 'quiet danger'}
          aria-label={name ? `${label}: ${name}` : undefined}
          onClick={() => setAsking(true)}
        >
          {label}
        </button>
      </p>
    )
  }
  return (
    <div
      className={['confirm', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={name ? `${label}: ${name}` : label}
      aria-describedby={questionId}
      onKeyDown={(e) => {
        if (e.key === 'Escape') cancel()
      }}
    >
      <p id={questionId}>{question}</p>
      <p>
        <button
          type="button"
          className="danger"
          onClick={() => {
            setAsking(false)
            onConfirm()
          }}
        >
          {confirmLabel}
        </button>{' '}
        <button type="button" className="quiet" autoFocus onClick={cancel}>
          {t('common.cancel')}
        </button>
      </p>
    </div>
  )
}
