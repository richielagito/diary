import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Composer } from './Composer'

test('the input is disabled while sending so text typed meanwhile is not wiped', async () => {
  let resolve: (sent: boolean) => void = () => {}
  const onSend = vi.fn(() => new Promise<boolean>((r) => (resolve = r)))
  const user = userEvent.setup()
  render(<Composer streaming={false} onSend={onSend} onStop={() => {}} />)
  const input = screen.getByRole('textbox', { name: 'Pesan' })
  await user.type(input, 'halo{Enter}')
  expect(onSend).toHaveBeenCalledWith('halo')
  expect(input).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Kirim' })).toBeDisabled()
  await act(async () => resolve(true))
  expect(input).toBeEnabled()
  expect(input).toHaveValue('')
})

test('a failed send re-enables the input and keeps the draft', async () => {
  let resolve: (sent: boolean) => void = () => {}
  const onSend = vi.fn(() => new Promise<boolean>((r) => (resolve = r)))
  const user = userEvent.setup()
  render(<Composer streaming={false} onSend={onSend} onStop={() => {}} />)
  const input = screen.getByRole('textbox', { name: 'Pesan' })
  await user.type(input, 'halo')
  await user.click(screen.getByRole('button', { name: 'Kirim' }))
  expect(input).toBeDisabled()
  await act(async () => resolve(false))
  expect(input).toBeEnabled()
  expect(input).toHaveValue('halo')
})
