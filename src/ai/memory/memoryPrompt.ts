import type { ChatMessage } from '../../storage/ChatRepository'
import type { Memory } from '../../storage/MemoryRepository'
import type { Language } from '../../storage/SettingsStore'
import { EXTRACT_MESSAGE_CHARS, MEMORY_TEXT_MAX } from './limits'

export function buildMemorySystemPrompt(language: Language): string {
  return [
    'You maintain a short list of facts about the user of a private diary app, so that a companion AI can remember them in later conversations.',
    'Read the new conversation messages and decide which durable facts to add, update or remove. Keep only facts that stay useful later: people and relationships, work or school, ongoing situations, goals, preferences, and recurring feelings.',
    'Never store passwords, identity numbers, bank or card numbers, full addresses or phone numbers.',
    'Do not duplicate existing memories. You may only update or remove memories marked (ai); never touch memories marked (user).',
    `Write each memory as one short sentence of at most ${MEMORY_TEXT_MAX} characters describing the user, in ${
      language === 'id' ? 'Indonesian (Bahasa Indonesia)' : 'English'
    }.`,
    'Reply with only a JSON object of this exact shape and nothing else: {"add": ["..."], "update": [{"id": "...", "text": "..."}], "remove": ["..."]}. Use empty arrays when there is nothing to do.',
  ].join('\n\n')
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

export function buildMemoryUserPrompt(memories: Memory[], messages: ChatMessage[]): string {
  const current = memories.length
    ? memories.map((m) => `- [${m.id}] (${m.source === 'user' ? 'user' : 'ai'}) ${m.text}`).join('\n')
    : '(none)'
  const conversation = messages
    .map((m) => `[${m.date}] ${m.role === 'user' ? 'User' : 'Companion'}: ${clip(m.content, EXTRACT_MESSAGE_CHARS)}`)
    .join('\n')
  return `Current memories:\n${current}\n\nNew conversation messages:\n${conversation}`
}
