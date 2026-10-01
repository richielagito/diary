import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useRepos } from '../../app/RepoContext'
import { dateKey, parseDateKey } from '../../domain/date'
import type { DateKey, Mood } from '../../domain/types'
import { DiaryEditor, type DiaryEditorHandle } from '../../editor/DiaryEditor'
import { takeUnsavedDraft, useAutosave } from '../../editor/useAutosave'
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

  const save = useCallback((d: DateKey, markdown: string) => diary.save(d, { markdown }), [diary])
  const autosave = useAutosave({ date, save })
  const { schedule } = autosave
  const tagSuggest = useTagSuggestions(() => editorRef.current?.getMarkdown() ?? '')

  useEffect(() => {
    let cancelled = false
    void diary.get(date).then((entry) => {
      if (cancelled) return
      // Teks yang gagal tersimpan waktu halaman ini ditutup menang atas isi lama, lalu disimpan ulang.
      const draft = takeUnsavedDraft(date)
      const markdown = draft ?? entry?.markdown ?? ''
      setLoaded({ markdown })
      if (draft !== undefined) schedule(draft)
      setMood(entry?.mood ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [diary, date, schedule])

  // Perubahan dari tab lain: terapkan hanya kalau editor ini tidak punya perubahan tertunda.
  useEffect(() => {
    if (!loaded) return
    return diary.watch(date, (entry) => {
      if (!moodPending.current) setMood(entry?.mood ?? null)
      const editor = editorRef.current
      if (!editor || autosave.isDirty()) return
      const incoming = entry?.markdown ?? ''
      if (incoming === editor.getMarkdown()) return
      editor.setMarkdown(incoming)
    })
  }, [diary, date, loaded, autosave.isDirty])

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
