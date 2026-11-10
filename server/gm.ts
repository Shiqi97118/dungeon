import { configGm, type Gm } from '../src/game/session.js'

export function serverGm(): Gm | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return configGm({
    enabled: true,
    apiKey,
    baseUrl: process.env.GM_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.GM_MODEL || 'gpt-4o-mini',
  })
}
