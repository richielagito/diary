import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: 'Tulis diary' })

async function write(page: Page, date: string, text: string) {
  await page.goto(`/day/${date}`)
  await editor(page).click()
  await page.keyboard.type(text)
  await expect(page.getByRole('status')).toHaveText('Tersimpan')
}

test('write, autosave, reload keeps text and mood', async ({ page }) => {
  await write(page, '2026-09-20', 'Hari ini belajar #kuliah')
  await page.getByRole('button', { name: 'Senang' }).click()
  await page.reload()
  await expect(editor(page)).toContainText('Hari ini belajar #kuliah')
  await expect(page.getByRole('button', { name: 'Senang' })).toHaveAttribute('aria-pressed', 'true')
})

test('archive search finds entry by tag and opens it', async ({ page }) => {
  await write(page, '2026-09-20', 'Ujian #kuliah')
  await page.getByRole('link', { name: 'Arsip' }).click()
  await page.getByRole('searchbox', { name: 'Cari' }).fill('#kuliah')
  await expect(page.getByText('1 hasil')).toBeVisible()
  await page.getByRole('list', { name: 'Cari' }).getByRole('link').click()
  await expect(editor(page)).toContainText('Ujian #kuliah')
})

test('export then import into a fresh profile restores entries', async ({ page, browser }) => {
  await write(page, '2026-09-20', 'Backup ini penting')
  await page.getByRole('link', { name: 'Pengaturan' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Ekspor cadangan (ZIP)' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^diary-export-\d{4}-\d{2}-\d{2}\.zip$/)
  const zipPath = await download.path()
  if (!zipPath) throw new Error('download did not save to disk')

  const fresh = await browser.newContext({ baseURL: 'http://localhost:4173', locale: 'id-ID', timezoneId: 'Asia/Jakarta' })
  const p2 = await fresh.newPage()
  await p2.goto('/settings')
  // download.path() saves to a temp file without the original extension, but the app
  // decides .zip vs .md by file name, so re-attach the real suggested filename here
  // (this is what happens when a real user re-selects their downloaded export file).
  await p2.getByLabel('Impor').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/zip',
    buffer: readFileSync(zipPath),
  })
  await expect(p2.getByText('1 entri baru')).toBeVisible()
  // Scoped to the dialog: the file input labelled "Import" is itself exposed with
  // role=button and accessible name "Import" in Chromium, so the unscoped locator
  // is ambiguous between it and the dialog's actual "Import" confirm button.
  await p2.getByRole('dialog').getByRole('button', { name: 'Impor' }).click()
  await expect(p2.getByText('Selesai: 1 ditambah, 0 ditimpa, 0 dilewati.')).toBeVisible()
  await p2.goto('/day/2026-09-20')
  await expect(editor(p2)).toContainText('Backup ini penting')
  await fresh.close()
})

test('app opens offline after first visit', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload() // sekarang halaman dikontrol service worker
  await context.setOffline(true)
  await page.reload()
  await expect(editor(page)).toBeVisible()
})
