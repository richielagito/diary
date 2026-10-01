import { describe, expect, it } from 'vitest'
import type { DayEntry, Mood } from '../domain/types'
import { moodLiftTags, newTags, topTags } from './tagStats'

const e = (date: string, tags: string[], mood: Mood | null = null): DayEntry => ({
  date, markdown: '', mood, tags, wordCount: 0, createdAt: 0, updatedAt: 0,
})

describe('topTags', () => {
  it('sorts by days then alphabetically and limits', () => {
    const entries = [e('2026-01-01', ['b', 'a']), e('2026-01-02', ['b', 'c']), e('2026-01-03', ['b', 'a'])]
    expect(topTags(entries)).toEqual([
      { tag: 'b', days: 3 }, { tag: 'a', days: 2 }, { tag: 'c', days: 1 },
    ])
    expect(topTags(entries, 1)).toEqual([{ tag: 'b', days: 3 }])
  })
})

describe('moodLiftTags', () => {
  it('needs 3 mood days and positive lift, ties alphabetical', () => {
    const entries = [
      e('2026-01-01', ['up', 'zed', 'rare'], 5),
      e('2026-01-02', ['up', 'zed', 'rare'], 5),
      e('2026-01-03', ['up', 'zed'], 5),
      e('2026-01-04', ['flat'], 3),
      e('2026-01-05', ['flat'], 3),
      e('2026-01-06', ['flat'], 3),
      e('2026-01-07', [], 1),
      e('2026-01-08', ['nomood'], null),
    ]
    const r = moodLiftTags(entries)
    expect(r.map((x) => x.tag)).toEqual(['up', 'zed'])
    expect(r[0].days).toBe(3)
    expect(r[0].lift).toBeGreaterThan(0)
  })
  it('excludes a lift that would be shown as +0.0', () => {
    const tagged = (n: number) => Array.from({ length: n }, (_, i) => e(`2026-01-${String(i + 1).padStart(2, '0')}`, ['a'], 4))
    // 29 hari bertag mood 4 + 1 hari mood 3: lift 0,033
    expect(moodLiftTags([...tagged(29), e('2026-02-01', [], 3)])).toEqual([])
    // 19 + 1: lift 0,04999… (di bawah 0,05 karena floating point), tampil sebagai 0,0
    expect(moodLiftTags([...tagged(19), e('2026-02-01', [], 3)])).toEqual([])
    // 9 + 1: lift 0,1
    const r = moodLiftTags([...tagged(9), e('2026-02-01', [], 3)])
    expect(r.map((x) => x.tag)).toEqual(['a'])
    expect(r[0].lift).toBeCloseTo(0.1)
  })
  it('excludes zero lift', () => {
    const entries = [e('2026-01-01', ['a'], 3), e('2026-01-02', ['a'], 3), e('2026-01-03', ['a'], 3)]
    expect(moodLiftTags(entries)).toEqual([])
  })
})

describe('newTags', () => {
  it('keeps tags first seen in range, ordered by first date then tag', () => {
    const all = [
      e('2026-01-05', ['old']),
      e('2026-02-02', ['old', 'z']),
      e('2026-02-02', ['a']),
      e('2026-02-10', ['m']),
      e('2026-03-01', ['z', 'late']),
    ]
    expect(newTags(all, '2026-02-01', '2026-02-28')).toEqual(['a', 'z', 'm'])
    expect(newTags(all, '2026-02-01', '2026-02-28', 2)).toEqual(['a', 'z'])
  })
})
