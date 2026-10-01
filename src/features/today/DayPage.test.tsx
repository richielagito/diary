import { screen, waitFor } from '@testing-library/react'
import type { Mood } from '../../domain/types'
import { rememberUnsavedDraft } from '../../editor/useAutosave'
import { renderApp } from '../../test/renderApp'
import { stubLayout } from '../../test/stubLayout'

const open = (date: string, seed?: { markdown?: string; mood?: Mood }) =>
  renderApp(`/day/${date}`, { entries: seed ? [{ date, ...seed }] : [] })

test('loads existing entry and mood for the date', async () => {
  await open('2026-09-20', { markdown: 'Isi lama #tag', mood: 4 })
  expect(await screen.findByRole('textbox', { name: 'Tulis diary' })).toHaveTextContent('Isi lama #tag')
  expect(screen.getByRole('button', { name: 'Baik' })).toHaveAttribute('aria-pressed', 'true')
})

test('mood click saves immediately', async () => {
  const { diary, user } = await open('2026-09-20')
  await user.click(await screen.findByRole('button', { name: 'Senang' }))
  await waitFor(async () => expect((await diary.get('2026-09-20'))?.mood).toBe(5))
})

test('clicking active mood clears it and removes mood-only entry', async () => {
  const { diary, user } = await open('2026-09-20', { mood: 2 })
  await user.click(await screen.findByRole('button', { name: 'Kurang baik' }))
  await waitFor(async () => expect(await diary.get('2026-09-20')).toBeUndefined())
})

test('mood save failure shows error banner and keeps selection; next success clears it', async () => {
  const { diary, user } = await open('2026-09-20')
  vi.spyOn(diary, 'save').mockRejectedValueOnce(new Error('QuotaExceededError'))
  await user.click(await screen.findByRole('button', { name: 'Senang' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Gagal menyimpan. Tulisanmu masih aman di layar.')
  expect(screen.getByRole('button', { name: 'Senang' })).toHaveAttribute('aria-pressed', 'true')

  await user.click(screen.getByRole('button', { name: 'Baik' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
})

test('shows formatted date heading', async () => {
  await open('2026-09-20')
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('20')
})

test('external change (other tab) refreshes editor when not dirty', async () => {
  const { diary } = await open('2026-09-20', { markdown: 'awal' })
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  await diary.save('2026-09-20', { markdown: 'dari tab lain' })
  await waitFor(() => expect(box).toHaveTextContent('dari tab lain'))
})

test('past day shows back-to-today link', async () => {
  await open('2026-09-20')
  expect(await screen.findByRole('link', { name: 'Kembali ke hari ini' })).toBeInTheDocument()
})

test('typing # shows known tags as chips and Tab accepts one, which is autosaved', async () => {
  stubLayout()
  const { diary, user } = await renderApp('/day/2026-09-20', {
    entries: [{ date: '2026-09-01', markdown: 'rapat #kampus' }],
  })
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  await user.click(box)
  await user.keyboard('halo #ka')
  expect(await screen.findByRole('button', { name: 'Tambah tag #kampus' })).toBeInTheDocument()
  await user.keyboard('{Tab}')
  await waitFor(async () => expect((await diary.get('2026-09-20'))?.tags).toEqual(['kampus']), { timeout: 3000 })
  expect((await diary.get('2026-09-20'))?.markdown).not.toContain('+kampus')
})

test('unsaved draft from a failed save replaces the stored text and is saved again', async () => {
  rememberUnsavedDraft('2026-09-20', 'belum tersimpan')
  const { diary } = await open('2026-09-20', { markdown: 'lama' })
  expect(await screen.findByRole('textbox', { name: 'Tulis diary' })).toHaveTextContent('belum tersimpan')
  await waitFor(async () => expect((await diary.get('2026-09-20'))?.markdown).toBe('belum tersimpan'), {
    timeout: 3000,
  })
})
