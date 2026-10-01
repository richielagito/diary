import type { Memory } from '../../storage/MemoryRepository'
import { MEMORY_MAX, MEMORY_TEXT_MAX } from './limits'
import { applyMemoryOps, parseMemoryOps } from './memoryOps'

const mem = (id: string, text: string, source: Memory['source'] = 'auto'): Memory => ({ id, text, source, createdAt: 1, updatedAt: 1 })
let n = 0
const newId = () => `new-${++n}`
beforeEach(() => {
  n = 0
})

describe('parseMemoryOps', () => {
  test('accepts full and partial shapes', () => {
    expect(parseMemoryOps({ add: ['a'], update: [{ id: 'x', text: 'y' }], remove: ['z'] })).toEqual({
      add: ['a'],
      update: [{ id: 'x', text: 'y' }],
      remove: ['z'],
    })
    expect(parseMemoryOps({ add: ['a'] })).toEqual({ add: ['a'], update: [], remove: [] })
  })
  test('drops malformed items but keeps valid ones', () => {
    expect(parseMemoryOps({ add: ['a', 3], update: [{ id: 'x' }, { id: 'y', text: 't' }], remove: ['z', null] })).toEqual({
      add: ['a'],
      update: [{ id: 'y', text: 't' }],
      remove: ['z'],
    })
  })
  test.each([null, 'teks', [1], { add: 'bukan array' }, { update: {} }])('rejects %j', (v) => {
    expect(parseMemoryOps(v)).toBeNull()
  })
})

describe('applyMemoryOps', () => {
  test('adds trimmed, deduplicated, length-capped memories', () => {
    const r = applyMemoryOps([mem('a', 'Punya kucing Mochi')], { add: ['  punya kucing mochi ', 'Kuliah di ITB', 'x'.repeat(300), ''], update: [], remove: [] }, 9, newId)
    expect(r.puts).toEqual([
      { id: 'new-1', text: 'Kuliah di ITB', source: 'auto', createdAt: 9, updatedAt: 9 },
      { id: 'new-2', text: 'x'.repeat(MEMORY_TEXT_MAX), source: 'auto', createdAt: 9, updatedAt: 9 },
    ])
    expect(r.added).toBe(2)
  })

  test('updates and removes only existing auto memories', () => {
    const current = [mem('a', 'lama'), mem('u', 'milik user', 'user')]
    const r = applyMemoryOps(
      current,
      { add: [], update: [{ id: 'a', text: 'baru' }, { id: 'u', text: 'diubah AI' }, { id: 'ghost', text: 'x' }], remove: ['u', 'ghost'] },
      5,
      newId,
    )
    expect(r.puts).toEqual([{ ...current[0], text: 'baru', updatedAt: 5 }])
    expect(r.removes).toEqual([])
    expect([r.updated, r.removed]).toEqual([1, 0])
  })

  test('remove wins over update for the same id', () => {
    const r = applyMemoryOps([mem('a', 'lama')], { add: [], update: [{ id: 'a', text: 'baru' }], remove: ['a'] }, 5, newId)
    expect(r.removes).toEqual(['a'])
    expect(r.puts).toEqual([])
  })

  test('never exceeds MEMORY_MAX', () => {
    const current = Array.from({ length: MEMORY_MAX - 1 }, (_, i) => mem(`m${i}`, `fakta ${i}`))
    const r = applyMemoryOps(current, { add: ['satu', 'dua', 'tiga'], update: [], remove: [] }, 1, newId)
    expect(r.added).toBe(1)
  })
})
