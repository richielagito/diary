import { parseJsonObject } from '../json'
import { completeText } from '../provider/completeText'
import { ProviderError, type ChatProvider, type ProviderErrorKind } from '../provider/types'
import type { ChatRepository } from '../../storage/ChatRepository'
import type { MemoryRepository } from '../../storage/MemoryRepository'
import type { SettingsStore } from '../../storage/SettingsStore'
import { EXTRACT_MESSAGE_LIMIT } from './limits'
import { buildMemorySystemPrompt, buildMemoryUserPrompt } from './memoryPrompt'
import { applyMemoryOps, parseMemoryOps } from './memoryOps'

export type ExtractResult =
  | { status: 'nothing' }
  | { status: 'busy' }
  | { status: 'ok'; added: number; updated: number; removed: number }
  | { status: 'error'; kind: ProviderErrorKind | 'format' }

export interface ExtractDeps {
  chats: ChatRepository
  memories: MemoryRepository
  settingsStore: SettingsStore
  provider: ChatProvider
  minUserMessages: number
  now?: () => number
}

let running = false

export async function extractMemories(deps: ExtractDeps): Promise<ExtractResult> {
  if (running) return { status: 'busy' }
  running = true
  try {
    const settings = await deps.settingsStore.getAll()
    const pending = (await deps.chats.listAll())
      .filter((m) => m.createdAt > settings.memoryCursor)
      .sort((a, b) => a.createdAt - b.createdAt)
    if (!pending.length) return { status: 'nothing' }
    if (pending.filter((m) => m.role === 'user').length < deps.minUserMessages) return { status: 'nothing' }
    const batch = pending.slice(-EXTRACT_MESSAGE_LIMIT)
    const current = await deps.memories.list()

    let reply: string
    try {
      reply = await completeText(deps.provider, {
        system: buildMemorySystemPrompt(settings.language),
        messages: [{ role: 'user', content: buildMemoryUserPrompt(current, batch) }],
      })
    } catch (err) {
      return { status: 'error', kind: err instanceof ProviderError ? err.kind : 'unknown' }
    }
    // The user may have turned memory off while the model was thinking: drop the result and keep the cursor.
    const latest = await deps.settingsStore.getAll()
    if (!latest.aiMemoryEnabled) return { status: 'nothing' }
    const ops = parseMemoryOps(parseJsonObject(reply))
    if (!ops) return { status: 'error', kind: 'format' }

    const applied = applyMemoryOps(current, ops, (deps.now ?? Date.now)())
    // Conditional writes: never overwrite what the user edited or deleted while the model was thinking.
    const before = new Map(current.map((m) => [m.id, m]))
    let added = 0
    let updated = 0
    let removed = 0
    for (const id of applied.removes) {
      if (await deps.memories.removeIfUnchanged(id, before.get(id)!.updatedAt)) removed++
    }
    for (const m of applied.puts) {
      const old = before.get(m.id)
      if (await deps.memories.putIfUnchanged(m, old ? old.updatedAt : null)) old ? updated++ : added++
    }

    // Never move the cursor backwards (memory may have been re-enabled mid-run, which sets it to now).
    await deps.settingsStore.set('memoryCursor', Math.max(latest.memoryCursor, ...batch.map((m) => m.createdAt)))
    return { status: 'ok', added, updated, removed }
  } finally {
    running = false
  }
}
