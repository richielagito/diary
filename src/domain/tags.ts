import { unescapeMarkdown } from './markdownText'

const FENCED_CODE = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm
const INLINE_CODE = /`[^`\n]*`/g
// '#' yang tidak didahului huruf, angka, '_', '/', '&', atau '#'; diikuti huruf, angka, '_', atau '-'.
const TAG = /(?<![\p{L}\p{N}_/&#])#([\p{L}\p{N}_-]+)/gu
const HAS_NON_DIGIT = /[\p{L}_-]/u

export function extractTags(markdown: string): string[] {
  const text = unescapeMarkdown(markdown.replace(FENCED_CODE, '').replace(INLINE_CODE, ''))
  const tags = new Set<string>()
  for (const m of text.matchAll(TAG)) {
    const tag = m[1].toLowerCase()
    if (HAS_NON_DIGIT.test(tag)) tags.add(tag)
  }
  return [...tags].sort()
}
