export type ProviderKind = 'anthropic' | 'openai' | 'openrouter' | 'gemini' | 'ollama' | 'custom'

export interface AiConfig {
  provider: ProviderKind
  apiKey: string
  /** Diisi dari preset; diabaikan untuk anthropic. */
  baseUrl: string
  model: string
  /** Model untuk kerja latar (saran tag, memori, ringkasan). Kosong: pakai default preset, lalu `model`. */
  fastModel?: string
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  system: string
  messages: ChatTurn[]
  signal: AbortSignal
  /** Ekor dinamis untuk pesan user terakhir. Hanya ada di request, tidak pernah disimpan. */
  context?: string
  /** Pasang breakpoint cache (system dan teks user terakhir). Hanya untuk percakapan yang dipakai ulang, yaitu Curhat. */
  cache?: boolean
}

export interface ChatProvider {
  /** Mengalirkan potongan teks jawaban. Melempar ProviderError. */
  stream(req: ChatRequest): AsyncIterable<string>
}

export type ProviderErrorKind =
  | 'auth'
  | 'rateLimit'
  | 'notFound'
  | 'badRequest'
  | 'network'
  | 'refusal'
  | 'aborted'
  | 'unknown'

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind

  constructor(kind: ProviderErrorKind, message?: string) {
    super(message ?? kind)
    this.name = 'ProviderError'
    this.kind = kind
  }
}

export interface ProviderPreset {
  baseUrl: string
  defaultModel: string
  fastModel: string
  suggestedModels: string[]
  needsKey: boolean
}

export const PROVIDER_PRESETS: Record<ProviderKind, ProviderPreset> = {
  anthropic: {
    baseUrl: '',
    defaultModel: 'claude-opus-5-5',
    fastModel: 'claude-haiku-4-5',
    suggestedModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-fable-5-1'],
    needsKey: true,
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.6',
    fastModel: 'gpt-5.6-luna',
    suggestedModels: ['gpt-5.6', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    needsKey: true,
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-5.6-sol',
    fastModel: 'openai/gpt-5.6-luna',
    suggestedModels: ['~anthropic/claude-sonnet-latest', 'openai/gpt-5.6-sol', 'openai/gpt-5.6-luna'],
    needsKey: true,
  },
  // OpenAI-compatible endpoint Gemini (ai.google.dev/gemini-api/docs/openai); caching implisit untuk Gemini 2.5+.
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-3.8-flash',
    fastModel: 'gemini-3.1-flash-lite',
    suggestedModels: ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'],
    needsKey: true,
  },
  ollama: { baseUrl: 'http://localhost:11434/v1', defaultModel: '', fastModel: '', suggestedModels: [], needsKey: false },
  custom: { baseUrl: '', defaultModel: '', fastModel: '', suggestedModels: [], needsKey: false },
}

export function isOpenAICompatible(kind: ProviderKind): boolean {
  return kind !== 'anthropic'
}
