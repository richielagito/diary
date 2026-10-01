import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { ProviderDeps } from './anthropic'
import { systemBlock, toBlockTurns, withInlineContext } from './cacheBlocks'
import { mapSdkError } from './errors'
import { ProviderError, type AiConfig, type ChatProvider, type ChatRequest } from './types'

/** Ollama dan sebagian endpoint lokal tidak butuh key, tapi SDK mewajibkan nilai. */
const PLACEHOLDER_KEY = 'no-key'

/**
 * Melempar ProviderError('badRequest') kalau base URL kosong untuk provider selain 'openai':
 * tanpa baseURL, SDK jatuh ke api.openai.com, sehingga key dan isi diary bisa terkirim ke provider yang salah.
 */
export function createOpenAICompatibleClient(config: AiConfig, deps: ProviderDeps = {}): OpenAI {
  if (config.provider !== 'openai' && !config.baseUrl.trim()) throw new ProviderError('badRequest')
  const fetchImpl = config.provider === 'gemini' ? withoutStainlessHeaders(deps.fetch) : deps.fetch
  return new OpenAI({
    apiKey: config.apiKey || PLACEHOLDER_KEY,
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: true,
    maxRetries: deps.maxRetries ?? 1,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  })
}

/**
 * Preflight CORS endpoint OpenAI-compatible Gemini menolak header telemetri `x-stainless-*` yang dikirim SDK OpenAI
 * dari browser (403), sehingga request tidak pernah sampai. Header itu hanya telemetri SDK, jadi aman dibuang.
 */
function withoutStainlessHeaders(base: typeof fetch | undefined): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers)
    for (const key of [...headers.keys()]) if (key.startsWith('x-stainless')) headers.delete(key)
    return (base ?? globalThis.fetch)(input, { ...init, headers })
  }
}

/**
 * OpenRouter meneruskan `cache_control` (hanya bila `cache`) di blok konten ke provider yang butuh breakpoint eksplisit
 * (Anthropic, Qwen, Gemini). Endpoint lain dapat string biasa: server custom bisa menolak field asing.
 */
function toChatMessages(
  config: AiConfig,
  { system, messages, context, cache = false }: Omit<ChatRequest, 'signal'>,
): ChatCompletionMessageParam[] {
  if (config.provider !== 'openrouter') {
    return [{ role: 'system', content: system }, ...withInlineContext(messages, context)]
  }
  // Tipe SDK OpenAI tidak mendeklarasikan `cache_control`; blok kita tetap cocok secara struktural, dan OpenRouter menerimanya.
  return [{ role: 'system', content: [systemBlock(system, cache)] }, ...toBlockTurns(messages, context, cache)]
}

export function createOpenAICompatibleProvider(config: AiConfig, deps: ProviderDeps = {}): ChatProvider {
  const client = createOpenAICompatibleClient(config, deps)

  return {
    async *stream({ signal, ...request }: ChatRequest) {
      try {
        const stream = await client.chat.completions.create(
          { model: config.model, stream: true, messages: toChatMessages(config, request) },
          { signal },
        )
        for await (const chunk of stream) {
          const choice = chunk.choices[0]
          if (choice?.delta?.content) yield choice.delta.content
          if (choice?.finish_reason === 'content_filter') throw new ProviderError('refusal')
        }
      } catch (err) {
        throw mapSdkError(err, OpenAI)
      }
    },
  }
}
