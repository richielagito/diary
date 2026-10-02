import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from '../../app/App'
import { RepoProvider } from '../../app/RepoContext'
import type { Mood } from '../../domain/types'
import { rememberUnsavedDraft } from '../../editor/useAutosave'
import { DexieDiaryRepository } from '../../storage/DexieDiaryRepository'
import { StaleTextError } from '../../storage/DiaryRepository'
import { renderApp } from '../../test/renderApp'
import { stubLayout } from '../../test/stubLayout'

afterEach(() => vi.restoreAllMocks())

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
  const stored = (await diary.get('2026-09-20'))!.markdown
  expect(stored.match(/paragraf hp/g)).toHaveLength(1)
  expect(stored.split('---')).toHaveLength(2)
})

test('an autosave that started from an older text does not overwrite a newer one', async () => {
  stubLayout()
  // The page never hears about the change (spied on the prototype, before the page subscribes): only the repository can stop the overwrite.
  vi.spyOn(DexieDiaryRepository.prototype, 'watch').mockReturnValue(() => {})
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
  vi.spyOn(DexieDiaryRepository.prototype, 'watch').mockReturnValue(() => {})
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
})

test('two saves that overlap do not lose the newer keystrokes', async () => {
  stubLayout()
  const { diary, user } = await open('2026-09-20', { markdown: 'awal' })
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  // Text saves requested during the first 2.2 s are held, then run in the order they were requested.
  const original = diary.save.bind(diary)
  let holding = true
  const held: (() => void)[] = []
  vi.spyOn(diary, 'save').mockImplementation(async (date, patch) => {
    if (holding && patch.markdown !== undefined) await new Promise<void>((resolve) => held.push(resolve))
    return original(date, patch)
  })

  await user.click(box)
  await user.keyboard(' satu')
  await new Promise((resolve) => setTimeout(resolve, 1000)) // the first autosave is now waiting
  await user.keyboard(' dua')
  await new Promise((resolve) => setTimeout(resolve, 1000)) // a second autosave was requested
  holding = false
  for (const release of held) release()

  await waitFor(async () => expect((await diary.get('2026-09-20'))!.markdown).toContain('dua'), { timeout: 3000 })
  const stored = (await diary.get('2026-09-20'))!.markdown
  expect(stored).toContain('satu')
  expect(stored).not.toContain('---')
}, 15000)

test('one undo after a merge does not remove the other device text', async () => {
  stubLayout()
  const { diary, user } = await open('2026-09-20', { markdown: 'awal' })
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  await user.click(box)
  await user.keyboard(' laptop')
  await diary.save('2026-09-20', { markdown: 'awal\n\nparagraf hp' })
  await waitFor(() => expect(box).toHaveTextContent('paragraf hp'))
  await waitFor(async () => expect((await diary.get('2026-09-20'))!.markdown).toContain('laptop'), { timeout: 3000 })
  await user.keyboard('{Control>}z{/Control}')
  await new Promise((resolve) => setTimeout(resolve, 1200))
  expect(box).toHaveTextContent('paragraf hp')
  expect((await diary.get('2026-09-20'))!.markdown).toContain('paragraf hp')
})

test('one undo after an external text was simply shown keeps the external text', async () => {
  stubLayout()
  const { diary, user } = await open('2026-09-20', { markdown: 'awal' })
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  await user.click(box)
  await diary.save('2026-09-20', { markdown: 'dari hp' })
  await waitFor(() => expect(box).toHaveTextContent('dari hp'))
  await user.keyboard('{Control>}z{/Control}')
  await new Promise((resolve) => setTimeout(resolve, 1200))
  expect((await diary.get('2026-09-20'))!.markdown).toBe('dari hp')
})

test('a restored draft is merged with a stored text that changed meanwhile', async () => {
  rememberUnsavedDraft('2026-09-20', 'awal kalimat laptop', 'awal')
  const { diary } = await open('2026-09-20', { markdown: 'awal\n\nparagraf hp' })
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  expect(box).toHaveTextContent('paragraf hp')
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

type View = Awaited<ReturnType<typeof open>>

/** Buka lagi hari itu di atas repositori yang sama (renderApp selalu membuat DB baru). */
function reopen(v: View, date: string) {
  render(
    <RepoProvider
      diary={v.diary}
      settingsStore={v.settingsStore}
      chats={v.chats}
      memories={v.memories}
      summaries={v.summaries}
      letters={v.letters}
      createProvider={() => {
        throw new Error('no provider in test')
      }}
      listModels={() => Promise.reject(new Error('no model list in test'))}
    >
      <MemoryRouter initialEntries={[`/day/${date}`]}>
        <AppRoutes />
      </MemoryRouter>
    </RepoProvider>,
  )
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Tunggu sampai semua pemanggilan save yang tercatat selesai, termasuk yang baru muncul karenanya. */
async function settle(calls: Promise<unknown>[]) {
  let n: number
  do {
    n = calls.length
    await Promise.allSettled([...calls])
    await tick()
  } while (calls.length !== n)
}

test('a queued write does not overwrite a foreign text that was merged while it waited (page closed)', async () => {
  stubLayout()
  vi.spyOn(DexieDiaryRepository.prototype, 'watch').mockReturnValue(() => {})
  const { diary, user, db, unmount } = await open('2026-09-20', { markdown: 'awal' })
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  const original = diary.save.bind(diary)
  let holding = true
  const held: (() => void)[] = []
  const calls: Promise<unknown>[] = []
  vi.spyOn(diary, 'save').mockImplementation((date, patch) => {
    const run = (async () => {
      if (holding && patch.markdown !== undefined) await new Promise<void>((resolve) => held.push(resolve))
      return original(date, patch)
    })()
    calls.push(run)
    return run
  })
  await user.click(box)
  await user.keyboard(' kalimat laptop')
  await waitFor(() => expect(held).toHaveLength(1), { timeout: 3000 })
  await db.entries.update('2026-09-20', { markdown: 'awal\n\nparagraf hp', updatedAt: Date.now() })
  unmount() // queues a second write with the same text
  holding = false
  for (const release of held) release()
  await settle(calls)
  const stored = (await diary.get('2026-09-20'))!.markdown
  expect(stored).toContain('kalimat laptop')
  expect(stored).toContain('paragraf hp')
}, 15000)

test('a queued write does not overwrite a foreign text that was absorbed while it waited (page open)', async () => {
  stubLayout()
  const { diary, user, db } = await open('2026-09-20', { markdown: 'awal' })
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  const original = diary.save.bind(diary)
  let holding = true
  const held: (() => void)[] = []
  vi.spyOn(diary, 'save').mockImplementation(async (date, patch) => {
    if (holding && patch.markdown !== undefined) await new Promise<void>((resolve) => held.push(resolve))
    return original(date, patch)
  })
  await user.click(box)
  await user.keyboard(' satu')
  await waitFor(() => expect(held).toHaveLength(1), { timeout: 3000 })
  await user.keyboard(' dua')
  await new Promise((resolve) => setTimeout(resolve, 1000)) // a second autosave was requested and is queued
  await db.entries.update('2026-09-20', { markdown: 'awal\n\nparagraf hp', updatedAt: Date.now() })
  await waitFor(() => expect(box).toHaveTextContent('paragraf hp')) // absorbed and merged in the editor
  holding = false
  const seen: string[] = []
  for (const release of held) release()
  const until = Date.now() + 5000
  for (;;) {
    const stored = (await diary.get('2026-09-20'))!.markdown
    seen.push(stored)
    if (['satu', 'dua', 'paragraf hp'].every((w) => stored.includes(w)) || Date.now() > until) break
    await tick()
  }
  for (const stored of seen) expect(stored).toContain('paragraf hp')
  const final = (await diary.get('2026-09-20'))!.markdown
  for (const w of ['satu', 'dua', 'paragraf hp']) expect(final).toContain(w)
}, 15000)

test('the draft of a twice-refused closed-page write is based on the first stored text it merged with', async () => {
  stubLayout()
  vi.spyOn(DexieDiaryRepository.prototype, 'watch').mockReturnValue(() => {})
  const view = await open('2026-09-20', { markdown: 'awal' })
  const { diary, user, db } = view
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  const original = diary.save.bind(diary)
  const calls: Promise<unknown>[] = []
  let textSaves = 0
  const spy = vi.spyOn(diary, 'save').mockImplementation((date, patch) => {
    const run = (async () => {
      if (patch.markdown !== undefined && ++textSaves === 2) {
        // Versi ketiga masuk tepat sebelum penulisan gabungan berjalan.
        await db.entries.update('2026-09-20', { markdown: 'awal\n\nparagraf hp\n\ntiga versi', updatedAt: Date.now() })
      }
      return original(date, patch)
    })()
    calls.push(run)
    return run
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await user.click(box)
  await user.keyboard(' kalimat laptop')
  await db.entries.update('2026-09-20', { markdown: 'awal\n\nparagraf hp', updatedAt: Date.now() })
  view.unmount()
  await settle(calls)
  expect(textSaves).toBe(2) // refused, then the merged write refused again; nothing retried
  spy.mockRestore()
  vi.restoreAllMocks()

  reopen(view, '2026-09-20')
  const box2 = await screen.findByRole('textbox', { name: 'Tulis diary' })
  for (const w of ['kalimat laptop', 'paragraf hp', 'tiga versi']) expect(box2).toHaveTextContent(w)
  await waitFor(
    async () => {
      const stored = (await diary.get('2026-09-20'))!.markdown
      for (const w of ['kalimat laptop', 'paragraf hp', 'tiga versi']) expect(stored).toContain(w)
    },
    { timeout: 3000 },
  )
}, 15000)

test('with two failing writes after the page closed, the newest text is the draft', async () => {
  stubLayout()
  const view = await open('2026-09-20', { markdown: 'awal' })
  const { diary, user } = view
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  let holding = true
  const held: (() => void)[] = []
  const calls: Promise<unknown>[] = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(diary, 'save').mockImplementation((_date, patch) => {
    const run = (async () => {
      if (patch.markdown !== undefined) {
        if (holding) await new Promise<void>((resolve) => held.push(resolve))
        throw new Error('QuotaExceededError')
      }
      return null
    })()
    calls.push(run)
    return run
  })
  await user.click(box)
  await user.keyboard(' satu')
  await waitFor(() => expect(held).toHaveLength(1), { timeout: 3000 })
  await user.keyboard(' dua')
  view.unmount() // queues a second write with the newer text
  holding = false
  for (const release of held) release()
  await waitFor(() => expect(calls).toHaveLength(2), { timeout: 3000 })
  await settle(calls)
  vi.restoreAllMocks()

  reopen(view, '2026-09-20')
  expect(await screen.findByRole('textbox', { name: 'Tulis diary' })).toHaveTextContent('satu dua')
}, 15000)

test('the error of a failed save carries the draft without exposing the text to the console', async () => {
  stubLayout()
  const { diary, user } = await open('2026-09-20', { markdown: 'awal' })
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(diary, 'save').mockImplementation(async (_date, patch) => {
    if (patch.markdown !== undefined) throw new Error('QuotaExceededError')
    return null
  })
  await user.click(box)
  await user.keyboard(' rahasia')
  await waitFor(() => expect(logged).toHaveBeenCalled(), { timeout: 3000 })
  const err = logged.mock.calls[0]![0] as Error & { draft?: { markdown: string } }
  expect(err.draft?.markdown).toContain('rahasia')
  expect(Object.keys(err)).not.toContain('draft')
  expect(JSON.stringify(err)).not.toContain('rahasia')
})

test('a refused write that comes back after the editor is gone, but before the page cleanup, is merged and not dropped', async () => {
  stubLayout()
  vi.spyOn(DexieDiaryRepository.prototype, 'watch').mockReturnValue(() => {})
  const { diary, user, db } = await open('2026-09-20', { markdown: 'awal' })
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  const original = diary.save.bind(diary)
  const calls: Promise<unknown>[] = []
  let refuse: (() => void) | null = null
  let textSaves = 0
  vi.spyOn(diary, 'save').mockImplementation((date, patch) => {
    // The first text write is answered by the test: refused because the stored text changed.
    const run =
      patch.markdown !== undefined && ++textSaves === 1
        ? new Promise<never>((_, reject) => (refuse = () => reject(new StaleTextError('awal\n\nparagraf hp'))))
        : original(date, patch)
    calls.push(run)
    return run
  })
  await user.click(box)
  await user.keyboard(' kalimat laptop')
  await waitFor(() => expect(refuse).not.toBeNull(), { timeout: 3000 })
  await db.entries.update('2026-09-20', { markdown: 'awal\n\nparagraf hp', updatedAt: Date.now() })

  // Leaving the page: React detaches the editor while it removes the page from the document, and runs the page's own
  // cleanup (a passive effect) in a later task when the removal used up its time slice. The refusal lands in between.
  const article = box.closest('article')!
  const removeChild = Node.prototype.removeChild
  vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function (this: Node, child: Node) {
    if (child === article) {
      const until = performance.now() + 20
      while (performance.now() < until) {
        // use up the time slice
      }
      refuse!()
    }
    return removeChild.call(this, child)
  } as typeof Node.prototype.removeChild)
  const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  env.IS_REACT_ACT_ENVIRONMENT = false // the navigation below must run on React's real scheduler, not inside act()
  try {
    screen.getByRole('link', { name: 'Arsip' }).click()
    await waitFor(() => expect(article).not.toBeInTheDocument())
    await settle(calls)
  } finally {
    env.IS_REACT_ACT_ENVIRONMENT = true
  }
  const stored = (await diary.get('2026-09-20'))!.markdown
  expect(stored).toContain('kalimat laptop')
  expect(stored).toContain('paragraf hp')
}, 15000)
