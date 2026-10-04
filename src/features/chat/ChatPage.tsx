import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ChevronRight } from '../../app/icons'
import { useRepos, useSettings } from '../../app/RepoContext'
import { detectCrisis } from '../../ai/safety/crisis'
import { parseDateKey } from '../../domain/date'
import type { DateKey, Mood } from '../../domain/types'
import type { ChatMessage } from '../../storage/ChatRepository'
import { Composer } from './Composer'
import { ContextPreview } from './ContextPreview'
import { CrisisCard } from './CrisisCard'
import { MessageList } from './MessageList'
import { SaveToDiary } from './SaveToDiary'
import { loadChatPrompt } from './systemPromptSource'
import { useAiMaintenance } from './useAiMaintenance'
import { useChat } from './useChat'

const HISTORY_LINKS = 14

export function ChatPage({ date }: { date: DateKey }) {
  const { t, i18n } = useTranslation()
  const { diary, chats, memories, summaries, settingsStore } = useRepos()
  const settings = useSettings()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [dates, setDates] = useState<DateKey[]>([])

  useEffect(() => chats.watchByDate(date, setMessages), [chats, date])
  useEffect(() => {
    void chats.datesWithChats().then(setDates)
  }, [chats, messages.length])

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

  const dayFormat = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' })
  const fullFormat = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const otherDates = dates.filter((d) => d !== date).slice(-HISTORY_LINKS).reverse()

  const deleteConversation = async () => {
    if (window.confirm(t('chat.deleteConfirm'))) await chats.deleteByDate(date)
  }

  return (
    <section className="chat">
      <header>
        <h1>{t('chat.title')}</h1>
        <p>{fullFormat.format(parseDateKey(date))}</p>
        {settings.ai && <Link to="/memory">{t('chat.memoryLink')}</Link>}
        {otherDates.length > 0 && (
          <details className="chat-history">
            <summary>
              <ChevronRight />
              {t('chat.history')}
            </summary>
            <nav aria-label={t('chat.history')}>
              {otherDates.map((d) => (
                <Link key={d} to={`/chat/${d}`}>
                  {dayFormat.format(parseDateKey(d))}
                </Link>
              ))}
            </nav>
          </details>
        )}
      </header>

      {!settings.ai && (
        <div className="banner">
          <div>
            <h2>{t('chat.noConfigTitle')}</h2>
            <p>{t('chat.noConfigBody')}</p>
          </div>
          <Link className="button primary" to="/settings#ai">
            {t('chat.openSettings')}
          </Link>
        </div>
      )}

      {/* Without AI, "I'm listening" would be a promise the page cannot keep. */}
      {(settings.ai || messages.length > 0) && <MessageList messages={messages} state={chat.state} onRetry={chat.retry} />}

      {showCrisis && <CrisisCard />}
      {/* The card appears inside the flow; this tells a screen reader it arrived. */}
      <p className="visually-hidden" aria-live="assertive">
        {showCrisis ? t('crisis.title') : ''}
      </p>

      <SaveToDiary date={date} messages={messages} disabled={chat.state.phase === 'streaming'} />

      {settings.ai && (
        <>
          {/* What goes out with each message is stated where the message is written, not only in a fold below. */}
          <p className="chat-sharing">
            {t(settings.aiIncludeDiary ? 'chat.diaryShared' : 'chat.diaryNotShared')}
            <button type="button" className="quiet" onClick={() => void settingsStore.set('aiIncludeDiary', !settings.aiIncludeDiary)}>
              {t(settings.aiIncludeDiary ? 'chat.stopSharing' : 'chat.startSharing')}
            </button>
          </p>
          <Composer streaming={chat.state.phase === 'streaming'} onSend={chat.send} onStop={chat.stop} />
          <ContextPreview date={date} latestUserText={[...messages].reverse().find((m) => m.role === 'user')?.content ?? ''} />
        </>
      )}

      {messages.length > 0 && chat.state.phase !== 'streaming' && (
        <p>
          <button type="button" className="quiet danger" onClick={() => void deleteConversation()}>
            {t('chat.deleteDay')}
          </button>
        </p>
      )}
    </section>
  )
}
