import { describe, it, expect } from 'bun:test'
import {
  AIError,
  ContextExceededError,
  DeepSeekContextExceededError,
  TimeoutError,
  UnknownModelError,
  ProviderNotRegisteredError,
  HTTPError,
  StreamingNotSupportedError
} from '../../src/errors.js'

describe('errors hierarchy', () => {
  it('DeepSeekContextExceededError instanceof ContextExceededError', () => {
    const e = new DeepSeekContextExceededError()
    expect(e).toBeInstanceOf(ContextExceededError)
    expect(e).toBeInstanceOf(AIError)
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('DeepSeekContextExceededError')
    expect(e.code).toBe('MOT-AI-013')
    expect(e.provider).toBe('deepseek')
  })
  it('TimeoutError instanceof AIError code MOT-AI-012', () => {
    const e = new TimeoutError('timeout', { provider: 'deepseek' })
    expect(e).toBeInstanceOf(AIError)
    expect(e.code).toBe('MOT-AI-012')
    expect(e.name).toBe('TimeoutError')
  })
  it('UnknownModelError mensaje lista', () => {
    const e = new UnknownModelError('foo', ['a', 'b'])
    expect(e).toBeInstanceOf(AIError)
    expect(e.model).toBe('foo')
    expect(e.code).toBe('MOT-AI-016')
    expect(e.message).toContain('foo')
    expect(e.message).toContain('a, b')
  })
  it('ProviderNotRegisteredError', () => {
    const e = new ProviderNotRegisteredError('openai')
    expect(e.code).toBe('MOT-AI-017')
    expect(e.provider).toBe('openai')
  })
  it('HTTPError status/body', () => {
    const e = new HTTPError('err', { status: 500, body: 'oops', provider: 'deepseek' })
    expect(e.status).toBe(500)
    expect(e.body).toBe('oops')
    expect(e.code).toBe('MOT-AI-011')
  })
  it('StreamingNotSupportedError MOT-AI-018', () => {
    const e = new StreamingNotSupportedError('muse')
    expect(e.code).toBe('MOT-AI-018')
    expect(e.provider).toBe('muse')
  })
})
