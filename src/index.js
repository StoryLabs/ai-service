import { applyDefaults } from './config.js'
import { AIError, StreamingNotSupportedError } from './errors.js'
import { resolveLogger } from './logger.js'
import {
  deepseekProvider,
  MODELOS as DeepSeekModelos,
  MAX_TOKENS,
  parseUsage,
  DEEPSEEK_URL,
  DEFAULT_TIMEOUT_MS,
  callDeepSeek,
  topeDeRespuesta,
  esTransitorio,
  esContextoExcedido,
  clasificarFallo
} from './providers/deepseek.js'
import { museProvider, MUSE_MODELS } from './providers/muse.js'
import { register, resolveProvider, getProvider, listProviders, listModels, registry, setModelTable } from './providers/registry.js'

// Register built-in providers
register(deepseekProvider)
register(museProvider)

// Populate model table for exact matches (avoids circular import)
// includes new Muse id + legacy alias for backward compat
setModelTable({
  [DeepSeekModelos.NORMAL]: 'deepseek',
  [DeepSeekModelos.PRO]: 'deepseek',
  [MUSE_MODELS.SPARK]: 'muse',
  'muse-spark-1.2-contributor': 'muse'
})

// Re-export MODELOS (legacy) and MODELS alias
export const MODELOS = DeepSeekModelos
export const MODELS = MODELOS
export { MUSE_MODELS }
export const MODELOS_MUSE = MUSE_MODELS

export { MAX_TOKENS, parseUsage, DEEPSEEK_URL, DEFAULT_TIMEOUT_MS, callDeepSeek, topeDeRespuesta, esTransitorio, esContextoExcedido, clasificarFallo }

export * from './errors.js'
export { register, resolveProvider, getProvider, listProviders, listModels, registry }
export { resolveLogger }

function composeAbortSignal(timeoutMs, callerSignal) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return { signal: controller.signal, clear: () => clearTimeout(timeout) }
}

/**
 * Llamada unificada a IA. Resuelve provider + credenciales internamente.
 *
 * @param {Object} args
 * @param {Array<{role:string, content:string}>} [args.messages] - OpenAI-style. Alias: prompts
 * @param {Array<{role:string, content:string}>} [args.prompts] - alias de messages (compat RQ)
 * @param {string} args.model - id literal del modelo (ej. 'deepseek-v4-flash', 'LLM_1751420409235724_4VRvEUuB8UJRvaAMotFs0f66XpU')
 * @param {Object} [args.config] - { temperature?, maxTokens?, timeoutMs?, topP?, topK?, presencePenalty?, frequencyPenalty?, stop?, seed?, responseFormat?, includeRaw? }
 * @param {number} [args.config.temperature] - 0..2, default por provider (DeepSeek 0.2, Muse 0.3) — validación estricta MOT-AI-016
 * @param {number} [args.config.topP] - 0..1 — validación estricta
 * @param {number} [args.config.topK] - integer >=1 — validación estricta
 * @param {number} [args.config.presencePenalty] - -2..2
 * @param {number} [args.config.frequencyPenalty] - -2..2
 * @param {string|string[]} [args.config.stop]
 * @param {number} [args.config.seed] - integer
 * @param {Object} [args.config.responseFormat]
 * @param {number} [args.config.maxTokens] - techo de completion_tokens, default por modelo
 * @param {number} [args.config.timeoutMs] - default por provider (DeepSeek 180_000, Muse 120_000)
 * @param {boolean} [args.config.includeRaw] - si true, NormalizedResult.raw incluye respuesta cruda
 * @param {string} [args.userId] - opcional, trazabilidad del provider
 * @param {string} [args.provider] - opcional, fuerza adapter ('deepseek'|'muse')
 * @param {Object} args.logger - REQUERIDO desde v0.1.1, logger inyectable { warn, error, info } — sin fallback, lanza MOT-AI-010 si falta
 * @param {AbortSignal} [args.signal] - opcional, señal externa para cancelar
 * @returns {Promise<NormalizedResult>}
 */
export async function callAI({ messages, prompts, model, config = {}, userId = null, provider, logger: callerLogger, signal: callerSignal }) {
  // logger requerido desde v0.1.1 — sin fallback
  const earlyLog = resolveLogger(callerLogger)
  const msgs = messages ?? prompts
  if (messages && prompts) {
    earlyLog.warn('MOT-AI-015', 'callAI recibió messages y prompts — se usa messages')
  }
  if (!Array.isArray(msgs) || msgs.length === 0) throw new AIError('messages/prompts requerido y no vacío', { code: 'MOT-AI-016' })
  if (!model || typeof model !== 'string') throw new AIError('model requerido', { code: 'MOT-AI-016' })

  const adapter = resolveProvider({ model, provider })
  const mergedConfig = applyDefaults(model, config, adapter.name)
  const { signal, clear } = composeAbortSignal(mergedConfig.timeoutMs, callerSignal)
  const log = resolveLogger(callerLogger)

  try {
    const result = await adapter.complete({ messages: msgs, model, config: mergedConfig, userId, signal, logger: log })
    // Never leak env vars — ensure result doesn't contain key
    if (result && typeof result === 'object' && ('apiKey' in result || 'DEEPSEEK_API_KEY' in result || 'MUSE_API_KEY' in result)) {
      delete result.apiKey
      delete result.DEEPSEEK_API_KEY
      delete result.MUSE_API_KEY
    }
    return result
  } finally {
    clear()
  }
}

export const aiComplete = callAI

/**
 * Streaming stub v1 — investigación entregada, implementación diferida.
 * Ver docs/specs/10-ai-service.md §13 para análisis SSE vs chunked vs ReadableStream,
 * compat Hono/Express/Nuxt proxy (h3 sendStream vs ofetch buffering), y firma Chunk.
 *
 * Firma propuesta (congelada):
 *   callAI.stream({ messages|prompts, model, config, userId, provider, logger, signal })
 *     → AsyncIterable<Chunk> donde Chunk = { contentDelta, reasoningDelta, usage, finishReason, provider, model }
 *
 * Transporte wire recomendado: SSE (text/event-stream) para HTTP, AsyncIterable directo para uso interno.
 * Backpressure: for await respeta backpressure (yield espera al consumer).
 * Cancelación: AbortSignal externo aborta fetch al provider.
 *
 * Este stub lanza StreamingNotSupportedError para que callers puedan feature-detect.
 */
// eslint-disable-next-line require-yield
export async function* streamAI(args) {
  const provider = args?.provider || (args?.model?.startsWith('muse-') ? 'muse' : args?.model?.startsWith('deepseek-') ? 'deepseek' : 'global')
  throw new StreamingNotSupportedError(provider, 'Streaming no está habilitado en v1. Ver docs/specs/10-ai-service.md §13.')
}

export const stream = streamAI

// Attach to callAI for API per spec: callAI.stream
callAI.stream = streamAI

// Also export compose for testing
export { composeAbortSignal }
