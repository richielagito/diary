import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { ArrowDownTray, ArrowUpTray } from '../../app/icons'
import { useRepos, useSettings } from '../../app/RepoContext'
import { readImportFiles, type ParsedImport } from '../../backup/importFiles'
import { useExport } from '../../backup/useExport'
import type { DateKey } from '../../domain/types'
import type { Language, Theme } from '../../storage/SettingsStore'
import { AccountSection } from './AccountSection'
import { StorageUsage } from './StorageUsage'
import { AiSettingsSection } from './AiSettingsSection'
import { Field } from './Field'
import { ImportDialog } from './ImportDialog'

const REMINDER_OPTIONS = [7, 14, 30] as const

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { diary, settingsStore } = useRepos()
  const settings = useSettings()
  const exportNow = useExport()
  const { hash } = useLocation()
  // "Atur AI" elsewhere links to #ai; the router does not scroll to fragments by itself.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.()
  }, [hash])
  const [importing, setImporting] = useState<{ parsed: ParsedImport; existing: Set<DateKey> } | null>(null)

  const [importFailed, setImportFailed] = useState(false)
  const importId = useId()

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setImportFailed(false)
    try {
      const parsed = await readImportFiles([...files], Date.now())
      const existing = new Set((await diary.list()).map((e) => e.date))
      setImporting({ parsed, existing })
    } catch (err) {
      console.error(err)
      setImportFailed(true)
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
      <h1>{t('nav.settings')}</h1>
      <section>
        <h2>{t('settings.appearance')}</h2>
        <div className="field-pair">
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
        </div>
      </section>

      <section>
        <h2>{t('settings.backup')}</h2>
        {/* Facts first, then the two actions side by side, then the standing preference. */}
        <div className="backup-status">
          <p>{lastExport}</p>
          <StorageUsage />
        </div>
        <p className="settings-actions">
          <button type="button" className="primary" onClick={() => void exportNow()}>
            <ArrowDownTray />
            {t('settings.export')}
          </button>
          {/* The native control's text is the browser's, not the app's language: hidden, with its own label as the button. */}
          <input
            id={importId}
            className="visually-hidden"
            type="file"
            accept=".zip,.md"
            multiple
            onChange={(e) => {
              void onFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <label htmlFor={importId} className="file-btn">
            <ArrowUpTray />
            {t('settings.chooseFile')}
          </label>
        </p>
        {importFailed && <p role="alert">{t('import.failed')}</p>}
        <Field label={t('settings.reminder')}>
          {(id) => (
            <>
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
              {settings.persistGranted === true && <small>{t('settings.persistGranted')}</small>}
              {settings.persistGranted === false && <small>{t('settings.persistDenied')}</small>}
            </>
          )}
        </Field>
      </section>

      <AccountSection />

      <AiSettingsSection />

      <p className="settings-footer">
        <Link to="/guide">{t('guide.title')}</Link>
      </p>

      {importing && (
        <ImportDialog parsed={importing.parsed} existing={importing.existing} onClose={() => setImporting(null)} />
      )}
    </div>
  )
}
