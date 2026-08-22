import { AIError, DeepSeekContextoExcedidoError as BaseDeepSeekError, HTTPError, TimeoutError } from '../errors.js'
import { resolveLogger } from '../logger.js'

export const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'

// 180 s. Un modelo que razona sobre un contexto clínico completo puede pasarse largamente del
// minuto, y cortar antes convierte una respuesta buena en un error.
// ⚠️ INVARIANTE DE CAPAS: el techo del CLIENTE tiene que ser estrictamente MAYOR que éste.
// Si el cliente corta primero, el backend sigue: termina la llamada, guarda el mensaje y
// descuenta el crédito, mientras el usuario ve timeout y nunca ve la respuesta que pagó.
// 180 s. Subido junto con MAX_TOKENS: agotar 8 000 tokens a ~55 tok/s ronda los 145 s.
export const DEFAULT_TIMEOUT_MS = 180_000

export const MODELS = {
  NORMAL: 'deepseek-v4-flash',
  PRO: 'deepseek-v4-pro'
}

export const MAX_TOKENS = {
  [MODELS.NORMAL]: 6000,
  [MODELS.PRO]: 8000
}

export const TOPE_POR_DEFECTO = 4000

export const topeDeRespuesta = (maxTokens, model) => maxTokens ?? MAX_TOKENS[model] ?? TOPE_POR_DEFECTO

export const MAX_INTENTOS = 3
export const ESPERA_BASE_MS = 1000

export const esTransitorio = status => status === 429 || status >= 500

export const esContextoExcedido = (status, cuerpo = '') =>
  status === 400 && /context length|context_length|maximum context|too long|too many tokens/i.test(cuerpo)

// Re-export for compat — instanceof DeepSeekContextoExcedidoError should work via errors.js
export { BaseDeepSeekError as DeepSeekContextoExcedidoError }

export const parseUsage = (usage = {}) => {
  const u = usage || {}
  const promptTokens = u.prompt_tokens || 0
  const completionTokens = u.completion_tokens || 0
  return {
    promptTokens,
    completionTokens,
    totalTokens: u.total_tokens || promptTokens + completionTokens
  }
}

/**
 * Decide qué hacer con una respuesta HTTP fallida. O LANZA (fallo definitivo) o devuelve cuántos
 * intentos quedan, ya habiendo esperado el backoff.
 */
export const clasificarFallo = async (response, intentos, logger) => {
  const log = resolveLogger(logger)
  const errText = await response.text()

  if (esContextoExcedido(response.status, errText)) {
    log.warn('MOT-AI-013', 'DeepSeek rechazó por contexto excedido', { status: response.status })
    throw new BaseDeepSeekError()
  }

  if (esTransitorio(response.status) && intentos > 1) {
    const espera = ESPERA_BASE_MS * (MAX_INTENTOS - intentos + 1)

    log.warn('MOT-AI-014', 'DeepSeek falló con error transitorio — reintentando', {
      status: response.status,
      intentosRestantes: intentos - 1,
      esperaMs: espera
    })

    await new Promise(resolve => {
      setTimeout(resolve, espera)
    })

    return intentos - 1
  }

  log.error('MOT-AI-011', 'Error HTTP desde DeepSeek API', { status: response.status, body: errText })
  throw new HTTPError(`Error en API DeepSeek (${response.status})`, {
    provider: 'deepseek',
    status: response.status,
    body: errText
  })
}

/**
 * Internal helper that does the fetch and normalizes to NormalizedResult.
 * Accepts already-resolved config fields.
 */
async function executeDeepSeek({ messages, model, temperature, maxTokens, topP, topK, presencePenalty, frequencyPenalty, stop, seed, responseFormat, userId, signal, logger, intentos, includeRaw }) {
  const log = resolveLogger(logger)

  const apiKey = (process.env.DEEPSEEK_API_KEY ?? '').trim()

  if (!apiKey) {
    log.warn('MOT-AI-010', 'DEEPSEEK_API_KEY no está configurada')
    throw new AIError('El servicio de IA no se encuentra configurado (falta la clave API de DeepSeek)', {
      provider: 'deepseek',
      code: 'MOT-AI-010'
    })
  }

  const tope = topeDeRespuesta(maxTokens, model)

  const payload = {
    model,
    messages,
    temperature,
    max_tokens: tope,
    ...(topP != null ? { top_p: topP } : {}),
    ...(topK != null ? { top_k: topK } : {}),
    ...(presencePenalty != null ? { presence_penalty: presencePenalty } : {}),
    ...(frequencyPenalty != null ? { frequency_penalty: frequencyPenalty } : {}),
    ...(stop != null ? { stop } : {}),
    ...(seed != null ? { seed } : {}),
    ...(responseFormat != null ? { response_format: responseFormat } : {}),
    ...(userId ? { user_id: String(userId) } : {})
  }

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const reintentar = await clasificarFallo(response, intentos, log)
      return executeDeepSeek({ messages, model, temperature, maxTokens, topP, topK, presencePenalty, frequencyPenalty, stop, seed, responseFormat, userId, signal, logger: log, intentos: reintentar, includeRaw })
    }

    let result
    try {
      result = await response.json()
    } catch (e) {
      log.error('MOT-AI-011', 'Error parseando JSON de DeepSeek', { error: e.message })
      throw new HTTPError(`Error en API DeepSeek (respuesta no es JSON válido)`, {
        provider: 'deepseek',
        status: response.status,
        body: e.message,
        cause: e
      })
    }
    const choice = result.choices?.[0]?.message

    const normalized = {
      content: choice?.content?.trim() || '',
      reasoningContent: choice?.reasoning_content?.trim() || null,
      usage: parseUsage(result.usage),
      finishReason: result.choices?.[0]?.finish_reason,
      provider: 'deepseek',
      model
    }
    if (includeRaw) normalized.raw = result
    return normalized
  } catch (err) {
    if (err instanceof BaseDeepSeekError || err instanceof HTTPError || err instanceof AIError) throw err
    if (err.name === 'AbortError') {
      log.error('MOT-AI-012', 'Timeout consultando DeepSeek', { timeoutMs: signal ? undefined : DEFAULT_TIMEOUT_MS })
      throw new TimeoutError(`Tiempo de espera agotado al consultar DeepSeek`, {
        provider: 'deepseek',
        cause: err
      })
    }
    log.error('MOT-AI-012', 'Excepción al consultar DeepSeek', { error: err.message })
    throw err
  }
}

/**
 * Cliente HTTP para DeepSeek — port fiel de bookingAPI/src/util/deepseekClient.js
 * Firma legacy preservada para compat: callDeepSeek({ messages, model, temperature, maxTokens, userId, timeoutMs, intentos, signal, logger })
 */
export const callDeepSeek = async ({
  messages,
  model = MODELS.NORMAL,
  temperature = 0.2,
  maxTokens = null,
  topP = null,
  topK = null,
  presencePenalty = null,
  frequencyPenalty = null,
  stop = null,
  seed = null,
  responseFormat = null,
  userId = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intentos = MAX_INTENTOS,
  signal: callerSignal,
  logger: callerLogger,
  includeRaw = false
}) => {
  const log = resolveLogger(callerLogger)

  // Compose AbortController with timeout + caller signal
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  const signal = controller.signal

  try {
    const result = await executeDeepSeek({
      messages,
      model,
      temperature,
      maxTokens,
      topP,
      topK,
      presencePenalty,
      frequencyPenalty,
      stop,
      seed,
      responseFormat,
      userId,
      signal,
      logger: log,
      intentos,
      includeRaw
    })
    return result
  } catch (err) {
    if (err.name === 'AbortError') {
      log.error('MOT-AI-012', 'Timeout consultando DeepSeek', { timeoutMs })
      throw new TimeoutError(`Tiempo de espera agotado al consultar DeepSeek (${timeoutMs / 1000}s)`, {
        provider: 'deepseek',
        timeoutMs,
        cause: err
      })
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

// AIProvider adapter
import { StreamingNotSupportedError } from '../errors.js'

export const deepseekProvider = {
  name: 'deepseek',
  models: Object.values(MODELS),
  supports(model) {
    return model.startsWith('deepseek-') || this.models.includes(model)
  },
  async complete({ messages, model, config = {}, userId, signal, logger }) {
    const log = resolveLogger(logger)
    const merged = {
      temperature: config.temperature ?? 0.2,
      maxTokens: config.maxTokens ?? null,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      includeRaw: config.includeRaw ?? false,
      topP: config.topP ?? null,
      topK: config.topK ?? null,
      presencePenalty: config.presencePenalty ?? null,
      frequencyPenalty: config.frequencyPenalty ?? null,
      stop: config.stop ?? null,
      seed: config.seed ?? null,
      responseFormat: config.responseFormat ?? null
    }

    // If caller already composed a signal with timeout (via callAI), use it directly.
    // Otherwise create a timeout internally.
    if (signal) {
      return executeDeepSeek({
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
        userId,
        signal,
        logger: log,
        intentos: MAX_INTENTOS,
        includeRaw: merged.includeRaw
      }).catch(err => {
        if (err.name === 'AbortError') {
          log.error('MOT-AI-012', 'Timeout consultando DeepSeek', { timeoutMs: merged.timeoutMs })
          throw new TimeoutError(`Tiempo de espera agotado al consultar DeepSeek (${merged.timeoutMs / 1000}s)`, {
            provider: 'deepseek',
            timeoutMs: merged.timeoutMs,
            cause: err
          })
        }
        throw err
      })
    }

    // Fallback: no signal from callAI (direct usage)
    return callDeepSeek({
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
      userId,
      timeoutMs: merged.timeoutMs,
      logger: log,
      includeRaw: merged.includeRaw
    })
  },
  // eslint-disable-next-line require-yield
  async *stream() {
    throw new StreamingNotSupportedError('deepseek', 'Streaming no está habilitado en v1. Ver docs/specs/10-ai-service.md §13.')
  }
}
