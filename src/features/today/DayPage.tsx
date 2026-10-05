import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import { ChevronLeft, ChevronRight } from '../../app/icons'
import { useRepos } from '../../app/RepoContext'
import { addDays, dateKey, parseDateKey } from '../../domain/date'
import { mergeText } from '../../domain/mergeText'
import { StaleTextError } from '../../storage/DiaryRepository'
import type { DateKey, Mood } from '../../domain/types'
import { DiaryEditor, type DiaryEditorHandle } from '../../editor/DiaryEditor'
import { takeUnsavedDraft, useAutosave } from '../../editor/useAutosave'
import { useExport } from '../../backup/useExport'
import { BackupBanner } from './BackupBanner'
import { MoodPicker } from './MoodPicker'
import { SaveStatusText } from './SaveStatus'
import { useTagSuggestions } from './useTagSuggestions'

/**
 * Menempelkan draft (teks dan dasarnya) pada error, supaya useAutosave mengingat yang benar kalau halaman sudah ditutup.
 * Tidak enumerable: error ini dicatat ke konsol, dan teks diary tidak boleh ikut tercetak.
 */
function withDraft(err: unknown, draft: { markdown: string; base: string }) {
  const target = typeof err === 'object' && err !== null ? err : new Error(String(err))
  return Object.defineProperty(target, 'draft', { value: draft, configurable: true })
}

export function DayPage({ date }: { date: DateKey }) {
  const { t, i18n } = useTranslation()
  const { diary } = useRepos()
  const exportNow = useExport()
  const editorRef = useRef<DiaryEditorHandle>(null)
  const [loaded, setLoaded] = useState<{ markdown: string } | null>(null)
  const [mood, setMood] = useState<Mood | null>(null)
  const [moodError, setMoodError] = useState(false)
  /** The day already had an entry when it opened: before any new edit, its status reads as saved, not blank. */
  const [stored, setStored] = useState(false)
  /** True sejak mood diklik sampai tersimpan; selama itu watch tidak menimpa mood di layar. */
  const moodPending = useRef(false)

  /** Teks tersimpan yang terakhir sudah tercakup di editor ini: dasar gabung kalau yang tersimpan berubah dari luar. */
  const base = useRef('')
  /** Teks yang sedang ditulis, supaya kabar tentang tulisan sendiri tidak dikira perubahan dari luar. */
  const sending = useRef<string | null>(null)
  const alive = useRef(true)
  const absorbRef = useRef<(incoming: string) => void>(() => {})
  /** True while the page shows the first-run welcome text, which is never stored unless the user edits it. */
  const [welcome, setWelcome] = useState(false)

  /** Dinaikkan tiap kali `base` diisi teks yang bukan tulisan editor ini sendiri (gabungan dari luar). */
  const foreign = useRef(0)

  /** Teks dan dasarnya berjalan bersama: tulisan yang antre membawa dasar saat diminta kalau sejak itu ada teks asing masuk. */
  const write = useCallback(
    async (d: DateKey, markdown: string, req: { base: string; foreign: number }) => {
      // Dasar bergeser karena tulisan sendiri (teks ini sudah memuatnya): pakai yang terbaru. Karena teks asing: pakai dasar lama, repositori akan menolak.
      const used = foreign.current === req.foreign ? base.current : req.base
      sending.current = markdown
      try {
        const entry = await diary.save(d, { markdown, baseMarkdown: used })
        base.current = entry?.markdown ?? ''
      } catch (err) {
        if (!(err instanceof StaleTextError)) throw withDraft(err, { markdown, base: used })
        // Yang tersimpan berubah dari luar (sync atau tab lain) sejak editor ini memuatnya: gabung, jangan timpa.
        // Saat halaman ditutup React melepas editor sebelum `alive` menjadi false; tanpa editor, absorb tidak bisa menggabung.
        if (alive.current && editorRef.current) {
          absorbRef.current(err.stored)
        } else {
          const merged = mergeText(markdown, err.stored, used)
          try {
            const entry = await diary.save(d, { markdown: merged, baseMarkdown: err.stored })
            base.current = entry?.markdown ?? ''
            foreign.current++
          } catch (retryErr) {
            // Gagal setelah halaman ditutup: draft adalah teks gabungan beserta teks tersimpan yang sudah dimuatnya. Tidak dicoba lagi.
            throw withDraft(retryErr, { markdown: merged, base: err.stored })
          }
        }
      } finally {
        sending.current = null
      }
    },
    [diary],
  )
  /** Tulisan halaman ini dijalankan berurutan. */
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const save = useCallback(
    (d: DateKey, markdown: string) => {
      const req = { base: base.current, foreign: foreign.current }
      const run = queue.current.then(() => write(d, markdown, req))
      queue.current = run.catch(() => {})
      return run
    },
    [write],
  )
  const autosave = useAutosave({ date, save, draftBase: () => base.current })
  const { schedule } = autosave
  const tagSuggest = useTagSuggestions(() => editorRef.current?.getMarkdown() ?? '')

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /** Versi tersimpan yang baru terlihat. Tanpa ketikan tertunda: tampilkan. Dengan ketikan tertunda: gabung di editor lalu simpan. */
  absorbRef.current = (incoming: string) => {
    const editor = editorRef.current
    if (!editor) return
    if (incoming === base.current || incoming === sending.current) {
      base.current = incoming
      return
    }
    foreign.current++
    if (!autosave.isDirty()) {
      base.current = incoming
      if (incoming !== editor.getMarkdown()) editor.setMarkdown(incoming)
      return
    }
    const current = editor.getMarkdown()
    const merged = mergeText(current, incoming, base.current)
    base.current = incoming
    if (merged !== current) editor.setMarkdown(merged)
    schedule(merged)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const entry = await diary.get(date)
      // First run: today's page of an empty diary opens on a welcome text. It is stored only once the user edits it,
      // so a new device that later signs in does not push it into an account that already has a diary.
      const firstRun = !entry && date === dateKey() && (await diary.isEmpty())
      if (cancelled) return
      // Teks yang gagal tersimpan waktu halaman ini ditutup menang atas isi lama, lalu disimpan ulang.
      const draft = takeUnsavedDraft(date)
      const stored = entry?.markdown ?? ''
      base.current = stored
      // Draft tanpa dasar yang diketahui menang (mergeText dengan dasar = tersimpan mengembalikan draft).
      const markdown = draft ? mergeText(draft.markdown, stored, draft.base ?? stored) : firstRun ? t('day.welcome') : stored
      setWelcome(firstRun && !draft)
      setLoaded({ markdown })
      setStored(!!entry)
      if (draft) schedule(markdown)
      setMood(entry?.mood ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [diary, date, schedule, t])

  // Perubahan dari luar (sync atau tab lain) untuk tanggal ini.
  useEffect(() => {
    if (!loaded) return
    return diary.watch(date, (entry) => {
      if (!moodPending.current) setMood(entry?.mood ?? null)
      absorbRef.current(entry?.markdown ?? '')
    })
  }, [diary, date, loaded])

  const onMood = (m: Mood | null) => {
    moodPending.current = true
    setMood(m)
    // Mood tetap tampil walau gagal tersimpan; banner error muncul seperti pada teks.
    void diary.save(date, { mood: m }).then(
      () => {
        moodPending.current = false
        setMoodError(false)
      },
      () => setMoodError(true),
    )
  }

  /** The guide was never stored, so clearing it only empties the editor. */
  const clearWelcome = () => {
    if (!welcome) return
    setWelcome(false)
    editorRef.current?.setMarkdown('')
  }

  const today = dateKey()
  // "Minggu, 4 Okt": the year shows only for another year. Day, month and year stay on one line: a narrow screen breaks after the weekday.
  let afterWeekday = 0
  const heading = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: date.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
  })
    .formatToParts(parseDateKey(date))
    .map((p) => {
      if (p.type === 'weekday') afterWeekday = 1
      else if (afterWeekday && p.type === 'literal' && afterWeekday++ > 1) return p.value.replace(/ /g, ' ')
      return p.value
    })
    .join('')
  const isToday = date === today
  const prev = `/day/${addDays(date, -1)}`
  const next = addDays(date, 1) === today ? '/' : `/day/${addDays(date, 1)}`

  // Arrow keys page through days only when nothing interactive has focus: fields, buttons and links keep their arrows.
  const navigate = useNavigate()
  const stepped = { stepped: true }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return
      const el = e.target as HTMLElement | null
      if (el?.closest('a, button, input, textarea, select, summary, [contenteditable="true"], [role="group"]')) return
      if (e.key === 'ArrowLeft') navigate(prev, { state: { stepped: true } })
      else if (e.key === 'ArrowRight' && !isToday) navigate(next, { state: { stepped: true } })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, prev, next, isToday])

  // After stepping to another day, focus lands on its date, so a screen reader hears where it arrived.
  const location = useLocation()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if ((location.state as { stepped?: boolean } | null)?.stepped) headingRef.current?.focus()
  }, [location.state])

  return (
    <article>
      <BackupBanner />
      <header className="day-header">
        <div className="day-title">
          <h1 ref={headingRef} tabIndex={-1}>
            {heading}
          </h1>
          <SaveStatusText
            status={moodError ? 'error' : autosave.status === 'idle' && stored ? 'saved' : autosave.status}
            onExport={() => void exportNow()}
            onRetry={() => {
              if (moodError) onMood(mood)
              void autosave.flush()
            }}
          />
        </div>
        <div className="day-step">
          <Link className="icon-btn" to={prev} state={stepped} aria-label={t('day.prevDay')} title={`${t('day.prevDay')} (←)`} aria-keyshortcuts="ArrowLeft">
            <ChevronLeft />
          </Link>
          {isToday ? (
            <a className="icon-btn" role="link" aria-disabled="true" aria-label={t('day.nextDay')}>
              <ChevronRight />
            </a>
          ) : (
            <Link className="icon-btn" to={next} state={stepped} aria-label={t('day.nextDay')} title={`${t('day.nextDay')} (→)`} aria-keyshortcuts="ArrowRight">
              <ChevronRight />
            </Link>
          )}
        </div>
      </header>
      <MoodPicker value={mood} onChange={onMood} past={!isToday} />
      {/* The guide gives way as soon as the user goes to write: this button or a tap in the editor clears it. It stays in Settings. */}
      {welcome && (
        <p className="day-welcome">
          <button
            type="button"
            onClick={() => {
              clearWelcome()
              editorRef.current?.focus()
            }}
          >
            {t('day.startWriting')}
          </button>
        </p>
      )}
      {loaded && (
        <DiaryEditor
          ref={editorRef}
          initialMarkdown={loaded.markdown}
          placeholder={t(isToday ? 'day.placeholder' : 'day.placeholderPast')}
          label={t('day.editorLabel')}
          onChange={(markdown) => {
            setWelcome(false)
            autosave.schedule(markdown)
          }}
          onBlur={() => void autosave.flush()}
          onFocus={clearWelcome}
          tagSuggest={tagSuggest}
        />
      )}
    </article>
  )
}
