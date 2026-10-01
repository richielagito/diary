import { expect, test } from '@playwright/test'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function anthropicSse(text: string): string {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }],
    ['message_stop', { type: 'message_stop' }],
  ] as const
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
}

/** Markdown of every stored entry, read straight from IndexedDB (runs in the page). */
function storedMarkdown(): Promise<string> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('diary')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const all = db.transaction('entries').objectStore('entries').getAll()
      all.onerror = () => reject(all.error)
      all.onsuccess = () => {
        db.close()
        resolve((all.result as { markdown: string }[]).map((e) => e.markdown).join('\n'))
      }
    }
  })
}

test('typing # offers an AI tag chip that Tab accepts and autosave keeps', async ({ page }) => {
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const body = route.request().postDataJSON() as { model: string; system: string | { text: string }[] }
    const system = typeof body.system === 'string' ? body.system : body.system.map((b) => b.text).join('\n')
    const isTagRequest = body.model === 'claude-haiku-4-5' && system.includes('suggest topic tags')
    const text = isTagRequest ? JSON.stringify({ tags: ['kantor', 'kucing'] }) : 'Aku dengerin.'
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: anthropicSse(text) })
  })

  await page.goto('/settings')
  await page.getByLabel('API key').fill('sk-e2e')
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByText('Tersimpan.')).toBeVisible()

  await page.goto('/')
  const editor = page.getByRole('textbox', { name: 'Tulis diary' })
  await editor.click()
  await page.keyboard.type('Hari ini presentasi di #ka')

  await expect(page.getByRole('button', { name: 'Tambah tag #kantor' })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(editor).toContainText('#kantor')

  // Blur flushes the autosave; wait until the stored entry has the tag before reloading.
  await editor.blur()
  await expect.poll(() => page.evaluate(storedMarkdown)).toContain('#kantor')

  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Tulis diary' })).toContainText('#kantor')
})
