/** Ambil objek JSON {...} seimbang pertama dari teks bebas (misalnya jawaban model). */
export function parseJsonObject(text: string): unknown | null {
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          try {
            const value: unknown = JSON.parse(text.slice(start, i + 1))
            if (value && typeof value === 'object' && !Array.isArray(value)) return value
          } catch {
            // coba kurung kurawal pembuka berikutnya
          }
          break
        }
      }
    }
  }
  return null
}
