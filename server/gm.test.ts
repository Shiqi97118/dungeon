import { describe, expect, it } from 'vitest'
import { gmEndpoint } from './gm.js'

describe('gmEndpoint', () => {
  it('uses OpenAI for OpenAI keys', () => {
    expect(gmEndpoint('sk-proj-abc', '', 'gpt-4o-mini')).toEqual({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' })
  })

  it('switches to OpenRouter for OpenRouter keys and prefixes the model vendor', () => {
    expect(gmEndpoint('sk-or-v1-abc', undefined, 'gpt-4o-mini')).toEqual({ baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' })
    expect(gmEndpoint('sk-or-v1-abc', undefined, 'anthropic/claude-3.5-haiku').model).toBe('anthropic/claude-3.5-haiku')
  })

  it('respects an explicit base URL', () => {
    expect(gmEndpoint('sk-or-v1-abc', 'https://api.deepseek.com/v1', 'deepseek-chat')).toEqual({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' })
  })
})
