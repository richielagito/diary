import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useRepos, useSettings } from '../../app/RepoContext'
import { extractMemories } from '../../ai/memory/extractMemories'
import { AUTO_EXTRACT_MIN_USER_MESSAGES } from '../../ai/memory/limits'
import { fastConfig } from '../../ai/provider/fastConfig'
import { maintainSummaries } from '../../ai/summary/maintainSummaries'
import { dateKey } from '../../domain/date'
import type { Mood } from '../../domain/types'

/**
 * Pekerjaan AI latar belakang untuk halaman Curhat, memakai model cepat.
 * Kegagalan dicatat di console dan dicoba lagi lain kali.
 */
export function useAiMaintenance(): { onReplySaved: () => void } {
  const { t } = useTranslation()
  const { diary, chats, memories, summaries, settingsStore, createProvider } = useRepos()
  const settings = useSettings()
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => {
    const s = settingsRef.current
    const ai = s.ai
    if (!ai || !s.aiSummariesEnabled || !s.aiIncludeDiary) return
    // The provider is created inside the chain so that a throwing factory is logged, never thrown into React.
    void Promise.resolve()
      .then(() =>
        maintainSummaries({
          diary,
          summaries,
          provider: createProvider(fastConfig(ai)),
          language: s.language,
          moodLabel: (m: Mood) => t(`mood.${m}`),
          today: dateKey(),
        }),
      )
      .catch((err: unknown) => console.error(err))
    // Sekali per halaman dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onReplySaved = useCallback(() => {
    const s = settingsRef.current
    const ai = s.ai
    if (!ai || !s.aiMemoryEnabled) return
    void Promise.resolve()
      .then(() =>
        extractMemories({
          chats,
          memories,
          settingsStore,
          provider: createProvider(fastConfig(ai)),
          minUserMessages: AUTO_EXTRACT_MIN_USER_MESSAGES,
        }),
      )
      .catch((err: unknown) => console.error(err))
  }, [chats, memories, settingsStore, createProvider])

  return { onReplySaved }
}
