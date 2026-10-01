import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useRepos } from '../app/RepoContext'
import { downloadBlob } from './downloadBlob'
import { buildExportZip, exportFileName } from './exportZip'

export function useExport(): () => Promise<void> {
  const { t } = useTranslation()
  const { diary, settingsStore, chats, memories } = useRepos()
  return useCallback(async () => {
    try {
      const now = Date.now()
      const bytes = await buildExportZip(await diary.list(), now, await chats.listAll(), await memories.list())
      downloadBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), exportFileName(new Date(now)))
      await settingsStore.set('lastExportAt', now)
    } catch (err) {
      console.error(err)
      window.alert(t('backup.exportFailed'))
    }
  }, [diary, settingsStore, chats, memories, t])
}
