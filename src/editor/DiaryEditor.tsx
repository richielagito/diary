import { posToDOMRect, type ChainedCommands } from '@tiptap/core'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { Bold, CodeBracket, H2, Italic, ListBullet, NumberedList, Strikethrough } from '../app/icons'
import { createExtensions } from './extensions'
import { TagSuggest } from './tagSuggest'

/** On a phone the wide menu keeps clear of the screen edge. Module-level so the menu is not re-registered on every render. */
const bubbleOptions = { shift: { padding: 8 } }

export interface DiaryEditorHandle {
  getMarkdown(): string
  setMarkdown(md: string): void
  focus(): void
}

interface Props {
  initialMarkdown: string
  placeholder: string
  label: string
  onChange: (md: string) => void
  onBlur: () => void
  onFocus?: () => void
  /** Inline tag chips while typing `#`. Only read at mount; bump `version` when suggestions change. */
  tagSuggest?: { getSuggestions(prefix: string): string[]; onTrigger(): void; version: number }
  ref?: Ref<DiaryEditorHandle>
}

export function DiaryEditor({ initialMarkdown, placeholder, label, onChange, onBlur, onFocus, tagSuggest, ref }: Props) {
  const { t, i18n } = useTranslation()
  const onChangeRef = useRef(onChange)
  const onBlurRef = useRef(onBlur)
  const tagSuggestRef = useRef(tagSuggest)
  const tRef = useRef(t)
  const lastMarkdown = useRef<string | null>(null)
  onChangeRef.current = onChange
  onBlurRef.current = onBlur
  const onFocusRef = useRef(onFocus)
  onFocusRef.current = onFocus
  tagSuggestRef.current = tagSuggest
  tRef.current = t

  // Created once; the options delegate to refs so they always see the latest props.
  const [extensions] = useState(() => [
    ...createExtensions(placeholder),
    ...(tagSuggest
      ? [
          TagSuggest.configure({
            getSuggestions: (prefix) => tagSuggestRef.current?.getSuggestions(prefix) ?? [],
            onTrigger: () => tagSuggestRef.current?.onTrigger(),
            label: (tag) => tRef.current('suggest.addTag', { tag }),
          }),
        ]
      : []),
  ])

  const editor = useEditor({
    extensions,
    content: initialMarkdown,
    contentType: 'markdown',
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': label, class: 'editor' },
    },
    // A plugin adds a trailing paragraph while the document loads, before onCreate. That is not an edit: opening a page
    // must never schedule a save (it would move the entry's updatedAt and wake sync). Only a different Markdown is an edit.
    onCreate: ({ editor }) => {
      lastMarkdown.current = editor.getMarkdown()
    },
    onUpdate: ({ editor }) => {
      const md = editor.getMarkdown()
      const loading = lastMarkdown.current === null
      if (loading || md === lastMarkdown.current) {
        lastMarkdown.current = md
        return
      }
      lastMarkdown.current = md
      onChangeRef.current(md)
    },
    onBlur: () => onBlurRef.current(),
    onFocus: () => onFocusRef.current?.(),
  })

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => editor?.getMarkdown() ?? '',
      setMarkdown: (md) => {
        if (!editor) return
        const { from, to } = editor.state.selection
        const wasFocused = editor.isFocused
        // Bukan langkah undo: satu Ctrl+Z tidak boleh mengembalikan teks lama dan menghapus tulisan dari perangkat lain.
        editor.chain().setMeta('addToHistory', false).setContent(md, { contentType: 'markdown', emitUpdate: false }).run()
        lastMarkdown.current = editor.getMarkdown()
        // Tanpa fokus tidak ada caret yang perlu dijaga (dan menggeser seleksi memicu saran tag).
        if (!wasFocused) return
        const max = editor.state.doc.content.size
        editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) })
      },
      focus: () => editor?.commands.focus('end'),
    }),
    [editor],
  )

  const hasTagSuggest = extensions.some((e) => e.name === TagSuggest.name)
  const tagVersion = tagSuggest?.version
  const language = i18n.language
  // New suggestions or a new language (chip labels) redraw the chips.
  useEffect(() => {
    if (editor && hasTagSuggest) editor.commands.refreshTagSuggestions()
  }, [editor, hasTagSuggest, tagVersion, language])

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      strike: e?.isActive('strike') ?? false,
      code: e?.isActive('code') ?? false,
      heading: e?.isActive('heading', { level: 2 }) ?? false,
      bulletList: e?.isActive('bulletList') ?? false,
      orderedList: e?.isActive('orderedList') ?? false,
    }),
  })

  // A format button pins the menu where it stands: bold or italic resizes the selected text, and the menu should not chase it.
  // The pin holds until the selection moves; scrolling still carries the menu along with the text.
  const pinned = useRef<{ from: number; to: number; rect: DOMRect; scrollY: number } | null>(null)
  const pinnedAnchor = useCallback(() => {
    const pin = pinned.current
    const { from, to } = editor?.state.selection ?? {}
    if (!pin || pin.from !== from || pin.to !== to) {
      pinned.current = null
      return null
    }
    const r = pin.rect
    const rect = new DOMRect(r.x, r.y + pin.scrollY - window.scrollY, r.width, r.height)
    return { getBoundingClientRect: () => rect, getClientRects: () => [rect] }
  }, [editor])

  if (!editor) return null
  const format = (toggle: (c: ChainedCommands) => ChainedCommands) => () => {
    const { from, to } = editor.state.selection
    pinned.current ??= { from, to, rect: posToDOMRect(editor.view, from, to), scrollY: window.scrollY }
    toggle(editor.chain().focus()).run()
  }
  const buttons = [
    { key: 'bold', icon: <Bold />, run: format((c) => c.toggleBold()) },
    { key: 'italic', icon: <Italic />, run: format((c) => c.toggleItalic()) },
    { key: 'strike', icon: <Strikethrough />, run: format((c) => c.toggleStrike()) },
    { key: 'code', icon: <CodeBracket />, run: format((c) => c.toggleCode()) },
  ] as const
  // Line formats act on the whole paragraph the selection sits in. Typing "## ", "- " or "1. " at a line start does the same.
  const blocks = [
    { key: 'heading', icon: <H2 />, run: format((c) => c.toggleHeading({ level: 2 })) },
    { key: 'bulletList', icon: <ListBullet />, run: format((c) => c.toggleBulletList()) },
    { key: 'orderedList', icon: <NumberedList />, run: format((c) => c.toggleOrderedList()) },
  ] as const
  const button = (b: (typeof buttons)[number] | (typeof blocks)[number]) => (
    <button
      key={b.key}
      type="button"
      data-format={b.key}
      aria-label={t(`editor.${b.key}`)}
      title={t(`editor.${b.key}`)}
      aria-pressed={active?.[b.key]}
      onClick={b.run}
    >
      {b.icon}
    </button>
  )

  return (
    <>
      <BubbleMenu editor={editor} className="bubble" getReferencedVirtualElement={pinnedAnchor} options={bubbleOptions}>
        {buttons.map(button)}
        <hr />
        {blocks.map(button)}
      </BubbleMenu>
      {/* The host positions the tag chip overlay shown while an IME composes. */}
      <EditorContent editor={editor} className="editor-host" />
    </>
  )
}
