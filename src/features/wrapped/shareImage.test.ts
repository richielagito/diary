import { shareImage } from './shareImage'

const file = new File(['x'], 'diary-wrapped-2026.png', { type: 'image/png' })
let clicks: { href: string; download: string; attached: boolean }[]

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  clicks = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ href: this.href, download: this.download, attached: this.isConnected })
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const sharing = (share: Navigator['share']) => ({ canShare: () => true, share }) as unknown as Navigator

test('shares when files are supported', async () => {
  const share = vi.fn().mockResolvedValue(undefined)
  expect(await shareImage(file, sharing(share))).toBe('shared')
  expect(share).toHaveBeenCalledWith({ files: [file] })
  expect(clicks).toHaveLength(0)
})

test.each([
  ['a DOMException', new DOMException('x', 'AbortError')],
  ['a plain error named AbortError', Object.assign(new Error('x'), { name: 'AbortError' })],
])('AbortError (%s) is cancelled without a download', async (_, err) => {
  expect(await shareImage(file, sharing(vi.fn().mockRejectedValue(err)))).toBe('cancelled')
  expect(clicks).toHaveLength(0)
  expect(document.querySelector('a')).toBeNull()
})

test('falls back to download with an attached anchor and a delayed revoke', async () => {
  vi.useFakeTimers()
  expect(await shareImage(file, {} as Navigator)).toBe('downloaded')
  expect(clicks).toEqual([{ href: 'blob:x', download: 'diary-wrapped-2026.png', attached: true }])
  expect(document.querySelector('a')).toBeNull()
  vi.advanceTimersByTime(999)
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
})

test.each([
  ['TypeError', new TypeError('no')],
  ['NotAllowedError', new DOMException('lost user activation', 'NotAllowedError')],
])('a %s from share falls back to download', async (_, err) => {
  expect(await shareImage(file, sharing(vi.fn().mockRejectedValue(err)))).toBe('downloaded')
  expect(clicks).toEqual([{ href: 'blob:x', download: 'diary-wrapped-2026.png', attached: true }])
})
