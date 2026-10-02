import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useRepos } from '../../app/RepoContext'
import { dateKey, parseDateKey } from '../../domain/date'
import { mergeText } from '../../domain/mergeText'
import { StaleTextError } from '../../storage/DiaryRepository'
import type { DateKey, Mood } from '../../domain/types'
import { DiaryEditor, type DiaryEditorHandle } from '../../editor/DiaryEditor'
import { rememberUnsavedDraft, takeUnsavedDraft, useAutosave } from '../../editor/useAutosave'
import { useExport } from '../../backup/useExport'
import { BackupBanner } from './BackupBanner'
import { MoodPicker } from './MoodPicker'
import { SaveStatusText } from './SaveStatus'
import { useTagSuggestions } from './useTagSuggestions'

export function DayPage({ date }: { date: DateKey }) {
  const { t, i18n } = useTranslation()
  const { diary } = useRepos()
  const exportNow = useExport()
  const editorRef = useRef<DiaryEditorHandle>(null)
  const [loaded, setLoaded] = useState<{ markdown: string } | null>(null)
  const [mood, setMood] = useState<Mood | null>(null)
  const [moodError, setMoodError] = useState(false)
  /** True sejak mood diklik sampai tersimpan; selama itu watch tidak menimpa mood di layar. */
  const moodPending = useRef(false)

  /** Teks tersimpan yang terakhir sudah tercakup di editor ini: dasar gabung kalau yang tersimpan berubah dari luar. */
  const base = useRef('')
  /** Teks yang sedang ditulis, supaya kabar tentang tulisan sendiri tidak dikira perubahan dari luar. */
  const sending = useRef<string | null>(null)
  const alive = useRef(true)
  const absorbRef = useRef<(incoming: string) => void>(() => {})

  const write = useCallback(
    async (d: DateKey, markdown: string) => {
      sending.current = markdown
      try {
        const entry = await diary.save(d, { markdown, baseMarkdown: base.current })
        base.current = entry?.markdown ?? ''
      } catch (err) {
        if (!(err instanceof StaleTextError)) throw err
        // Yang tersimpan berubah dari luar (sync atau tab lain) sejak editor ini memuatnya: gabung, jangan timpa.
        if (alive.current) {
          absorbRef.current(err.stored)
        } else {
          const merged = mergeText(markdown, err.stored, base.current)
          try {
            const entry = await diary.save(d, { markdown: merged, baseMarkdown: err.stored })
            base.current = entry?.markdown ?? ''
          } catch (retryErr) {
            // Gagal tersimpan setelah halaman ditutup: yang diingat sebagai draft adalah teks gabungan.
            rememberUnsavedDraft(d, merged, retryErr instanceof StaleTextError ? retryErr.stored : err.stored)
            throw retryErr
          }
        }
      } finally {
        sending.current = null
      }
    },
    [diary],
  )
  /** Tulisan halaman ini dijalankan berurutan, supaya dasar gabung dibaca saat tulisan dimulai, bukan saat diminta. */
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const save = useCallback(
    (d: DateKey, markdown: string) => {
      const run = queue.current.then(() => write(d, markdown))
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
    void diary.get(date).then((entry) => {
      if (cancelled) return
      // Teks yang gagal tersimpan waktu halaman ini ditutup menang atas isi lama, lalu disimpan ulang.
      const draft = takeUnsavedDraft(date)
      const stored = entry?.markdown ?? ''
      base.current = stored
      // Draft tanpa dasar yang diketahui menang (mergeText dengan dasar = tersimpan mengembalikan draft).
      const markdown = draft ? mergeText(draft.markdown, stored, draft.base ?? stored) : stored
      setLoaded({ markdown })
      if (draft) schedule(markdown)
      setMood(entry?.mood ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [diary, date, schedule])

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


  const heading = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parseDateKey(date))
  const isToday = date === dateKey()

  return (
    <article>
      <BackupBanner />
      <header className="day-header">
        <h1>{heading}</h1>
        {!isToday && <Link to="/">{t('day.backToToday')}</Link>}
        <SaveStatusText status={moodError ? 'error' : autosave.status} onExport={() => void exportNow()} />
      </header>
      <MoodPicker value={mood} onChange={onMood} />
      {loaded && (
        <DiaryEditor
          ref={editorRef}
          initialMarkdown={loaded.markdown}
          placeholder={t('day.placeholder')}
          label={t('day.editorLabel')}
          onChange={autosave.schedule}
          onBlur={() => void autosave.flush()}
          tagSuggest={tagSuggest}
        />
      )}
    </article>
  )
}
