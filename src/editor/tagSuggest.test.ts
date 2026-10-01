import { Editor, type Extensions, type JSONContent } from '@tiptap/core'
import { createExtensions } from './extensions'
import { stubLayout } from '../test/stubLayout'
import { findTagTrigger, TagSuggest } from './tagSuggest'

const cleanups: (() => void)[] = []
beforeEach(() => stubLayout())
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

function mount(extensions: Extensions, content: JSONContent) {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({ element, extensions, content })
  cleanups.push(() => {
    editor.destroy()
    element.remove()
  })
  // Chips only show while the editor has focus.
  editor.view.focus()
  return editor
}

/** `placement: 'first'` registers TagSuggest before the list extensions, so only its priority puts its keymap first. */
function setup(content: JSONContent, placement: 'last' | 'first' | 'none' = 'last') {
  const onTrigger = vi.fn()
  const tagSuggest = TagSuggest.configure({ getSuggestions: () => ['kantor', 'kampus'], onTrigger, label: (t) => 'Tambah tag ' + t })
  const base = createExtensions()
  const extensions = placement === 'none' ? base : placement === 'first' ? [tagSuggest, ...base] : [...base, tagSuggest]
  return { editor: mount(extensions, content), onTrigger }
}

const paragraph = (text: string, marks?: JSONContent['marks']): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text, ...(marks ? { marks } : {}) }] : [] }],
})

/** Paragraph with `text` and the cursor at `cursor` (text offset; default: the end). */
function withCursor(text: string, cursor = text.length, marks?: JSONContent['marks']) {
  const s = setup(paragraph(text, marks))
  s.editor.commands.setTextSelection(1 + cursor)
  return s
}

function type(editor: Editor, text: string) {
  editor.view.dispatch(editor.state.tr.insertText(text))
}

function press(editor: Editor, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  return editor.view.someProp('handleKeyDown', (f) => f(editor.view, event)) ?? false
}

const widget = (editor: Editor) => editor.view.dom.querySelector('.tag-suggest')

test('findTagTrigger finds the prefix before the cursor', () => {
  const { editor } = withCursor('halo #ka')
  expect(findTagTrigger(editor.state)).toEqual({ from: 6, to: 9, prefix: 'ka' })
})

test.each([
  ['C#', 'C#'],
  ['an HTML entity', '&#'],
  ['a path', 'a/#b'],
  ['a double hash', '##'],
])('findTagTrigger is null after %s', (_name, text) => {
  const { editor } = withCursor(text)
  expect(findTagTrigger(editor.state)).toBeNull()
  expect(widget(editor)).toBeNull()
})

test('findTagTrigger is null with the cursor in the middle of a word', () => {
  const { editor } = withCursor('#kantor', 3)
  expect(findTagTrigger(editor.state)).toBeNull()
  expect(widget(editor)).toBeNull()
})

test('findTagTrigger is null inside a code block', () => {
  const { editor } = setup({ type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'x #ka' }] }] })
  editor.commands.setTextSelection(6)
  expect(findTagTrigger(editor.state)).toBeNull()
  expect(widget(editor)).toBeNull()
})

test('findTagTrigger is null inside inline code', () => {
  const { editor } = withCursor('x #ka', 5, [{ type: 'code' }])
  expect(findTagTrigger(editor.state)).toBeNull()
  expect(widget(editor)).toBeNull()
})

test('findTagTrigger is null when only the prefix is inline code', () => {
  const s = setup({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x ' }, { type: 'text', text: '#ka', marks: [{ type: 'code' }] }, { type: 'text', text: ' y' }] }],
  })
  s.editor.commands.setTextSelection(6)
  expect(findTagTrigger(s.editor.state)).toBeNull()
})

test('shows chips next to the cursor with accessible labels', () => {
  const { editor } = withCursor('halo #ka')
  const chips = widget(editor)!.querySelectorAll('button')
  expect([...chips].map((b) => b.textContent)).toEqual(['+kantor', '+kampus'])
  expect([...chips].map((b) => b.getAttribute('aria-label'))).toEqual(['Tambah tag #kantor', 'Tambah tag #kampus'])
})

test('chips never reach the document or the markdown', () => {
  const { editor } = withCursor('halo #ka')
  expect(widget(editor)).not.toBeNull()
  expect(editor.getMarkdown()).toBe('halo #ka')
  expect(editor.getText()).toBe('halo #ka')
  expect(editor.getMarkdown()).not.toContain('+kantor')
})

test('Tab accepts the first suggestion with a normal transaction', () => {
  const { editor } = withCursor('halo #ka')
  const onUpdate = vi.fn()
  editor.on('update', onUpdate)
  expect(press(editor, 'Tab')).toBe(true)
  expect(editor.getText()).toBe('halo #kantor ')
  expect(editor.getMarkdown()).toContain('#kantor')
  expect(onUpdate).toHaveBeenCalled()
  expect(widget(editor)).toBeNull()
})

test('clicking a chip accepts that tag', () => {
  const { editor } = withCursor('halo #ka')
  const second = widget(editor)!.querySelectorAll('button')[1]
  second.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  second.click()
  expect(editor.getText()).toBe('halo #kampus ')
})

test('Escape hides chips for the same trigger until a new # starts', () => {
  const { editor } = withCursor('halo #ka')
  expect(press(editor, 'Escape')).toBe(true)
  expect(widget(editor)).toBeNull()
  type(editor, 'n')
  expect(widget(editor)).toBeNull()
  expect(press(editor, 'Escape')).toBe(false)
  type(editor, ' #k')
  expect(widget(editor)).not.toBeNull()
})

test('Tab and Escape are not handled when no chip is shown', () => {
  const { editor } = withCursor('halo')
  expect(press(editor, 'Tab')).toBe(false)
  expect(press(editor, 'Escape')).toBe(false)
  expect(editor.getText()).toBe('halo')
})

const twoItems = (second: string): JSONContent => ({
  type: 'doc',
  content: [
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'satu' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: second }] }] },
      ],
    },
  ],
})

test('Tab in a list item with chips shown accepts the chip instead of sinking the item', () => {
  const { editor } = setup(twoItems('dua #ka'), 'first')
  // doc > bulletList(0) > item(1) > paragraph(2) "satu"(3-7) … item(9) > paragraph(10) > "dua #ka"(11-18)
  editor.commands.setTextSelection(18)
  expect(editor.state.selection.$from.parent.type.name).toBe('paragraph')
  expect(widget(editor)).not.toBeNull()
  expect(press(editor, 'Tab')).toBe(true)
  expect(editor.getMarkdown()).toMatch(/^- satu\n- dua #kantor /)
})

test('Tab without a trigger still sinks a list item exactly like without the extension', () => {
  const results = (['first', 'last', 'none'] as const).map((placement) => {
    const { editor } = setup(twoItems('dua'), placement)
    // End of "dua": its text runs from 11 to 14.
    editor.commands.setTextSelection(14)
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph')
    expect(editor.state.selection.$from.parent.textContent).toBe('dua')
    press(editor, 'Tab')
    return { json: editor.getJSON(), md: editor.getMarkdown() }
  })
  expect(results[0]).toEqual(results[2])
  expect(results[1]).toEqual(results[2])
  expect(results[0].md).toMatch(/- satu\n\s+- dua/)
})

test('onTrigger is called once when a trigger appears', () => {
  const { editor, onTrigger } = withCursor('halo ')
  expect(onTrigger).not.toHaveBeenCalled()
  type(editor, '#')
  expect(onTrigger).toHaveBeenCalledTimes(1)
  type(editor, 'k')
  type(editor, 'a')
  expect(onTrigger).toHaveBeenCalledTimes(1)
  type(editor, ' #')
  expect(onTrigger).toHaveBeenCalledTimes(2)
})

test('refreshTagSuggestions recomputes the chips', () => {
  let tags = ['kantor']
  const editor = mount(
    [...createExtensions(), TagSuggest.configure({ getSuggestions: () => tags, onTrigger: () => {}, label: (t) => t })],
    paragraph('#k'),
  )
  editor.commands.setTextSelection(3)
  expect(widget(editor)!.querySelectorAll('button')).toHaveLength(1)
  tags = ['kantor', 'kucing']
  editor.commands.refreshTagSuggestions()
  expect(widget(editor)!.querySelectorAll('button')).toHaveLength(2)
})

test('accepting a chip is its own undo step that restores the typed prefix', () => {
  const { editor } = withCursor('halo ')
  type(editor, '#')
  type(editor, 'k')
  type(editor, 'a')
  press(editor, 'Tab')
  expect(editor.getText()).toBe('halo #kantor ')
  editor.commands.undo()
  expect(editor.getText()).toBe('halo #ka')
})

test('no double space: an existing space after the prefix is kept and the cursor moves past it', () => {
  const { editor } = withCursor('halo #ka besok', 8)
  press(editor, 'Tab')
  expect(editor.getText()).toBe('halo #kantor besok')
  expect(editor.state.selection.from).toBe(1 + 'halo #kantor '.length)
})

const overlay = (editor: Editor) => editor.view.dom.parentElement!.querySelector(':scope > .tag-suggest--overlay')
const compose = (editor: Editor, type: 'compositionstart' | 'compositionend') =>
  editor.view.dom.dispatchEvent(new CompositionEvent(type, { bubbles: true }))

test('while an IME composes, the chips move to an overlay outside the editable text', async () => {
  const { editor } = withCursor('halo #ka')
  expect(widget(editor)).not.toBeNull()
  expect(overlay(editor)).toBeNull()
  compose(editor, 'compositionstart')
  expect(editor.view.composing).toBe(true)
  await vi.waitFor(() => expect(overlay(editor)).not.toBeNull())
  expect(widget(editor)).toBeNull()
  expect(editor.view.dom.contains(overlay(editor))).toBe(false)
  expect(overlay(editor)).toHaveClass('tag-suggest')
  const chips = [...overlay(editor)!.querySelectorAll('button')]
  expect(chips.map((b) => b.textContent)).toEqual(['+kantor', '+kampus'])
  expect(chips.map((b) => b.getAttribute('aria-label'))).toEqual(['Tambah tag #kantor', 'Tambah tag #kampus'])
  // Tab and Escape belong to the input method while it composes.
  expect(press(editor, 'Tab')).toBe(false)
  expect(press(editor, 'Escape')).toBe(false)
  expect(editor.getText()).toBe('halo #ka')
})

test('clicking an overlay chip ends the composition first, then replaces the prefix with the tag', async () => {
  const { editor } = withCursor('halo #ka')
  // Like a browser, commit the composition when the editable loses focus.
  const commitOnBlur = () => compose(editor, 'compositionend')
  editor.view.dom.addEventListener('blur', commitOnBlur)
  compose(editor, 'compositionstart')
  await vi.waitFor(() => expect(overlay(editor)).not.toBeNull())
  const first = overlay(editor)!.querySelectorAll('button')[0]
  const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  first.dispatchEvent(down)
  expect(down.defaultPrevented).toBe(true)
  first.click()
  expect(editor.view.composing).toBe(false)
  await vi.waitFor(() => expect(editor.getText()).toBe('halo #kantor '))
  expect(editor.getMarkdown()).toBe('halo #kantor ')
  expect(editor.view.hasFocus()).toBe(true)
  expect(overlay(editor)).toBeNull()
  editor.view.dom.removeEventListener('blur', commitOnBlur)
})

test('the inline chips come back after the composition ends', async () => {
  const { editor } = withCursor('halo #ka')
  compose(editor, 'compositionstart')
  await vi.waitFor(() => expect(overlay(editor)).not.toBeNull())
  compose(editor, 'compositionend')
  await vi.waitFor(() => expect(widget(editor)).not.toBeNull())
  expect(overlay(editor)).toBeNull()
})

test('blur resets the composing flag, so the chips cannot stay hidden', async () => {
  const { editor } = withCursor('halo #ka')
  compose(editor, 'compositionstart')
  await vi.waitFor(() => expect(overlay(editor)).not.toBeNull())
  editor.view.dom.blur()
  expect(overlay(editor)).toBeNull()
  // The composition ended without a compositionend event.
  ;(editor.view as unknown as { input: { composing: boolean } }).input.composing = false
  editor.view.focus()
  expect(widget(editor)).not.toBeNull()
  expect(overlay(editor)).toBeNull()
})

test('a composing flag without a composing view is ignored', async () => {
  const { editor } = withCursor('halo #ka')
  compose(editor, 'compositionstart')
  await vi.waitFor(() => expect(overlay(editor)).not.toBeNull())
  // ProseMirror ended the composition (e.g. its Android timeout) but no compositionend arrived.
  ;(editor.view as unknown as { input: { composing: boolean } }).input.composing = false
  editor.commands.refreshTagSuggestions()
  expect(widget(editor)).not.toBeNull()
  expect(overlay(editor)).toBeNull()
})

test('the overlay is removed when the editor is destroyed', async () => {
  const { editor } = withCursor('halo #ka')
  const parent = editor.view.dom.parentElement!
  compose(editor, 'compositionstart')
  await vi.waitFor(() => expect(overlay(editor)).not.toBeNull())
  editor.destroy()
  expect(parent.querySelector('.tag-suggest--overlay')).toBeNull()
})

test('no chips while the editor is not focused', () => {
  const { editor } = withCursor('halo #ka')
  expect(widget(editor)).not.toBeNull()
  editor.view.dom.blur()
  expect(widget(editor)).toBeNull()
  expect(press(editor, 'Tab')).toBe(false)
  editor.view.focus()
  expect(widget(editor)).not.toBeNull()
})

test('chip labels follow a language switch', () => {
  let prefix = 'Tambah tag '
  const editor = mount(
    [...createExtensions(), TagSuggest.configure({ getSuggestions: () => ['kantor'], onTrigger: () => {}, label: (t) => prefix + t })],
    paragraph('#k'),
  )
  editor.commands.setTextSelection(3)
  expect(widget(editor)!.querySelector('button')).toHaveAttribute('aria-label', 'Tambah tag #kantor')
  prefix = 'Add tag '
  editor.commands.refreshTagSuggestions()
  expect(widget(editor)!.querySelector('button')).toHaveAttribute('aria-label', 'Add tag #kantor')
})
