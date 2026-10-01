import { Editor } from '@tiptap/core'
import { extractTags } from '../domain/tags'
import { createExtensions } from './extensions'

function roundTrip(md: string): string {
  const editor = new Editor({ extensions: createExtensions(), content: md, contentType: 'markdown' })
  const out = editor.getMarkdown()
  editor.destroy()
  return out
}

const cases: Record<string, string> = {
  paragraphs: 'Satu paragraf.\n\nParagraf dua.',
  headings: '# H1\n\n## H2\n\n### H3',
  marks: '**tebal** *miring* ~~coret~~ `kode`',
  bulletList: '- satu\n- dua',
  orderedList: '1. satu\n2. dua',
  taskList: '- [ ] belum\n- [x] sudah',
  blockquote: '> kutipan',
  codeBlock: '```\nconst x = 1\n```',
  link: '[teks](https://example.com)',
  hr: 'atas\n\n---\n\nbawah',
  // Canonical serializer output: '@tiptap/markdown' backslash-escapes '_' (valid,
  // equivalent CommonMark). 'src/domain/tags.ts' unescapes before matching tags,
  // so this stays a real, non-truncated tag downstream (see 'no tag content lost' below).
  tags: 'hari ini #kuliah dan #self\\_care',
  tagAtLineStart: '#kuliah hari ini',
}

describe('markdown round trip', () => {
  test.each(Object.entries(cases))('%s is preserved', (_name, md) => {
    expect(roundTrip(md)).toBe(md)
  })

  test.each(Object.entries(cases))('%s is stable on second pass', (_name, md) => {
    const once = roundTrip(md)
    expect(roundTrip(once)).toBe(once)
  })
})

test.each([['tags', cases.tags], ['tagAtLineStart', cases.tagAtLineStart]])(
  'no tag content lost through the editor (%s)',
  (_name, md) => {
    expect(extractTags(roundTrip(md))).toEqual(extractTags(md))
  },
)

test('unsupported pasted content (image, table) is dropped', () => {
  const editor = new Editor({ extensions: createExtensions() })
  editor.commands.setContent('<p>halo</p><img src="x.png"><table><tr><td>sel</td></tr></table>')
  const md = editor.getMarkdown()
  editor.destroy()
  expect(md).toContain('halo')
  expect(md).not.toContain('![')
  expect(md).not.toContain('|')
  expect(md).not.toContain('<')
})
