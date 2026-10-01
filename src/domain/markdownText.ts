// Stored markdown comes from the editor's serializer, which escapes characters such as `_`, `*`, `[`, `]`, `~`
// and backslash (not `#`).
const ESCAPED_PUNCTUATION = /\\([!-/:-@[-`{-~])/g

export function unescapeMarkdown(markdown: string): string {
  return markdown.replace(ESCAPED_PUNCTUATION, '$1')
}

// Blok kode berpagar, inline code, atau token #tag (awal tag sama dengan extractTags) yang boleh berisi `\_` dan `\-`.
const CODE_OR_TAG =
  /(^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\2[ \t]*$)|(`[^`\n]*`)|(?<![\p{L}\p{N}_/&#])#(?:[\p{L}\p{N}_-]|\\[_-])+/gmu

/** Hapus backslash yang meng-escape `_` atau `-` di dalam #tag di luar kode, supaya aplikasi lain membaca tag utuh. */
export function unescapeTagTokens(markdown: string): string {
  return markdown.replace(CODE_OR_TAG, (match, fenced?: string, _fence?: string, inline?: string) =>
    fenced !== undefined || inline !== undefined ? match : match.replace(/\\([_-])/g, '$1'),
  )
}
