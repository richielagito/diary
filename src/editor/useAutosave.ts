import { useCallback, useEffect, useRef, useState } from 'react'
import type { DateKey } from '../domain/types'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface Options {
  date: DateKey
  save: (date: DateKey, markdown: string) => Promise<unknown>
  delay?: number
  /** Teks tersimpan yang menjadi dasar tulisan sekarang; dicatat bersama draft yang gagal tersimpan. */
  draftBase?: () => string
}

interface Pending {
  date: DateKey
  markdown: string
}

/** Teks yang gagal tersimpan setelah editornya ditutup, menunggu dibuka lagi di tanggal yang sama. */
const unsavedDrafts = new Map<DateKey, UnsavedDraft>()

/** `base`: teks tersimpan yang menjadi dasar draft, dipakai untuk menggabung kalau yang tersimpan berubah sementara itu. */
export interface UnsavedDraft {
  markdown: string
  base?: string
}

export function rememberUnsavedDraft(date: DateKey, markdown: string, base?: string) {
  unsavedDrafts.set(date, { markdown, base })
}

/** Ambil lalu hapus draft yang belum tersimpan untuk tanggal ini. */
export function takeUnsavedDraft(date: DateKey): UnsavedDraft | undefined {
  const draft = unsavedDrafts.get(date)
  unsavedDrafts.delete(date)
  return draft
}

export function useAutosave({ date, save, delay = 800, draftBase }: Options) {
  const draftBaseRef = useRef(draftBase)
  draftBaseRef.current = draftBase
  const [status, setStatus] = useState<SaveStatus>('idle')
  const pending = useRef<Pending | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(save)
  saveRef.current = save
  const mounted = useRef(true)

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const job = pending.current
    if (!job) return
    if (mounted.current) setStatus('saving')
    try {
      await saveRef.current(job.date, job.markdown)
      unsavedDrafts.delete(job.date)
      if (pending.current === job) pending.current = null
      if (mounted.current) setStatus('saved')
    } catch (err) {
      console.error(err)
      // Teks tetap di pending dan di editor; dicoba lagi pada schedule berikutnya.
      // Kalau editor sudah ditutup, teks disimpan sebagai draft supaya muncul lagi saat tanggal ini dibuka.
      if (mounted.current) setStatus('error')
      // Draft yang sudah dicatat pemanggil (teks gabungan) tidak ditimpa teks mentah.
      else if (!unsavedDrafts.has(job.date)) rememberUnsavedDraft(job.date, job.markdown, draftBaseRef.current?.())
    }
  }, [])

  const schedule = useCallback(
    (markdown: string) => {
      pending.current = { date, markdown }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), delay)
    },
    [date, delay, flush],
  )

  const isDirty = useCallback(() => pending.current !== null, [])

  // Pindah tanggal atau unmount: simpan yang tertunda ke tanggal lamanya.
  useEffect(() => () => void flush(), [date, flush])

  useEffect(() => {
    mounted.current = true
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    // Masih ada teks yang belum tersimpan: minta browser menampilkan konfirmasi keluar halaman.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current === null) return
      e.preventDefault()
      e.returnValue = ''
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      mounted.current = false
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [flush])

  return { schedule, flush, status, isDirty }
}
