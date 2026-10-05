import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Stop } from '../../app/icons'

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
  // The field grows with what is typed, up to its CSS max-height, so a long message stays readable before it is sent.
  const field = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [text])

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
        ref={field}
        rows={1}
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
        <button type="button" className="icon-btn" aria-label={t('chat.stop')} title={t('chat.stop')} onClick={onStop}>
          <Stop />
        </button>
      ) : (
        <button
          type="button"
          className="icon-btn primary"
          aria-label={t('chat.send')}
          title={t('chat.send')}
          onClick={() => void submit()}
          disabled={sending || !text.trim()}
        >
          <Send />
        </button>
      )}
    </div>
  )
}
