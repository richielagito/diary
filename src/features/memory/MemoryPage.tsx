import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { ChevronLeft, ChevronRight } from '../../app/icons'
import { ConfirmButton } from '../../app/ConfirmButton'
import { useInitial } from '../../app/useInitial'
import { useRepos, useSettings } from '../../app/RepoContext'
import { extractMemories, type ExtractResult } from '../../ai/memory/extractMemories'
import { MEMORY_MAX, MEMORY_TEXT_MAX } from '../../ai/memory/limits'
import { fastConfig } from '../../ai/provider/fastConfig'
import { parseDateKey } from '../../domain/date'
import type { Memory } from '../../storage/MemoryRepository'
import type { Summary } from '../../storage/SummaryRepository'

/** Menjalankan satu perubahan penyimpanan; gagal dicatat dan ditampilkan, berhasil menghapus peringatan. */
type Save = (action: () => Promise<unknown>) => Promise<boolean>

function MemoryItem({ memory, index, save }: { memory: Memory; index: number; save: Save }) {
  const { t } = useTranslation()
  const { memories } = useRepos()
  const [text, setText] = useState(memory.text)
  const ref = useRef<HTMLTextAreaElement>(null)
  // Selama tidak sedang diedit, tampilkan teks tersimpan agar nilai lokal usang tidak menimpanya.
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(memory.text)
  }, [memory.text])
  return (
    <li>
      <textarea
        ref={ref}
        aria-label={t('memory.itemLabel', { n: index + 1 })}
        maxLength={MEMORY_TEXT_MAX}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          // Kosong berarti user sedang mengetik ulang; hapus hanya lewat tombol.
          const next = e.target.value.trim()
          if (next) void save(() => memories.edit(memory.id, next))
        }}
        onBlur={() => {
          if (!text.trim()) setText(memory.text)
        }}
      />{' '}
      <small>{memory.source === 'user' ? t('memory.byYou') : t('memory.byAi')}</small>{' '}
      <ConfirmButton
        muted
        label={t('memory.delete')}
        name={memory.text}
        question={t('memory.deleteOne')}
        confirmLabel={t('common.yesDelete')}
        onConfirm={() => void save(() => memories.remove(memory.id))}
      />
    </li>
  )
}

export function MemoryPage() {
  const { t, i18n } = useTranslation()
  const { memories, summaries, letters, chats, settingsStore, createProvider } = useRepos()
  const settings = useSettings()
  // Read before the page shows, so it never opens on the empty notes first.
  const initial = useInitial(memories, 'memory-page', async () => ({
    memories: await memories.list().catch((err: unknown) => {
      console.error(err)
      return []
    }),
    summaries: await summaries.list().catch((err: unknown) => {
      console.error(err)
      return []
    }),
  }))
  const [memoryList, setMemoryList] = useState<Memory[]>(initial.memories)
  const [summaryList, setSummaryList] = useState<Summary[]>(initial.summaries)
  const [draft, setDraft] = useState('')
  const [refresh, setRefresh] = useState<ExtractResult | { status: 'running' } | null>(null)
  const [storageFailed, setStorageFailed] = useState(false)

  useEffect(() => memories.watch(setMemoryList), [memories])
  useEffect(() => summaries.watch(setSummaryList), [summaries])

  const save: Save = async (action) => {
    try {
      await action()
      setStorageFailed(false)
      return true
    } catch (err) {
      console.error(err)
      setStorageFailed(true)
      return false
    }
  }

  const full = memoryList.length >= MEMORY_MAX

  const add = async () => {
    const text = draft.trim()
    if (!text || full) return
    if (await save(() => memories.add(text, 'user'))) setDraft('')
  }

  const clearAll = () => save(() => Promise.all([memories.clear(), letters.clear()]))

  const toggleMemory = (enabled: boolean) =>
    save(async () => {
      // Chat yang ditulis saat memori mati tidak boleh diekstrak setelah dinyalakan lagi: cursor dulu, baru toggle.
      if (enabled && !settings.aiMemoryEnabled) await settingsStore.set('memoryCursor', Date.now())
      await settingsStore.set('aiMemoryEnabled', enabled)
    })

  const runRefresh = async () => {
    if (!settings.ai || !settings.aiMemoryEnabled) return
    setRefresh({ status: 'running' })
    try {
      setRefresh(await extractMemories({ chats, memories, settingsStore, provider: createProvider(fastConfig(settings.ai)), minUserMessages: 1 }))
    } catch (err) {
      console.error(err)
      setRefresh({ status: 'error', kind: 'unknown' })
    }
  }

  const dayFormat = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })
  const monthFormat = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' })
  const summaryLabel = (s: Summary) =>
    s.kind === 'week'
      ? t('memory.weekOf', { date: dayFormat.format(parseDateKey(s.periodStart)) })
      : t('memory.monthOf', { date: monthFormat.format(parseDateKey(s.periodStart)) })

  // Back goes where the page was opened from: the chat details or the AI settings.
  const back = (useLocation().state as { from?: string } | null)?.from ?? '/chat'
  return (
    <section className="memory">
      <header className="back-header">
        <Link className="icon-btn" to={back} aria-label={t('common.back')}>
          <ChevronLeft />
        </Link>
        <h1>{t('memory.title')}</h1>
      </header>
      <p>{t('memory.intro')}</p>
      <details className="memory-how">
        <summary>
          <ChevronRight />
          {t('memory.how')}
        </summary>
        <p>{t('memory.privacy')}</p>
      </details>
      {storageFailed && <p role="alert">{t('aiError.storage')}</p>}
      <div className="toggles">
        <label>
          <input
            type="checkbox"
            checked={settings.aiMemoryEnabled}
            onChange={(e) => void toggleMemory(e.target.checked)}
          />{' '}
          {t('memory.enable')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.aiSummariesEnabled}
            onChange={(e) => {
              const enabled = e.target.checked
              void save(() => settingsStore.set('aiSummariesEnabled', enabled))
            }}
          />{' '}
          {t('memory.enableSummaries')}
        </label>
      </div>

      <h2>{t('memory.listTitle')}</h2>
      {memoryList.length === 0 ? (
        <p>{t('memory.empty')}</p>
      ) : (
        <ul className="memory-list">
          {memoryList.map((m, i) => (
            <MemoryItem key={m.id} memory={m} index={i} save={save} />
          ))}
        </ul>
      )}
      <p className="inline-form">
        <input
          aria-label={t('memory.addLabel')}
          placeholder={t('memory.addLabel')}
          maxLength={MEMORY_TEXT_MAX}
          value={draft}
          disabled={full}
          onChange={(e) => setDraft(e.target.value)}
        />{' '}
        <button type="button" onClick={() => void add()} disabled={full || !draft.trim()}>
          {t('memory.add')}
        </button>
      </p>
      {full && <p>{t('memory.full', { max: MEMORY_MAX })}</p>}
      <p>
        <button type="button" onClick={() => void runRefresh()} disabled={!settings.ai || !settings.aiMemoryEnabled || refresh?.status === 'running'}>
          {refresh?.status === 'running' ? t('memory.refreshing') : t('memory.refresh')}
        </button>
      </p>
      {!settings.ai && <p>{t('memory.needsAi')}</p>}
      {!settings.aiMemoryEnabled && <p>{t('memory.refreshOff')}</p>}
      {refresh?.status === 'ok' && <p role="status">{t('memory.refreshDone', refresh)}</p>}
      {refresh?.status === 'nothing' && <p role="status">{t('memory.refreshNothing')}</p>}
      {refresh?.status === 'busy' && <p role="status">{t('memory.refreshBusy')}</p>}
      {refresh?.status === 'error' && (
        <p role="alert">{refresh.kind === 'format' ? t('memory.refreshFormat') : t(`aiError.${refresh.kind}`)}</p>
      )}

      <h2 id="summaries-title">{t('memory.summariesTitle')}</h2>
      {summaryList.length === 0 ? (
        <p>{t('memory.summariesEmpty')}</p>
      ) : (
        <ul aria-labelledby="summaries-title" className="summary-list">
          {[...summaryList]
            .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
            .map((s) => (
              <li key={s.id}>
                <strong>{summaryLabel(s)}</strong>
                <p>{s.text}</p>
                <ConfirmButton
                  muted
                  label={t('memory.delete')}
                  name={summaryLabel(s)}
                  question={t('memory.deleteSummary')}
                  confirmLabel={t('common.yesDelete')}
                  onConfirm={() => void save(() => summaries.remove(s.id))}
                />
              </li>
            ))}
        </ul>
      )}

      {/* The one irreversible action on the page sits at its end, away from "Perbarui". */}
      {memoryList.length > 0 && (
        <ConfirmButton
          className="settings-danger"
          label={t('memory.clearAll')}
          question={t('memory.clearConfirm')}
          confirmLabel={t('common.yesDelete')}
          onConfirm={() => void clearAll()}
        />
      )}
    </section>
  )
}
