import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { callAI } from '../../src/index.js'
import { AIError, StreamingNotSupportedError } from '../../src/errors.js'
import { museProvider, MUSE_MODELS } from '../../src/providers/muse.js'

describe('muse stub', () => {
  let origFetch
  beforeEach(() => {
    origFetch = global.fetch
  })
  afterEach(() => {
    global.fetch = origFetch
    delete process.env.MUSE_API_KEY
    delete process.env.MUSE_CONTRIBUTOR_TOKEN
  })

  it('supports muse prefix', () => {
    expect(museProvider.supports('muse-spark-1.2-contributor')).toBe(true)
    expect(museProvider.supports('muse-v2')).toBe(true)
    expect(museProvider.supports('deepseek-v4-flash')).toBe(false)
  })

  it('sin env var → AIError MOT-AI-010', async () => {
    delete process.env.MUSE_API_KEY
    delete process.env.MUSE_CONTRIBUTOR_TOKEN
    let caught
    try {
      await callAI({ messages: [{ role: 'user', content: 'hi' }], model: MUSE_MODELS.SPARK })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AIError)
    expect(caught.code).toBe('MOT-AI-010')
  })

  it('con env var pero stub → AIError actionable', async () => {
    process.env.MUSE_API_KEY = 'sk-muse'
    let caught
    try {
      await callAI({ messages: [{ role: 'user', content: 'hi' }], model: MUSE_MODELS.SPARK })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AIError)
    expect(caught.message).toMatch(/Muse Spark/)
  })

  it('MUSE_CONTRIBUTOR_TOKEN fallback works (considera configurado)', async () => {
    process.env.MUSE_CONTRIBUTOR_TOKEN = 'tok'
    let caught
    try {
      await callAI({ messages: [{ role: 'user', content: 'hi' }], model: MUSE_MODELS.SPARK })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught.message).toMatch(/Muse Spark/)
    expect(caught.code).toBe('MOT-AI-010')
    expect(caught.provider).toBe('muse')
  })

  it('stream siempre lanza StreamingNotSupportedError', async () => {
    let caught
    try {
      for await (const _c of museProvider.stream()) {
        // should not yield
      }
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(StreamingNotSupportedError)
    expect(caught.provider).toBe('muse')
  })

  // TODO: habilitar con MUSE_API_KEY real y endpoint confirmado
  it.skip('integration real con MUSE_API_KEY (TODO)', async () => {
    process.env.MUSE_API_KEY = process.env.MUSE_API_KEY || 'real'
    // await callAI({ messages: [{ role: 'user', content: 'hi' }], model: MUSE_MODELS.SPARK })
  })
})
