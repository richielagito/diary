import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ChevronRight } from '../../app/icons'
import { useRepos, useSettings } from '../../app/RepoContext'
import { PERSONA_MAX_INSTRUCTION, PERSONA_STYLES, type PersonaStyle } from '../../ai/prompt/persona'
import { fastConfig, fastModelOf } from '../../ai/provider/fastConfig'
import { testConnection, type ConnectionResult } from '../../ai/provider/testConnection'
import { isOpenAICompatible, PROVIDER_PRESETS, type AiConfig, type ProviderErrorKind, type ProviderKind } from '../../ai/provider/types'
import { Field } from './Field'
import { SharingChoices } from './SharingChoices'

const PROVIDERS = Object.keys(PROVIDER_PRESETS) as ProviderKind[]

/**
 * Config di form: `fastModel` selalu string. Config lama tanpa `fastModel`: Anthropic jadi '' (preset),
 * provider lain diisi `model`, supaya menyimpan ulang tetap memakai model utama untuk kerja latar (sama seperti fastModelOf).
 */
type FormConfig = AiConfig & { fastModel: string }

function initialConfig(saved: AiConfig | null): FormConfig {
  if (saved) return { ...saved, fastModel: saved.fastModel ?? (saved.provider === 'anthropic' ? '' : saved.model) }
  return { provider: 'anthropic', apiKey: '', baseUrl: '', model: PROVIDER_PRESETS.anthropic.defaultModel, fastModel: '' }
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saved' }
  | { kind: 'saveFailed' }
  | { kind: 'missing'; fields: string[] }
  | { kind: 'testing' }
  | { kind: 'testOk' }
  | { kind: 'testFail'; error: ProviderErrorKind; detail?: string }
  | { kind: 'testFastFail'; error: ProviderErrorKind; detail?: string }

type ModelFetch = { kind: 'idle' } | { kind: 'fetching' } | { kind: 'ok'; count: number } | { kind: 'failed' }

export function AiSettingsSection() {
  const { t } = useTranslation()
  const { settingsStore, createProvider, listModels } = useRepos()
  const settings = useSettings()
  const [config, setConfig] = useState<FormConfig>(() => initialConfig(settings.ai))
  const [showKey, setShowKey] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null)
  const [modelFetch, setModelFetch] = useState<ModelFetch>({ kind: 'idle' })
  // Dinaikkan saat daftar model tidak lagi berlaku (provider berganti), supaya hasil fetch lama diabaikan.
  const modelListVersion = useRef(0)
  const modelListId = useId()
  const tagSuggestHintId = useId()
  const [name, setName] = useState(settings.persona.name)
  const [instruction, setInstruction] = useState(settings.persona.customInstruction)

  /** Error 'unknown' ikut menampilkan pesan asli provider (misalnya "503 model overloaded") supaya penyebabnya terlihat. */
  const errorText = (kind: ProviderErrorKind, detail?: string) => (detail ? `${t(`aiError.${kind}`)} (${detail})` : t(`aiError.${kind}`))

  const preset = PROVIDER_PRESETS[config.provider]
  const compatible = isOpenAICompatible(config.provider)
  const update = (patch: Partial<FormConfig>) => {
    setConfig((c) => ({ ...c, ...patch }))
    setStatus({ kind: 'idle' })
  }

  /** Daftar model hanya berlaku untuk provider, key dan base URL yang dipakai saat mengambilnya; hasil fetch yang masih jalan diabaikan. */
  const resetModelList = () => {
    modelListVersion.current++
    setFetchedModels(null)
    setModelFetch({ kind: 'idle' })
  }

  /** Field yang menentukan ke mana request dikirim. Tanpa ini tidak ada yang dikirim ke mana pun. */
  const missingConnectionFields = (): string[] => {
    const missing: string[] = []
    if (preset.needsKey && !config.apiKey.trim()) missing.push(t('aiSettings.apiKey'))
    if (compatible && !config.baseUrl.trim()) missing.push(t('aiSettings.baseUrl'))
    return missing
  }

  const missingFields = (): string[] => {
    const missing = missingConnectionFields()
    if (!config.model.trim()) missing.push(t('aiSettings.model'))
    return missing
  }

  const cleaned = (): AiConfig => ({
    provider: config.provider,
    apiKey: config.apiKey.trim(),
    baseUrl: compatible ? config.baseUrl.trim() : '',
    model: config.model.trim(),
    fastModel: config.fastModel.trim(),
  })

  // Tes koneksi memakai isi form, jadi bisa berhasil padahal belum disimpan: beri tahu selama form beda dari yang tersimpan.
  const savedForm = settings.ai ? initialConfig(settings.ai) : null
  const current = cleaned()
  const unsaved = savedForm
    ? current.provider !== savedForm.provider ||
      current.apiKey !== savedForm.apiKey.trim() ||
      current.baseUrl !== (isOpenAICompatible(savedForm.provider) ? savedForm.baseUrl.trim() : '') ||
      current.model !== savedForm.model.trim() ||
      current.fastModel !== savedForm.fastModel.trim()
    : current.apiKey !== '' || !preset.needsKey

  const save = async () => {
    const missing = missingFields()
    if (missing.length) return setStatus({ kind: 'missing', fields: missing })
    try {
      const first = !settings.ai
      await settingsStore.set('ai', cleaned())
      setStatus({ kind: 'saved' })
      if (first) setAskSharing(true)
    } catch (err) {
      console.error(err)
      setStatus({ kind: 'saveFailed' })
    }
  }

  const runTest = async () => {
    const missing = missingFields()
    if (missing.length) return setStatus({ kind: 'missing', fields: missing })
    setStatus({ kind: 'testing' })
    const c = cleaned()
    const main = await tryConnection(c)
    if (!main.ok) return setStatus({ kind: 'testFail', error: main.kind, detail: main.detail })
    if (fastModelOf(c) !== c.model) {
      const fast = await tryConnection(fastConfig(c))
      if (!fast.ok) return setStatus({ kind: 'testFastFail', error: fast.kind, detail: fast.detail })
    }
    setStatus({ kind: 'testOk' })
  }

  // The provider is created inside the try so that a throwing factory becomes a failed test, not a stuck form.
  const tryConnection = async (c: AiConfig): Promise<ConnectionResult> => {
    try {
      return await testConnection(createProvider(c))
    } catch (err) {
      console.error(err)
      return { ok: false, kind: 'unknown' }
    }
  }

  const fetchModels = async () => {
    // The model itself is not required: picking one is what the list is for.
    const missing = missingConnectionFields()
    if (missing.length) return setStatus({ kind: 'missing', fields: missing })
    setStatus({ kind: 'idle' })
    const c = cleaned()
    const version = ++modelListVersion.current
    setModelFetch({ kind: 'fetching' })
    let ids: string[]
    try {
      ids = await listModels(c)
    } catch (err) {
      console.error(err)
      if (version === modelListVersion.current) setModelFetch({ kind: 'failed' })
      return
    }
    if (version !== modelListVersion.current) return
    // An empty list would hide the preset suggestions without offering anything instead.
    setFetchedModels(ids.length ? ids : null)
    setModelFetch({ kind: 'ok', count: ids.length })
    // Ollama dengan satu model terpasang: tidak ada pilihan lain, jadi isi keduanya kalau masih kosong.
    if (c.provider === 'ollama' && ids.length === 1) {
      const only = ids[0]
      setConfig((cur) => (cur.model.trim() || cur.fastModel.trim() ? cur : { ...cur, model: only, fastModel: only }))
    }
  }

  const saveTagSuggest = async (enabled: boolean) => {
    try {
      await settingsStore.set('aiTagSuggest', enabled)
    } catch (err) {
      console.error(err)
      setStatus({ kind: 'saveFailed' })
    }
  }

  const [confirmingClear, setConfirmingClear] = useState(false)
  const clear = async () => {
    setConfirmingClear(false)
    try {
      await settingsStore.set('ai', null)
      setConfig(initialConfig(null))
      resetModelList()
      setStatus({ kind: 'idle' })
    } catch (err) {
      console.error(err)
      setStatus({ kind: 'saveFailed' })
    }
  }

  const [askSharing, setAskSharing] = useState(false)

  const savePersona = async (patch: Partial<typeof settings.persona>) => {
    const current = (await settingsStore.getAll()).persona
    await settingsStore.set('persona', { ...current, ...patch })
  }

  const baseUrlField = (
    <Field label={t('aiSettings.baseUrl')}>
      {(id) => (
        <input
          id={id}
          type="url"
          value={config.baseUrl}
          onChange={(e) => {
            update({ baseUrl: e.target.value })
            resetModelList()
          }}
        />
      )}
    </Field>
  )

  return (
    <section id="ai">
      <h2>{t('aiSettings.title')}</h2>
      <p>{t('aiSettings.privacy')}</p>
      <p>
        <Link to="/memory">{t('aiSettings.memoryLink')}</Link>
      </p>
      <Field label={t('aiSettings.provider')}>
        {(id) => (
          <select
            id={id}
            value={config.provider}
            onChange={(e) => {
              const provider = e.target.value as ProviderKind
              // fastModel '' lets the new provider's preset fast model apply.
              update({ provider, apiKey: '', baseUrl: PROVIDER_PRESETS[provider].baseUrl, model: PROVIDER_PRESETS[provider].defaultModel, fastModel: '' })
              setShowKey(false)
              resetModelList()
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {t(`aiSettings.providers.${p}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('aiSettings.apiKey')}>
        {(id) => (
          <span>
            <input
              id={id}
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              value={config.apiKey}
              onChange={(e) => {
                update({ apiKey: e.target.value })
                resetModelList()
              }}
            />
            <button type="button" onClick={() => setShowKey((s) => !s)}>
              {showKey ? t('aiSettings.hideKey') : t('aiSettings.showKey')}
            </button>
          </span>
        )}
      </Field>
      {compatible && !preset.baseUrl.startsWith('https://') && baseUrlField}
      {config.provider === 'ollama' && <p>{t('aiSettings.ollamaHint')}</p>}
      <Field label={t('aiSettings.model')}>
        {(id) => <input id={id} list={modelListId} value={config.model} onChange={(e) => update({ model: e.target.value })} />}
      </Field>
      <datalist id={modelListId}>
        {(fetchedModels ?? preset.suggestedModels).map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <p>
        <button type="button" onClick={() => void fetchModels()} disabled={modelFetch.kind === 'fetching'}>
          {modelFetch.kind === 'fetching' ? t('aiSettings.fetchingModels') : t('aiSettings.fetchModels')}
        </button>
      </p>
      {modelFetch.kind === 'ok' && <p role="status">{t('aiSettings.modelsFetched', { count: modelFetch.count })}</p>}
      {modelFetch.kind === 'failed' && <p role="alert">{t('aiSettings.modelsFetchFailed')}</p>}
      <details className="settings-advanced" open={status.kind === 'testFastFail' || undefined}>
        <summary>
          <ChevronRight />
          {t('aiSettings.advanced')}
        </summary>
        {compatible && preset.baseUrl.startsWith('https://') && baseUrlField}
        <Field label={t('aiSettings.fastModel')}>
          {(id) => (
            <>
              <input
                id={id}
                list={modelListId}
                placeholder={fastModelOf(config)}
                aria-describedby={`${id}-hint`}
                value={config.fastModel}
                onChange={(e) => update({ fastModel: e.target.value })}
              />
              <small id={`${id}-hint`}>{t('aiSettings.fastModelHint')}</small>
            </>
          )}
        </Field>
      </details>
      <p>
        <button type="button" className="primary" onClick={() => void save()}>
          {t('aiSettings.save')}
        </button>{' '}
        <button type="button" onClick={() => void runTest()} disabled={status.kind === 'testing'}>
          {status.kind === 'testing' ? t('aiSettings.testing') : t('aiSettings.test')}
        </button>
      </p>
      {/* Bukan live region: diumumkan tiap ketikan akan mengganggu pembaca layar. */}
      {unsaved && status.kind !== 'saved' && <p>{t('aiSettings.unsaved')}</p>}
      {status.kind === 'saved' && <p role="status">{t('aiSettings.saved')}</p>}
      {status.kind === 'testOk' && <p role="status">{t('aiSettings.testOk')}</p>}
      {status.kind === 'saveFailed' && <p role="alert">{t('aiSettings.saveFailed')}</p>}
      {status.kind === 'missing' && <p role="alert">{t('aiSettings.required', { fields: status.fields.join(', ') })}</p>}
      {status.kind === 'testFail' && <p role="alert">{errorText(status.error, status.detail)}</p>}
      {status.kind === 'testFastFail' && <p role="alert">{t('aiSettings.fastTestFailed', { reason: errorText(status.error, status.detail) })}</p>}
      {askSharing && <SharingChoices onDone={() => setAskSharing(false)} />}
      <p>
        <label>
          <input
            type="checkbox"
            checked={settings.aiTagSuggest}
            aria-describedby={tagSuggestHintId}
            onChange={(e) => void saveTagSuggest(e.target.checked)}
          />{' '}
          {t('aiSettings.tagSuggest')}
        </label>
        <br />
        <small id={tagSuggestHintId}>{t('aiSettings.tagSuggestHint')}</small>
      </p>

      <h3>{t('aiSettings.persona')}</h3>
      <p>{t('aiSettings.personaAutosave')}</p>
      <Field label={t('aiSettings.style')}>
        {(id) => (
          <select id={id} value={settings.persona.style} onChange={(e) => void savePersona({ style: e.target.value as PersonaStyle })}>
            {PERSONA_STYLES.map((s) => (
              <option key={s} value={s}>
                {t(`aiSettings.styles.${s}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('aiSettings.name')}>
        {(id) => (
          <input
            id={id}
            value={name}
            onChange={(e) => {
              const value = e.target.value
              setName(value)
              void savePersona({ name: value.trim() })
            }}
          />
        )}
      </Field>
      <Field label={t('aiSettings.customInstruction')}>
        {(id) => (
          <span>
            <textarea
              id={id}
              maxLength={PERSONA_MAX_INSTRUCTION}
              value={instruction}
              onChange={(e) => {
                const value = e.target.value
                setInstruction(value)
                void savePersona({ customInstruction: value })
              }}
            />
            <small>{t('aiSettings.charCount', { count: instruction.length, max: PERSONA_MAX_INSTRUCTION })}</small>
          </span>
        )}
      </Field>
      {settings.ai &&
        (confirmingClear ? (
          <div className="settings-danger" role="group" aria-label={t('aiSettings.clear')}>
            <p>{t('aiSettings.clearConfirm')}</p>
            <p>
              <button type="button" className="danger" onClick={() => void clear()}>
                {t('aiSettings.clearAction')}
              </button>{' '}
              <button type="button" className="quiet" onClick={() => setConfirmingClear(false)}>
                {t('aiSettings.cancel')}
              </button>
            </p>
          </div>
        ) : (
          <p className="settings-danger">
            <button type="button" className="quiet danger" onClick={() => setConfirmingClear(true)}>
              {t('aiSettings.clear')}
            </button>
          </p>
        ))}
    </section>
  )
}
