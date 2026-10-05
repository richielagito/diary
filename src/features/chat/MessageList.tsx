import { useTranslation } from 'react-i18next'
import type { ChatMessage } from '../../storage/ChatRepository'
import type { ChatPhase } from './useChat'

interface Props {
  messages: ChatMessage[]
  state: ChatPhase
  onRetry: () => void
}

interface Row {
  key: number
  role: 'user' | 'assistant'
  content: string
  stopped: boolean
  live: boolean
}

export function MessageList({ messages, state, onRetry }: Props) {
  const { t } = useTranslation()
  // Retry cannot help a storage error that has nothing unsaved to resend (the composer already kept the draft).
  const showRetry = state.phase === 'error' && !(state.kind === 'storage' && !state.unsaved)

  // One flat, position-keyed list: messages are append-only and never reordered, and the trailing
  // streaming/unsaved row occupies the same slot the persisted message will land in once saved.
  // Keeping everything in a single map() (rather than a mapped array plus separate sibling
  // expressions) lets React match that slot by key across the streaming -> persisted handoff and
  // update the existing bubble in place instead of unmounting one and mounting another.
  const rows: Row[] = messages.map((m, i) => ({ key: i, role: m.role, content: m.content, stopped: m.status === 'stopped', live: false }))
  // The saved reply can arrive via the watch just before the state goes idle; don't show it twice.
  const last = messages.at(-1)
  const settled = state.phase === 'streaming' && last?.role === 'assistant' && last.content === state.partial
  if (state.phase === 'streaming' && !settled) {
    rows.push({ key: messages.length, role: 'assistant', content: state.partial, stopped: false, live: true })
  } else if (state.phase === 'error' && state.unsaved) {
    rows.push({
      key: messages.length,
      role: 'assistant',
      content: state.unsaved.content,
      stopped: state.unsaved.status === 'stopped',
      live: false,
    })
  }

  return (
    <>
      <ul className="messages" aria-label={t('chat.title')}>
        {rows.map((r) => (
          <li key={r.key} className={`bubble-msg ${r.role}`} aria-live={r.live ? 'polite' : undefined}>
            {r.content}
            {r.live && !r.content && (
              // Before the first words arrive: three dots, like a chat app shows the other side typing.
              <span className="typing">
                <span />
                <span />
                <span />
                <span className="visually-hidden">{t('chat.typing')}</span>
              </span>
            )}
            {r.stopped && <span className="meta">{t('chat.stopped')}</span>}
          </li>
        ))}
      </ul>
      {state.phase === 'error' && (
        <div className="banner error" role="alert">
          <span>{t(`aiError.${state.kind}`)}</span>
          {showRetry && (
            <button type="button" onClick={onRetry}>
              {t('chat.retry')}
            </button>
          )}
        </div>
      )}
    </>
  )
}
