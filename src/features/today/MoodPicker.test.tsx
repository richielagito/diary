import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MoodPicker } from './MoodPicker'

test('selects mood and toggles off when clicking active mood', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const { rerender } = render(<MoodPicker value={null} onChange={onChange} />)
  await user.click(screen.getByRole('button', { name: 'Senang' }))
  expect(onChange).toHaveBeenLastCalledWith(5)

  rerender(<MoodPicker value={5} onChange={onChange} />)
  expect(screen.getByRole('button', { name: 'Senang' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Senang' }))
  expect(onChange).toHaveBeenLastCalledWith(null)
})

test('faces run from happiest to saddest', () => {
  render(<MoodPicker value={null} onChange={() => {}} />)
  expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Senang', 'Baik', 'Biasa', 'Kurang baik', 'Sedih'])
})

test('group is labelled', () => {
  render(<MoodPicker value={null} onChange={() => {}} />)
  expect(screen.getByRole('group', { name: 'Mood hari ini' })).toBeInTheDocument()
})

test('the faces are one tab stop and arrow keys move between them', async () => {
  const user = userEvent.setup()
  render(<MoodPicker value={4} onChange={() => {}} />)
  await user.tab()
  expect(screen.getByRole('button', { name: 'Baik' })).toHaveFocus()
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('button', { name: 'Biasa' })).toHaveFocus()
  await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}')
  // Wraps from the first face to the last.
  expect(screen.getByRole('button', { name: 'Sedih' })).toHaveFocus()
})
