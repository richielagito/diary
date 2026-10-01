import type { Unsubscribe } from './DiaryRepository'

export type MemorySource = 'auto' | 'user'

export interface Memory {
  id: string
  /** Satu fakta pendek, maksimal 200 karakter. */
  text: string
  /** 'user' = dibuat atau diedit user; AI tidak boleh mengubah atau menghapusnya. */
  source: MemorySource
  createdAt: number
  updatedAt: number
}

export interface MemoryRepository {
  /** Urut createdAt naik. */
  list(): Promise<Memory[]>
  add(text: string, source: MemorySource, now?: number): Promise<Memory>
  /** Edit oleh user: sumber menjadi 'user'. Teks kosong menghapus memori. */
  edit(id: string, text: string, now?: number): Promise<void>
  put(memory: Memory): Promise<void>
  remove(id: string): Promise<void>
  /**
   * Atomik: expectedUpdatedAt null = id harus belum ada (lalu ditambahkan); selain itu record harus ada,
   * bersumber 'auto', dan updatedAt sama (lalu ditimpa). Mengembalikan apakah menulis.
   */
  putIfUnchanged(memory: Memory, expectedUpdatedAt: number | null): Promise<boolean>
  /** Atomik: hapus hanya bila record ada, bersumber 'auto', dan updatedAt sama. Mengembalikan apakah menghapus. */
  removeIfUnchanged(id: string, expectedUpdatedAt: number): Promise<boolean>
  clear(): Promise<void>
  /** Satu transaksi; id yang sudah ada dilewati. Mengembalikan jumlah yang ditambahkan. */
  importMany(items: Memory[]): Promise<number>
  watch(cb: (memories: Memory[]) => void): Unsubscribe
}
