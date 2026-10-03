import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRepos, useSettings } from '../../app/RepoContext'
import type { ContextCounts } from '../../ai/context/chatContext'
import type { DateKey, Mood } from '../../domain/types'
import { ChevronRight } from '../../app/icons'
import { loadChatPrompt } from './systemPromptSource'

export function ContextPreview({ date, latestUserText }: { date: DateKey; latestUserText: string }) {
  const { t } = useTranslation()
  const { diary, memories, summaries, settingsStore } = useRepos()
  const settings = useSettings()
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<{ system: string; context: string; counts: ContextCounts } | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void loadChatPrompt({ diary, memories, summaries, settings, moodLabel: (m: Mood) => t(`mood.${m}`), date, latestUserText })
      .then((p) => {
        if (!cancelled) setPreview(p)
      })
      // The preview is only informative: on failure it stays hidden.
      .catch((err: unknown) => console.error(err))
    return () => {
      cancelled = true
    }
  }, [open, diary, memories, summaries, settings, date, latestUserText, t])

  return (
    <details className="context-preview" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <ChevronRight />
        {t('chat.contextTitle')}
      </summary>
      <label>
        <input
          type="checkbox"
          checked={settings.aiIncludeDiary}
          onChange={(e) => void settingsStore.set('aiIncludeDiary', e.target.checked)}
        />{' '}
        {t('chat.includeDiary')}
      </label>
      {preview && (
        <>
          <p>{t('chat.contextCounts', { ...preview.counts })}</p>
          <pre>{[preview.system, preview.context].filter(Boolean).join('\n\n')}</pre>
        </>
      )}
    </details>
  )
}
