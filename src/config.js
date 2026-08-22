// src/config.js — central defaults per provider/model
// Invariante de timeout (§7.3, §11.3):
// ⚠️ El timeoutMs del servidor (ai-service adapter, default 180_000 para DeepSeek) debe ser
//    estrictamente menor que el timeout del cliente que lo invoca (p.ej. booking/bookingCustomer
//    ofetch/fetch, o aiChatStore.enviarMensaje). Si el cliente corta primero, el backend sigue:
//    termina la llamada, guarda el mensaje y descuenta crédito mientras el usuario ve timeout
//    y nunca ve la respuesta que pagó. Al revés no pasa nada malo: éste corta, devuelve error
//    explícito y NO se descuenta nada. Ver README § Timeouts.

export const DEFAULTS = {
  deepseek: {
    temperature: 0.2,
    timeoutMs: 180_000,
    maxTokensByModel: {
      'deepseek-v4-flash': 6000,
      'deepseek-v4-pro': 8000
    },
    fallbackMaxTokens: 4000
  },
  muse: {
    temperature: 0.3,
    timeoutMs: 120_000,
    maxTokensByModel: {
      'muse-spark-1.2-contributor': 4096
    },
    fallbackMaxTokens: 4000
  },
  global: {
    temperature: 0.2,
    timeoutMs: 180_000,
    fallbackMaxTokens: 4000
  }
}

export function applyDefaults(model, config = {}, providerName) {
  const d = DEFAULTS[providerName] ?? DEFAULTS.global
  return {
    temperature: config.temperature ?? d.temperature,
    maxTokens: config.maxTokens ?? d.maxTokensByModel?.[model] ?? d.fallbackMaxTokens,
    timeoutMs: config.timeoutMs ?? d.timeoutMs,
    includeRaw: config.includeRaw ?? false
  }
}
