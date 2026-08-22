import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { callAI } from '../../src/index.js'
import { AIError, StreamingNotSupportedError } from '../../src/errors.js'
import { museProvider, MUSE_MODELS } from '../../src/providers/muse.js'
const mockLogger = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} }

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
      await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: MUSE_MODELS.SPARK })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AIError)
    expect(caught.code).toBe('MOT-AI-010')
  })

  it('con env var → fetch success (muse real)', async () => {
    process.env.MUSE_API_KEY = 'sk-muse'
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok muse' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } })
    })
    const res = await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: MUSE_MODELS.SPARK })
    expect(res.content).toBe('ok muse')
    expect(res.provider).toBe('muse')
  })

  it('MUSE_CONTRIBUTOR_TOKEN fallback works (fetch success)', async () => {
    process.env.MUSE_CONTRIBUTOR_TOKEN = 'tok'
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok via token' } }], usage: { input_tokens: 1, output_tokens: 1 } })
    })
    const res = await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: MUSE_MODELS.SPARK })
    expect(res.content).toBe('ok via token')
    expect(res.usage.promptTokens).toBe(1)
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
    // await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: MUSE_MODELS.SPARK })
  })
})
