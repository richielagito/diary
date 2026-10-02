import { expect, test } from '@playwright/test'

// The default build, without VITE_API_URL: the second web server in playwright.config.ts.
const ORIGIN = 'http://localhost:4174'
test.use({ baseURL: ORIGIN })

test('a build without a sync server has no account section and talks to no other origin', async ({ page }) => {
  const elsewhere: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith(`${ORIGIN}/`) && !/^(data|blob):/.test(url)) elsewhere.push(url)
  })

  await page.goto('/settings')
  await expect(page.getByRole('button', { name: 'Export ZIP' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Akun & sinkronisasi' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Pengaturan', exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Perlu perhatian' })).toHaveCount(0)

  await page.goto('/day/2026-09-20')
  await page.getByRole('textbox', { name: 'Tulis diary' }).click()
  await page.keyboard.type('ditulis tanpa server')
  await expect(page.getByRole('status')).toHaveText('Tersimpan')
  // Longer than the pause after which a build with sync would start a round.
  await page.waitForTimeout(6500)
  expect(elsewhere).toEqual([])
})
