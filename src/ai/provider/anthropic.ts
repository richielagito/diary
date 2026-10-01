import Anthropic from '@anthropic-ai/sdk'
import { systemBlock, toBlockTurns } from './cacheBlocks'
import { mapSdkError } from './errors'
import { ProviderError, type AiConfig, type ChatProvider, type ChatRequest } from './types'

export interface ProviderDeps {
  fetch?: typeof fetch
  maxRetries?: number
}

export const ANTHROPIC_FALLBACK_BETA = 'server-side-fallback-2026-07-01'
const FALLBACK_MODELS = /^claude-(opus|fable)-5/

export function createAnthropicClient(config: AiConfig, deps: ProviderDeps = {}): Anthropic {
  return new Anthropic({
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: deps.maxRetries ?? 1,
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  })
}

export function createAnthropicProvider(config: AiConfig, deps: ProviderDeps = {}): ChatProvider {
  const client = createAnthropicClient(config, deps)
  const useFallbacks = FALLBACK_MODELS.test(config.model)

  return {
    async *stream({ system, messages, signal, context, cache = false }: ChatRequest) {
      try {
        const stream = client.beta.messages.stream(
          {
            model: config.model,
            max_tokens: 64000,
            system: [systemBlock(system, cache)],
            messages: toBlockTurns(messages, context, cache),
            ...(useFallbacks ? { betas: [ANTHROPIC_FALLBACK_BETA], fallbacks: 'default' as const } : {}),
          },
          { signal },
        )
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text
        }
        const final = await stream.finalMessage()
        if (final.stop_reason === 'refusal') throw new ProviderError('refusal')
      } catch (err) {
        throw mapSdkError(err, Anthropic)
      }
    },
  }
}
