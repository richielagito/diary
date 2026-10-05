import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRepos, useSettings } from '../../app/RepoContext'
import { useExport } from '../../backup/useExport'
import { shouldRemindBackup } from '../../domain/reminder'

/** "Nanti" hides the reminder until the app is opened again, so it does not follow the user from day to day. */
let dismissed = false

export function BackupBanner() {
  const { t } = useTranslation()
  const { diary } = useRepos()
  const settings = useSettings()
  const exportNow = useExport()
  const [firstEntryAt, setFirstEntryAt] = useState<number | null>(null)
  const [later, setLater] = useState(dismissed)

  useEffect(() => diary.watchFirstCreatedAt(setFirstEntryAt), [diary])

  const show = shouldRemindBackup({
    firstEntryAt,
    lastExportAt: settings.lastExportAt,
    reminderDays: settings.backupReminderDays,
    persistGranted: settings.persistGranted,
    now: Date.now(),
  })
  if (!show || later) return null
  return (
    <div className="banner">
      <span>{t('backup.reminder')}</span>
      <button type="button" onClick={() => void exportNow()}>
        {t('backup.action')}
      </button>
      <button
        type="button"
        className="quiet"
        onClick={() => {
          dismissed = true
          setLater(true)
        }}
      >
        {t('backup.later')}
      </button>
    </div>
  )
}
