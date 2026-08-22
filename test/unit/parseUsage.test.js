import { describe, it, expect } from 'bun:test'
import { parseUsage } from '../../src/providers/deepseek.js'

describe('parseUsage unit', () => {
  it('prompt_tokens/completion_tokens/total_tokens → camelCase', () => {
    const out = parseUsage({ prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 })
    expect(out).toEqual({ promptTokens: 5, completionTokens: 7, totalTokens: 12 })
  })
  it('ausente total_tokens suma', () => {
    expect(parseUsage({ prompt_tokens: 2, completion_tokens: 3 }).totalTokens).toBe(5)
  })
  it('campos ausentes → 0', () => {
    expect(parseUsage({})).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
    expect(parseUsage()).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
  })
})
