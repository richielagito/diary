import type { ChatTurn } from './types'

export interface TextBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export interface BlockTurn {
  role: ChatTurn['role']
  content: TextBlock[]
}

const EPHEMERAL = { type: 'ephemeral' } as const

export function systemBlock(system: string, cache: boolean): TextBlock {
  return cache ? { type: 'text', text: system, cache_control: EPHEMERAL } : { type: 'text', text: system }
}

/**
 * Pesan sebagai blok konten. Dengan `cache`, breakpoint ada di teks pesan terakhir, jadi giliran berikutnya
 * ikut memakai cache sampai pesan user ini. `context` menyusul sebagai blok terpisah tanpa cache.
 * Tidak pernah membuat blok teks kosong.
 */
export function toBlockTurns(messages: ChatTurn[], context: string | undefined, cache: boolean): BlockTurn[] {
  const turns = messages.map((m): BlockTurn => ({ role: m.role, content: [{ type: 'text', text: m.content }] }))
  const last = turns.at(-1)
  if (!last) return turns
  if (cache) last.content[0].cache_control = EPHEMERAL
  if (context?.trim()) last.content.push({ type: 'text', text: context })
  return turns
}

/** Untuk provider tanpa blok konten: konteks digabung ke teks pesan terakhir. */
export function withInlineContext(messages: ChatTurn[], context?: string): ChatTurn[] {
  if (!context?.trim() || messages.length === 0) return messages
  const last = messages[messages.length - 1]
  return [...messages.slice(0, -1), { ...last, content: `${last.content}\n\n${context}` }]
}
