import { isValidDateKey, toLocalIso } from './date'
import { isMood, type EntryInput, type Mood } from './types'

export type ParseErrorReason = 'invalidDate' | 'invalidMood' | 'empty' | 'badFrontmatter'
export type ParseResult =
  | { ok: true; entry: EntryInput }
  | { ok: false; fileName: string; reason: ParseErrorReason }

export function serializeEntry(e: EntryInput): string {
  const body = e.markdown.endsWith('\n') || e.markdown === '' ? e.markdown : e.markdown + '\n'
  return (
    '---\n' +
    `date: ${e.date}\n` +
    `mood: ${e.mood ?? 'null'}\n` +
    `created: ${toLocalIso(e.createdAt)}\n` +
    `updated: ${toLocalIso(e.updatedAt)}\n` +
    '---\n' +
    body
  )
}

function splitFrontmatter(text: string): { meta: Record<string, string>; body: string } | 'bad' | null {
  if (!text.startsWith('---\n')) return null
  const end = text.indexOf('\n---', 3)
  if (end === -1) return 'bad'
  const afterFence = end + 4
  if (afterFence < text.length && text[afterFence] !== '\n') return 'bad'
  const meta: Record<string, string> = {}
  for (const line of text.slice(4, end).split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return { meta, body: text.slice(afterFence + 1) }
}

export function parseEntry(fileName: string, text: string, now: number): ParseResult {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  const fail = (reason: ParseErrorReason): ParseResult => ({ ok: false, fileName: base, reason })
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')

  const split = splitFrontmatter(normalized)
  if (split === 'bad') return fail('badFrontmatter')
  const meta = split?.meta ?? {}
  const rawBody = split ? split.body : normalized

  const date = meta.date ?? base.replace(/\.md$/i, '')
  if (!isValidDateKey(date)) return fail('invalidDate')

  let mood: Mood | null = null
  if (meta.mood !== undefined && meta.mood !== 'null' && meta.mood !== '') {
    const n = Number(meta.mood)
    if (!isMood(n)) return fail('invalidMood')
    mood = n
  }

  const markdown = rawBody.replace(/\n$/, '')
  if (markdown.trim() === '' && mood === null) return fail('empty')

  const ts = (v: string | undefined) => {
    const ms = v ? Date.parse(v) : NaN
    return Number.isNaN(ms) ? now : ms
  }
  return { ok: true, entry: { date, markdown, mood, createdAt: ts(meta.created), updatedAt: ts(meta.updated) } }
}
