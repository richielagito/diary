import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { FakeServer } from '../src/sync/testing/fakeServer'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
}
const EMAIL = 'e2e@example.com'

/** Contexts in this set cannot reach the server, like a laptop on a train. */
const offline = new Set<BrowserContext>()

async function newDevice(browser: Browser, server: FakeServer): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: 'http://localhost:4173', locale: 'id-ID', timezoneId: 'Asia/Jakarta' })
  await context.route(`${server.origin}/**`, async (route) => {
    if (offline.has(context)) return route.abort()
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const res = await server.handle(request.method(), request.url(), await request.allHeaders(), request.postData())
    await route.fulfill({
      status: res.status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: res.body === undefined ? '' : JSON.stringify(res.body),
    })
  })
  return { context, page: await context.newPage() }
}

async function signIn(page: Page, server: FakeServer) {
  await page.goto('/settings')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByRole('button', { name: 'Kirim kode' }).click()
  await expect(page.getByText(`Kode dikirim ke ${EMAIL}.`)).toBeVisible()
  await page.getByLabel('Kode dari email').fill(server.lastCode(EMAIL))
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
}

/** Turns sync on with the key the page generates, and returns that key as shown. */
async function firstDevice(page: Page, server: FakeServer): Promise<string> {
  await signIn(page, server)
  const key = (await page.getByLabel('Kunci pemulihan').textContent())!
  await page.getByRole('checkbox', { name: 'Saya sudah menyimpan kunci ini' }).check()
  await page.getByRole('button', { name: 'Lanjut' }).click()
  await expect(page.getByText(/^Terakhir sync:/)).toBeVisible()
  return key
}

async function anotherDevice(page: Page, server: FakeServer, key: string) {
  await signIn(page, server)
  await page.getByLabel('Kunci pemulihan').fill(key)
  await page.getByRole('button', { name: 'Buka' }).click()
  await expect(page.getByText(/^Terakhir sync:/)).toBeVisible()
}

/** How many requests of this kind the server has seen so far. */
const requestCount = (server: FakeServer, method: string, path: string) =>
  server.requests.filter((r) => r.method === method && r.path === path).length
const pushes = (server: FakeServer) => requestCount(server, 'POST', '/sync')
const pulls = (server: FakeServer) => requestCount(server, 'GET', '/sync')

/** Presses "Sync sekarang" and waits until the server has seen a new pull from this click. */
async function syncNow(page: Page, server: FakeServer) {
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: 'Sync sekarang' })).toBeEnabled()
  const before = pulls(server)
  await page.getByRole('button', { name: 'Sync sekarang' }).click()
  await expect.poll(() => pulls(server), { timeout: 15_000 }).toBeGreaterThan(before)
  await expect(page.getByRole('button', { name: 'Sync sekarang' })).toBeEnabled()
  await expect(page.getByText(/^Terakhir sync:/)).toBeVisible()
}

const editor = (page: Page) => page.getByRole('textbox', { name: 'Tulis diary' })

test('a diary written on one device appears on another, and the server never sees it', async ({ browser }) => {
  const server = new FakeServer()
  const laptop = await newDevice(browser, server)
  const key = await firstDevice(laptop.page, server)

  const pushesBefore = pushes(server)
  const recordsBefore = server.user(EMAIL).records.size
  await laptop.page.goto('/')
  await editor(laptop.page).click()
  await laptop.page.keyboard.type('RAHASIA-e2e ditulis di laptop ')
  await expect(laptop.page.getByRole('status')).toHaveText('Tersimpan')
  await expect.poll(() => pushes(server), { timeout: 15_000 }).toBeGreaterThan(pushesBefore)
  // The entry's blob is new, so the check below ran against it and not only against earlier records.
  expect(server.user(EMAIL).records.size).toBeGreaterThan(recordsBefore)
  for (const record of server.user(EMAIL).records.values()) {
    expect(Buffer.from(record.blob, 'base64').toString('latin1')).not.toContain('RAHASIA')
  }

  const phone = await newDevice(browser, server)
  await anotherDevice(phone.page, server, key)
  await phone.page.goto('/')
  await expect(editor(phone.page)).toContainText('RAHASIA-e2e ditulis di laptop')

  await laptop.context.close()
  await phone.context.close()
})

test('a mood tapped on the phone and text written offline on the laptop both survive', async ({ browser }) => {
  const server = new FakeServer()
  const laptop = await newDevice(browser, server)
  const key = await firstDevice(laptop.page, server)
  const phone = await newDevice(browser, server)
  await anotherDevice(phone.page, server, key)

  offline.add(laptop.context)
  await laptop.page.goto('/')
  await editor(laptop.page).click()
  await laptop.page.keyboard.type('ditulis di kereta ')
  await expect(laptop.page.getByRole('status')).toHaveText('Tersimpan')

  // 1. The phone taps the mood and its push reaches the server.
  const phonePushFrom = pushes(server)
  await phone.page.goto('/')
  await phone.page.getByRole('button', { name: 'Senang' }).click()
  await expect(phone.page.getByRole('button', { name: 'Senang' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => pushes(server), { timeout: 15_000 }).toBeGreaterThan(phonePushFrom)

  // 2. The laptop is back online: it pulls, then pushes the merged entry.
  offline.delete(laptop.context)
  const laptopPushFrom = pushes(server)
  await syncNow(laptop.page, server)
  await expect.poll(() => pushes(server), { timeout: 15_000 }).toBeGreaterThan(laptopPushFrom)
  await laptop.page.goto('/')
  await expect(editor(laptop.page)).toContainText('ditulis di kereta')
  await expect(laptop.page.getByRole('button', { name: 'Senang' })).toHaveAttribute('aria-pressed', 'true')

  // 3. The phone pulls the merged entry.
  await syncNow(phone.page, server)
  await phone.page.goto('/')
  await expect(editor(phone.page)).toContainText('ditulis di kereta')
  await expect(phone.page.getByRole('button', { name: 'Senang' })).toHaveAttribute('aria-pressed', 'true')

  await laptop.context.close()
  await phone.context.close()
})
