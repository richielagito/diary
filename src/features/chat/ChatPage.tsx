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
import { MessageList } from './MessageList'
import { loadChatPrompt } from './systemPromptSource'
import { useAiMaintenance } from './useAiMaintenance'
import { useChat } from './useChat'

/** The conversation's own area where it scrolls by itself (phones), otherwise the page. */
function scrollerOf(area: HTMLElement | null): HTMLElement {
  return area && getComputedStyle(area).overflowY === 'auto' ? area : document.documentElement
}

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
  // Phones scroll the conversation inside its own area above an unmoving composer: a sticky composer is what the
  // iOS keyboard strands mid-screen and scrolls back to while typing. Wider screens scroll the page.
  const scrollArea = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  useEffect(() => {
    const onScroll = () => {
      const s = scrollerOf(scrollArea.current)
      following.current = s.clientHeight + s.scrollTop >= s.scrollHeight - 160
    }
    // Capture: scroll events from the area do not bubble to the document.
    document.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [])
  const partial = chat.state.phase === 'streaming' ? chat.state.partial : ''
  useEffect(() => {
    if (!following.current) return
    const s = scrollerOf(scrollArea.current)
    s.scrollTo?.({ top: s.scrollHeight })
  }, [messages.length, partial, showCrisis, chat.state.phase])

  const empty = messages.length === 0 && chat.state.phase === 'idle'

  // Once the title has scrolled away, a slim bar keeps the date and the way to the details in reach.
  const header = useRef<HTMLElement>(null)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const el = header.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    // On wider screens the top nav is sticky, so the title counts as gone once it slips under the nav.
    // ponytail: measured once; crossing the 640px breakpoint mid-page keeps the old offset until the page remounts.
    const nav = document.querySelector<HTMLElement>('.nav')
    const navBottom = nav && getComputedStyle(nav).position === 'sticky' ? Math.round(nav.getBoundingClientRect().height) : 0
    el.parentElement?.style.setProperty('--chat-bar-top', `${navBottom}px`)
    const observer = new IntersectionObserver(
      ([e]) => setCompact(!e.isIntersecting && e.boundingClientRect.top < navBottom),
      { rootMargin: `-${navBottom}px 0px 0px 0px` },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="chat">
      <div className="chat-scroll" ref={scrollArea}>
        <header ref={header}>
          <div>
            <h1>{t('chat.title')}</h1>
            <p>{chatDate(date, i18n.language)}</p>
          </div>
          <Link className="icon-btn" to={`/chat/${date}/info`} aria-label={t('chat.infoTitle')} title={t('chat.infoTitle')}>
            <Settings />
          </Link>
        </header>
        {/* A visual echo of the header above: hidden from assistive tech, which still has the real one. */}
        <div className="chat-bar" data-shown={compact || undefined} aria-hidden="true" inert={!compact}>
          <p>
            <strong>{t('chat.title')}</strong> <span>{chatDate(date, i18n.language)}</span>
          </p>
          <Link className="icon-btn" to={`/chat/${date}/info`} tabIndex={-1} title={t('chat.infoTitle')}>
            <Settings />
          </Link>
        </div>

        {!settings.ai ? (
          <div className="chat-empty">
            <h2>{t('chat.noConfigTitle')}</h2>
            <p>{t('chat.noConfigBody')}</p>
            <Link className="button primary" to="/settings#ai">
              {t('chat.openSettings')}
            </Link>
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
      </div>

      {settings.ai && <Composer streaming={chat.state.phase === 'streaming'} onSend={chat.send} onStop={chat.stop} />}
    </section>
  )
}
