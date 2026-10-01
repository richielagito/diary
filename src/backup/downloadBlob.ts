/** Unduh lewat <a download>. Anchor ditempel ke dokumen dan URL dicabut belakangan: Safari/Firefox bisa membatalkan unduhan kalau tidak. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
