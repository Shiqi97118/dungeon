import { configGm, type Gm } from '../src/game/session.js'

const PROVIDERS = [
  { prefix: 'xai-', baseUrl: 'https://api.x.ai/v1', model: 'grok-4.7' },
  { prefix: 'sk-or-', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
]
const OPENAI = { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }

/** Picks the endpoint and default model from the key's prefix unless they are configured, so xAI and OpenRouter keys work as-is. */
export function gmEndpoint(apiKey: string, baseUrl?: string, model?: string) {
  const byKey = PROVIDERS.find((p) => apiKey.startsWith(p.prefix))
  const base = baseUrl || byKey?.baseUrl || OPENAI.baseUrl
  const known = PROVIDERS.find((p) => p.baseUrl === base) ?? (base === OPENAI.baseUrl ? OPENAI : undefined)
  let m = model || known?.model || OPENAI.model
  if (base.includes('openrouter.ai') && !m.includes('/')) m = `openai/${m}`
  return { baseUrl: base, model: m }
}

export function serverGm(): Gm | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  return configGm({ enabled: true, apiKey, ...gmEndpoint(apiKey, process.env.GM_BASE_URL, process.env.GM_MODEL) })
}
