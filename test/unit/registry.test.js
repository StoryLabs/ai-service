import { describe, it, expect } from 'bun:test'
import { resolveProvider, listModels } from '../../src/providers/registry.js'
import { MODELS } from '../../src/providers/deepseek.js'
import { MUSE_MODELS } from '../../src/providers/muse.js'
import { UnknownModelError, ProviderNotRegisteredError } from '../../src/errors.js'
import '../../src/index.js'

describe('registry unit', () => {
  it('deepseek prefix resuelve deepseek', () => {
    expect(resolveProvider({ model: 'deepseek-v4-flash' }).name).toBe('deepseek')
  })
  it('muse prefix resuelve muse', () => {
    expect(resolveProvider({ model: 'muse-spark-1.2-contributor' }).name).toBe('muse')
  })
  it('unknown → UnknownModelError', () => {
    expect(() => resolveProvider({ model: 'unknown' })).toThrow(UnknownModelError)
  })
  it('provider no registrado → ProviderNotRegisteredError', () => {
    expect(() => resolveProvider({ model: MODELS.FLASH, provider: 'openai' })).toThrow(ProviderNotRegisteredError)
  })
  it('provider explicit valido', () => {
    expect(resolveProvider({ model: MODELS.PRO, provider: 'deepseek' }).name).toBe('deepseek')
  })
  it('listModels contiene todos', () => {
    const m = listModels()
    expect(m.includes(MODELS.FLASH)).toBe(true)
    expect(m.includes(MUSE_MODELS.SPARK)).toBe(true)
  })
})
