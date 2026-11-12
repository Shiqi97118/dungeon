import { CONFIG } from '../iselan/config'
import type { AiResponse, ModelCall } from '../iselan/ai'
import type { EndingCall } from '../iselan/play'
import type { AiConfig } from '../game/ai'

/**
 * The player's own OpenAI-compatible endpoint, called from this browser with their key. Its
 * responses have no server receipts, so a run hosted this way plays fully but unlocks nothing.
 */
export function customModels(cfg: AiConfig, saved: readonly AiResponse[] = []): { readonly turn: ModelCall; readonly ending: EndingCall } {
  let next = saved.reduce((m, r) => Math.max(m, r.seq), 0) + 1
  const ask = async (kind: 'turn' | 'ending', system: string, content: string): Promise<AiResponse> => {
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions'
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content }],
      temperature: 0.85,
      max_tokens: CONFIG.cost.maxOutputTokens[kind],
      response_format: { type: 'json_object' },
    }
    if (/api\.deepseek\.com/.test(url)) body.thinking = { type: kind === 'ending' ? 'enabled' : 'disabled' }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(kind === 'ending' ? 90_000 : 40_000),
    })
    if (!res.ok) throw new Error(`AI 接口返回 ${res.status}：${(await res.text()).slice(0, 160)}`)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] } | null
    return { seq: next++, text: data?.choices?.[0]?.message?.content ?? '' }
  }
  return {
    turn: ({ prefix, content }) => ask('turn', prefix, content),
    ending: ({ prefix, content }) => ask('ending', prefix, content),
  }
}
