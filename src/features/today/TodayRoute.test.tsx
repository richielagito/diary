import { screen } from '@testing-library/react'
import { renderApp } from '../../test/renderApp'

afterEach(() => vi.useRealTimers())

test('Hari ini link after midnight opens the new day', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 27, 23, 59))
  const { user } = await renderApp('/')
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('27')

  vi.setSystemTime(new Date(2026, 8, 28, 0, 5))
  await user.click(screen.getByRole('link', { name: 'Hari ini' }))
  expect(await screen.findByRole('heading', { level: 1, name: /28/ })).toBeInTheDocument()
})
