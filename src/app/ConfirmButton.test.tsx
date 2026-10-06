import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmButton } from './ConfirmButton'

test('asking lands on cancel, so a second Enter never deletes; Escape cancels and returns focus', async () => {
  const user = userEvent.setup()
  const onConfirm = vi.fn()
  render(<ConfirmButton label="Hapus" question="Hapus semua?" confirmLabel="Ya, hapus" onConfirm={onConfirm} />)
  await user.click(screen.getByRole('button', { name: 'Hapus' }))
  expect(screen.getByRole('group', { name: 'Hapus' })).toHaveAccessibleDescription('Hapus semua?')
  expect(screen.getByRole('button', { name: 'Batal' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(onConfirm).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Hapus' })).toHaveFocus()
})
