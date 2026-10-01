import { render, screen } from '@testing-library/react'
import type { ChatMessage } from '../../storage/ChatRepository'
import { MessageList } from './MessageList'

const msg = (id: string, role: ChatMessage['role'], content: string): ChatMessage => ({
  id,
  date: '2026-09-20',
  role,
  content,
  createdAt: Number(id),
  status: 'complete',
})

test('a saved reply that arrives before the stream settles is shown once', () => {
  const messages = [msg('1', 'user', 'halo'), msg('2', 'assistant', 'Aku di sini untukmu.')]
  render(<MessageList messages={messages} state={{ phase: 'streaming', partial: 'Aku di sini untukmu.' }} onRetry={() => {}} />)
  expect(screen.getAllByText('Aku di sini untukmu.')).toHaveLength(1)
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
})

test('the streaming row still shows after a user message or an earlier, different reply', () => {
  const messages = [msg('1', 'user', 'halo'), msg('2', 'assistant', 'lama'), msg('3', 'user', 'lagi')]
  render(<MessageList messages={messages} state={{ phase: 'streaming', partial: 'lama' }} onRetry={() => {}} />)
  expect(screen.getAllByText('lama')).toHaveLength(2)
  expect(screen.getAllByRole('listitem')).toHaveLength(4)
})
