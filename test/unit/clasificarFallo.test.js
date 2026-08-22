import { describe, it, expect } from 'bun:test'
import { classifyFailure, DeepSeekContextExceededError } from '../../src/providers/deepseek.js'
import { HTTPError, ContextExceededError } from '../../src/errors.js'

function mock(status, body) {
  return { status, text: async () => body }
}

describe('classifyFailure', () => {
  it('400 context → DeepSeekContextExceededError', async () => {
    let caught
    try {
      await classifyFailure(mock(400, 'context_length exceeded'), 3, { warn: () => {}, error: () => {} })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(DeepSeekContextExceededError)
    expect(caught).toBeInstanceOf(ContextExceededError)
  })
  it('429 con retries>1 → backoff y return', async () => {
    const r = await classifyFailure(mock(429, 'rate'), 3, { warn: () => {}, error: () => {} })
    expect(r).toBe(2)
  })
  it('400 sin contexto → HTTPError', async () => {
    await expect(classifyFailure(mock(400, 'bad key'), 3, { warn: () => {}, error: () => {} })).rejects.toThrow(HTTPError)
  })
  it('401 → HTTPError', async () => {
    await expect(classifyFailure(mock(401, 'unauth'), 3, { warn: () => {}, error: () => {} })).rejects.toThrow(HTTPError)
  })
})
