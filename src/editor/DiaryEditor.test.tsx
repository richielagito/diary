import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { DiaryEditor, type DiaryEditorHandle } from './DiaryEditor'

function setup(initial = 'Halo **dunia**') {
  const ref = createRef<DiaryEditorHandle>()
  const onChange = vi.fn()
  render(
    <DiaryEditor ref={ref} initialMarkdown={initial} placeholder="Tulis…" label="Tulis diary" onChange={onChange} onBlur={() => {}} />,
  )
  return { ref, onChange }
}

test('renders initial markdown as accessible textbox', async () => {
  setup()
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  expect(box).toHaveTextContent('Halo dunia')
  expect(box.querySelector('strong')).toHaveTextContent('dunia')
  // The composition chip overlay is positioned relative to this host.
  expect(box.parentElement).toHaveClass('editor-host')
})

test('handle get/set markdown without firing onChange', async () => {
  const { ref, onChange } = setup()
  await screen.findByRole('textbox', { name: 'Tulis diary' })
  ref.current!.setMarkdown('Baru #tag')
  expect(ref.current!.getMarkdown()).toBe('Baru #tag')
  expect(onChange).not.toHaveBeenCalled()
})

test('tag chips follow the latest suggestions and are never part of the markdown', async () => {
  const ref = createRef<DiaryEditorHandle>()
  const onTrigger = vi.fn()
  const props = (tags: string[], version: number) => ({
    ref,
    initialMarkdown: 'halo',
    placeholder: 'Tulis…',
    label: 'Tulis diary',
    onChange: vi.fn(),
    onBlur: () => {},
    tagSuggest: { getSuggestions: (p: string) => tags.filter((t) => t.startsWith(p)), onTrigger, version },
  })
  const { rerender } = render(<DiaryEditor {...props([], 0)} />)
  await screen.findByRole('textbox', { name: 'Tulis diary' })
  ref.current!.setMarkdown('halo #ka')
  ref.current!.focus()
  expect(onTrigger).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: 'Tambah tag #kantor' })).toBeNull()

  rerender(<DiaryEditor {...props(['kantor'], 1)} />)
  expect(await screen.findByRole('button', { name: 'Tambah tag #kantor' })).toHaveTextContent('+kantor')
  expect(ref.current!.getMarkdown()).toBe('halo #ka')
})
