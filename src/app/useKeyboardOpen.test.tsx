import { act, renderHook } from '@testing-library/react'
import { useKeyboardOpen } from './useKeyboardOpen'

/** A visual viewport whose height the test sets, standing in for the on-screen keyboard. */
function fakeViewport(height: number) {
  const vv = Object.assign(new EventTarget(), { height })
  vi.stubGlobal('visualViewport', vv)
  return {
    resize(h: number) {
      vv.height = h
      vv.dispatchEvent(new Event('resize'))
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

test('a closing keyboard pulls a scroll stranded past the end of the page back inside it', () => {
  vi.useFakeTimers()
  const viewport = fakeViewport(800)
  const field = document.body.appendChild(document.createElement('textarea'))
  const { result } = renderHook(() => useKeyboardOpen())

  act(() => {
    field.focus()
    viewport.resize(450)
  })
  expect(result.current).toBe(true)

  // The page is 800px tall again once the nav is back, but iOS left the scroll where the keyboard put it.
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(800)
  vi.stubGlobal('innerHeight', 800)
  vi.stubGlobal('scrollY', 350)
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

  act(() => field.blur())
  expect(result.current).toBe(false)
  act(() => vi.advanceTimersByTime(400))
  expect(scrollTo).toHaveBeenCalledWith(0, 0)
})
