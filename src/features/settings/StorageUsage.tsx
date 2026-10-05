import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRepos, useSettings } from '../../app/RepoContext'

/** Above this share of the quota the browser may refuse new writes soon. */
const NEARLY_FULL = 0.8

function formatBytes(bytes: number, language: string) {
  const [value, unit] =
    bytes >= 1e9 ? [bytes / 1e9, 'gigabyte'] : bytes >= 1e6 ? [bytes / 1e6, 'megabyte'] : [bytes / 1e3, 'kilobyte']
  return new Intl.NumberFormat(language, { style: 'unit', unit, maximumFractionDigits: 1 }).format(value)
}

/**
 * What a backup would cover right now: how many days changed since the last export, and how full this browser's
 * storage is. Both help decide when to export; storage is shown only where the browser reports it.
 */
export function StorageUsage() {
  const { t, i18n } = useTranslation()
  const { diary } = useRepos()
  const { lastExportAt } = useSettings()
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const [changed, setChanged] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void navigator.storage
      ?.estimate?.()
      .then(({ usage, quota }) => {
        if (!cancelled && usage !== undefined && quota) setEstimate({ usage, quota })
      })
      // Informative only: without an estimate the line stays hidden.
      .catch(() => {})
    void diary.list().then((all) => {
      if (!cancelled) setChanged(all.filter((e) => lastExportAt === null || e.updatedAt > lastExportAt).length)
    })
    return () => {
      cancelled = true
    }
  }, [diary, lastExportAt])

  const full = estimate ? estimate.usage / estimate.quota : 0
  return (
    <>
      {changed !== null && changed > 0 && <p>{t('settings.changedSinceExport', { count: changed })}</p>}
      {estimate && (
        <p className="storage-usage">
          {t('settings.storageUsed', { used: formatBytes(estimate.usage, i18n.language), quota: formatBytes(estimate.quota, i18n.language) })}
          <span className="storage-bar" aria-hidden="true">
            <span style={{ width: `${Math.max(full * 100, 1)}%` }} />
          </span>
          {full >= NEARLY_FULL && <strong role="alert">{t('settings.storageNearlyFull')}</strong>}
        </p>
      )}
    </>
  )
}
