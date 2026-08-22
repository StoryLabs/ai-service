import { AIError, StreamingNotSupportedError } from '../errors.js'
import { resolveLogger } from '../logger.js'

// TODO: Transporte Muse Spark — decidir entre HTTP fetch vs SDK local (@muse/sdk).
// Opción A: fetch HTTP a endpoint Muse (si expone OpenAI-compatible /v1/chat/completions)
// Opción B: SDK — import { MuseClient } from '@muse/sdk'; client.complete(...)
// Ambos deben normalizar a NormalizedResult con parseUsage y los mismos códigos MOT-AI-01x.
// Hasta tener credenciales/endpoint confirmados, este adapter es stub registrado que valida
// env var y lanza error accionable sin hacer fetch.

export const MUSE_URL = 'https://api.muse.example.com/v1/chat/completions'

export const MUSE_MODELS = {
  SPARK: 'muse-spark-1.2-contributor'
}

export const MODELS = MUSE_MODELS

export const MAX_TOKENS_MUSE = {
  [MUSE_MODELS.SPARK]: 4096
}

export const TOPE_MUSE_DEFECTO = 4000

export const DEFAULT_TIMEOUT_MUSE = 120_000

export const topeMuse = (maxTokens, model) => maxTokens ?? MAX_TOKENS_MUSE[model] ?? TOPE_MUSE_DEFECTO

export async function callMuse({
  messages: _messages,
  model = MUSE_MODELS.SPARK,
  temperature: _temperature = 0.3,
  maxTokens: _maxTokens = null,
  userId: _userId = null,
  timeoutMs: _timeoutMs = DEFAULT_TIMEOUT_MUSE,
  signal: _signal,
  logger: callerLogger
}) {
  const log = resolveLogger(callerLogger)
  const apiKey = (process.env.MUSE_API_KEY ?? process.env.MUSE_CONTRIBUTOR_TOKEN ?? '').trim()

  if (!apiKey) {
    log.warn('MOT-AI-010', 'MUSE_API_KEY / MUSE_CONTRIBUTOR_TOKEN no está configurada')
    throw new AIError('El servicio de IA no se encuentra configurado (falta la clave API de Muse)', {
      provider: 'muse',
      code: 'MOT-AI-010'
    })
  }

  // Stub: contrato definido pero implementación pendiente de credenciales/endpoint.
  // No se hace fetch para evitar filtrar key en logs ni cobrar sin contrato verificado.
  log.warn('MOT-AI-010', 'Muse Spark adapter stub — implementación pendiente de endpoint', { model })
  throw new AIError(
    'Muse Spark no está configurado — falta endpoint por confirmar. Ver README § Muse Spark. Configure MUSE_API_KEY / MUSE_CONTRIBUTOR_TOKEN y actualice el adapter cuando el transporte HTTP/SDK esté disponible.',
    { provider: 'muse', code: 'MOT-AI-010' }
  )
}

export const museProvider = {
  name: 'muse',
  models: Object.values(MUSE_MODELS),
  supports(model) {
    return model.startsWith('muse-') || this.models.includes(model)
  },
  async complete({ messages: _messages, model, config = {}, userId: _userId, signal: _signal, logger }) {
    const log = resolveLogger(logger)
    const apiKey = (process.env.MUSE_API_KEY ?? process.env.MUSE_CONTRIBUTOR_TOKEN ?? '').trim()

    if (!apiKey) {
      log.warn('MOT-AI-010', 'MUSE_API_KEY / MUSE_CONTRIBUTOR_TOKEN no está configurada')
      throw new AIError('El servicio de IA no se encuentra configurado (falta la clave API de Muse)', {
        provider: 'muse',
        code: 'MOT-AI-010'
      })
    }

    const temperature = config.temperature ?? 0.3
    const maxTokens = config.maxTokens ?? MAX_TOKENS_MUSE[model] ?? TOPE_MUSE_DEFECTO
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MUSE

    // Si en el futuro hay endpoint HTTP, aquí iría el fetch similar a DeepSeek:
    // const payload = { model, messages, temperature, max_tokens: maxTokens, ...(userId ? { user_id: String(userId) } : {}) }
    // const response = await fetch(MUSE_URL, { method: 'POST', signal, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    // Normalizar con parseUsage y mapear usage (input_tokens/output_tokens si aplica) → { promptTokens, completionTokens, totalTokens }

    // Stub accionable — no fetch hasta confirmar transporte
    log.warn('MOT-AI-010', 'Muse Spark adapter stub — implementación pendiente', { model, temperature, maxTokens, timeoutMs })
    throw new AIError('Muse Spark no está configurado — falta endpoint por confirmar. Ver README § Muse Spark.', {
      provider: 'muse',
      code: 'MOT-AI-010'
    })
  },
  // eslint-disable-next-line require-yield
  async *stream() {
    throw new StreamingNotSupportedError('muse', "El provider 'muse' no soporta streaming en v1. Ver docs/specs/10-ai-service.md §13.")
  }
}
