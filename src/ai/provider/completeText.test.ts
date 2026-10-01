import { failWith, replyWith } from '../../test/fakeProvider'
import { completeText } from './completeText'
import type { AiConfig } from './types'

const cfg: AiConfig = { provider: 'anthropic', apiKey: 'k', baseUrl: '', model: 'm' }

test('joins streamed chunks', async () => {
  expect(await completeText(replyWith('{"a"', ':1}')(cfg), { system: 's', messages: [] })).toBe('{"a":1}')
})
test('rethrows provider errors', async () => {
  await expect(completeText(failWith('auth')(cfg), { system: 's', messages: [] })).rejects.toMatchObject({ kind: 'auth' })
})
