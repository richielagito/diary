import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { SyncController, SyncStatus } from '../sync/controller'

const SyncContext = createContext<SyncController | null>(null)

/** `controller` null berarti aplikasi dibangun tanpa server sync: tidak ada akun, tidak ada sync. */
export function SyncProvider({ controller, children }: { controller: SyncController | null; children: ReactNode }) {
  return <SyncContext.Provider value={controller}>{children}</SyncContext.Provider>
}

export function useSync(): SyncController | null {
  return useContext(SyncContext)
}

const never = () => () => {}

export function useSyncStatus(): SyncStatus | null {
  const controller = useContext(SyncContext)
  return useSyncExternalStore(controller ? controller.subscribe : never, () => (controller ? controller.status() : null))
}

/** True kalau sync berhenti dan butuh tindakan pengguna. Offline dan percobaan ulang tidak termasuk. */
export function needsAttention(status: SyncStatus | null): boolean {
  if (!status || status.phase === 'signed-out') return false
  return status.phase === 'needs-passphrase' || (status.problem !== null && status.problem !== 'retrying')
}
