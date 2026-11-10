import { configGm, type Gm } from '../src/game/session.js'

const OPENROUTER = 'https://openrouter.ai/api/v1'

/** Picks the endpoint from the key when none is configured, so an OpenRouter key works as-is. */
export function gmEndpoint(apiKey: string, baseUrl?: string, model?: string) {
  const base = baseUrl || (apiKey.startsWith('sk-or-') ? OPENROUTER : 'https://api.openai.com/v1')
  const m = model || 'gpt-4o-mini'
  return { baseUrl: base, model: base.includes('openrouter.ai') && !m.includes('/') ? `openai/${m}` : m }
}

export function serverGm(): Gm | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  return configGm({ enabled: true, apiKey, ...gmEndpoint(apiKey, process.env.GM_BASE_URL, process.env.GM_MODEL) })
}
