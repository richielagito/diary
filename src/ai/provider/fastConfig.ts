import { PROVIDER_PRESETS, type AiConfig } from './types'

/**
 * Model cepat: isian user, lalu default preset provider, lalu model utama.
 * Config lama (disimpan sebelum ada `fastModel`) di luar Anthropic tetap memakai model utama, karena preset
 * belum tentu tersedia di akun atau endpoint user. `''` berarti "pakai preset", dan itulah yang disimpan form.
 */
export function fastModelOf(ai: AiConfig): string {
  if (ai.fastModel === undefined && ai.provider !== 'anthropic') return ai.model
  return ai.fastModel?.trim() || PROVIDER_PRESETS[ai.provider].fastModel || ai.model
}

/** Config yang sama dengan `model` diganti model cepat. Aman untuk config lama tanpa `fastModel`. */
export function fastConfig(ai: AiConfig): AiConfig {
  return { ...ai, model: fastModelOf(ai) }
}
