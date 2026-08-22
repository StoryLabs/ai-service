import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { callAI, MODELS } from '../../src/index.js'
import { AIError } from '../../src/errors.js'
const mockLogger = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} }

describe('credential isolation', () => {
  let origFetch
  beforeEach(() => {
    origFetch = global.fetch
  })
  afterEach(() => {
    global.fetch = origFetch
    delete process.env.DEEPSEEK_API_KEY
  })

  it('sin DEEPSEEK_API_KEY → MOT-AI-010 sin fetch', async () => {
    delete process.env.DEEPSEEK_API_KEY
    let fetched = false
    global.fetch = async () => {
      fetched = true
      return { ok: true, json: async () => ({}) }
    }
    let caught
    try {
      await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: MODELS.FLASH })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AIError)
    expect(caught.code).toBe('MOT-AI-010')
    expect(fetched).toBe(false)
  })

  it('con espacios trim pasa', async () => {
    process.env.DEEPSEEK_API_KEY = '  secret  '
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: {} }) })
    const r = await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: MODELS.FLASH })
    expect(r.content).toBe('ok')
  })

  it('key nunca en retorno ni error', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-never-leak'
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'hi' } }], usage: {} }) })
    const r = await callAI({ logger: mockLogger, messages: [{ role: 'user', content: 'hi' }], model: MODELS.FLASH })
    expect(JSON.stringify(r).includes('sk-never-leak')).toBe(false)
  })
})
