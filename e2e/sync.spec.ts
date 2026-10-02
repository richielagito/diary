import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { FakeServer } from '../src/sync/testing/fakeServer'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
}
const EMAIL = 'e2e@example.com'
const PASS = 'frasa sandi e2e'

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

async function firstDevice(page: Page, server: FakeServer) {
  await signIn(page, server)
  await page.getByLabel('Frasa sandi sync').fill(PASS)
  await page.getByLabel('Ulangi frasa sandi').fill(PASS)
  await page.getByRole('button', { name: 'Buat frasa sandi' }).click()
  await expect(page.getByText(/^Terakhir sync:/)).toBeVisible()
}

async function anotherDevice(page: Page, server: FakeServer) {
  await signIn(page, server)
  await page.getByLabel('Frasa sandi sync').fill(PASS)
  await page.getByRole('button', { name: 'Buka' }).click()
  await expect(page.getByText(/^Terakhir sync:/)).toBeVisible()
}

async function syncNow(page: Page) {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Sync sekarang' }).click()
  await expect(page.getByText(/^Terakhir sync:/)).toBeVisible()
}

const editor = (page: Page) => page.getByRole('textbox', { name: 'Tulis diary' })

test('a diary written on one device appears on another, and the server never sees it', async ({ browser }) => {
  const server = new FakeServer()
  const laptop = await newDevice(browser, server)
  await firstDevice(laptop.page, server)

  await laptop.page.goto('/')
  await editor(laptop.page).click()
  await laptop.page.keyboard.type('RAHASIA-e2e ditulis di laptop ')
  await expect(laptop.page.getByRole('status')).toHaveText('Tersimpan')
  await expect.poll(() => server.user(EMAIL).records.size, { timeout: 15_000 }).toBeGreaterThan(0)
  for (const record of server.user(EMAIL).records.values()) {
    expect(Buffer.from(record.blob, 'base64').toString('latin1')).not.toContain('RAHASIA')
  }

  const phone = await newDevice(browser, server)
  await anotherDevice(phone.page, server)
  await phone.page.goto('/')
  await expect(editor(phone.page)).toContainText('RAHASIA-e2e ditulis di laptop')

  await laptop.context.close()
  await phone.context.close()
})

test('a mood tapped on the phone and text written offline on the laptop both survive', async ({ browser }) => {
  const server = new FakeServer()
  const laptop = await newDevice(browser, server)
  await firstDevice(laptop.page, server)
  const phone = await newDevice(browser, server)
  await anotherDevice(phone.page, server)

  offline.add(laptop.context)
  await laptop.page.goto('/')
  await editor(laptop.page).click()
  await laptop.page.keyboard.type('ditulis di kereta ')
  await expect(laptop.page.getByRole('status')).toHaveText('Tersimpan')

  await phone.page.goto('/')
  await phone.page.getByRole('button', { name: 'Senang' }).click()
  await expect(phone.page.getByRole('button', { name: 'Senang' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => server.user(EMAIL).records.size, { timeout: 15_000 }).toBeGreaterThan(0)

  offline.delete(laptop.context)
  await syncNow(laptop.page)
  await laptop.page.goto('/')
  await expect(editor(laptop.page)).toContainText('ditulis di kereta')
  await expect(laptop.page.getByRole('button', { name: 'Senang' })).toHaveAttribute('aria-pressed', 'true')

  await syncNow(phone.page)
  await phone.page.goto('/')
  await expect(editor(phone.page)).toContainText('ditulis di kereta')
  await expect(phone.page.getByRole('button', { name: 'Senang' })).toHaveAttribute('aria-pressed', 'true')

  await laptop.context.close()
  await phone.context.close()
})
