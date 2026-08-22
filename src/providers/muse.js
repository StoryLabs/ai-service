import { AIError, HTTPError, TimeoutError, StreamingNotSupportedError } from '../errors.js'
import { resolveLogger } from '../logger.js'
import { createClassifyFailure } from '../retry.js'
import { ContextExceededError } from '../errors.js'

// Muse Spark via fetch — OpenAI-compatible endpoint (Meta protocol : https://dev.meta.ai/docs/protocols )
export const MUSE_URL = 'https://api.meta.ai/v1/chat/completions'

export const MUSE_MODELS = {
  SPARK: 'muse-spark-1.2-contributor'
}

// keep backward alias for tests/docs that still reference old id
export const MODELS = MUSE_MODELS

export const MAX_TOKENS_MUSE = {
  [MUSE_MODELS.SPARK]: 4096,
  'muse-spark-1.2-contributor': 4096
}

export const MUSE_FALLBACK_MAX_TOKENS = 4000

export const DEFAULT_TIMEOUT_MUSE = 120_000

export const resolveMuseMaxTokens = (maxTokens, model) => maxTokens ?? MAX_TOKENS_MUSE[model] ?? MUSE_FALLBACK_MAX_TOKENS

export const MUSE_MAX_RETRIES = 3
export const MUSE_BASE_RETRY_DELAY_MS = 1000

export const isTransientMuse = status => status === 429 || status >= 500

export const isContextExceededMuse = (status, body = '') =>
  status === 400 && /context length|context_length|maximum context|too long|too many tokens|input.*too.*long/i.test(body)

export const parseUsageMuse = (usage = {}) => {
  const u = usage || {}
  // support both OpenAI-style prompt_tokens and Muse input_tokens
  const promptTokens = u.prompt_tokens ?? u.input_tokens ?? u.inputTokens ?? 0
  const completionTokens = u.completion_tokens ?? u.output_tokens ?? u.outputTokens ?? 0
  const total = u.total_tokens ?? u.totalTokens ?? (promptTokens + completionTokens)
  return { promptTokens, completionTokens, totalTokens: total }
}

export const classifyMuseFailure = createClassifyFailure({
  isTransient: isTransientMuse,
  isContextExceeded: isContextExceededMuse,
  MAX_RETRIES: MUSE_MAX_RETRIES,
  BASE_RETRY_DELAY_MS: MUSE_BASE_RETRY_DELAY_MS,
  provider: 'muse',
  ContextError: ContextExceededError
})

async function executeMuse({ messages, model, temperature, maxTokens, topP, topK, presencePenalty, frequencyPenalty, stop, seed, responseFormat, reasoningEffort, userId, signal, logger, retries, includeRaw }) {
  const log = resolveLogger(logger)
  const apiKey = (process.env.MUSE_API_KEY ?? process.env.MUSE_CONTRIBUTOR_TOKEN ?? '').trim()
  if (!apiKey) {
    log.warn('MOT-AI-010', 'MUSE_API_KEY / MUSE_CONTRIBUTOR_TOKEN no está configurada')
    throw new AIError('El servicio de IA no se encuentra configurado (falta la clave API de Muse)', { provider: 'muse', code: 'MOT-AI-010' })
  }
  const maxTokensLimit = resolveMuseMaxTokens(maxTokens, model)
  const payload = {
    model,
    messages,
    temperature,
    max_completion_tokens: maxTokensLimit,
    ...(topP != null ? { top_p: topP } : {}),
    // top_k and stop not supported on Muse Spark (400) — omitted intentionally
    ...(presencePenalty != null ? { presence_penalty: presencePenalty } : {}),
    ...(frequencyPenalty != null ? { frequency_penalty: frequencyPenalty } : {}),
    ...(seed != null ? { seed } : {}),
    ...(responseFormat != null ? { response_format: responseFormat } : {}),
    ...(reasoningEffort != null ? { reasoning_effort: reasoningEffort } : {}),
    ...(userId ? { safety_identifier: String(userId) } : {})
  }
  try {
    const response = await fetch(MUSE_URL, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const retry = await classifyMuseFailure(response, retries, log)
      return executeMuse({ messages, model, temperature, maxTokens, topP, topK, presencePenalty, frequencyPenalty, stop, seed, responseFormat, reasoningEffort, userId, signal, logger: log, retries: retry, includeRaw })
    }
    let result
    try {
      result = await response.json()
    } catch (e) {
      log.error('MOT-AI-011', 'Error parseando JSON de Muse', { error: e.message })
      throw new HTTPError('Error en API Muse (respuesta no es JSON válido)', { provider: 'muse', status: response.status, body: e.message, cause: e })
    }
    const choice = result.choices?.[0]?.message
    const normalized = {
      content: choice?.content?.trim() || '',
      reasoningContent: choice?.reasoning_content?.trim() ?? choice?.thinking?.trim() ?? null,
      usage: parseUsageMuse(result.usage),
      finishReason: result.choices?.[0]?.finish_reason,
      provider: 'muse',
      model
    }
    if (includeRaw) normalized.raw = result
    return normalized
  } catch (err) {
    if (err instanceof HTTPError || err instanceof AIError) throw err
    const { ContextExceededError } = await import('../errors.js')
    if (err instanceof ContextExceededError) throw err
    if (err.name === 'AbortError') {
      log.error('MOT-AI-012', 'Timeout consultando Muse', { timeoutMs: signal ? undefined : DEFAULT_TIMEOUT_MUSE })
      throw new TimeoutError('Tiempo de delay agotado al consultar Muse', { provider: 'muse', cause: err })
    }
    log.error('MOT-AI-012', 'Excepción al consultar Muse', { error: err.message })
    throw err
  }
}

export async function callMuse({
  messages,
  model = MUSE_MODELS.SPARK,
  temperature = 1.0,
  maxTokens = null,
  topP = null,
  topK = null,
  presencePenalty = null,
  frequencyPenalty = null,
  stop = null,
  seed = null,
  responseFormat = null,
  reasoningEffort = null,
  userId = null,
  timeoutMs = DEFAULT_TIMEOUT_MUSE,
  signal: callerSignal,
  logger: callerLogger,
  includeRaw = false
}) {
  const log = resolveLogger(callerLogger)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  const signal = controller.signal
  try {
    return await executeMuse({ messages, model, temperature, maxTokens, topP, topK, presencePenalty, frequencyPenalty, stop, seed, responseFormat, reasoningEffort, userId, signal, logger: log, retries: MUSE_MAX_RETRIES, includeRaw })
  } catch (err) {
    if (err.name === 'AbortError') {
      log.error('MOT-AI-012', 'Timeout consultando Muse', { timeoutMs })
      throw new TimeoutError(`Tiempo de delay agotado al consultar Muse (${timeoutMs / 1000}s)`, { provider: 'muse', timeoutMs, cause: err })
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

export const museProvider = {
  name: 'muse',
  models: Object.values(MUSE_MODELS),
  supports(model) {
    return model.startsWith('muse-') || model === MUSE_MODELS.SPARK || this.models.includes(model)
  },
  async complete({ messages, model, config = {}, userId, signal, logger }) {
    const log = resolveLogger(logger)
    const merged = {
      temperature: config.temperature ?? 1.0,
      maxTokens: config.maxTokens ?? MAX_TOKENS_MUSE[model] ?? MUSE_FALLBACK_MAX_TOKENS,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MUSE,
      includeRaw: config.includeRaw ?? false,
      topP: config.topP ?? null,
      topK: config.topK ?? null,
      presencePenalty: config.presencePenalty ?? null,
      frequencyPenalty: config.frequencyPenalty ?? null,
      stop: config.stop ?? null,
      seed: config.seed ?? null,
      responseFormat: config.responseFormat ?? null,
      reasoningEffort: config.reasoningEffort ?? null
    }
    if (signal) {
      return executeMuse({
        messages,
        model,
        temperature: merged.temperature,
        maxTokens: merged.maxTokens,
        topP: merged.topP,
        topK: merged.topK,
        presencePenalty: merged.presencePenalty,
        frequencyPenalty: merged.frequencyPenalty,
        stop: merged.stop,
        seed: merged.seed,
        responseFormat: merged.responseFormat,
        reasoningEffort: merged.reasoningEffort,
        userId,
        signal,
        logger: log,
        retries: MUSE_MAX_RETRIES,
        includeRaw: merged.includeRaw
      }).catch(err => {
        if (err.name === 'AbortError') {
          log.error('MOT-AI-012', 'Timeout consultando Muse', { timeoutMs: merged.timeoutMs })
          throw new TimeoutError(`Tiempo de delay agotado al consultar Muse (${merged.timeoutMs / 1000}s)`, { provider: 'muse', timeoutMs: merged.timeoutMs, cause: err })
        }
        throw err
      })
    }
    return callMuse({
      messages,
      model,
      temperature: merged.temperature,
      maxTokens: merged.maxTokens,
      topP: merged.topP,
      topK: merged.topK,
      presencePenalty: merged.presencePenalty,
      frequencyPenalty: merged.frequencyPenalty,
      stop: merged.stop,
      seed: merged.seed,
      responseFormat: merged.responseFormat,
      reasoningEffort: merged.reasoningEffort,
      userId,
      timeoutMs: merged.timeoutMs,
      logger: log,
      includeRaw: merged.includeRaw
    })
  },
  // eslint-disable-next-line require-yield
  async *stream() {
    throw new StreamingNotSupportedError('muse', "El provider 'muse' no soporta streaming en v1. Ver docs/specs/10-ai-service.md §13.")
  }
}
