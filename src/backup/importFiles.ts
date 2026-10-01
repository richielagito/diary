import JSZip from 'jszip'
import { EXPORT_FORMAT_VERSION } from '../config'
import { isValidDateKey } from '../domain/date'
import { parseEntry, type ParseErrorReason } from '../domain/frontmatter'
import type { DateKey, EntryInput } from '../domain/types'
import { MEMORY_TEXT_MAX } from '../ai/memory/limits'
import type { ChatMessage } from '../storage/ChatRepository'
import type { Memory } from '../storage/MemoryRepository'

export type InvalidReason = ParseErrorReason | 'unsupportedFile' | 'formatVersion' | 'unreadable'
export interface InvalidFile {
  fileName: string
  reason: InvalidReason
}
export interface ParsedImport {
  valid: EntryInput[]
  invalid: InvalidFile[]
  /** Riwayat curhat dari chats.json di dalam ZIP export; file lepas tidak pernah menghasilkan chat. */
  chats: ChatMessage[]
  /** Jumlah item chats.json yang tidak valid dan dilewati. */
  skippedChats: number
  /** Memori AI dari memories.json di dalam ZIP export; file lepas tidak pernah menghasilkan memori. */
  memories: Memory[]
  /** Jumlah item memories.json yang tidak valid dan dilewati. */
  skippedMemories: number
}
export interface ImportSource {
  name: string
  arrayBuffer(): Promise<ArrayBuffer>
}

const decoder = new TextDecoder()

function toChatMessage(item: unknown): ChatMessage | null {
  if (typeof item !== 'object' || item === null) return null
  const { id, date, role, content, createdAt, status } = item as Record<string, unknown>
  if (typeof id !== 'string' || typeof date !== 'string' || !isValidDateKey(date)) return null
  if (role !== 'user' && role !== 'assistant') return null
  if (typeof content !== 'string' || typeof createdAt !== 'number') return null
  if (status !== 'complete' && status !== 'stopped') return null
  return { id, date, role, content, createdAt, status }
}

function toMemory(item: unknown): Memory | null {
  if (typeof item !== 'object' || item === null) return null
  const { id, text, source, createdAt, updatedAt } = item as Record<string, unknown>
  if (typeof id !== 'string' || typeof text !== 'string' || text.trim() === '') return null
  if (source !== 'auto' && source !== 'user') return null
  if (typeof createdAt !== 'number' || typeof updatedAt !== 'number') return null
  return { id, text: text.slice(0, MEMORY_TEXT_MAX), source, createdAt, updatedAt }
}

export async function readImportFiles(files: ImportSource[], now: number): Promise<ParsedImport> {
  const byDate = new Map<DateKey, EntryInput>()
  const invalid: InvalidFile[] = []
  const chatsById = new Map<string, ChatMessage>()
  let skippedChats = 0
  const memoriesById = new Map<string, Memory>()
  let skippedMemories = 0

  const merge = (entry: EntryInput) => {
    const prev = byDate.get(entry.date)
    if (!prev || entry.updatedAt >= prev.updatedAt) byDate.set(entry.date, entry)
  }

  for (const f of files) {
    const lower = f.name.toLowerCase()
    if (lower.endsWith('.zip')) {
      try {
        const zip = await JSZip.loadAsync(await f.arrayBuffer())
        const manifest = zip.file('manifest.json')
        if (manifest) {
          const { formatVersion } = JSON.parse(await manifest.async('string')) as { formatVersion?: unknown }
          if (formatVersion !== EXPORT_FORMAT_VERSION) {
            invalid.push({ fileName: f.name, reason: 'formatVersion' })
            continue
          }
        }
        // All-or-nothing per zip: only merge once every entry in it has been read successfully,
        // so a mid-read failure doesn't leave a partial subset of this zip's entries imported.
        const localValid: EntryInput[] = []
        const localInvalid: InvalidFile[] = []
        for (const entry of Object.values(zip.files)) {
          if (entry.dir || !entry.name.toLowerCase().endsWith('.md')) continue
          const r = parseEntry(entry.name, await entry.async('string'), now)
          if (r.ok) localValid.push(r.entry)
          else localInvalid.push({ fileName: r.fileName, reason: r.reason })
        }
        // A broken chats.json or memories.json only skips that part (counted); the diary entries still import.
        const localChats: ChatMessage[] = []
        let localSkipped = 0
        const chatsFile = zip.file('chats.json')
        if (chatsFile) {
          try {
            const items: unknown = JSON.parse(await chatsFile.async('string'))
            if (!Array.isArray(items)) throw new Error('chats.json is not an array')
            for (const item of items) {
              const m = toChatMessage(item)
              if (m) localChats.push(m)
              else localSkipped++
            }
          } catch {
            localChats.length = 0
            localSkipped = 1
          }
        }
        const localMemories: Memory[] = []
        let localSkippedMemories = 0
        const memoriesFile = zip.file('memories.json')
        if (memoriesFile) {
          try {
            const items: unknown = JSON.parse(await memoriesFile.async('string'))
            if (!Array.isArray(items)) throw new Error('memories.json is not an array')
            for (const item of items) {
              const m = toMemory(item)
              if (m) localMemories.push(m)
              else localSkippedMemories++
            }
          } catch {
            localMemories.length = 0
            localSkippedMemories = 1
          }
        }
        for (const entry of localValid) merge(entry)
        invalid.push(...localInvalid)
        for (const m of localChats) if (!chatsById.has(m.id)) chatsById.set(m.id, m)
        skippedChats += localSkipped
        for (const m of localMemories) if (!memoriesById.has(m.id)) memoriesById.set(m.id, m)
        skippedMemories += localSkippedMemories
      } catch {
        invalid.push({ fileName: f.name, reason: 'unreadable' })
      }
    } else if (lower.endsWith('.md')) {
      const r = parseEntry(f.name, decoder.decode(await f.arrayBuffer()), now)
      if (r.ok) merge(r.entry)
      else invalid.push({ fileName: r.fileName, reason: r.reason })
    } else {
      invalid.push({ fileName: f.name, reason: 'unsupportedFile' })
    }
  }

  const valid = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  const chats = [...chatsById.values()].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  const memories = [...memoriesById.values()].sort((a, b) => a.createdAt - b.createdAt)
  return { valid, invalid, chats, skippedChats, memories, skippedMemories }
}

export function buildPreview(parsed: ParsedImport, existing: Set<DateKey>) {
  const conflictCount = parsed.valid.filter((e) => existing.has(e.date)).length
  return { newCount: parsed.valid.length - conflictCount, conflictCount }
}
