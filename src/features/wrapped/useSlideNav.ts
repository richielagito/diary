import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'

const SWIPE_MIN = 50

/** Ada teks yang sedang diseleksi (mis. isi surat): gestur itu bukan navigasi. */
const hasSelection = () => (window.getSelection()?.toString() ?? '') !== ''

/** Navigasi slide: keyboard, tap kiri/kanan, dan swipe. Index selalu di [0, count-1]. */
export function useSlideNav(count: number, onClose: () => void) {
  const [raw, setRaw] = useState(0)
  const index = Math.min(raw, Math.max(count - 1, 0))
  const start = useRef<{ id: number; x: number; y: number } | null>(null)
  // Click berikutnya bukan navigasi: sudah dipakai swipe, atau hanya menutup seleksi teks
  const skipClick = useRef(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const next = useCallback(() => setRaw(Math.max(0, Math.min(index + 1, count - 1))), [index, count])
  const prev = useCallback(() => setRaw(Math.max(index - 1, 0)), [index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return closeRef.current()
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === ' ') {
        // Spasi pada tombol/link tetap mengaktifkannya
        if ((e.target as Element | null)?.closest?.('button, a, input, textarea')) return
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev])

  const bind = {
    onPointerDown: (e: PointerEvent) => {
      // Swipe sentuh tidak selalu diikuti click, jadi tanda lama dibuang di tiap gestur baru
      skipClick.current = hasSelection()
      // Jari kedua (cubit untuk zoom) membatalkan gestur, bukan memulai swipe baru
      if (start.current && start.current.id !== e.pointerId) {
        start.current = null
        return
      }
      // Geser di area data-no-nav (mis. amplop surat) bukan swipe slide
      start.current = (e.target as Element).closest('[data-no-nav]') ? null : { id: e.pointerId, x: e.clientX, y: e.clientY }
    },
    // Browser mengambil alih gestur (mis. scroll): bukan swipe
    onPointerCancel: () => {
      start.current = null
    },
    onPointerUp: (e: PointerEvent) => {
      const s = start.current
      if (s && s.id !== e.pointerId) return
      start.current = null
      // Drag yang menyeleksi teks bukan swipe
      if (!s || hasSelection()) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
        skipClick.current = true
        if (dx < 0) next()
        else prev()
      }
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (skipClick.current || hasSelection()) {
        skipClick.current = false
        return
      }
      if ((e.target as Element).closest('[data-no-nav], button, a')) return
      const rect = e.currentTarget.getBoundingClientRect()
      if (e.clientX - rect.left < rect.width * 0.3) prev()
      else next()
    },
  }

  return { index, next, prev, bind }
}
