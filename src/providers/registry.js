import { ProviderNotRegisteredError, UnknownModelError } from '../errors.js'

const registry = new Map()

export function register(provider) {
  if (!provider?.name || typeof provider.complete !== 'function') throw new Error('AIProvider inválido: requiere name y complete()')
  registry.set(provider.name, provider)
}

export function getProvider(name) {
  return registry.get(name)
}

export function listProviders() {
  return [...registry.values()]
}

export function listModels() {
  return [...registry.values()].flatMap(p => p.models)
}

// name -> prefix fallback (para inferencia sin tabla exhaustiva)
const PREFIX_MAP = {
  'deepseek-': 'deepseek',
  'muse-': 'muse'
}

// Placeholder for MODEL_TABLE dynamic — populated after MODELS imports to avoid circular
let MODEL_TABLE = {}

export function setModelTable(table) {
  MODEL_TABLE = table
}

export function getModelTable() {
  return MODEL_TABLE
}

export function resolveProvider({ model, provider }) {
  if (provider) {
    const p = registry.get(provider)
    if (!p) throw new ProviderNotRegisteredError(provider)
    if (!p.supports(model)) throw new UnknownModelError(model, p.models)
    return p
  }

  if (MODEL_TABLE[model]) {
    const p = registry.get(MODEL_TABLE[model])
    if (p?.supports(model)) return p
  }

  for (const [prefix, name] of Object.entries(PREFIX_MAP)) {
    if (model.startsWith(prefix)) {
      const p = registry.get(name)
      if (p?.supports(model)) return p
    }
  }

  // último intento: preguntar a cada provider
  for (const p of registry.values()) if (p.supports(model)) return p

  throw new UnknownModelError(
    model,
    [...registry.values()].flatMap(p => p.models)
  )
}

export { registry }
