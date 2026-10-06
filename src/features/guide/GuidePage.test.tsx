import { screen } from '@testing-library/react'
import { renderApp } from '../../test/renderApp'

test('the quick guide stays reachable from Settings after the welcome entry is gone', async () => {
  const { user } = await renderApp('/settings')
  await user.click(await screen.findByRole('link', { name: 'Panduan' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Panduan' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'Menulis' })).toBeInTheDocument()
  expect(screen.getByText('Arsip', { selector: 'strong' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Kembali' })).toHaveAttribute('href', '/settings')
})
