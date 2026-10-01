import { createAnthropicProvider, type ProviderDeps } from './anthropic'
import { createOpenAICompatibleProvider } from './openaiCompatible'
import type { AiConfig, ChatProvider } from './types'

export type { ProviderDeps }
export type CreateProvider = (config: AiConfig) => ChatProvider

export function createProvider(config: AiConfig, deps: ProviderDeps = {}): ChatProvider {
  return config.provider === 'anthropic'
    ? createAnthropicProvider(config, deps)
    : createOpenAICompatibleProvider(config, deps)
}
