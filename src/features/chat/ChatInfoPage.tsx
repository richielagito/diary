import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { ConfirmButton } from '../../app/ConfirmButton'
import { ChevronLeft } from '../../app/icons'
import { useRepos, useSettings } from '../../app/RepoContext'
import type { DateKey } from '../../domain/types'
import type { ChatMessage } from '../../storage/ChatRepository'
import { chatDate } from './chatDate'
import { ContextPreview } from './ContextPreview'
import { SaveToDiary } from './SaveToDiary'

/** Everything around a conversation, kept off the chat itself: what to do with it, other days, and what the AI gets to read. */
export function ChatInfoPage({ date }: { date: DateKey }) {
  const { t, i18n } = useTranslation()
  const { chats, settingsStore } = useRepos()
  const settings = useSettings()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [dates, setDates] = useState<DateKey[]>([])

  useEffect(() => chats.watchByDate(date, setMessages), [chats, date])
  useEffect(() => {
    void chats.datesWithChats().then(setDates)
  }, [chats, messages.length])

  const back = `/chat/${date}`
  const otherDates = dates.filter((d) => d !== date).reverse()
  const latestUserText = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

  return (
    <section className="chat-info">
      <header className="back-header">
        <Link className="icon-btn" to={back} aria-label={t('chat.back')}>
          <ChevronLeft />
        </Link>
        <h1>{t('chat.infoTitle')}</h1>
      </header>

      {messages.length > 0 && (
        <section>
          <h2>{t('chat.thisChat', { date: chatDate(date, i18n.language) })}</h2>
          <SaveToDiary date={date} messages={messages} />
          <ConfirmButton
            className="chat-delete"
            label={t('chat.deleteDay')}
            question={t('chat.deleteConfirm')}
            confirmLabel={t('common.yesDelete')}
            onConfirm={() => void chats.deleteByDate(date).then(() => navigate(back))}
          />
        </section>
      )}

      {otherDates.length > 0 && (
        <section>
          <h2>{t('chat.history')}</h2>
          <nav className="chat-history" aria-label={t('chat.history')}>
            {otherDates.map((d) => (
              <Link key={d} to={`/chat/${d}`}>
                {chatDate(d, i18n.language)}
              </Link>
            ))}
          </nav>
        </section>
      )}

      {settings.ai ? (
        <section>
          <h2>{t('chat.contextTitle')}</h2>
          <label>
            <input
              type="checkbox"
              checked={settings.aiIncludeDiary}
              onChange={(e) => void settingsStore.set('aiIncludeDiary', e.target.checked)}
            />
            {t('chat.includeDiary')}
          </label>
          <ContextPreview date={date} latestUserText={latestUserText} />
          <p>
            <Link to="/memory" state={{ from: `/chat/${date}/info` }}>
              {t('chat.memoryLink')}
            </Link>
          </p>
        </section>
      ) : (
        <section>
          <h2>{t('chat.noConfigTitle')}</h2>
          <p>{t('chat.noConfigBody')}</p>
          <Link className="button primary" to="/settings#ai">
            {t('chat.openSettings')}
          </Link>
        </section>
      )}
    </section>
  )
}
