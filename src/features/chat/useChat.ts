import { useCallback, useEffect, useRef, useState } from 'react'
import { useRepos } from '../../app/RepoContext'
import { ProviderError, type AiConfig, type ProviderErrorKind } from '../../ai/provider/types'
import type { DateKey } from '../../domain/types'
import type { ChatMessage } from '../../storage/ChatRepository'

export const HISTORY_LIMIT = 30
/** Awal jendela riwayat bergeser per langkah ini, jadi prefiks yang di-cache tetap sama selama beberapa giliran. */
export const HISTORY_STEP = 10

export type ChatPhase =
  | { phase: 'idle' }
  | { phase: 'streaming'; partial: string }
  | {
      phase: 'error'
      kind: ProviderErrorKind | 'storage'
      unsaved?: { content: string; status: 'complete' | 'stopped' }
    }

interface Options {
  date: DateKey
  messages: ChatMessage[]
  config: AiConfig | null
  loadPrompt: (latestUserText: string) => Promise<{ system: string; context: string }>
  /** Dipanggil setelah jawaban lengkap tersimpan (tidak untuk jawaban yang dihentikan, gagal, atau kosong). */
  onReplySaved?: () => void
  now?: () => number
}

/**
 * Ambil paling banyak HISTORY_LIMIT pesan terakhir. Awal jendela bergeser per HISTORY_STEP pesan, bukan per pesan,
 * supaya pesan pertama (dan cache prompt) tetap sama beberapa giliran berturut-turut. Lalu buang giliran assistant
 * di awal supaya pesan pertama selalu dari user.
 */
export function trimHistory(history: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  const over = history.length - HISTORY_LIMIT
  const sliced = history.slice(over > 0 ? Math.ceil(over / HISTORY_STEP) * HISTORY_STEP : 0)
  const start = sliced.findIndex((m) => m.role === 'user')
  return (start === -1 ? [] : sliced.slice(start)).map((m) => ({ role: m.role, content: m.content }))
}

export function useChat({ date, messages, config, loadPrompt, onReplySaved, now = Date.now }: Options) {
  const { chats, createProvider } = useRepos()
  const [state, setState] = useState<ChatPhase>({ phase: 'idle' })
  const busy = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const nowRef = useRef(now)
  nowRef.current = now
  const onReplySavedRef = useRef(onReplySaved)
  onReplySavedRef.current = onReplySaved
  /** Beri tahu bahwa jawaban tersimpan. Kegagalan callback hanya dicatat; jawaban tetap dianggap tersimpan. */
  const replySaved = useCallback((status: 'complete' | 'stopped') => {
    if (status !== 'complete') return
    try {
      onReplySavedRef.current?.()
    } catch (err) {
      console.error(err)
    }
  }, [])
  const stateRef = useRef(state)
  stateRef.current = state

  const run = useCallback(
    async (history: ChatMessage[]) => {
      if (!config) return
      busy.current = true
      const ac = new AbortController()
      controller.current = ac
      let partial = ''
      setState({ phase: 'streaming', partial })
      try {
        let status: 'complete' | 'stopped'
        try {
          const latest = [...history].reverse().find((m) => m.role === 'user')?.content ?? ''
          const { system, context } = await loadPrompt(latest)
          const turns = trimHistory(history)
          for await (const chunk of createProvider(config).stream({ system, context, messages: turns, signal: ac.signal, cache: true })) {
            partial += chunk
            if (mounted.current) setState({ phase: 'streaming', partial })
          }
          status = 'complete'
        } catch (err) {
          const kind: ProviderErrorKind = err instanceof ProviderError ? err.kind : 'unknown'
          if (kind !== 'aborted') {
            if (mounted.current) setState({ phase: 'error', kind })
            return
          }
          status = 'stopped'
        }
        if (!partial.trim()) {
          if (mounted.current) setState({ phase: 'idle' })
          return
        }
        try {
          await chats.add({ date, role: 'assistant', content: partial, createdAt: nowRef.current(), status })
        } catch (err) {
          console.error(err)
          if (mounted.current) setState({ phase: 'error', kind: 'storage', unsaved: { content: partial, status } })
          return
        }
        if (mounted.current) setState({ phase: 'idle' })
        replySaved(status)
      } finally {
        if (controller.current === ac) controller.current = null
        busy.current = false
      }
    },
    [config, loadPrompt, createProvider, chats, date, replySaved],
  )

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const content = text.trim()
      if (!content || !config || busy.current) return false
      busy.current = true
      // Typing dots from the moment of sending, not only once the message is stored.
      setState({ phase: 'streaming', partial: '' })

      // A prior reply that failed to save is still only on screen, not in storage. Save it now,
      // before starting a new run, so sending a new message never silently discards it.
      const current = stateRef.current
      let savedReply: ChatMessage | null = null
      if (current.phase === 'error' && current.unsaved) {
        const unsaved = current.unsaved
        try {
          savedReply = await chats.add({
            date,
            role: 'assistant',
            content: unsaved.content,
            createdAt: nowRef.current(),
            status: unsaved.status,
          })
        } catch (err) {
          console.error(err)
          busy.current = false
          if (mounted.current) setState({ phase: 'error', kind: 'storage', unsaved })
          return false
        }
        replySaved(unsaved.status)
      }

      let userMessage: ChatMessage
      try {
        userMessage = await chats.add({ date, role: 'user', content, createdAt: nowRef.current(), status: 'complete' })
      } catch (err) {
        console.error(err)
        busy.current = false
        if (mounted.current) setState({ phase: 'error', kind: 'storage' })
        return false
      }
      // messagesRef may not have caught up with the reply saved above; add it once, before the new message.
      const history = savedReply ? [...messagesRef.current.filter((m) => m.id !== savedReply.id), savedReply] : messagesRef.current
      void run([...history, userMessage])
      return true
    },
    [config, chats, date, run, replySaved],
  )

  const retry = useCallback(() => {
    if (busy.current) return
    const current = stateRef.current
    if (current.phase !== 'error') return
    const unsaved = current.unsaved
    if (unsaved) {
      busy.current = true
      void (async () => {
        try {
          await chats.add({ date, role: 'assistant', content: unsaved.content, createdAt: nowRef.current(), status: unsaved.status })
        } catch (err) {
          console.error(err)
          if (mounted.current) setState({ phase: 'error', kind: 'storage', unsaved })
          return
        } finally {
          busy.current = false
        }
        if (mounted.current) setState({ phase: 'idle' })
        replySaved(unsaved.status)
      })()
      return
    }
    void run(messagesRef.current)
  }, [run, chats, date, replySaved])

  const stop = useCallback(() => controller.current?.abort(), [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
    }
  }, [])

  return { state, send, retry, stop }
}
