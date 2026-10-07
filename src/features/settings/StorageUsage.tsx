import { useTranslation } from 'react-i18next'
import { useRepos, useSettings } from '../../app/RepoContext'
import { useInitial } from '../../app/useInitial'

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
  // Read before Settings shows, so these lines do not appear late and push the page down.
  const { entries, estimate } = useInitial(diary, 'storage-usage', async () => ({
    entries: await diary.list().catch((err: unknown) => {
      console.error(err)
      return null
    }),
    // Informative only: without an estimate the line stays hidden.
    estimate: await (navigator.storage?.estimate?.() ?? Promise.resolve(null)).then(
      (e) => (e?.usage !== undefined && e.quota ? { usage: e.usage, quota: e.quota } : null),
      () => null,
    ),
  }))
  const changed = entries?.filter((e) => lastExportAt === null || e.updatedAt > lastExportAt).length ?? 0

  const full = estimate ? estimate.usage / estimate.quota : 0
  return (
    <>
      {changed > 0 && <p>{t('settings.changedSinceExport', { count: changed })}</p>}
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
