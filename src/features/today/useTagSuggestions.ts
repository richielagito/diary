import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRepos, useSettings } from '../../app/RepoContext'
import { fastConfig } from '../../ai/provider/fastConfig'
import { mergeTagSuggestions } from '../../ai/suggest/mergeTagSuggestions'
import { suggestTags } from '../../ai/suggest/suggest'
import { topTags } from '../../ai/suggest/tags'
import { extractTags } from '../../domain/tags'

/** Ask the AI again only after the entry grew by this many characters. */
const AI_REFRESH_CHARS = 300

export interface TagSuggestions {
  getSuggestions(prefix: string): string[]
  onTrigger(): void
  /** Increases whenever the suggestions may have changed. */
  version: number
}

/**
 * Tag suggestions for the inline chips: tags from other entries, plus AI tags from the fast
 * model when enabled. AI failures are logged only; local tags keep working.
 */
export function useTagSuggestions(getMarkdown: () => string): TagSuggestions {
  const { diary, createProvider } = useRepos()
  const settings = useSettings()
  const [version, setVersion] = useState(0)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const getMarkdownRef = useRef(getMarkdown)
  getMarkdownRef.current = getMarkdown
  const knownTags = useRef<string[]>([])
  const aiTags = useRef<string[]>([])
  const inflight = useRef(false)
  const lastLen = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    diary.list().then(
      (entries) => {
        if (cancelled) return
        knownTags.current = topTags(entries)
        setVersion((v) => v + 1)
      },
      (err: unknown) => console.error(err),
    )
    return () => {
      cancelled = true
    }
  }, [diary])

  const onTrigger = useCallback(() => {
    const s = settingsRef.current
    const ai = s.ai
    if (!ai || !s.aiTagSuggest || inflight.current) return
    const markdown = getMarkdownRef.current()
    if (lastLen.current !== null && markdown.length - lastLen.current < AI_REFRESH_CHARS) return
    inflight.current = true
    lastLen.current = markdown.length
    // The provider is created inside the chain so that a throwing factory is logged, never thrown into the editor.
    void Promise.resolve()
      .then(() =>
        suggestTags(createProvider(fastConfig(ai)), {
          markdown,
          language: s.language,
          // Tags from other entries are diary content: they only reach the AI when the diary is shared with it.
          knownTags: s.aiIncludeDiary ? knownTags.current : [],
          existingTags: extractTags(markdown),
        }),
      )
      .then((result) => {
        if (result.status === 'ok') {
          aiTags.current = result.tags
          setVersion((v) => v + 1)
        } else {
          console.error('tag suggestion failed:', result.kind)
        }
      })
      .catch((err: unknown) => console.error(err))
      .finally(() => {
        inflight.current = false
      })
  }, [createProvider])

  const getSuggestions = useCallback(
    (prefix: string) =>
      mergeTagSuggestions(prefix, aiTags.current, knownTags.current, extractTags(getMarkdownRef.current())),
    [],
  )

  return useMemo(() => ({ getSuggestions, onTrigger, version }), [getSuggestions, onTrigger, version])
}
