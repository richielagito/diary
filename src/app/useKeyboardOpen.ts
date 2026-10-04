import { useEffect, useState } from 'react'

const TEXT_FIELD = 'textarea, [contenteditable="true"], input:not([type="checkbox"], [type="radio"], [type="file"], [type="button"], [type="submit"])'

/**
 * True while an on-screen keyboard covers part of the page: a text field has focus and the visual viewport
 * has shrunk well below its tallest height. Focus alone is not enough: on Android the back gesture closes
 * the keyboard but leaves the field focused, and the page must get its navigation back then.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let tallest = vv.height
    const update = () => {
      tallest = Math.max(tallest, vv.height)
      const typing = document.activeElement?.matches(TEXT_FIELD) ?? false
      setOpen(typing && vv.height < tallest * 0.8)
    }
    const reset = () => {
      tallest = vv.height
      update()
    }
    vv.addEventListener('resize', update)
    window.addEventListener('orientationchange', reset)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      vv.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', reset)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [])
  return open
}
