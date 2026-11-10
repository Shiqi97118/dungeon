import { configGm, type Gm } from '../src/game/session.js'

const PROVIDERS = [
  { prefix: 'xai-', baseUrl: 'https://api.x.ai/v1', model: 'grok-4.7' },
  { prefix: 'sk-or-', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  { prefix: 'sk-proj-', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
]
const DEFAULTS: Record<string, string> = {
  'https://api.deepseek.com': 'deepseek-flash',
  'https://api.openai.com/v1': 'gpt-4o-mini',
}

/**
 * Keys with a recognisable prefix (xAI, OpenRouter, OpenAI project keys) go to their own provider.
 * Any other key, such as a DeepSeek or Qwen key, goes to GM_BASE_URL / GM_MODEL.
 */
export function gmEndpoint(apiKey: string, baseUrl?: string, model?: string) {
  const byKey = PROVIDERS.find((p) => apiKey.startsWith(p.prefix))
  if (byKey) return { baseUrl: byKey.baseUrl, model: byKey.model }
  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
  let m = model || DEFAULTS[base] || 'gpt-4o-mini'
  if (base.includes('openrouter.ai') && !m.includes('/')) m = `openai/${m}`
  return { baseUrl: base, model: m }
}

export function serverGm(): Gm | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  return configGm({ enabled: true, apiKey, ...gmEndpoint(apiKey, process.env.GM_BASE_URL, process.env.GM_MODEL) })
}
