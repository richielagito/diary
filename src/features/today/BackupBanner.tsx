import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRepos, useSettings } from '../../app/RepoContext'
import { useExport } from '../../backup/useExport'
import { shouldRemindBackup } from '../../domain/reminder'

export function BackupBanner() {
  const { t } = useTranslation()
  const { diary } = useRepos()
  const settings = useSettings()
  const exportNow = useExport()
  const [firstEntryAt, setFirstEntryAt] = useState<number | null>(null)

  useEffect(() => diary.watchFirstCreatedAt(setFirstEntryAt), [diary])

  const show = shouldRemindBackup({
    firstEntryAt,
    lastExportAt: settings.lastExportAt,
    reminderDays: settings.backupReminderDays,
    persistGranted: settings.persistGranted,
    now: Date.now(),
  })
  if (!show) return null
  return (
    <div className="banner">
      <span>{t('backup.reminder')}</span>
      <button type="button" onClick={() => void exportNow()}>
        {t('backup.action')}
      </button>
    </div>
  )
}
