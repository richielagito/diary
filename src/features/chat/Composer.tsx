import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  streaming: boolean
  onSend: (text: string) => Promise<boolean>
  onStop: () => void
}

export function Composer({ streaming, onSend, onStop }: Props) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  // Locked while onSend is pending, so text typed in the meantime cannot be wiped when it succeeds.
  const [sending, setSending] = useState(false)

  const submit = async () => {
    if (sending) return
    setSending(true)
    try {
      if (await onSend(text)) setText('')
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // On a touch keyboard Enter is a new line; sending stays on the button, so half a thought never goes out.
    const touch = window.matchMedia?.('(pointer: coarse)').matches
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !touch) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div className="composer">
      <textarea
        aria-label={t('chat.inputLabel')}
        placeholder={t('chat.placeholder')}
        value={text}
        // Read-only, not disabled: a disabled field drops focus, and on a phone the keyboard would fold on every send.
        readOnly={streaming || sending}
        aria-busy={streaming || sending}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {streaming ? (
        <button type="button" onClick={onStop}>
          {t('chat.stop')}
        </button>
      ) : (
        <button type="button" className="primary" onClick={() => void submit()} disabled={sending || !text.trim()}>
          {t('chat.send')}
        </button>
      )}
    </div>
  )
}
