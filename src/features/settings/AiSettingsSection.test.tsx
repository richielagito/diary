import { screen, waitFor, within } from '@testing-library/react'
import type { CreateProvider } from '../../ai/provider/createProvider'
import type { ListModels } from '../../ai/provider/listModels'
import { ProviderError } from '../../ai/provider/types'
import { failWith, replyWith } from '../../test/fakeProvider'
import { renderApp } from '../../test/renderApp'

/** Values offered by the datalist that an input points to. */
function optionsOf(input: HTMLElement): string[] {
  const list = document.getElementById(input.getAttribute('list') ?? '')
  return [...(list?.querySelectorAll('option') ?? [])].map((o) => o.getAttribute('value') ?? '')
}

test('defaults to anthropic with default model; saving stores config', async () => {
  const { settingsStore, user } = await renderApp('/settings')
  expect(await screen.findByRole('combobox', { name: 'Provider' })).toHaveValue('anthropic')
  expect(screen.getByLabelText('Model')).toHaveValue('claude-opus-5-5')
  expect(screen.queryByLabelText('Base URL')).not.toBeInTheDocument()
  await user.type(screen.getByLabelText('API key'), 'sk-ant-test')
  await user.click(screen.getByRole('button', { name: 'Simpan' }))
  await waitFor(async () =>
    expect((await settingsStore.getAll()).ai).toEqual({ provider: 'anthropic', apiKey: 'sk-ant-test', baseUrl: '', model: 'claude-opus-5-5', fastModel: '' }),
  )
  expect(await screen.findByText('Tersimpan.')).toBeInTheDocument()
})

test('the first AI save asks what may be sent, and each choice applies at once', async () => {
  const { settingsStore, user } = await renderApp('/settings')
  await user.type(await screen.findByLabelText('API key'), 'sk-ant-test')
  await user.click(screen.getByRole('button', { name: 'Simpan' }))
  const choices = await screen.findByRole('group', { name: 'Apa saja yang boleh dikirim ke AI?' })
  await user.click(within(choices).getByRole('checkbox', { name: /Sertakan diary/ }))
  await user.click(within(choices).getByRole('checkbox', { name: 'Saran tag otomatis saat mengetik #' }))
  await waitFor(async () => expect(await settingsStore.getAll()).toMatchObject({ aiIncludeDiary: false, aiTagSuggest: false }))
  await user.click(within(choices).getByRole('button', { name: 'Selesai' }))
  expect(screen.queryByRole('group', { name: 'Apa saja yang boleh dikirim ke AI?' })).not.toBeInTheDocument()
})

test('switching to OpenRouter fills preset base URL and default model', async () => {
  const { user } = await renderApp('/settings')
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Provider' }), 'openrouter')
  expect(screen.getByLabelText('Base URL')).toHaveValue('https://openrouter.ai/api/v1')
  expect(screen.getByLabelText('Model')).toHaveValue('openai/gpt-5.6-sol')
})

test('required fields block saving', async () => {
  const { settingsStore, user } = await renderApp('/settings')
  await user.click(await screen.findByRole('button', { name: 'Simpan' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Wajib diisi: API key')
  expect((await settingsStore.getAll()).ai).toBeNull()
})

test('ollama needs no key and shows the origins hint', async () => {
  const { settingsStore, user } = await renderApp('/settings')
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Provider' }), 'ollama')
  expect(screen.getByText(/OLLAMA_ORIGINS/)).toBeInTheDocument()
  await user.type(screen.getByLabelText('Model'), 'llama')
  await user.click(screen.getByRole('button', { name: 'Simpan' }))
  await waitFor(async () => expect((await settingsStore.getAll()).ai?.provider).toBe('ollama'))
})

test('test connection reports success and failure', async () => {
  const ok = await renderApp('/settings', {}, { createProvider: replyWith('OK') })
  await ok.user.type(await screen.findByLabelText('API key'), 'k')
  await ok.user.click(screen.getByRole('button', { name: 'Tes koneksi' }))
  expect(await screen.findByText('Koneksi berhasil.')).toBeInTheDocument()
})

test('test connection shows mapped error', async () => {
  const bad = await renderApp('/settings', {}, { createProvider: failWith('auth') })
  await bad.user.type(await screen.findByLabelText('API key'), 'k')
  await bad.user.click(screen.getByRole('button', { name: 'Tes koneksi' }))
  expect(await screen.findByText('API key ditolak. Periksa key di Pengaturan.')).toBeInTheDocument()
})

test('existing config is loaded and can be cleared', async () => {
  const ai = { provider: 'openai' as const, apiKey: 'sk-x', baseUrl: 'https://api.openai.com/v1', model: 'my-model' }
  const { settingsStore, user } = await renderApp('/settings', { settings: { ai } })
  expect(await screen.findByLabelText('Model')).toHaveValue('my-model')
  await user.click(screen.getByRole('button', { name: 'Hapus pengaturan AI' }))
  await user.click(screen.getByRole('button', { name: 'Ya, hapus' }))
  await waitFor(async () => expect((await settingsStore.getAll()).ai).toBeNull())
})

test('persona style, name and instruction are saved', async () => {
  const { settingsStore, user } = await renderApp('/settings')
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Gaya bicara' }), 'gaul')
  const name = screen.getByLabelText('Nama AI')
  await user.clear(name)
  await user.type(name, 'Bro')
  const instr = screen.getByLabelText('Instruksi tambahan')
  await user.type(instr, 'jawab singkat')
  expect(screen.getByText('13/500')).toBeInTheDocument()
  await waitFor(async () =>
    expect((await settingsStore.getAll()).persona).toEqual({ style: 'gaul', name: 'Bro', customInstruction: 'jawab singkat' }),
  )
})

test('privacy note is always shown', async () => {
  await renderApp('/settings')
  expect(await screen.findByText(/tanpa enkripsi/)).toBeInTheDocument()
})

test('switching provider clears the API key so it is never sent to another provider', async () => {
  const ai = { provider: 'anthropic' as const, apiKey: 'sk-ant-secret', baseUrl: '', model: 'claude-opus-5' }
  const spy = vi.fn(replyWith('OK'))
  const { user } = await renderApp('/settings', { settings: { ai } }, { createProvider: spy })
  expect(await screen.findByLabelText('API key')).toHaveValue('sk-ant-secret')
  await user.click(screen.getByRole('button', { name: 'Tampilkan' }))
  const provider = screen.getByRole('combobox', { name: 'Provider' })
  await user.selectOptions(provider, 'openrouter')
  expect(screen.getByLabelText('API key')).toHaveValue('')
  expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password')
  await user.type(screen.getByLabelText('Model'), 'some-model')
  await user.click(screen.getByRole('button', { name: 'Tes koneksi' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Wajib diisi: API key')
  // Ollama tidak butuh key, jadi config benar-benar dikirim: key lama tidak boleh ikut.
  await user.selectOptions(provider, 'ollama')
  await user.type(screen.getByLabelText('Model'), 'llama')
  await user.click(screen.getByRole('button', { name: 'Tes koneksi' }))
  expect(await screen.findByText('Koneksi berhasil.')).toBeInTheDocument()
  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy.mock.calls[0][0]).toMatchObject({ provider: 'ollama', apiKey: '' })
})

test('a failure saving AI settings shows an error', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { settingsStore, user } = await renderApp('/settings')
  vi.spyOn(settingsStore, 'set').mockRejectedValueOnce(new Error('quota'))
  await user.type(await screen.findByLabelText('API key'), 'sk-ant-test')
  await user.click(screen.getByRole('button', { name: 'Simpan' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Gagal menyimpan pengaturan.')
  expect(screen.queryByText('Tersimpan.')).not.toBeInTheDocument()
  expect(errorSpy).toHaveBeenCalledWith(expect.any(Error))
  errorSpy.mockRestore()
})

test('a failure clearing AI settings shows an error and keeps the form', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const ai = { provider: 'openai' as const, apiKey: 'sk-x', baseUrl: 'https://api.openai.com/v1', model: 'my-model' }
  const { settingsStore, user } = await renderApp('/settings', { settings: { ai } })
  expect(await screen.findByLabelText('Model')).toHaveValue('my-model')
  vi.spyOn(settingsStore, 'set').mockRejectedValueOnce(new Error('quota'))
  await user.click(screen.getByRole('button', { name: 'Hapus pengaturan AI' }))
  await user.click(screen.getByRole('button', { name: 'Ya, hapus' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Gagal menyimpan pengaturan.')
  expect(screen.getByLabelText('Model')).toHaveValue('my-model')
  expect(errorSpy).toHaveBeenCalledWith(expect.any(Error))
  errorSpy.mockRestore()
})

test('the fast model is saved trimmed; empty shows the provider default as placeholder', async () => {
  const ai = { provider: 'anthropic' as const, apiKey: 'sk-ant', baseUrl: '', model: 'claude-opus-5-5' }
  const { settingsStore, user } = await renderApp('/settings', { settings: { ai } })
  const fast = await screen.findByLabelText('Model cepat (opsional)')
  expect(fast).toHaveValue('')
  expect(fast).toHaveAttribute('placeholder', 'claude-haiku-4-5')
  await user.type(fast, '  claude-sonnet-5-5 ')
  await user.click(screen.getByRole('button', { name: 'Simpan' }))
  await waitFor(async () => expect((await settingsStore.getAll()).ai?.fastModel).toBe('claude-sonnet-5-5'))
})

test('re-saving a legacy non-anthropic config without fastModel keeps background work on the main model', async () => {
  const ai = { provider: 'openrouter' as const, apiKey: 'sk-or', baseUrl: 'https://openrouter.ai/api/v1', model: 'x/y' }
  const { settingsStore, user } = await renderApp('/settings', { settings: { ai } })
  expect(await screen.findByLabelText('Model cepat (opsional)')).toHaveValue('x/y')
  await user.click(screen.getByRole('button', { name: 'Simpan' }))
  await waitFor(async () => expect((await settingsStore.getAll()).ai).toEqual({ ...ai, fastModel: 'x/y' }))
})

test('switching provider clears the fast model so the preset default applies', async () => {
  const ai = { provider: 'anthropic' as const, apiKey: 'sk-ant', baseUrl: '', model: 'claude-opus-5-5', fastModel: 'claude-sonnet-5-5' }
  const { user } = await renderApp('/settings', { settings: { ai } })
  const fast = await screen.findByLabelText('Model cepat (opsional)')
  expect(fast).toHaveValue('claude-sonnet-5-5')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Provider' }), 'openai')
  expect(fast).toHaveValue('')
  expect(fast).toHaveAttribute('placeholder', 'gpt-5.6-luna')
})

test('fetching models shows the count and offers them to both model inputs', async () => {
  const listModels = vi.fn<ListModels>(async () => ['model-a', 'model-b'])
  const { user } = await renderApp('/settings', {}, { listModels })
  await user.type(await screen.findByLabelText('API key'), ' sk-ant ')
  await user.click(screen.getByRole('button', { name: 'Ambil daftar model' }))
  expect(await screen.findByRole('status')).toHaveTextContent('2 model ditemukan.')
  expect(listModels).toHaveBeenCalledWith(expect.objectContaining({ provider: 'anthropic', apiKey: 'sk-ant' }))
  expect(optionsOf(screen.getByLabelText('Model'))).toEqual(['model-a', 'model-b'])
  expect(optionsOf(screen.getByLabelText('Model cepat (opsional)'))).toEqual(['model-a', 'model-b'])
})

test('a failed model fetch shows an alert', async () => {
  const listModels: ListModels = async () => {
    throw new ProviderError('auth')
  }
  const { user } = await renderApp('/settings', {}, { listModels })
  await user.type(await screen.findByLabelText('API key'), 'sk-ant')
  await user.click(screen.getByRole('button', { name: 'Ambil daftar model' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Daftar model tidak bisa diambil. Ketik nama model secara manual.')
})

test('fetching models needs the key and base URL first, so nothing is sent to a default endpoint', async () => {
  const listModels = vi.fn<ListModels>(async () => ['x'])
  const { user } = await renderApp('/settings', {}, { listModels })
  await user.click(await screen.findByRole('button', { name: 'Ambil daftar model' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Wajib diisi: API key')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Provider' }), 'custom')
  await user.type(screen.getByLabelText('API key'), 'sk-custom')
  expect(screen.getByLabelText('Base URL')).toHaveValue('')
  await user.click(screen.getByRole('button', { name: 'Ambil daftar model' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Wajib diisi: Base URL')
  expect(listModels).not.toHaveBeenCalled()
})

test('an empty fetched list keeps the preset suggestions', async () => {
  const { user } = await renderApp('/settings', {}, { listModels: async () => [] })
  await user.type(await screen.findByLabelText('API key'), 'sk-ant')
  await user.click(screen.getByRole('button', { name: 'Ambil daftar model' }))
  expect(await screen.findByRole('status')).toHaveTextContent('0 model ditemukan.')
  expect(optionsOf(screen.getByLabelText('Model'))).toContain('claude-opus-5-5')
})

/** A listModels whose single pending call the test resolves by hand. */
function deferredListModels() {
  let resolve: (ids: string[]) => void = () => {}
  const listModels = vi.fn<ListModels>(
    () =>
      new Promise<string[]>((r) => {
        resolve = r
      }),
  )
  return { listModels, resolve: (ids: string[]) => resolve(ids) }
}

const openaiAi = { provider: 'openai' as const, apiKey: 'sk-x', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6' }

test('a model list that arrives after the base URL changed is ignored', async () => {
  const deferred = deferredListModels()
  const { user } = await renderApp('/settings', { settings: { ai: openaiAi } }, { listModels: deferred.listModels })
  await user.click(await screen.findByRole('button', { name: 'Ambil daftar model' }))
  expect(await screen.findByRole('button', { name: 'Mengambil…' })).toBeDisabled()
  await user.type(screen.getByLabelText('Base URL'), 'x')
  expect(screen.getByRole('button', { name: 'Ambil daftar model' })).toBeEnabled()
  deferred.resolve(['stale-model'])
  await new Promise((r) => setTimeout(r, 0))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(optionsOf(screen.getByLabelText('Model'))).not.toContain('stale-model')
})

test('a model list that arrives after a provider switch is ignored', async () => {
  const deferred = deferredListModels()
  const { user } = await renderApp('/settings', { settings: { ai: openaiAi } }, { listModels: deferred.listModels })
  await user.click(await screen.findByRole('button', { name: 'Ambil daftar model' }))
  await user.selectOptions(screen.getByRole('combobox', { name: 'Provider' }), 'anthropic')
  deferred.resolve(['stale-model'])
  await new Promise((r) => setTimeout(r, 0))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(optionsOf(screen.getByLabelText('Model'))).not.toContain('stale-model')
})

test('changing the API key drops a fetched model list', async () => {
  const { user } = await renderApp('/settings', { settings: { ai: openaiAi } }, { listModels: async () => ['fetched-model'] })
  await user.click(await screen.findByRole('button', { name: 'Ambil daftar model' }))
  expect(await screen.findByRole('status')).toHaveTextContent('1 model ditemukan.')
  expect(optionsOf(screen.getByLabelText('Model'))).toEqual(['fetched-model'])
  await user.type(screen.getByLabelText('API key'), 'y')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(optionsOf(screen.getByLabelText('Model'))).toContain('gpt-5.6')
})

test('ollama with exactly one model fills both empty model inputs', async () => {
  const { user } = await renderApp('/settings', {}, { listModels: async () => ['llama3'] })
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Provider' }), 'ollama')
  await user.click(screen.getByRole('button', { name: 'Ambil daftar model' }))
  expect(await screen.findByRole('status')).toHaveTextContent('1 model ditemukan.')
  expect(screen.getByLabelText('Model')).toHaveValue('llama3')
  expect(screen.getByLabelText('Model cepat (opsional)')).toHaveValue('llama3')
})

test('the connection test reports a failing fast model while the main model works, and saving still works', async () => {
  const ok = replyWith('OK')
  const bad = failWith('notFound')
  const createProvider: CreateProvider = (config) => (config.model === 'claude-haiku-4-5' ? bad(config) : ok(config))
  const spy = vi.fn(createProvider)
  const { settingsStore, user } = await renderApp('/settings', {}, { createProvider: spy })
  await user.type(await screen.findByLabelText('API key'), 'k')
  await user.click(screen.getByRole('button', { name: 'Tes koneksi' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Model utama OK, tapi model cepat gagal: Model tidak ditemukan. Periksa nama model di Pengaturan.',
  )
  expect(spy.mock.calls.map(([c]) => c.model)).toEqual(['claude-opus-5-5', 'claude-haiku-4-5'])
  await user.click(screen.getByRole('button', { name: 'Simpan' }))
  await waitFor(async () => expect((await settingsStore.getAll()).ai?.model).toBe('claude-opus-5-5'))
})

test('the connection test skips the fast model when it equals the main model', async () => {
  const spy = vi.fn(replyWith('OK'))
  const { user } = await renderApp('/settings', {}, { createProvider: spy })
  await user.type(await screen.findByLabelText('API key'), 'k')
  await user.type(screen.getByLabelText('Model cepat (opsional)'), 'claude-opus-5-5')
  await user.click(screen.getByRole('button', { name: 'Tes koneksi' }))
  expect(await screen.findByText('Koneksi berhasil.')).toBeInTheDocument()
  expect(spy).toHaveBeenCalledTimes(1)
})

test('the tag suggestion toggle is on by default and persists when turned off', async () => {
  const { settingsStore, user } = await renderApp('/settings')
  const toggle = await screen.findByRole('checkbox', { name: 'Saran tag otomatis saat mengetik #' })
  expect(toggle).toBeChecked()
  expect(toggle).toHaveAccessibleDescription(/Mengirim isi halaman diary ke provider AI/)
  await user.click(toggle)
  await waitFor(async () => expect((await settingsStore.getAll()).aiTagSuggest).toBe(false))
  expect(toggle).not.toBeChecked()
})

test('Gemini preset fills the OpenAI-compatible base URL and Gemini models', async () => {
  const { user } = await renderApp('/settings')
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Provider' }), 'gemini')
  expect(screen.getByRole('option', { name: 'Google Gemini' })).toBeInTheDocument()
  expect(screen.getByLabelText('Base URL')).toHaveValue('https://generativelanguage.googleapis.com/v1beta/openai/')
  expect(screen.getByLabelText('Model')).toHaveValue('gemini-3.8-flash')
  expect(screen.getByLabelText('Model cepat (opsional)')).toHaveAttribute('placeholder', 'gemini-3.1-flash-lite')
})

test('shows an unsaved-changes note until the AI settings are saved', async () => {
  const { user } = await renderApp('/settings')
  await screen.findByRole('combobox', { name: 'Provider' })
  expect(screen.queryByText(/belum disimpan/i)).not.toBeInTheDocument()
  await user.type(screen.getByLabelText('API key'), 'sk-ant-test')
  expect(screen.getByText(/belum disimpan/i)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Simpan' }))
  await waitFor(() => expect(screen.queryByText(/belum disimpan/i)).not.toBeInTheDocument())
})
test('an unknown provider error shows the provider message so the cause is visible', async () => {
  const overloaded: CreateProvider = () => ({
    // eslint-disable-next-line require-yield
    async *stream() {
      throw new ProviderError('unknown', '503 The model is overloaded. Please try again later.')
    },
  })
  const { user } = await renderApp('/settings', {}, { createProvider: overloaded })
  await user.type(await screen.findByLabelText('API key'), 'sk-ant-test')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await user.click(screen.getByRole('button', { name: 'Tes koneksi' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Terjadi kesalahan')
  expect(alert).toHaveTextContent('503 The model is overloaded')
  vi.restoreAllMocks()
})