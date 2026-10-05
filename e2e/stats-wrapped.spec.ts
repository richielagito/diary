import { expect, test, type Page } from '@playwright/test'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function anthropicSse(text: string): string {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }],
    ['message_stop', { type: 'message_stop' }],
  ] as const
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
}

const editor = (page: Page) => page.getByRole('textbox', { name: 'Tulis diary' })

/** Tanggal hari ini seperti di label sel heatmap. Bukan dateStyle 'full': itu menulis hari 1-9 sebagai "01". */
const todayLabel = () =>
  new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date())

/** This month as a Wrapped period id, e.g. "2026-10". */
const thisMonth = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date())

async function writeToday(page: Page, text: string) {
  await page.goto('/')
  await editor(page).click()
  // An empty diary opens on the welcome text; the entry should hold only this text.
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(text)
  await expect(page.getByRole('status')).toHaveText('Tersimpan')
  await page.getByRole('button', { name: 'Senang' }).click()
  await expect(page.getByRole('button', { name: 'Senang' })).toHaveAttribute('aria-pressed', 'true')
}

test('stats heatmap, Wrapped and saving the share image', async ({ page }) => {
  // Paksa jalur unduh: tanpa Web Share API
  await page.addInitScript(() => {
    delete (navigator as any).canShare // eslint-disable-line @typescript-eslint/no-explicit-any
    delete (navigator as any).share // eslint-disable-line @typescript-eslint/no-explicit-any
  })
  await writeToday(page, 'hari ini #olahraga ')

  await page.getByRole('link', { name: 'Statistik' }).click()
  await expect(page.getByRole('link', { name: new RegExp(`${todayLabel()}.*Senang`) })).toBeVisible()

  // Stats links to Wrapped only after a week of recorded days; with one day it still opens by its address.
  await expect(page.getByText(/^Wrapped terbuka setelah 7 hari/)).toBeVisible()
  await page.goto(`/wrapped/${thisMonth()}`)
  const save = page.getByRole('button', { name: 'Simpan gambar' })
  // Slide: pembuka, mood, tag, penutup (tanpa surat karena AI belum diatur)
  await expect(page.getByRole('group', { name: /^1 dari \d+$/ })).toBeVisible()
  for (let i = 0; i < 10 && !(await save.isVisible()); i++) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(100)
  }
  await expect(save).toBeVisible()

  const [download] = await Promise.all([page.waitForEvent('download'), save.click()])
  expect(download.suggestedFilename()).toMatch(/^diary-wrapped-\d{4}-\d{2}\.png$/)
})

test('320px phone: nav fits on one line and the year heatmap opens at today', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await writeToday(page, 'hari ini #olahraga ')

  const nav = page.getByRole('navigation')
  await expect(nav.getByRole('link')).toHaveCount(5)
  const fit = await nav.evaluate((el) => ({
    navOverflow: el.scrollWidth - el.clientWidth,
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    lines: [...el.querySelectorAll('a')].map((a) => a.getClientRects().length),
  }))
  expect(fit).toEqual({ navOverflow: 0, pageOverflow: 0, lines: [1, 1, 1, 1, 1] })

  await nav.getByRole('link', { name: 'Statistik' }).click()
  await page.getByRole('button', { name: 'Tahun' }).click()
  const cell = page.getByRole('link', { name: new RegExp(`${todayLabel()}.*Senang`) })
  await expect(cell).toBeInViewport({ ratio: 1 })
  // Scroll ada di dalam heatmap, bukan di halaman
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)

  // Form pengaturan (input model, petunjuk) tidak melebarkan halaman
  await nav.getByRole('link', { name: 'Pengaturan' }).click()
  await expect(page.getByLabel('API key')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
})

test('Wrapped letter from the persona, without entry text in the request', async ({ page }) => {
  const bodies: { model: string }[] = []
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    bodies.push(route.request().postDataJSON())
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: anthropicSse('Surat untukmu.') })
  })

  await page.goto('/settings')
  await page.getByLabel('API key').fill('sk-e2e')
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByText('Tersimpan.')).toBeVisible()

  await writeToday(page, 'RAHASIA-e2e hari ini ')
  await page.getByRole('link', { name: 'Statistik' }).click()
  // Stats links to Wrapped only after a week of recorded days; with one day it still opens by its address.
  await expect(page.getByText(/^Wrapped terbuka setelah 7 hari/)).toBeVisible()
  await page.goto(`/wrapped/${thisMonth()}`)
  // Slide: pembuka, mood, surat (tanpa tag), penutup
  await expect(page.getByRole('group', { name: '1 dari 4' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('group', { name: '2 dari 4' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('Ada pesan dari Teman')).toBeVisible()
  await page.getByRole('button', { name: 'Buka' }).click()

  await expect(page.getByText('Surat untukmu.')).toBeVisible()
  const letterBodies = bodies.filter((b) => b.model === 'claude-opus-5-5')
  expect(letterBodies.length).toBeGreaterThan(0)
  expect(JSON.stringify(letterBodies)).not.toContain('RAHASIA-e2e')
})
