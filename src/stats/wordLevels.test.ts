import { describe, expect, it } from 'vitest'
import { LEVEL_OPACITY, wordLevel, wordThresholds } from './wordLevels'

describe('wordLevels', () => {
  it('quartile thresholds and levels', () => {
    const t = wordThresholds([40, 10, 30, 20])
    expect(t).toEqual([10, 20, 30])
    expect([10, 20, 30, 40].map((w) => wordLevel(w, t))).toEqual([1, 2, 3, 4])
  })
  it('flat data gives null and level 4', () => {
    const t = wordThresholds([5, 5, 5, 5, 5])
    expect(t).toBeNull()
    expect(wordLevel(5, t)).toBe(4)
  })
  it('too few counts gives null', () => expect(wordThresholds([1, 2, 3])).toBeNull())
  it('opacity per level', () => expect(LEVEL_OPACITY).toEqual({ 1: 0.35, 2: 0.55, 3: 0.8, 4: 1 }))
})
