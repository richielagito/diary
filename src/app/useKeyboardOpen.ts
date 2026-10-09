import { useEffect, useState } from 'react'

const TEXT_FIELD = 'textarea, [contenteditable="true"], input:not([type="checkbox"], [type="radio"], [type="file"], [type="button"], [type="submit"])'

/**
 * iOS Safari scrolls the page up to keep the field above the keyboard and leaves it there when the keyboard
 * closes. The nav coming back makes the page shorter again, so the view is stranded past its end: the title
 * under the status bar and the composer floating over empty space. Pull the scroll back inside the page.
 *
 * Mid-conversation the scroll is fine, but WebKit keeps the sticky composer where the keyboard left it until the
 * page scrolls. A 1px nudge there and back makes it place sticky elements again, out of sight.
 */
function settle() {
  const end = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  const y = Math.min(window.scrollY, end)
  window.scrollTo(0, y > 0 ? y - 1 : Math.min(1, end))
  requestAnimationFrame(() => window.scrollTo(0, y))
}

/**
 * True while an on-screen keyboard covers part of the page: a text field has focus and the visual viewport
 * has shrunk well below its tallest height. Focus alone is not enough: the keyboard can close while the field
 * keeps focus (Android's back gesture, iOS's Done), and the page must get its navigation back then.
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
        wasOpen = false // before blur(): its focusout runs update again, which must not repeat this
        // The keyboard's own Done (iOS) or the back gesture (Android) closes it but keeps the field focused, and
        // iOS keeps sticky elements placed for the keyboard while it is. Closing the keyboard means done typing:
        // let go of the field, as a tap elsewhere would.
        if (typing) (document.activeElement as HTMLElement).blur()
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
