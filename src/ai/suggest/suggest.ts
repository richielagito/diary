import { isMood, type Mood } from '../../domain/types'
import type { ChatMessage } from '../../storage/ChatRepository'
import type { Language } from '../../storage/SettingsStore'
import { parseJsonObject } from '../json'
import { completeText } from '../provider/completeText'
import { ProviderError, type ChatProvider, type ProviderErrorKind } from '../provider/types'
import { buildDraftSystem, buildDraftUser, buildTagSuggestSystem, buildTagSuggestUser } from './suggestPrompt'
import { INLINE_TAG_AI_MAX, sanitizeTags } from './tags'

// Limits live in suggestPrompt.ts (the prompt builders use them); re-exported here as the public surface.
export { DRAFT_MESSAGE_CHARS, DRAFT_MESSAGE_LIMIT, ENTRY_SUGGEST_CHARS } from './suggestPrompt'
export const DRAFT_TEXT_MAX = 2000

export interface Suggestion {
  mood: Mood | null
  tags: string[]
}
export type TagsResult = { status: 'ok'; tags: string[] } | { status: 'error'; kind: ProviderErrorKind | 'format' }
export type DraftResult = ({ status: 'ok'; text: string } & Suggestion) | { status: 'error'; kind: ProviderErrorKind | 'format' }

/** null if `value` is not a plain object; otherwise an invalid mood becomes null and tags are sanitized. */
export function parseSuggestion(value: unknown, existingTags: readonly string[]): Suggestion | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as { mood?: unknown; tags?: unknown }
  return { mood: isMood(raw.mood) ? raw.mood : null, tags: sanitizeTags(raw.tags, existingTags) }
}

const failure = (err: unknown) => ({ status: 'error', kind: err instanceof ProviderError ? err.kind : 'unknown' }) as const

export async function suggestTags(
  provider: ChatProvider,
  input: { markdown: string; language: Language; knownTags: string[]; existingTags: string[] },
): Promise<TagsResult> {
  let reply: string
  try {
    reply = await completeText(provider, {
      system: buildTagSuggestSystem(input.language),
      messages: [{ role: 'user', content: buildTagSuggestUser(input.markdown, input.knownTags) }],
    })
  } catch (err) {
    return failure(err)
  }
  const raw = parseJsonObject(reply) as { tags?: unknown } | null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.tags)) return { status: 'error', kind: 'format' }
  return { status: 'ok', tags: sanitizeTags(raw.tags, input.existingTags, INLINE_TAG_AI_MAX) }
}

export async function draftDiaryFromChat(
  provider: ChatProvider,
  input: { messages: ChatMessage[]; language: Language; knownTags: string[]; existingTags: string[] },
): Promise<DraftResult> {
  let reply: string
  try {
    reply = await completeText(provider, {
      system: buildDraftSystem(input.language),
      messages: [{ role: 'user', content: buildDraftUser(input.messages, input.knownTags) }],
    })
  } catch (err) {
    return failure(err)
  }
  const parsed = parseJsonObject(reply)
  const suggestion = parseSuggestion(parsed, input.existingTags)
  const rawText = (parsed as { text?: unknown } | null)?.text
  if (!suggestion || typeof rawText !== 'string' || rawText.trim() === '') return { status: 'error', kind: 'format' }
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  // By code points, so an emoji at the cut is never split.
  const text = Array.from(normalized).slice(0, DRAFT_TEXT_MAX).join('').trim()
  return { status: 'ok', text, ...suggestion }
}
