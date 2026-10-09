import { useTranslation } from 'react-i18next'
import { ArrowDownTray, ArrowPath } from '../../app/icons'
import type { SaveStatus } from '../../editor/useAutosave'

export function SaveStatusText({ status, onExport, onRetry }: { status: SaveStatus; onExport: () => void; onRetry: () => void }) {
  const { t } = useTranslation()
  if (status === 'error') {
    return (
      <div className="banner error" role="alert">
        <span>{t('save.error')}</span>
        <button type="button" onClick={onRetry}>
          <ArrowPath />
          {t('save.retry')}
        </button>
        <button type="button" onClick={onExport}>
          <ArrowDownTray />
          {t('save.exportNow')}
        </button>
      </div>
    )
  }
  if (status === 'idle') return null
  return (
    // Not announced: read out at every autosave pause it would talk over the writing. Errors are announced as alerts.
    <span className="save-status" role="status" aria-live="off" data-state={status}>
      {status === 'saving' ? t('save.saving') : t('save.saved')}
    </span>
  )
}
