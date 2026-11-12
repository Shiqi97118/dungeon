import { describe, expect, it } from 'vitest'
import { gmEndpoint } from './provider.js'

const DEEPSEEK = 'https://api.deepseek.com'

describe('gmEndpoint', () => {
  it('sends unprefixed keys to the configured provider', () => {
    expect(gmEndpoint('sk-0123456789abcdef0123456789abcdef', DEEPSEEK, 'deepseek-flash')).toEqual({ baseUrl: DEEPSEEK, model: 'deepseek-flash' })
    expect(gmEndpoint('sk-0123456789abcdef', `${DEEPSEEK}/`)).toEqual({ baseUrl: DEEPSEEK, model: 'deepseek-flash' })
    expect(gmEndpoint('sk-abc')).toEqual({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' })
  })

  it('recognises xAI, OpenRouter and OpenAI project keys regardless of the configured provider', () => {
    expect(gmEndpoint('xai-abc', DEEPSEEK, 'deepseek-flash')).toEqual({ baseUrl: 'https://api.x.ai/v1', model: 'grok-4.7' })
    expect(gmEndpoint('sk-or-v1-abc', DEEPSEEK, 'deepseek-flash')).toEqual({ baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' })
    expect(gmEndpoint('sk-proj-abc', DEEPSEEK, 'deepseek-flash')).toEqual({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' })
  })

  it('prefixes the vendor when OpenRouter is configured explicitly', () => {
    expect(gmEndpoint('abc', 'https://openrouter.ai/api/v1', 'gpt-4o').model).toBe('openai/gpt-4o')
  })
})
