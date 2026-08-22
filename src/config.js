// src/config.js — central defaults per provider/model
// Invariante de timeout (§7.3, §11.3):
// ⚠️ El timeoutMs del servidor (ai-service adapter, default 180_000 para DeepSeek) debe ser
//    estrictamente menor que el timeout del cliente que lo invoca (p.ej. booking/bookingCustomer
//    ofetch/fetch, o aiChatStore.enviarMensaje). Si el cliente corta primero, el backend sigue:
//    termina la llamada, guarda el mensaje y descuenta crédito mientras el usuario ve timeout
//    y nunca ve la respuesta que pagó. Al revés no pasa nada malo: éste corta, devuelve error
//    explícito y NO se descuenta nada. Ver README § Timeouts.

import { AIError } from './errors.js'

export const DEFAULTS = {
  deepseek: {
    temperature: 0.2,
    timeoutMs: 180_000,
    maxTokensByModel: {
      'deepseek-v4-flash': 6000,
      'deepseek-v4-pro': 8000
    },
    fallbackMaxTokens: 4000,
    topP: null,
    topK: null,
    presencePenalty: null,
    frequencyPenalty: null,
    stop: null,
    seed: null,
    responseFormat: null
  },
  muse: {
    temperature: 1.0,
    timeoutMs: 120_000,
    maxTokensByModel: {
      'muse-spark-1.2-contributor': 4096
    },
    fallbackMaxTokens: 4000,
    topP: null,
    topK: null,
    presencePenalty: null,
    frequencyPenalty: null,
    stop: null,
    seed: null,
    responseFormat: null
  },
  global: {
    temperature: 0.2,
    timeoutMs: 180_000,
    fallbackMaxTokens: 4000,
    topP: null,
    topK: null,
    presencePenalty: null,
    frequencyPenalty: null,
    stop: null,
    seed: null,
    responseFormat: null
  }
}

function validateNumber(name, value, min, max, code = 'MOT-AI-016') {
  if (value === null || value === undefined) return
  if (typeof value !== 'number' || Number.isNaN(value)) throw new AIError(`${name} debe ser número`, { code, provider: 'global' })
  if (value < min || value > max) throw new AIError(`${name} fuera de rango [${min}, ${max}]: ${value}`, { code, provider: 'global' })
}

function validateTopK(value) {
  if (value === null || value === undefined) return
  if (!Number.isInteger(value) || value < 1) throw new AIError(`topK debe ser entero >=1: ${value}`, { code: 'MOT-AI-016', provider: 'global' })
}

function validateStop(value) {
  if (value === null || value === undefined) return
  if (typeof value === 'string') return
  if (Array.isArray(value) && value.every(v => typeof v === 'string')) return
  throw new AIError('stop debe ser string o string[]', { code: 'MOT-AI-016', provider: 'global' })
}

function validateSeed(value) {
  if (value === null || value === undefined) return
  if (!Number.isInteger(value)) throw new AIError(`seed debe ser entero: ${value}`, { code: 'MOT-AI-016', provider: 'global' })
}

function validateResponseFormat(value) {
  if (value === null || value === undefined) return
  if (typeof value !== 'object' || Array.isArray(value)) throw new AIError('responseFormat debe ser objeto', { code: 'MOT-AI-016', provider: 'global' })
}

export function applyDefaults(model, config = {}, providerName) {
  const d = DEFAULTS[providerName] ?? DEFAULTS.global

  // strict validation before merging
  if (config.temperature !== undefined) validateNumber('temperature', config.temperature, 0, 2)
  if (config.topP !== undefined) validateNumber('topP', config.topP, 0, 1)
  if (config.topK !== undefined) validateTopK(config.topK)
  if (config.presencePenalty !== undefined) validateNumber('presencePenalty', config.presencePenalty, -2, 2)
  if (config.frequencyPenalty !== undefined) validateNumber('frequencyPenalty', config.frequencyPenalty, -2, 2)
  if (config.stop !== undefined) validateStop(config.stop)
  if (config.seed !== undefined) validateSeed(config.seed)
  if (config.responseFormat !== undefined) validateResponseFormat(config.responseFormat)
  if (config.timeoutMs !== undefined) {
    if (typeof config.timeoutMs !== 'number' || config.timeoutMs <= 0) throw new AIError('timeoutMs debe ser número >0', { code: 'MOT-AI-016', provider: 'global' })
  }
  if (config.maxTokens !== undefined) {
    if (config.maxTokens !== null && (!Number.isInteger(config.maxTokens) || config.maxTokens <= 0)) throw new AIError('maxTokens debe ser entero >0 o null', { code: 'MOT-AI-016', provider: 'global' })
  }

  return {
    temperature: config.temperature ?? d.temperature,
    maxTokens: config.maxTokens ?? d.maxTokensByModel?.[model] ?? d.fallbackMaxTokens,
    timeoutMs: config.timeoutMs ?? d.timeoutMs,
    includeRaw: config.includeRaw ?? false,
    topP: config.topP ?? d.topP,
    topK: config.topK ?? d.topK,
    presencePenalty: config.presencePenalty ?? d.presencePenalty,
    frequencyPenalty: config.frequencyPenalty ?? d.frequencyPenalty,
    stop: config.stop ?? d.stop,
    seed: config.seed ?? d.seed,
    responseFormat: config.responseFormat ?? d.responseFormat
  }
}
