import { useTranslation } from 'react-i18next'
import type { SaveStatus } from '../../editor/useAutosave'

export function SaveStatusText({ status, onExport }: { status: SaveStatus; onExport: () => void }) {
  const { t } = useTranslation()
  if (status === 'error') {
    return (
      <div className="banner error" role="alert">
        <span>{t('save.error')}</span>
        <button type="button" onClick={onExport}>
          {t('save.exportNow')}
        </button>
      </div>
    )
  }
  if (status === 'idle') return null
  return (
    <span className="save-status" role="status" data-state={status}>
      {status === 'saving' ? t('save.saving') : t('save.saved')}
    </span>
  )
}
