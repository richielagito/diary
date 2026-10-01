import { unescapeMarkdown, unescapeTagTokens } from './markdownText'

describe('unescapeMarkdown', () => {
  test('unescapes an escaped underscore', () => {
    expect(unescapeMarkdown('self\\_care')).toBe('self_care')
  })

  test('unescapes an escaped hash', () => {
    expect(unescapeMarkdown('\\#kuliah')).toBe('#kuliah')
  })

  test('unescapes an escaped backslash', () => {
    expect(unescapeMarkdown('a\\\\b')).toBe('a\\b')
  })

  test('leaves text without escapes unchanged', () => {
    expect(unescapeMarkdown('hari ini biasa saja')).toBe('hari ini biasa saja')
  })

  test('leaves a backslash before a letter unchanged', () => {
    expect(unescapeMarkdown('C:\\new')).toBe('C:\\new')
  })
})

describe('unescapeTagTokens', () => {
  test('removes escapes of _ and - inside tags', () => {
    expect(unescapeTagTokens('#self\\_care dan #a\\-b')).toBe('#self_care dan #a-b')
  })

  test('leaves escapes outside tags unchanged', () => {
    expect(unescapeTagTokens('snake\\_case bukan tag')).toBe('snake\\_case bukan tag')
  })

  test('leaves inline code unchanged', () => {
    expect(unescapeTagTokens('`#x\\_y`')).toBe('`#x\\_y`')
  })

  test('leaves fenced code blocks unchanged', () => {
    const md = '```\n#x\\_y\n```\nlalu #a\\_b'
    expect(unescapeTagTokens(md)).toBe('```\n#x\\_y\n```\nlalu #a_b')
  })
})
