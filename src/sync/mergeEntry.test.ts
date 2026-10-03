import type { DayEntry, Mood } from '../domain/types'
import { withDerived } from '../storage/DexieDiaryRepository'
import { MERGE_SEPARATOR, mergeEntry, type EntryBase } from './mergeEntry'

const DATE = '2026-10-01'
const NOW = 9000

const entry = (markdown: string, mood: Mood | null, updatedAt: number, createdAt = 100): DayEntry =>
  withDerived({ date: DATE, markdown, mood, createdAt, updatedAt })
const base = (markdown: string, mood: Mood | null): EntryBase => ({ markdown, mood })

describe('mergeEntry', () => {
  it('keeps a mood from one side and text from the other', () => {
    const result = mergeEntry(entry('tiga ratus kata', null, 10), entry('', 5, 20), null, NOW)
    expect(result).toEqual({ merged: entry('tiga ratus kata', 5, NOW) })
  })

  it('takes the only side that changed', () => {
    const agreed = base('awal', 3)
    expect(mergeEntry(entry('awal', 3, 10), entry('awal lalu lanjut', 4, 20), agreed, NOW)).toBe('remote')
    expect(mergeEntry(entry('awal lalu lanjut', 4, 20), entry('awal', 3, 10), agreed, NOW)).toBe('local')
  })

  it('combines text from one side with a mood from the other', () => {
    const result = mergeEntry(entry('awal lalu lanjut', 3, 20), entry('awal', 5, 30), base('awal', 3), NOW)
    expect(result).toEqual({ merged: entry('awal lalu lanjut', 5, NOW) })
  })

  it('keeps both texts, newest first, when both changed', () => {
    const result = mergeEntry(entry('versi hp', 3, 30), entry('versi laptop', 3, 20), base('awal', 3), NOW)
    expect(result).toEqual({ merged: entry('versi hp\n\nversi laptop', 3, NOW) })
    const swapped = mergeEntry(entry('versi laptop', 3, 20), entry('versi hp', 3, 30), base('awal', 3), NOW)
    expect(swapped).toEqual({ merged: entry('versi hp\n\nversi laptop', 3, NOW) })
  })

  it('stacks both texts on a first sync with no shared base', () => {
    const result = mergeEntry(entry('capek banget', null, 2100), entry('rapat pagi', null, 800), null, NOW)
    expect(result).toEqual({ merged: entry(`capek banget${MERGE_SEPARATOR}rapat pagi`, null, NOW) })
  })

  it('does not stack when one side emptied the text', () => {
    expect(mergeEntry(entry('', 4, 30), entry('masih ada', 4, 20), base('awal', 4), NOW)).toBe('remote')
    expect(mergeEntry(entry('masih ada', 4, 20), entry('  ', 4, 30), base('awal', 4), NOW)).toBe('local')
  })

  it('prefers a set mood over a cleared one, then the newer mood', () => {
    expect(mergeEntry(entry('a', null, 30), entry('a', 4, 20), base('a', 2), NOW)).toBe('remote')
    expect(mergeEntry(entry('a', 5, 20), entry('a', 1, 30), base('a', 2), NOW)).toBe('remote')
    expect(mergeEntry(entry('a', 5, 30), entry('a', 1, 20), base('a', 2), NOW)).toBe('local')
  })

  it('changes nothing when both sides already agree', () => {
    expect(mergeEntry(entry('sama', 4, 10), entry('sama', 4, 99), null, NOW)).toBe('remote')
    expect(mergeEntry(entry('sama', 4, 10), entry('sama', 4, 99), base('lama', 1), NOW)).toBe('remote')
  })

  it('lets an edit win over a deletion', () => {
    expect(mergeEntry(entry('diedit', 3, 20), null, base('awal', 3), NOW)).toBe('local')
    expect(mergeEntry(null, entry('diedit', 3, 20), base('awal', 3), NOW)).toBe('remote')
    expect(mergeEntry(null, null, base('awal', 3), NOW)).toBe('remote')
  })

  it('gives the same result on both devices when the timestamps are equal', () => {
    const one = entry('versi a', 2, 50)
    const two = entry('versi b', 4, 50)
    const fromOne = mergeEntry(one, two, base('awal', 3), NOW)
    const fromTwo = mergeEntry(two, one, base('awal', 3), NOW)
    expect(fromOne).toEqual({ merged: entry('versi b\n\nversi a', 4, NOW) })
    expect(fromTwo).toEqual(fromOne)
  })

  it('breaks a full tie on the mood', () => {
    const one = entry('sama', 2, 50)
    const two = entry('sama', 4, 50)
    expect(mergeEntry(one, two, base('sama', 3), NOW)).toBe('remote')
    expect(mergeEntry(two, one, base('sama', 3), NOW)).toBe('local')
  })

  it('does not stack again when two devices already produced the same merge', () => {
    const merged = `versi b${MERGE_SEPARATOR}versi a`
    expect(mergeEntry(entry(merged, 4, 70), entry(merged, 4, 80), base('versi a', 2), NOW)).toBe('remote')
  })

  it('keeps the indentation of the older text', () => {
    const result = mergeEntry(entry('baru\n\n', 3, 30), entry('\n    kode menjorok', 3, 20), base('awal', 3), NOW)
    expect(result).toEqual({ merged: entry('baru\n\n    kode menjorok', 3, NOW) })
  })

  it('keeps the earliest creation time and recomputes tags and word count', () => {
    const result = mergeEntry(entry('pagi #kerja', null, 30, 500), entry('malam #rumah', null, 20, 200), null, NOW)
    const merged = (result as { merged: DayEntry }).merged
    expect(merged.createdAt).toBe(200)
    expect(merged.updatedAt).toBe(NOW)
    expect(merged).toEqual(withDerived({ date: DATE, markdown: `pagi #kerja${MERGE_SEPARATOR}malam #rumah`, mood: null, createdAt: 200, updatedAt: NOW }))
    expect(merged.tags).toHaveLength(2)
  })
})
