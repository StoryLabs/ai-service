import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { callAI, MODELOS } from '../../src/index.js'
import { DeepSeekContextoExcedidoError, HTTPError, TimeoutError } from '../../src/errors.js'

describe('integration deepseek mock', () => {
  let origFetch
  beforeEach(() => {
    origFetch = global.fetch
    process.env.DEEPSEEK_API_KEY = 'sk-test'
  })
  afterEach(() => {
    global.fetch = origFetch
    delete process.env.DEEPSEEK_API_KEY
  })

  it('success → NormalizedResult', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: ' hello ', reasoning_content: ' reason ' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
      })
    })
    const r = await callAI({ messages: [{ role: 'user', content: 'hi' }], model: MODELOS.NORMAL })
    expect(r.content).toBe('hello')
    expect(r.reasoningContent).toBe('reason')
    expect(r.usage).toEqual({ promptTokens: 1, completionTokens: 2, totalTokens: 3 })
    expect(r.finishReason).toBe('stop')
  })

  it('retry 429 → 200', async () => {
    let calls = 0
    global.fetch = async () => {
      calls++
      if (calls === 1) return { ok: false, status: 429, text: async () => 'rate' }
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: {} }) }
    }
    const r = await callAI({ messages: [{ role: 'user', content: 'hi' }], model: MODELOS.NORMAL })
    expect(r.content).toBe('ok')
    expect(calls).toBe(2)
  })

  it('429 tres veces → HTTPError', async () => {
    global.fetch = async () => ({ ok: false, status: 429, text: async () => 'rate' })
    await expect(callAI({ messages: [{ role: 'user', content: 'hi' }], model: MODELOS.NORMAL })).rejects.toThrow(HTTPError)
  })

  it('400 context → DeepSeekContextoExcedidoError sin reintento', async () => {
    let calls = 0
    global.fetch = async () => {
      calls++
      return { ok: false, status: 400, text: async () => 'context_length exceeded' }
    }
    await expect(callAI({ messages: [{ role: 'user', content: 'hi' }], model: MODELOS.NORMAL })).rejects.toThrow(DeepSeekContextoExcedidoError)
    expect(calls).toBe(1)
  })

  it('timeout AbortError → TimeoutError', async () => {
    global.fetch = async (_u, { signal: _signal }) => {
      const e = new Error('abort')
      e.name = 'AbortError'
      throw e
    }
    await expect(callAI({ messages: [{ role: 'user', content: 'hi' }], model: MODELOS.NORMAL, config: { timeoutMs: 10 } })).rejects.toThrow(TimeoutError)
  })

  it('no choices → content "" sin throw', async () => {
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [] }) })
    const r = await callAI({ messages: [{ role: 'user', content: 'hi' }], model: MODELOS.NORMAL })
    expect(r.content).toBe('')
  })

  it('alias prompts', async () => {
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: {} }) })
    const r = await callAI({ prompts: [{ role: 'user', content: 'hi' }], model: MODELOS.NORMAL })
    expect(r.content).toBe('ok')
  })
})
