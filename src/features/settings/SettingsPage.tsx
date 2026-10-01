import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRepos, useSettings } from '../../app/RepoContext'
import { readImportFiles, type ParsedImport } from '../../backup/importFiles'
import { useExport } from '../../backup/useExport'
import type { DateKey } from '../../domain/types'
import type { Language, Theme } from '../../storage/SettingsStore'
import { AiSettingsSection } from './AiSettingsSection'
import { Field } from './Field'
import { ImportDialog } from './ImportDialog'

const REMINDER_OPTIONS = [7, 14, 30] as const

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { diary, settingsStore } = useRepos()
  const settings = useSettings()
  const exportNow = useExport()
  const [importing, setImporting] = useState<{ parsed: ParsedImport; existing: Set<DateKey> } | null>(null)

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      const parsed = await readImportFiles([...files], Date.now())
      const existing = new Set((await diary.list()).map((e) => e.date))
      setImporting({ parsed, existing })
    } catch (err) {
      console.error(err)
      window.alert(t('import.failed'))
    }
  }

  const lastExport = settings.lastExportAt
    ? t('settings.lastExport', {
        date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
          settings.lastExportAt,
        ),
      })
    : t('settings.never')

  return (
    <div className="settings">
      <section>
        <Field label={t('settings.language')}>
          {(id) => (
            <select
              id={id}
              value={settings.language}
              onChange={(e) => void settingsStore.set('language', e.target.value as Language)}
            >
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
            </select>
          )}
        </Field>
        <Field label={t('settings.theme')}>
          {(id) => (
            <select
              id={id}
              value={settings.theme}
              onChange={(e) => void settingsStore.set('theme', e.target.value as Theme)}
            >
              <option value="system">{t('settings.themeSystem')}</option>
              <option value="light">{t('settings.themeLight')}</option>
              <option value="dark">{t('settings.themeDark')}</option>
            </select>
          )}
        </Field>
      </section>

      <AiSettingsSection />

      <section>
        <h2>{t('settings.backup')}</h2>
        <p>{lastExport}</p>
        <button type="button" onClick={() => void exportNow()}>
          {t('settings.export')}
        </button>
        <Field label={t('settings.import')}>
          {(id) => (
            <input
              id={id}
              type="file"
              accept=".zip,.md"
              multiple
              onChange={(e) => {
                void onFiles(e.target.files)
                e.target.value = ''
              }}
            />
          )}
        </Field>
        <Field label={t('settings.reminder')}>
          {(id) => (
            <select
              id={id}
              value={settings.backupReminderDays ?? 'off'}
              onChange={(e) =>
                void settingsStore.set('backupReminderDays', e.target.value === 'off' ? null : Number(e.target.value))
              }
            >
              {REMINDER_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {t('settings.reminderDays', { count: d })}
                </option>
              ))}
              <option value="off">{t('settings.reminderOff')}</option>
            </select>
          )}
        </Field>
        {settings.persistGranted === true && <p>{t('settings.persistGranted')}</p>}
        {settings.persistGranted === false && <p>{t('settings.persistDenied')}</p>}
      </section>

      {importing && (
        <ImportDialog parsed={importing.parsed} existing={importing.existing} onClose={() => setImporting(null)} />
      )}
    </div>
  )
}
