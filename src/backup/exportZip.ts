import JSZip from 'jszip'
import { APP_ID, EXPORT_FORMAT_VERSION } from '../config'
import { dateKey } from '../domain/date'
import { serializeEntry } from '../domain/frontmatter'
import { unescapeTagTokens } from '../domain/markdownText'
import type { DayEntry } from '../domain/types'
import type { ChatMessage } from '../storage/ChatRepository'
import type { Memory } from '../storage/MemoryRepository'

export function exportFileName(now: Date): string {
  return `diary-export-${dateKey(now)}.zip`
}

export async function buildExportZip(entries: DayEntry[], now: number, chats: ChatMessage[] = [],
  memories: Memory[] = [],
): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    'manifest.json',
    JSON.stringify(
      { app: APP_ID, formatVersion: EXPORT_FORMAT_VERSION, exportedAt: new Date(now).toISOString(), count: entries.length, chatCount: chats.length, memoryCount: memories.length },
      null,
      2,
    ),
  )
  // Hanya di file export: bentuk yang tersimpan tidak diubah.
  for (const e of entries) {
    zip.file(`entries/${e.date.slice(0, 4)}/${e.date}.md`, serializeEntry({ ...e, markdown: unescapeTagTokens(e.markdown) }))
  }
  if (chats.length > 0) {
    const sorted = [...chats].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    zip.file('chats.json', JSON.stringify(sorted, null, 2))
  }
  if (memories.length > 0) {
    zip.file('memories.json', JSON.stringify([...memories].sort((a, b) => a.createdAt - b.createdAt), null, 2))
  }
  return zip.generateAsync({ type: 'uint8array' })
}
