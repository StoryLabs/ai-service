import { describe, it, expect } from 'bun:test'
import { applyDefaults, DEFAULTS } from '../../src/config.js'

describe('config applyDefaults', () => {
  it('deepseek defaults', () => {
    const c = applyDefaults('deepseek-v4-pro', {}, 'deepseek')
    expect(c.temperature).toBe(0.2)
    expect(c.maxTokens).toBe(8000)
    expect(c.timeoutMs).toBe(180_000)
  })
  it('deepseek NORMAL 6000', () => {
    expect(applyDefaults('deepseek-v4-flash', {}, 'deepseek').maxTokens).toBe(6000)
  })
  it('muse defaults 4096/120_000/1.0', () => {
    const c = applyDefaults('muse-spark-1.2-contributor', {}, 'muse')
    expect(c.maxTokens).toBe(4096)
    expect(c.timeoutMs).toBe(120_000)
    expect(c.temperature).toBe(1.0)
  })
  it('config.maxTokens explicit prevalece', () => {
    expect(applyDefaults('deepseek-v4-pro', { maxTokens: 123 }, 'deepseek').maxTokens).toBe(123)
  })
  it('fallback 4000 para modelo no tabulado', () => {
    expect(applyDefaults('deepseek-unknown', {}, 'deepseek').maxTokens).toBe(4000)
    expect(applyDefaults('muse-unknown', {}, 'muse').maxTokens).toBe(4000)
  })
  it('global fallback', () => {
    const c = applyDefaults('unknown', {}, 'unknown')
    expect(c.timeoutMs).toBe(DEFAULTS.global.timeoutMs)
  })
})
