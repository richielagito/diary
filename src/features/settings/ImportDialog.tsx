import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseDateKey } from '../../domain/date'
import { useRepos } from '../../app/RepoContext'
import { buildPreview, type ParsedImport } from '../../backup/importFiles'
import type { DateKey } from '../../domain/types'
import type { ImportResult } from '../../storage/DiaryRepository'

interface Props {
  parsed: ParsedImport
  existing: Set<DateKey>
  onClose: () => void
}

const LISTED_CONFLICTS = 8

export function ImportDialog({ parsed, existing, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  // A real modal: focus moves in, the page behind is inert, Esc closes. Older engines get a plain open dialog.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
  }, [])
  const { diary, chats, memories } = useRepos()
  const [mode, setMode] = useState<'skip' | 'overwrite'>('skip')
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'failed' } | { kind: 'done'; result: ImportResult; chatsAdded: number | 'failed'; memoriesAdded: number | 'failed' }>({
    kind: 'idle',
  })
  const { newCount, conflictCount } = buildPreview(parsed, existing)
  // "Overwrite" names the days it would replace, so the choice is not made blind.
  const dayFormat = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
  const conflicts = parsed.valid.filter((e) => existing.has(e.date)).map((e) => e.date).sort()
  const conflictDates =
    conflicts.slice(0, LISTED_CONFLICTS).map((d) => dayFormat.format(parseDateKey(d))).join(', ') +
    (conflicts.length > LISTED_CONFLICTS ? ` ${t('import.andMore', { count: conflicts.length - LISTED_CONFLICTS })}` : '')
  const busy = state.kind === 'busy'

  const run = async () => {
    setState({ kind: 'busy' })
    try {
      const result = await diary.importMany(parsed.valid, mode)
      let chatsAdded: number | 'failed' = 0
      if (parsed.chats.length > 0) {
        // The diary part is already committed here, so a chat failure must not claim nothing changed.
        try {
          chatsAdded = await chats.importMany(parsed.chats)
        } catch (err) {
          console.error(err)
          chatsAdded = 'failed'
        }
      }
      let memoriesAdded: number | 'failed' = 0
      if (parsed.memories.length > 0) {
        try {
          memoriesAdded = await memories.importMany(parsed.memories)
        } catch (err) {
          console.error(err)
          memoriesAdded = 'failed'
        }
      }
      setState({ kind: 'done', result, chatsAdded, memoriesAdded })
    } catch {
      setState({ kind: 'failed' })
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="import-title"
      className="import-dialog"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
    >
      <h2 id="import-title">{t('import.title')}</h2>
      <ul>
        <li>{t('import.newCount', { count: newCount })}</li>
        <li>{t('import.conflictCount', { count: conflictCount })}</li>
        {parsed.chats.length > 0 && <li>{t('import.chatCount', { count: parsed.chats.length })}</li>}
        {parsed.memories.length > 0 && <li>{t('import.memoryCount', { count: parsed.memories.length })}</li>}
        {parsed.invalid.length > 0 && <li>{t('import.invalidCount', { count: parsed.invalid.length })}</li>}
        {parsed.skippedChats > 0 && <li>{t('import.skippedChats', { count: parsed.skippedChats })}</li>}
        {parsed.skippedMemories > 0 && <li>{t('import.skippedMemories', { count: parsed.skippedMemories })}</li>}
      </ul>
      {parsed.invalid.length > 0 && (
        <ul>
          {parsed.invalid.map((f) => (
            <li key={f.fileName}>{`${f.fileName}: ${t(`import.reason.${f.reason}`)}`}</li>
          ))}
        </ul>
      )}

      {state.kind === 'done' ? (
        <>
          <p role="status">{t('import.done', { ...state.result })}</p>
          {state.chatsAdded === 'failed' ? (
            <p role="alert">{t('import.chatsFailed')}</p>
          ) : (
            parsed.chats.length > 0 && <p>{t('import.doneChats', { count: state.chatsAdded })}</p>
          )}
          {state.memoriesAdded === 'failed' ? (
            <p role="alert">{t('import.memoriesFailed')}</p>
          ) : (
            parsed.memories.length > 0 && <p>{t('import.doneMemories', { count: state.memoriesAdded })}</p>
          )}
          <button type="button" className="primary" autoFocus onClick={onClose}>
            {t('import.close')}
          </button>
        </>
      ) : (
        <>
          {conflictCount > 0 && (
            <fieldset>
              <legend>{t('import.onConflict')}</legend>
              <label>
                <input type="radio" name="conflict" checked={mode === 'skip'} onChange={() => setMode('skip')} />
                {t('import.skip')}
              </label>
              <label>
                <input
                  type="radio"
                  name="conflict"
                  checked={mode === 'overwrite'}
                  onChange={() => setMode('overwrite')}
                />
                {t('import.overwrite')}
              </label>
              {mode === 'overwrite' && <small>{t('import.overwriteHint', { dates: conflictDates })}</small>}
            </fieldset>
          )}
          {state.kind === 'failed' && <p role="alert">{t('import.failed')}</p>}
          <p className="dialog-actions">
            <button type="button" onClick={onClose} disabled={busy}>
              {t('import.cancel')}
            </button>
            <button type="button" className="primary" onClick={() => void run()} disabled={busy || (parsed.valid.length === 0 && parsed.chats.length === 0 && parsed.memories.length === 0)}>
              {t('import.confirm')}
            </button>
          </p>
        </>
      )}
    </dialog>
  )
}
