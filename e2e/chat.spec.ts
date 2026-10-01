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

test('configure Anthropic, chat, and the conversation survives a reload', async ({ page }) => {
  const bodies: { model: string; system: { text: string }[] }[] = []
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    bodies.push(route.request().postDataJSON())
    expect(route.request().headers()['x-api-key']).toBe('sk-e2e')
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: anthropicSse('Aku di sini untukmu.') })
  })

  await page.goto('/settings')
  await page.getByLabel('API key').fill('sk-e2e')
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByText('Tersimpan.')).toBeVisible()

  await page.getByRole('link', { name: 'Curhat' }).click()
  const input = page.getByRole('textbox', { name: 'Pesan' })
  await input.fill('hari ini capek banget')
  await input.press('Enter')
  await expect(page.getByText('Aku di sini untukmu.')).toBeVisible()
  expect(bodies[0].model).toBe('claude-opus-5-5')
  expect(bodies[0].system[0].text).toContain('You are Teman')

  await page.reload()
  await expect(page.getByText('hari ini capek banget')).toBeVisible()
  await expect(page.getByText('Aku di sini untukmu.')).toBeVisible()
})
