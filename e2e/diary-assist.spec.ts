import { expect, test } from '@playwright/test'

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

test('a conversation becomes diary text with a suggested mood and tag', async ({ page }) => {
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const body = route.request().postDataJSON() as { system: { text: string }[] }
    const text = body.system[0].text.includes('Write a diary passage as the user')
      ? JSON.stringify({ text: 'Hari ini aku cerita soal kucingku.', mood: 4, tags: ['kucing'] })
      : 'Aku dengerin.'
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: anthropicSse(text) })
  })

  await page.goto('/settings')
  await page.getByLabel('API key').fill('sk-e2e')
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByText('Tersimpan.')).toBeVisible()

  await page.getByRole('link', { name: 'Curhat' }).click()
  const input = page.getByRole('textbox', { name: 'Pesan' })
  await input.fill('aku cerita soal kucingku')
  await input.press('Enter')
  await expect(page.getByText('Aku dengerin.')).toBeVisible()

  await page.getByRole('button', { name: 'Simpan jadi diary' }).click()
  await page.getByRole('button', { name: 'Tambahkan ke diary' }).click()
  await page.getByRole('link', { name: 'Buka diary tanggal ini' }).click()

  const editor = page.getByRole('textbox', { name: 'Tulis diary' })
  await expect(editor).toContainText('Hari ini aku cerita soal kucingku.')
  await expect(editor).toContainText('#kucing')
  await expect(page.getByRole('button', { name: 'Baik', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
