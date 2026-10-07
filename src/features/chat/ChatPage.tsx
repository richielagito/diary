import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Settings } from '../../app/icons'
import { useRepos, useSettings } from '../../app/RepoContext'
import { useInitial } from '../../app/useInitial'
import { detectCrisis } from '../../ai/safety/crisis'
import type { DateKey, Mood } from '../../domain/types'
import type { ChatMessage } from '../../storage/ChatRepository'
import { chatDate } from './chatDate'
import { Composer } from './Composer'
import { CrisisCard } from './CrisisCard'
import { ApiKeyHelp } from '../settings/ApiKeyHelp'
import { MessageList } from './MessageList'
import { loadChatPrompt } from './systemPromptSource'
import { useAiMaintenance } from './useAiMaintenance'
import { useChat } from './useChat'

export function ChatPage({ date }: { date: DateKey }) {
  const { t, i18n } = useTranslation()
  const { diary, chats, memories, summaries } = useRepos()
  const settings = useSettings()
  // Read before the page shows, so a conversation never opens on the empty-chat note first.
  const initial = useInitial(chats, `chat:${date}`, () =>
    chats.listByDate(date).catch((err: unknown) => {
      console.error(err)
      return []
    }),
  )
  const [messages, setMessages] = useState<ChatMessage[]>(initial)

  useEffect(() => chats.watchByDate(date, setMessages), [chats, date])

  const loadPrompt = useCallback(
    async (latestUserText: string) => {
      const { system, context } = await loadChatPrompt({
        diary,
        memories,
        summaries,
        settings,
        moodLabel: (m: Mood) => t(`mood.${m}`),
        date,
        latestUserText,
      })
      return { system, context }
    },
    [diary, memories, summaries, settings, date, t],
  )
  const { onReplySaved } = useAiMaintenance()
  const chat = useChat({ date, messages, config: settings.ai, loadPrompt, onReplySaved })

  // Latched: once refused today the card stays, even after a successful retry. ChatPage is keyed by date.
  const [refused, setRefused] = useState(false)
  const refusedNow = chat.state.phase === 'error' && chat.state.kind === 'refusal'
  useEffect(() => {
    if (refusedNow) setRefused(true)
  }, [refusedNow])
  const showCrisis = refused || refusedNow || messages.some((m) => m.role === 'user' && detectCrisis(m.content))

  // Follow the conversation: open at the latest message (where the crisis card sits too), and keep following
  // new and streaming replies unless the user has scrolled up to reread.
  const following = useRef(true)
  useEffect(() => {
    const onScroll = () => {
      following.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const partial = chat.state.phase === 'streaming' ? chat.state.partial : ''
  useEffect(() => {
    if (following.current) window.scrollTo?.({ top: document.documentElement.scrollHeight })
  }, [messages.length, partial, showCrisis, chat.state.phase])

  const empty = messages.length === 0 && chat.state.phase === 'idle'

  return (
    <section className="chat">
      <header>
        <div>
          <h1>{t('chat.title')}</h1>
          <p>{chatDate(date, i18n.language)}</p>
        </div>
        <Link className="icon-btn" to={`/chat/${date}/info`} aria-label={t('chat.infoTitle')} title={t('chat.infoTitle')}>
          <Settings />
        </Link>
      </header>

      {!settings.ai ? (
        <div className="chat-empty">
          <h2>{t('chat.noConfigTitle')}</h2>
          <p>{t('chat.noConfigBody')}</p>
          <Link className="button primary" to="/settings#ai">
            {t('chat.openSettings')}
          </Link>
          <ApiKeyHelp />
        </div>
      ) : (
        empty && (
          <div className="chat-empty">
            <h2>{t('chat.emptyTitle')}</h2>
            <p>{t('chat.emptyBody', { name: settings.persona.name.trim() || t('chat.title') })}</p>
          </div>
        )
      )}

      {/* Without AI, "I'm listening" would be a promise the page cannot keep; earlier messages still show. */}
      {!empty && <MessageList messages={messages} state={chat.state} onRetry={chat.retry} />}

      {showCrisis && <CrisisCard />}
      {/* The card appears inside the flow; this tells a screen reader it arrived. */}
      <p className="visually-hidden" aria-live="assertive">
        {showCrisis ? t('crisis.title') : ''}
      </p>

      {settings.ai && <Composer streaming={chat.state.phase === 'streaming'} onSend={chat.send} onStop={chat.stop} />}
    </section>
  )
}
