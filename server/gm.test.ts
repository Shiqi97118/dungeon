import { describe, expect, it } from 'vitest'
import { gmEndpoint } from './gm.js'

describe('gmEndpoint', () => {
  it('uses OpenAI for OpenAI keys', () => {
    expect(gmEndpoint('sk-proj-abc')).toEqual({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' })
  })

  it('uses xAI and Grok for xAI keys', () => {
    expect(gmEndpoint('xai-abc')).toEqual({ baseUrl: 'https://api.x.ai/v1', model: 'grok-4.7' })
    expect(gmEndpoint('xai-abc', undefined, 'grok-4.5').model).toBe('grok-4.5')
  })

  it('switches to OpenRouter for OpenRouter keys and prefixes the model vendor', () => {
    expect(gmEndpoint('sk-or-v1-abc')).toEqual({ baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' })
    expect(gmEndpoint('sk-or-v1-abc', undefined, 'gpt-4o')).toEqual({ baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o' })
    expect(gmEndpoint('sk-or-v1-abc', undefined, 'anthropic/claude-3.5-haiku').model).toBe('anthropic/claude-3.5-haiku')
  })

  it('respects an explicit base URL', () => {
    expect(gmEndpoint('sk-or-v1-abc', 'https://api.deepseek.com/v1', 'deepseek-chat')).toEqual({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' })
  })
})
