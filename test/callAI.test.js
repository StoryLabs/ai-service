import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { callAI, aiComplete, MODELOS, MUSE_MODELS, StreamingNotSupportedError } from '../src/index.js'
import { UnknownModelError, ContextExceededError, DeepSeekContextoExcedidoError, AIError } from '../src/errors.js'

const mockLogger = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} }

describe('callAI integration mocked fetch', () => {
  let origFetch
  let origEnvDeepSeek
  let origEnvMuse

  beforeEach(() => {
    origFetch = global.fetch
    origEnvDeepSeek = process.env.DEEPSEEK_API_KEY
    origEnvMuse = process.env.MUSE_API_KEY
  })

  afterEach(() => {
    global.fetch = origFetch
    if (origEnvDeepSeek === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = origEnvDeepSeek
    if (origEnvMuse === undefined) delete process.env.MUSE_API_KEY
    else process.env.MUSE_API_KEY = origEnvMuse
    delete process.env.MUSE_CONTRIBUTOR_TOKEN
  })

  it('callAI deepseek success → NormalizedResult', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test'
    global.fetch = async (url, opts) => {
      expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
      const body = JSON.parse(opts.body)
      expect(body.model).toBe(MODELOS.NORMAL)
      expect(body.temperature).toBe(0.2)
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '  Hola mundo  ', reasoning_content: '  thinking  ' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
        })
      }
    }
    const res = await callAI({ logger: mockLogger,
      messages: [{ role: 'user', content: 'Hi' }],
      model: MODELOS.NORMAL,
      config: { temperature: 0.2 }
    })
    expect(res.content).toBe('Hola mundo')
    expect(res.reasoningContent).toBe('thinking')
    expect(res.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 })
    expect(res.finishReason).toBe('stop')
    expect(res.provider).toBe('deepseek')
    expect(res.model).toBe(MODELOS.NORMAL)
    expect(!('raw' in res) || res.raw === undefined).toBeTruthy()
  })

  it('aiComplete alias works', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test'
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: {} })
    })
    const res = await aiComplete({logger: mockLogger,messages: [{ role: 'user', content: 'hi' }], model: MODELOS.NORMAL })
    expect(res.content).toBe('ok')
  })

  it('prompts alias works igual que messages', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test'
    global.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body)
      expect(body.messages[0].content).toBe('via prompts')
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: {} }) }
    }
    const res = await callAI({ logger: mockLogger, prompts: [{ role: 'user', content: 'via prompts' }], model: MODELOS.NORMAL })
    expect(res.content).toBe('ok')
  })

  it('messages prevalece si ambos llegan + warn MOT-AI-015', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test'
    global.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body)
      expect(body.messages[0].content).toBe('from messages')
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: {} }) }
    }
    const warns = []
    const logger = { warn: (c, _m) => warns.push(c), error: () => {}, info: () => {}, debug: () => {} }
    const res = await callAI({
      messages: [{ role: 'user', content: 'from messages' }],
      prompts: [{ role: 'user', content: 'from prompts' }],
      model: MODELOS.NORMAL,
      logger
    })
    expect(res.content).toBe('ok')
    expect(warns.includes('MOT-AI-015')).toBe(true)
  })

  it('unknown model → UnknownModelError sin fetch', async () => {
    let fetched = false
    global.fetch = async () => {
      fetched = true
      return { ok: true, json: async () => ({}) }
    }
    let caught
    try {
      await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: 'unknown-xyz' })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(UnknownModelError)
    expect(caught.code).toBe('MOT-AI-016')
    expect(fetched).toBe(false)
  })

  it('credential missing → AIError MOT-AI-010 sin fetch', async () => {
    delete process.env.DEEPSEEK_API_KEY
    let fetched = false
    global.fetch = async () => {
      fetched = true
      return { ok: true, json: async () => ({}) }
    }
    let caught
    try {
      await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: MODELOS.NORMAL })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AIError)
    expect(caught.code).toBe('MOT-AI-010')
    expect(caught.message).toMatch(/falta la clave API de DeepSeek/)
    expect(JSON.stringify(caught).includes('sk-')).toBe(false)
    expect(fetched).toBe(false)
  })

  it('muse sin env var → AIError MOT-AI-010', async () => {
    delete process.env.MUSE_API_KEY
    delete process.env.MUSE_CONTRIBUTOR_TOKEN
    let fetched = false
    global.fetch = async () => {
      fetched = true
      return { ok: true, json: async () => ({}) }
    }
    let caught
    try {
      await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: MUSE_MODELS.SPARK })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AIError)
    expect(caught.provider).toBe('muse')
    expect(caught.code).toBe('MOT-AI-010')
    expect(fetched).toBe(false)
  })

  it('muse con env var → fetch muse success', async () => {
    process.env.MUSE_API_KEY = 'sk-muse'
    global.fetch = async (url, opts) => {
      expect(url).toBe('https://api.muse.example.com/v1/chat/completions')
      const body = JSON.parse(opts.body)
      expect(body.model).toBe(MUSE_MODELS.SPARK)
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hola Muse', reasoning_content: null }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
        })
      }
    }
    const res = await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: MUSE_MODELS.SPARK })
    expect(res.content).toBe('Hola Muse')
    expect(res.provider).toBe('muse')
    expect(res.model).toBe(MUSE_MODELS.SPARK)
    expect(res.usage).toEqual({ promptTokens: 5, completionTokens: 10, totalTokens: 15 })
  })

  it('stream stub throws StreamingNotSupportedError MOT-AI-018', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test'
    let caught
    try {
      for await (const _chunk of callAI.stream({ messages: [{ role: 'user', content: 'hi' }], model: MODELOS.NORMAL })) {
        // should not yield
      }
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(StreamingNotSupportedError)
    expect(caught.code).toBe('MOT-AI-018')
    expect(caught.message).toMatch(/Streaming no está habilitado/)
  })

  it('stream via src/stream.js also throws', async () => {
    const { streamAI } = await import('../src/stream.js')
    let caught
    try {
      for await (const _c of streamAI({ model: MODELOS.NORMAL })) {
        // should not yield
      }
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(StreamingNotSupportedError)
  })

  it('includeRaw true pasa raw', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test'
    const rawPayload = {
      choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      id: 'abc'
    }
    global.fetch = async () => ({ ok: true, json: async () => rawPayload })
    const res = await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: MODELOS.NORMAL, config: { includeRaw: true } })
    expect(res.raw).toEqual(rawPayload)
  })

  it('no expone credentials en resultado', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-super-secret-123'
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'hi' } }], usage: {} }) })
    const res = await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: MODELOS.NORMAL })
    const serialized = JSON.stringify(res)
    expect(serialized.includes('sk-super-secret-123')).toBe(false)
    expect(serialized.includes('DEEPSEEK_API_KEY')).toBe(false)
  })

  it('DeepSeek contexto excedido se propaga como ContextExceededError', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test'
    global.fetch = async () => ({
      ok: false,
      status: 400,
      text: async () => 'context_length exceeded limit'
    })
    let caught
    try {
      await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: MODELOS.NORMAL })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(DeepSeekContextoExcedidoError)
    expect(caught).toBeInstanceOf(ContextExceededError)
    expect(caught.code).toBe('MOT-AI-013')
  })

  it('messages vacío → AIError', async () => {
    await expect(callAI({ logger: mockLogger, messages: [], model: MODELOS.NORMAL })).rejects.toThrow(AIError)
    await expect(callAI({ logger: mockLogger, model: MODELOS.NORMAL })).rejects.toThrow(AIError)
  })

  it('model missing → AIError', async () => {
    await expect(callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(AIError)
  })

  it('provider explicit forces muse for model', async () => {
    process.env.MUSE_API_KEY = 'sk-muse'
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok muse' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
    })
    const res = await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: MUSE_MODELS.SPARK, provider: 'muse' })
    expect(res.provider).toBe('muse')
    expect(res.content).toBe('ok muse')
  })
})
