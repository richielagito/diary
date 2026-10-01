import { downloadBlob } from '../../backup/downloadBlob'

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/** Bagikan lewat Web Share (dengan file) kalau bisa, kalau tidak unduh. */
export async function shareImage(file: File, nav: Navigator = navigator): Promise<ShareOutcome> {
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] })
      return 'shared'
    } catch (err) {
      // User batal: diam. Dicek lewat name karena tidak semua browser melempar DOMException.
      if ((err as { name?: unknown } | null)?.name === 'AbortError') return 'cancelled'
      // Error lain (mis. NotAllowedError: aktivasi user habis selama gambar dirender): unduh saja.
    }
  }
  downloadBlob(file, file.name)
  return 'downloaded'
}
