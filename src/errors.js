export class AIError extends Error {
  constructor(message, { provider, code, cause } = {}) {
    super(message, cause ? { cause } : undefined)
    this.name = 'AIError'
    this.provider = provider
    this.code = code
    if (cause) this.cause = cause
  }
}

export class ContextExceededError extends AIError {
  constructor(message = 'La conversación es demasiado larga para el modelo.', opts = {}) {
    super(message, { code: 'MOT-AI-013', ...opts })
    this.name = 'ContextExceededError'
  }
}

export class DeepSeekContextExceededError extends ContextExceededError {
  constructor(message, opts = {}) {
    super(message, { provider: 'deepseek', ...opts })
    this.name = 'DeepSeekContextExceededError'
  }
}

export class TimeoutError extends AIError {
  constructor(message, opts = {}) {
    super(message, { code: 'MOT-AI-012', ...opts })
    this.name = 'TimeoutError'
  }
}

export class UnknownModelError extends AIError {
  constructor(model, knownModels = [], opts = {}) {
    super(`Modelo '${model}' no soportado. Modelos: ${knownModels.join(', ') || '—'}`, { code: 'MOT-AI-016', ...opts })
    this.name = 'UnknownModelError'
    this.model = model
  }
}

export class ProviderNotRegisteredError extends AIError {
  constructor(provider, opts = {}) {
    super(`Provider '${provider}' no está registrado.`, { code: 'MOT-AI-017', ...opts })
    this.name = 'ProviderNotRegisteredError'
    this.provider = provider
  }
}

export class HTTPError extends AIError {
  constructor(message, { status, body, provider, ...opts } = {}) {
    super(message, { code: 'MOT-AI-011', provider, ...opts })
    this.name = 'HTTPError'
    this.status = status
    this.body = body
  }
}

export class StreamingNotSupportedError extends AIError {
  constructor(provider, message) {
    super(message || `El provider '${provider}' no soporta streaming`, { code: 'MOT-AI-018', provider })
    this.name = 'StreamingNotSupportedError'
  }
}
