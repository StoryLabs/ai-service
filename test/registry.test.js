import { describe, it, expect } from 'bun:test'
import { resolveProvider, listModels, getProvider, registry } from '../src/providers/registry.js'
import { MODELS } from '../src/providers/deepseek.js'
import { MUSE_MODELS } from '../src/providers/muse.js'
import { UnknownModelError, ProviderNotRegisteredError } from '../src/errors.js'

// Ensure index registration happened (callAI imports register)
import '../src/index.js'
const mockLogger = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} }

describe('registry resolveProvider', () => {
  it('deepseek-v4-flash → deepseek', () => {
    const p = resolveProvider({ model: 'deepseek-v4-flash' })
    expect(p.name).toBe('deepseek')
  })
  it('deepseek-v4-pro → deepseek', () => {
    const p = resolveProvider({ model: MODELS.PRO })
    expect(p.name).toBe('deepseek')
  })
  it('cualquier deepseek-* prefijo → deepseek', () => {
    const p = resolveProvider({ model: 'deepseek-v99-custom' })
    expect(p.name).toBe('deepseek')
  })
  it('muse-spark-1.2-contributor → muse', () => {
    const p = resolveProvider({ model: 'muse-spark-1.2-contributor' })
    expect(p.name).toBe('muse')
  })
  it('cualquier muse-* prefijo → muse', () => {
    const p = resolveProvider({ model: 'muse-v2-alpha' })
    expect(p.name).toBe('muse')
  })
  it('unknown-model → UnknownModelError con lista', () => {
    let caught
    try {
      resolveProvider({ model: 'unknown-model' })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(UnknownModelError)
    expect(caught.model).toBe('unknown-model')
    expect(caught.code).toBe('MOT-AI-016')
    expect(caught.message).toContain('no soportado')
  })
  it('provider explicit override aun si model no matchea prefijo → UnknownModelError', () => {
    expect(() => resolveProvider({ model: 'custom-flash', provider: 'deepseek' })).toThrow(UnknownModelError)
  })
  it('provider explicit valido', () => {
    const p = resolveProvider({ model: MODELS.NORMAL, provider: 'deepseek' })
    expect(p.name).toBe('deepseek')
  })
  it('provider unknown → ProviderNotRegisteredError MOT-AI-017', () => {
    let caught
    try {
      resolveProvider({ model: MODELS.NORMAL, provider: 'openai' })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ProviderNotRegisteredError)
    expect(caught.code).toBe('MOT-AI-017')
    expect(caught.provider).toBe('openai')
  })
  it('listModels contiene ambos providers models', () => {
    const models = listModels()
    expect(models.includes(MODELS.NORMAL)).toBe(true)
    expect(models.includes(MODELS.PRO)).toBe(true)
    expect(models.includes(MUSE_MODELS.SPARK)).toBe(true)
  })
  it('getProvider deepseek y muse existen', () => {
    expect(getProvider('deepseek')).toBeTruthy()
    expect(getProvider('muse')).toBeTruthy()
    expect(getProvider('unknown')).toBeUndefined()
  })
  it('registry Map tiene 2 providers registrados', () => {
    expect(registry.size).toBe(2)
  })
})
