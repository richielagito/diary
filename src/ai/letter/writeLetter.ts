import type { LetterRepository } from '../../storage/LetterRepository'
import { completeText } from '../provider/completeText'
import { ProviderError, type AiConfig, type ChatProvider } from '../provider/types'
import type { LetterInput } from './letterInput'
import { buildLetterSystemPrompt, buildLetterUserPrompt } from './letterPrompt'

/** JSON dengan kunci objek terurut, supaya urutan kunci tidak mengubah hash. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

/** FNV-1a 32-bit, heksadesimal. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function letterFingerprint(input: LetterInput, ai: AiConfig): string {
  return fnv1a(stableStringify({ input, provider: ai.provider, model: ai.model }))
}

/** fresh=false: ada surat tersimpan tapi datanya sudah berubah (UI menawarkan "surat baru"). */
export async function cachedLetter(
  letters: LetterRepository,
  input: LetterInput,
  ai: AiConfig,
): Promise<{ text: string; fresh: boolean } | null> {
  const stored = await letters.get(input.periodId)
  if (!stored) return null
  return { text: stored.text, fresh: stored.fingerprint === letterFingerprint(input, ai) }
}

export async function writeLetter(deps: {
  input: LetterInput
  ai: AiConfig
  provider: ChatProvider
  letters: LetterRepository
  signal: AbortSignal
  now?: () => number
}): Promise<string> {
  const { input, ai, provider, letters, signal, now = Date.now } = deps
  let raw: string
  try {
    raw = await completeText(provider, {
      system: buildLetterSystemPrompt(input),
      messages: [{ role: 'user', content: buildLetterUserPrompt(input) }],
      signal,
    })
  } catch (err) {
    if (signal.aborted && !(err instanceof ProviderError)) throw new ProviderError('aborted')
    throw err
  }
  if (signal.aborted) throw new ProviderError('aborted')
  const text = raw.trim()
  if (!text) throw new ProviderError('unknown')
  await letters.put({ periodId: input.periodId, text, fingerprint: letterFingerprint(input, ai), createdAt: now() })
  return text
}
