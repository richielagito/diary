import type { ChatProvider, ChatTurn } from './types'

/** Jalankan satu permintaan non-interaktif dan kumpulkan seluruh jawabannya sebagai teks. */
export async function completeText(
  provider: ChatProvider,
  req: { system: string; messages: ChatTurn[]; signal?: AbortSignal },
): Promise<string> {
  let text = ''
  for await (const chunk of provider.stream({ ...req, signal: req.signal ?? new AbortController().signal })) text += chunk
  return text
}
