import { useEffect, useState } from 'react'

const TEXT_FIELD = 'textarea, [contenteditable="true"], input:not([type="checkbox"], [type="radio"], [type="file"], [type="button"], [type="submit"])'

/**
 * iOS Safari scrolls the page up to keep the field above the keyboard and leaves it there when the keyboard
 * closes. The nav coming back makes the page shorter again, so the view is stranded past its end: the title
 * under the status bar and the composer floating over empty space. Pull the scroll back inside the page.
 */
function settle() {
  const end = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  window.scrollTo(0, Math.min(window.scrollY, end))
}

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
    let wasOpen = false
    const update = () => {
      tallest = Math.max(tallest, vv.height)
      const typing = document.activeElement?.matches(TEXT_FIELD) ?? false
      const open = typing && vv.height < tallest * 0.8
      // Once the nav is back in the layout, and again after the keyboard has finished sliding away.
      if (wasOpen && !open) {
        requestAnimationFrame(settle)
        setTimeout(settle, 350)
      }
      wasOpen = open
      setOpen(open)
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
