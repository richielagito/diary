import { fastConfig, fastModelOf } from './fastConfig'
import type { AiConfig } from './types'

const base: AiConfig = { provider: 'anthropic', apiKey: 'k', baseUrl: '', model: 'claude-opus-5' }

test('a legacy anthropic config without fastModel uses the preset fast model', () => {
  expect(fastConfig(base)).toEqual({ ...base, model: 'claude-haiku-4-5' })
})

test('an explicit fastModel is trimmed and wins over the preset', () => {
  expect(fastModelOf({ ...base, fastModel: ' x ' })).toBe('x')
  expect(fastConfig({ ...base, fastModel: ' x ' }).model).toBe('x')
})

test('a blank fastModel falls back to the preset', () => {
  expect(fastModelOf({ ...base, fastModel: '   ' })).toBe('claude-haiku-4-5')
})

test('ollama without fastModel uses the main model', () => {
  const ai: AiConfig = { provider: 'ollama', apiKey: '', baseUrl: 'http://localhost:11434/v1', model: 'llama3' }
  expect(fastConfig(ai).model).toBe('llama3')
})

test('a legacy non-anthropic config without fastModel keeps using the main model', () => {
  const openai: AiConfig = { provider: 'openai', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' }
  expect(fastModelOf(openai)).toBe('gpt-4o')
  expect(fastConfig(openai).model).toBe('gpt-4o')
  const openrouter: AiConfig = { provider: 'openrouter', apiKey: 'k', baseUrl: 'https://openrouter.ai/api/v1', model: 'x/y' }
  expect(fastModelOf(openrouter)).toBe('x/y')
})

test("fastModel '' uses the provider preset (openai: luna)", () => {
  const ai: AiConfig = { provider: 'openai', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6', fastModel: '' }
  expect(fastConfig(ai).model).toBe('gpt-5.6-luna')
})

test("fastModel '' without a preset fast model uses the main model", () => {
  const ai: AiConfig = { provider: 'custom', apiKey: '', baseUrl: 'http://x/v1', model: 'local', fastModel: '' }
  expect(fastModelOf(ai)).toBe('local')
})
