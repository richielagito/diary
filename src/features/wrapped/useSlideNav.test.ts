import { act, renderHook } from '@testing-library/react'
import { useSlideNav } from './useSlideNav'

test('next() before any slide exists keeps the index at 0', () => {
  const { result, rerender } = renderHook(({ count }) => useSlideNav(count, () => {}), { initialProps: { count: 0 } })
  act(() => result.current.next())
  expect(result.current.index).toBe(0)
  rerender({ count: 3 })
  expect(result.current.index).toBe(0)
  act(() => result.current.next())
  expect(result.current.index).toBe(1)
})
