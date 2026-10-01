import type { Memory } from '../../storage/MemoryRepository'
import { MEMORY_MAX, MEMORY_TEXT_MAX } from './limits'

export interface MemoryOps {
  add: string[]
  update: { id: string; text: string }[]
  remove: string[]
}

export interface AppliedOps {
  puts: Memory[]
  removes: string[]
  added: number
  updated: number
  removed: number
}

function stringArray(value: unknown): string[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  return value.filter((s): s is string => typeof s === 'string')
}

/** Validasi bentuk operasi dari model. Item rusak dibuang; bentuk yang salah total mengembalikan null. */
export function parseMemoryOps(value: unknown): MemoryOps | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  const add = stringArray(v.add)
  const remove = stringArray(v.remove)
  if (!add || !remove) return null
  if (v.update !== undefined && !Array.isArray(v.update)) return null
  const update = ((v.update as unknown[] | undefined) ?? [])
    .filter((u): u is { id: string; text: string } => {
      if (!u || typeof u !== 'object') return false
      const r = u as Record<string, unknown>
      return typeof r.id === 'string' && typeof r.text === 'string'
    })
    .map((u) => ({ id: u.id, text: u.text }))
  return { add, update, remove }
}

const clean = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, MEMORY_TEXT_MAX)

/** Hitung perubahan tanpa menyentuh storage. Memori bersumber 'user' tidak pernah diubah atau dihapus. */
export function applyMemoryOps(
  current: Memory[],
  ops: MemoryOps,
  now: number,
  newId: () => string = () => crypto.randomUUID(),
): AppliedOps {
  const byId = new Map(current.map((m) => [m.id, m]))
  const removes: string[] = []
  for (const id of new Set(ops.remove)) {
    if (byId.get(id)?.source === 'auto') removes.push(id)
  }
  const removed = new Set(removes)

  const puts: Memory[] = []
  const updatedIds = new Set<string>()
  for (const u of ops.update) {
    const m = byId.get(u.id)
    const text = clean(u.text)
    if (!m || m.source !== 'auto' || removed.has(u.id) || updatedIds.has(u.id) || !text || text === m.text) continue
    updatedIds.add(u.id)
    puts.push({ ...m, text, updatedAt: now })
  }
  const updated = puts.length

  const known = new Set(current.filter((m) => !removed.has(m.id)).map((m) => m.text.toLowerCase()))
  for (const p of puts) known.add(p.text.toLowerCase())
  let count = current.length - removed.size
  let added = 0
  for (const raw of ops.add) {
    const text = clean(raw)
    if (!text || known.has(text.toLowerCase()) || count >= MEMORY_MAX) continue
    known.add(text.toLowerCase())
    puts.push({ id: newId(), text, source: 'auto', createdAt: now, updatedAt: now })
    count++
    added++
  }
  return { puts, removes, added, updated, removed: removes.length }
}
