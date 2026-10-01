import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { createAnthropicClient, type ProviderDeps } from './anthropic'
import { mapSdkError } from './errors'
import { createOpenAICompatibleClient } from './openaiCompatible'
import type { AiConfig } from './types'

export type ListModels = (config: AiConfig) => Promise<string[]>

const MAX_MODELS = 500

/** ID model dari endpoint provider, unik dan terurut, paling banyak 500. Melempar ProviderError. */
export async function listModels(config: AiConfig, deps: ProviderDeps = {}): Promise<string[]> {
  const isAnthropic = config.provider === 'anthropic'
  try {
    const models = isAnthropic
      ? createAnthropicClient(config, deps).models.list()
      : createOpenAICompatibleClient(config, deps).models.list()
    const ids = new Set<string>()
    for await (const m of models) {
      // Gemini mengembalikan "models/<id>", sedangkan chat memakai "<id>".
      ids.add(config.provider === 'gemini' ? m.id.replace(/^models\//, '') : m.id)
      if (ids.size >= MAX_MODELS) break
    }
    return [...ids].sort()
  } catch (err) {
    throw mapSdkError(err, isAnthropic ? Anthropic : OpenAI)
  }
}
