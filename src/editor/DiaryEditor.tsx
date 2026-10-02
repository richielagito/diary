import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
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

  if (!editor) return null
  const chain = () => editor.chain().focus()
  const buttons = [
    { key: 'bold', label: 'B', run: () => chain().toggleBold().run() },
    { key: 'italic', label: 'I', run: () => chain().toggleItalic().run() },
    { key: 'strike', label: 'S', run: () => chain().toggleStrike().run() },
    { key: 'code', label: '</>', run: () => chain().toggleCode().run() },
  ] as const

  return (
    <>
      <BubbleMenu editor={editor} className="bubble">
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
