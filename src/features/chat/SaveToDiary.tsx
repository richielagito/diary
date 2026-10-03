import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useRepos, useSettings } from '../../app/RepoContext'
import type { ProviderErrorKind } from '../../ai/provider/types'
import { draftDiaryFromChat } from '../../ai/suggest/suggest'
import { topTags } from '../../ai/suggest/tags'
import { dateKey } from '../../domain/date'
import { MOOD_EMOJI, type DateKey, type Mood } from '../../domain/types'
import type { ChatMessage } from '../../storage/ChatRepository'

interface Props {
  date: DateKey
  messages: ChatMessage[]
  /** true selama balasan sedang dialirkan */
  disabled: boolean
}

interface Draft {
  text: string
  /** null kalau entri sudah punya mood atau model tidak memberi mood */
  mood: Mood | null
  moodChecked: boolean
  tags: { tag: string; checked: boolean }[]
}

type ErrorKind = ProviderErrorKind | 'format' | 'storage'

/** Menyusun tulisan diary dari percakapan hari itu; user mengedit lalu menambahkannya ke entri tanggal itu. */
export function SaveToDiary({ date, messages, disabled }: Props) {
  const { t } = useTranslation()
  const { diary, createProvider } = useRepos()
  const settings = useSettings()
  const [drafting, setDrafting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<ErrorKind | null>(null)
  const [appended, setAppended] = useState(false)
  const textId = useId()

  const hasUserMessage = messages.some((m) => m.role === 'user')
  // Conversation gone (deleted): drop any draft or notice so it cannot reappear with the next conversation.
  if (!hasUserMessage && (draft || appended || error)) {
    setDraft(null)
    setAppended(false)
    setError(null)
  }
  if (!settings.ai || !hasUserMessage) return null
  const ai = settings.ai

  const run = async () => {
    setDrafting(true)
    setError(null)
    setAppended(false)
    try {
      const entry = await diary.get(date)
      const result = await draftDiaryFromChat(createProvider(ai), {
        messages,
        language: settings.language,
        // Tags come from other days' entries, so they only leave the device when the diary is shared with the AI.
        knownTags: settings.aiIncludeDiary ? topTags(await diary.list()) : [],
        existingTags: entry?.tags ?? [],
      })
      if (result.status === 'ok') {
        setDraft({
          text: result.text,
          mood: entry?.mood == null ? result.mood : null,
          moodChecked: true,
          tags: result.tags.map((tag) => ({ tag, checked: true })),
        })
      } else {
        setError(result.kind)
      }
    } catch (err) {
      console.error(err)
      setError('unknown')
    }
    setDrafting(false)
  }

  const append = async (e: FormEvent) => {
    e.preventDefault()
    if (!draft || saving) return
    const checked = draft.tags.filter((x) => x.checked).map((x) => `#${x.tag}`)
    const text = checked.length ? `${draft.text.trimEnd()}\n\n${checked.join(' ')}` : draft.text
    setSaving(true)
    setError(null)
    try {
      await diary.appendToEntry(date, text, draft.moodChecked ? draft.mood : null)
      setDraft(null)
      setAppended(true)
    } catch (err) {
      console.error(err)
      setError('storage')
    }
    setSaving(false)
  }

  const errorText = error === 'format' ? t('suggest.format') : error ? t(`aiError.${error}`) : null

  return (
    <section className="save-to-diary">
      <p>
        <button type="button" onClick={() => void run()} disabled={disabled || drafting || saving || draft !== null}>
          {drafting ? t('suggest.drafting') : t('suggest.saveToDiary')}
        </button>
      </p>
      {draft && (
        <form onSubmit={(e) => void append(e)}>
          <label htmlFor={textId}>{t('suggest.draftLabel')}</label>
          <textarea id={textId} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={8} />
          {draft.mood !== null && (
            <label>
              <input
                type="checkbox"
                checked={draft.moodChecked}
                onChange={(e) => setDraft({ ...draft, moodChecked: e.target.checked })}
              />
              {t('suggest.setMood', { emoji: MOOD_EMOJI[draft.mood], label: t(`mood.${draft.mood}`) })}
            </label>
          )}
          {draft.tags.map(({ tag, checked }) => (
            <label key={tag}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) =>
                  setDraft({ ...draft, tags: draft.tags.map((x) => (x.tag === tag ? { tag, checked: e.target.checked } : x)) })
                }
              />
              {t('suggest.tagLabel', { tag: `#${tag}` })}
            </label>
          ))}
          <p>
            <button type="submit" className="primary" disabled={saving || draft.text.trim() === ''}>
              {t('suggest.append')}
            </button>{' '}
            <button
              type="button"
              onClick={() => {
                setDraft(null)
                setError(null)
              }}
            >
              {t('suggest.cancel')}
            </button>
          </p>
        </form>
      )}
      {appended && (
        <p role="status">
          {t('suggest.appended')} <Link to={date === dateKey() ? '/' : `/day/${date}`}>{t('suggest.openDay')}</Link>
        </p>
      )}
      {errorText && <p role="alert">{errorText}</p>}
    </section>
  )
}
