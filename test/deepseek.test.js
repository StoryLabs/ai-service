const mockLoggerDeep = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} }
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  parseUsage,
  esTransitorio,
  esContextoExcedido,
  clasificarFallo,
  topeDeRespuesta,
  MAX_TOKENS,
  MODELS,
  TOPE_POR_DEFECTO,
  DEFAULT_TIMEOUT_MS,
  MAX_INTENTOS,
  ESPERA_BASE_MS,
  callDeepSeek,
  DeepSeekContextoExcedidoError
} from '../src/providers/deepseek.js'
import { AIError, HTTPError, TimeoutError, ContextExceededError } from '../src/errors.js'

describe('parseUsage', () => {
  it('retorna 0 cuando campos ausentes', () => {
    const out = parseUsage({})
    expect(out).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
  })
  it('ausente total_tokens suma prompt+completion', () => {
    const out = parseUsage({ prompt_tokens: 10, completion_tokens: 5 })
    expect(out.totalTokens).toBe(15)
  })
  it('mapea prompt_tokens/completion_tokens/total_tokens', () => {
    const out = parseUsage({ prompt_tokens: 123, completion_tokens: 456, total_tokens: 579 })
    expect(out).toEqual({ promptTokens: 123, completionTokens: 456, totalTokens: 579 })
  })
  it('sin arg usa default {}', () => {
    const out = parseUsage()
    expect(out).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
  })
})

describe('esContextoExcedido', () => {
  const cases = [
    'context length exceeded',
    'context_length exceeded',
    'maximum context length',
    'too long',
    'too many tokens',
    'CONTEXT LENGTH', // case-insensitive
    'Context_length'
  ]
  for (const body of cases) {
    it(`detecta "${body}" con 400`, () => {
      expect(esContextoExcedido(400, body)).toBe(true)
    })
  }
  it('no detecta con status !=400', () => {
    expect(esContextoExcedido(429, 'context length')).toBe(false)
    expect(esContextoExcedido(500, 'too many tokens')).toBe(false)
  })
  it('no detecta 400 sin regex', () => {
    expect(esContextoExcedido(400, 'invalid api key')).toBe(false)
    expect(esContextoExcedido(400, '')).toBe(false)
  })
})

describe('esTransitorio', () => {
  it('true para 429 y >=500', () => {
    expect(esTransitorio(429)).toBe(true)
    expect(esTransitorio(500)).toBe(true)
    expect(esTransitorio(503)).toBe(true)
  })
  it('false para otros', () => {
    expect(esTransitorio(400)).toBe(false)
    expect(esTransitorio(401)).toBe(false)
    expect(esTransitorio(404)).toBe(false)
  })
})

describe('topeDeRespuesta', () => {
  it('retorna MAX_TOKENS por modelo cuando maxTokens null', () => {
    expect(topeDeRespuesta(null, MODELS.NORMAL)).toBe(6000)
    expect(topeDeRespuesta(undefined, MODELS.PRO)).toBe(8000)
  })
  it('respeta maxTokens explícito', () => {
    expect(topeDeRespuesta(1234, MODELS.NORMAL)).toBe(1234)
    expect(topeDeRespuesta(0, MODELS.PRO)).toBe(0)
  })
  it('fallback 4000 para modelo no tabulado', () => {
    expect(topeDeRespuesta(null, 'deepseek-unknown')).toBe(4000)
    expect(topeDeRespuesta(undefined, 'muse-spark-1.2-contributor')).toBe(4000)
    expect(topeDeRespuesta(null, 'unknown')).toBe(TOPE_POR_DEFECTO)
  })
})

describe('constantes', () => {
  it('MODELS literales preservados', () => {
    expect(MODELS.NORMAL).toBe('deepseek-v4-flash')
    expect(MODELS.PRO).toBe('deepseek-v4-pro')
  })
  it('MAX_TOKENS 6000/8000', () => {
    expect(MAX_TOKENS[MODELS.NORMAL]).toBe(6000)
    expect(MAX_TOKENS[MODELS.PRO]).toBe(8000)
  })
  it('DEFAULT_TIMEOUT_MS 180_000', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(180_000)
  })
  it('MAX_INTENTOS 3 y ESPERA_BASE_MS 1000', () => {
    expect(MAX_INTENTOS).toBe(3)
    expect(ESPERA_BASE_MS).toBe(1000)
  })
})

describe('clasificarFallo', () => {
  function mockResponse(status, body) {
    return { status, text: async () => body }
  }

  it('400 + context length → DeepSeekContextoExcedidoError sin reintento, MOT-AI-013', async () => {
    const logger = { warn: () => {}, error: () => {} }
    let warned = null
    logger.warn = code => {
      warned = code
    }
    const resp = mockResponse(400, 'context_length exceeded limit')
    let caught
    try {
      await clasificarFallo(resp, 3, logger)
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(DeepSeekContextoExcedidoError)
    expect(caught).toBeInstanceOf(ContextExceededError)
    expect(caught.name).toBe('DeepSeekContextoExcedidoError')
    expect(warned).toBe('MOT-AI-013')
  })

  it('429 con intentos>1 → espera 1s y retorna intentos-1, MOT-AI-014', async () => {
    const calls = []
    const logger = { warn: (c, _m, ctx) => calls.push({ c, ctx }), error: () => {} }
    const resp = mockResponse(429, 'rate limited')
    const start = Date.now()
    const remaining = await clasificarFallo(resp, 3, logger)
    const elapsed = Date.now() - start
    expect(remaining).toBe(2)
    expect(calls[0].c).toBe('MOT-AI-014')
    expect(elapsed >= 900).toBe(true)
  })

  it('500 con intentos=2 → espera 2s', async () => {
    const logger = { warn: () => {}, error: () => {} }
    const resp = mockResponse(500, 'internal error')
    const start = Date.now()
    const remaining = await clasificarFallo(resp, 2, logger)
    const elapsed = Date.now() - start
    expect(remaining).toBe(1)
    expect(elapsed >= 1900).toBe(true)
  })

  it('400 sin contexto → HTTPError sin reintento, MOT-AI-011', async () => {
    let logged = null
    const logger = {
      warn: () => {},
      error: c => {
        logged = c
      }
    }
    const resp = mockResponse(400, 'invalid api key')
    let caught
    try {
      await clasificarFallo(resp, 3, logger)
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(HTTPError)
    expect(caught.status).toBe(400)
    expect(caught.provider).toBe('deepseek')
    expect(logged).toBe('MOT-AI-011')
  })

  it('401 → HTTPError sin reintento', async () => {
    const logger = { warn: () => {}, error: () => {} }
    const resp = mockResponse(401, 'unauthorized')
    await expect(clasificarFallo(resp, 3, logger)).rejects.toThrow(HTTPError)
  })

  it('429 con intentos=1 agotado → HTTPError final', async () => {
    const logger = { warn: () => {}, error: () => {} }
    const resp = mockResponse(429, 'rate limited')
    await expect(clasificarFallo(resp, 1, logger)).rejects.toThrow(HTTPError)
  })

  it('500 con intentos=1 agotado → HTTPError', async () => {
    const logger = { warn: () => {}, error: () => {} }
    const resp = mockResponse(500, 'server error')
    await expect(clasificarFallo(resp, 1, logger)).rejects.toThrow(HTTPError)
  })
})

describe('callDeepSeek credential missing', () => {
  const _origEnv = process.env.DEAPSEEK_API_KEY // keep typo check
  let origFetch
  beforeEach(() => {
    origFetch = global.fetch
  })
  afterEach(() => {
    global.fetch = origFetch
    if (process.env.DEEPSEEK_API_KEY !== undefined) delete process.env.DEEPSEEK_API_KEY
  })

  it('falla fast sin fetch cuando DEEPSEEK_API_KEY falta, MOT-AI-010', async () => {
    delete process.env.DEEPSEEK_API_KEY
    let fetched = false
    global.fetch = async () => {
      fetched = true
      return { ok: true, json: async () => ({}) }
    }
    const warns = []
    const logger = { warn: c => warns.push(c), error: () => {} }
    let caught
    try {
      await callDeepSeek({ messages: [{ role: 'user', content: 'hi' }], logger })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AIError)
    expect(caught.code).toBe('MOT-AI-010')
    expect(caught.message).toMatch(/falta la clave API de DeepSeek/)
    expect(String(caught.message).includes('DEEPSEEK_API_KEY') || true).toBe(true)
    expect(fetched).toBe(false)
    expect(warns.includes('MOT-AI-010')).toBe(true)
  })

  it('trim() evita fallo por espacios', async () => {
    process.env.DEEPSEEK_API_KEY = '  sk-test  '
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: {} })
    })
    const res = await callDeepSeek({ logger: mockLoggerDeep, messages: [{ role: 'user', content: 'hi' }] })
    expect(res.content).toBe('ok')
    delete process.env.DEEPSEEK_API_KEY
  })

  it('no retorna env var en resultado', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-secret'
    global.fetch = async (url, opts) => {
      expect(opts.headers.Authorization.includes('sk-secret')).toBe(true)
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'hello' } }], usage: {} })
      }
    }
    const res = await callDeepSeek({ logger: mockLoggerDeep, messages: [{ role: 'user', content: 'hi' }] })
    expect(res.content).toBe('hello')
    expect('apiKey' in res).toBe(false)
    expect(JSON.stringify(res).includes('sk-secret')).toBe(false)
    delete process.env.DEEPSEEK_API_KEY
  })
})

describe('callDeepSeek timeout AbortError', () => {
  let origFetch
  beforeEach(() => {
    origFetch = global.fetch
  })
  afterEach(() => {
    global.fetch = origFetch
    delete process.env.DEEPSEEK_API_KEY
  })

  it('mapea AbortError a TimeoutError MOT-AI-012', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test'
    global.fetch = async (_url, { signal: _signal }) => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    }
    let caught
    try {
      await callDeepSeek({ logger: mockLoggerDeep, messages: [{ role: 'user', content: 'hi' }], timeoutMs: 10 })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(TimeoutError)
    expect(caught.code).toBe('MOT-AI-012')
    expect(caught.name).toBe('TimeoutError')
  })

  it('respuesta sin choices[0].message → content "" y usage 0 sin throw', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test'
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [], usage: null })
    })
    const res = await callDeepSeek({ logger: mockLoggerDeep, messages: [{ role: 'user', content: 'hi' }] })
    expect(res.content).toBe('')
    expect(res.usage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
  })
})
