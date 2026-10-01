import { collect } from '../ai/provider/sse.test-utils'
import type { AiConfig } from '../ai/provider/types'
import { controllable, failWith, replyWith } from './fakeProvider'

const cfg: AiConfig = { provider: 'anthropic', apiKey: 'k', baseUrl: '', model: 'm' }
const req = (signal = new AbortController().signal) => ({ system: 's', messages: [], signal })

test('replyWith streams chunks', async () => {
  expect(await collect(replyWith('a', 'b')(cfg).stream(req()))).toBe('ab')
})

test('failWith throws the kind', async () => {
  await expect(collect(failWith('auth')(cfg).stream(req()))).rejects.toMatchObject({ kind: 'auth' })
})

test('controllable streams pushed text until finish, and abort throws aborted', async () => {
  const c = controllable()
  const p = collect(c.createProvider(cfg).stream(req()))
  c.push('x')
  c.push('y')
  c.finish()
  expect(await p).toBe('xy')

  const ac = new AbortController()
  const p2 = collect(c.createProvider(cfg).stream(req(ac.signal)))
  ac.abort()
  await expect(p2).rejects.toMatchObject({ kind: 'aborted' })
  expect(c.requests).toHaveLength(2)
})

test('controllable keeps text and finish sent before the stream starts', async () => {
  const c = controllable()
  c.push('early')
  c.finish()
  expect(await collect(c.createProvider(cfg).stream(req()))).toBe('early')
})

test('controllable throws aborted at once for an already-aborted signal', async () => {
  const c = controllable()
  const ac = new AbortController()
  ac.abort()
  await expect(collect(c.createProvider(cfg).stream(req(ac.signal)))).rejects.toMatchObject({ kind: 'aborted' })
  expect(c.requests).toHaveLength(1)
})

test('an abort or failure does not leak into the next stream', async () => {
  const c = controllable()
  const ac = new AbortController()
  const aborted = collect(c.createProvider(cfg).stream(req(ac.signal)))
  ac.abort()
  await expect(aborted).rejects.toMatchObject({ kind: 'aborted' })

  const failed = collect(c.createProvider(cfg).stream(req()))
  c.fail('auth')
  await expect(failed).rejects.toMatchObject({ kind: 'auth' })

  const next = collect(c.createProvider(cfg).stream(req()))
  c.push('ok')
  c.finish()
  expect(await next).toBe('ok')
})

test('reset clears pending text, finish and failure', async () => {
  const c = controllable()
  c.push('stale')
  c.fail('auth')
  c.reset()
  const p = collect(c.createProvider(cfg).stream(req()))
  c.push('fresh')
  c.finish()
  expect(await p).toBe('fresh')
})
