import { act, renderHook } from '@testing-library/react'
import { rememberUnsavedDraft, takeUnsavedDraft, useAutosave } from './useAutosave'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function setup(save = vi.fn().mockResolvedValue(undefined), date = '2026-09-27') {
  const hook = renderHook((p: { date: string }) => useAutosave({ date: p.date, save }), { initialProps: { date } })
  return { ...hook, save }
}

test('debounces 800ms and saves last value only', async () => {
  const { result, save } = setup()
  act(() => {
    result.current.schedule('a')
    result.current.schedule('ab')
  })
  await act(() => vi.advanceTimersByTimeAsync(799))
  expect(save).not.toHaveBeenCalled()
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenCalledWith('2026-09-27', 'ab')
  expect(result.current.status).toBe('saved')
})

test('flush saves immediately and cancels timer', async () => {
  const { result, save } = setup()
  act(() => result.current.schedule('x'))
  expect(result.current.isDirty()).toBe(true)
  await act(() => result.current.flush())
  expect(save).toHaveBeenCalledWith('2026-09-27', 'x')
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(save).toHaveBeenCalledTimes(1)
  expect(result.current.isDirty()).toBe(false)
})

test('flush with nothing pending does nothing', async () => {
  const { result, save } = setup()
  await act(() => result.current.flush())
  expect(save).not.toHaveBeenCalled()
})

test('pending text is saved to the OLD date when date changes', async () => {
  const { result, save, rerender } = setup()
  act(() => result.current.schedule('tulisan kemarin'))
  rerender({ date: '2026-09-28' })
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(save).toHaveBeenCalledWith('2026-09-27', 'tulisan kemarin')
  expect(save).not.toHaveBeenCalledWith('2026-09-28', expect.anything())
})

test('unmount flushes pending text', async () => {
  const { result, save, unmount } = setup()
  act(() => result.current.schedule('akhir'))
  unmount()
  await vi.advanceTimersByTimeAsync(0)
  expect(save).toHaveBeenCalledWith('2026-09-27', 'akhir')
})

test('visibility hidden flushes', async () => {
  const { result, save } = setup()
  act(() => result.current.schedule('pergi'))
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(save).toHaveBeenCalledWith('2026-09-27', 'pergi')
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

test('error status on failure, retried on next schedule, text never lost', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const save = vi.fn().mockRejectedValueOnce(new Error('QuotaExceededError')).mockResolvedValue(undefined)
  const { result } = setup(save)
  act(() => result.current.schedule('penting'))
  await act(() => vi.advanceTimersByTimeAsync(800))
  expect(result.current.status).toBe('error')
  expect(result.current.isDirty()).toBe(true)
  act(() => result.current.schedule('penting!'))
  await act(() => vi.advanceTimersByTimeAsync(800))
  expect(save).toHaveBeenLastCalledWith('2026-09-27', 'penting!')
  expect(result.current.status).toBe('saved')
})

test('failed save on unmount keeps the text as an unsaved draft', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { result, unmount } = setup(vi.fn().mockRejectedValue(new Error('QuotaExceededError')))
  act(() => result.current.schedule('jangan hilang'))
  unmount()
  await vi.advanceTimersByTimeAsync(0)
  expect(error).toHaveBeenCalled()
  expect(takeUnsavedDraft('2026-09-27')).toBe('jangan hilang')
  expect(takeUnsavedDraft('2026-09-27')).toBeUndefined()
})

test('successful save for a date drops its stored draft', async () => {
  rememberUnsavedDraft('2026-09-27', 'lama')
  const { result } = setup()
  act(() => result.current.schedule('baru'))
  await act(() => vi.advanceTimersByTimeAsync(800))
  expect(takeUnsavedDraft('2026-09-27')).toBeUndefined()
})

test('beforeunload is blocked only while text is pending', async () => {
  const { result } = setup()
  const idle = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(idle)
  expect(idle.defaultPrevented).toBe(false)

  act(() => result.current.schedule('belum'))
  const leaving = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(leaving)
  expect(leaving.defaultPrevented).toBe(true)

  await act(() => vi.advanceTimersByTimeAsync(800))
  const afterSave = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(afterSave)
  expect(afterSave.defaultPrevented).toBe(false)
})
