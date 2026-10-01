import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRepos } from '../../app/RepoContext'
import { buildPreview, type ParsedImport } from '../../backup/importFiles'
import type { DateKey } from '../../domain/types'
import type { ImportResult } from '../../storage/DiaryRepository'

interface Props {
  parsed: ParsedImport
  existing: Set<DateKey>
  onClose: () => void
}

export function ImportDialog({ parsed, existing, onClose }: Props) {
  const { t } = useTranslation()
  const { diary, chats, memories } = useRepos()
  const [mode, setMode] = useState<'skip' | 'overwrite'>('skip')
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'failed' } | { kind: 'done'; result: ImportResult; chatsAdded: number | 'failed'; memoriesAdded: number | 'failed' }>({
    kind: 'idle',
  })
  const { newCount, conflictCount } = buildPreview(parsed, existing)

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
    <div role="dialog" aria-modal="true" aria-labelledby="import-title" className="banner" style={{ display: 'block' }}>
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
          <button type="button" onClick={onClose}>
            OK
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
            </fieldset>
          )}
          {state.kind === 'failed' && <p role="alert">{t('import.failed')}</p>}
          <button type="button" onClick={onClose}>
            {t('import.cancel')}
          </button>{' '}
          <button type="button" onClick={() => void run()} disabled={state.kind === 'busy' || (parsed.valid.length === 0 && parsed.chats.length === 0 && parsed.memories.length === 0)}>
            {t('import.confirm')}
          </button>
        </>
      )}
    </div>
  )
}
