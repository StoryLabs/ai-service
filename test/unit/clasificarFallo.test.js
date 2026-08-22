import { describe, it, expect } from 'bun:test'
import { clasificarFallo, DeepSeekContextoExcedidoError } from '../../src/providers/deepseek.js'
import { HTTPError, ContextExceededError } from '../../src/errors.js'

function mock(status, body) {
  return { status, text: async () => body }
}

describe('clasificarFallo', () => {
  it('400 context → DeepSeekContextoExcedidoError', async () => {
    let caught
    try {
      await clasificarFallo(mock(400, 'context_length exceeded'), 3, { warn: () => {}, error: () => {} })
      throw new Error('should have thrown')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(DeepSeekContextoExcedidoError)
    expect(caught).toBeInstanceOf(ContextExceededError)
  })
  it('429 con intentos>1 → backoff y return', async () => {
    const r = await clasificarFallo(mock(429, 'rate'), 3, { warn: () => {}, error: () => {} })
    expect(r).toBe(2)
  })
  it('400 sin contexto → HTTPError', async () => {
    await expect(clasificarFallo(mock(400, 'bad key'), 3, { warn: () => {}, error: () => {} })).rejects.toThrow(HTTPError)
  })
  it('401 → HTTPError', async () => {
    await expect(clasificarFallo(mock(401, 'unauth'), 3, { warn: () => {}, error: () => {} })).rejects.toThrow(HTTPError)
  })
})
