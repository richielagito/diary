/** Membuat Response SSE palsu untuk test adapter. `data` string dikirim apa adanya, selain itu di-JSON-kan. */
export function sseResponse(events: { event?: string; data: unknown }[]): Response {
  const body = events
    .map((e) => `${e.event ? `event: ${e.event}\n` : ''}data: ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}\n\n`)
    .join('')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

export function jsonErrorResponse(status: number, body: unknown = { error: { type: 'error', message: 'err' } }): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export async function collect(it: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const chunk of it) out += chunk
  return out
}
