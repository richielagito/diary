import { posToDOMRect, type ChainedCommands } from '@tiptap/core'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { createExtensions } from './extensions'
import { TagSuggest } from './tagSuggest'

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
  /** Inline tag chips while typing `#`. Only read at mount; bump `version` when suggestions change. */
  tagSuggest?: { getSuggestions(prefix: string): string[]; onTrigger(): void; version: number }
  ref?: Ref<DiaryEditorHandle>
}

export function DiaryEditor({ initialMarkdown, placeholder, label, onChange, onBlur, tagSuggest, ref }: Props) {
  const { t, i18n } = useTranslation()
  const onChangeRef = useRef(onChange)
  const onBlurRef = useRef(onBlur)
  const tagSuggestRef = useRef(tagSuggest)
  const tRef = useRef(t)
  onChangeRef.current = onChange
  onBlurRef.current = onBlur
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
    onUpdate: ({ editor }) => onChangeRef.current(editor.getMarkdown()),
    onBlur: () => onBlurRef.current(),
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
    { key: 'bold', label: 'B', run: format((c) => c.toggleBold()) },
    { key: 'italic', label: 'I', run: format((c) => c.toggleItalic()) },
    { key: 'strike', label: 'S', run: format((c) => c.toggleStrike()) },
    { key: 'code', label: '</>', run: format((c) => c.toggleCode()) },
  ] as const

  return (
    <>
      <BubbleMenu editor={editor} className="bubble" getReferencedVirtualElement={pinnedAnchor}>
        {buttons.map((b) => (
          <button key={b.key} type="button" aria-label={t(`editor.${b.key}`)} aria-pressed={active?.[b.key]} onClick={b.run}>
            {b.label}
          </button>
        ))}
      </BubbleMenu>
      {/* The host positions the tag chip overlay shown while an IME composes. */}
      <EditorContent editor={editor} className="editor-host" />
    </>
  )
}
