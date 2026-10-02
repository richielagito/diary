import { screen, waitFor } from '@testing-library/react'
import type { Mood } from '../../domain/types'
import { rememberUnsavedDraft } from '../../editor/useAutosave'
import { DexieDiaryRepository } from '../../storage/DexieDiaryRepository'
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

test('a change from another device that arrives while typing is merged, not overwritten', async () => {
  stubLayout()
  const { diary, user } = await open('2026-09-20', { markdown: 'awal' })
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  await user.click(box)
  await user.keyboard(' kalimat laptop')
  // Sync (atau tab lain) menulis versi lain sebelum autosave sempat jalan.
  await diary.save('2026-09-20', { markdown: 'awal\n\nparagraf hp' })

  await waitFor(() => expect(box).toHaveTextContent('paragraf hp'))
  expect(box).toHaveTextContent('kalimat laptop')
  await waitFor(
    async () => {
      const stored = (await diary.get('2026-09-20'))!.markdown
      expect(stored).toContain('kalimat laptop')
      expect(stored).toContain('paragraf hp')
    },
    { timeout: 3000 },
  )
})

test('an autosave that started from an older text does not overwrite a newer one', async () => {
  stubLayout()
  // The page never hears about the change (spied on the prototype, before the page subscribes): only the repository can stop the overwrite.
  const watch = vi.spyOn(DexieDiaryRepository.prototype, 'watch').mockReturnValue(() => {})
  const { diary, user, db } = await open('2026-09-20', { markdown: 'awal' })
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  await user.click(box)
  await user.keyboard(' kalimat laptop')
  await db.entries.update('2026-09-20', { markdown: 'awal\n\nparagraf hp', updatedAt: Date.now() })

  await waitFor(
    async () => {
      const stored = (await diary.get('2026-09-20'))!.markdown
      expect(stored).toContain('kalimat laptop')
      expect(stored).toContain('paragraf hp')
    },
    { timeout: 3000 },
  )
  expect(box).toHaveTextContent('paragraf hp')
  watch.mockRestore()
})

test('its own autosaves are not mistaken for changes from elsewhere', async () => {
  stubLayout()
  const { diary, user } = await open('2026-09-20', { markdown: 'awal' })
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  await user.click(box)
  await user.keyboard(' satu')
  await waitFor(async () => expect((await diary.get('2026-09-20'))!.markdown).toContain('satu'), { timeout: 3000 })
  await user.keyboard(' dua')
  await waitFor(async () => expect((await diary.get('2026-09-20'))!.markdown).toContain('dua'), { timeout: 3000 })
  const stored = (await diary.get('2026-09-20'))!.markdown
  expect(stored).not.toContain('---')
  expect(stored.match(/awal/g)).toHaveLength(1)
})

test('text typed just before leaving the page is merged with a newer stored text', async () => {
  stubLayout()
  // Same as above: the page must not hear the change through its subscription.
  const watch = vi.spyOn(DexieDiaryRepository.prototype, 'watch').mockReturnValue(() => {})
  const view = await open('2026-09-20', { markdown: 'awal' })
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  await view.user.click(box)
  await view.user.keyboard(' kalimat laptop')
  await view.db.entries.update('2026-09-20', { markdown: 'awal\n\nparagraf hp', updatedAt: Date.now() })
  view.unmount()
  await waitFor(async () => {
    const stored = (await view.diary.get('2026-09-20'))!.markdown
    expect(stored).toContain('kalimat laptop')
    expect(stored).toContain('paragraf hp')
  })
  watch.mockRestore()
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
