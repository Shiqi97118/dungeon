import { CONFIG } from '../iselan/config'
import type { AiResponse, ModelCall } from '../iselan/ai'
import type { EndingCall } from '../iselan/play'

export interface AiConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
}

const KEY = 'echo-well-ai'

export const AI_PRESETS = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
]

const defaultConfig = (): AiConfig => ({ enabled: false, baseUrl: AI_PRESETS[0].baseUrl, apiKey: '', model: AI_PRESETS[0].model })

/** Kept only in this browser; the key never goes to the app's server. */
export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...defaultConfig(), ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return defaultConfig()
}

export const saveAiConfig = (c: AiConfig) => localStorage.setItem(KEY, JSON.stringify(c))

export const aiReady = (c: AiConfig) => c.enabled && !!c.apiKey && !!c.baseUrl && !!c.model

async function chat(cfg: AiConfig, system: string, content: string, maxTokens: number, thinking: boolean, timeoutMs: number, json = true): Promise<string> {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content }],
    temperature: 0.85,
    max_tokens: maxTokens,
  }
  if (json) body.response_format = { type: 'json_object' }
  if (/api\.x\.ai/.test(url)) {
    // Grok reasons before answering; reasoning tokens count against max_tokens and the default effort is too slow.
    delete body.max_tokens
    body.reasoning_effort = 'low'
  }
  if (/api\.deepseek\.com/.test(url)) body.thinking = { type: thinking ? 'enabled' : 'disabled' }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const t = await res.text()
    if (json && res.status === 400 && /response_format|json/i.test(t)) return chat(cfg, system, content, maxTokens, thinking, timeoutMs, false)
    throw new Error(`AI 接口返回 ${res.status}：${t.slice(0, 160)}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] } | null
  return data?.choices?.[0]?.message?.content ?? ''
}

/** One short call to check the endpoint, key and model before saving them. */
export async function aiTest(cfg: AiConfig): Promise<string> {
  const raw = await chat(cfg, '你是一位文字冒险的主持人。', '用一句不超过二十字的中文描述一座雨夜的港城。只输出 JSON：{"line":"…"}', 200, false, 20_000)
  try { return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}').line ?? raw } catch { return raw }
}

/**
 * The player's own OpenAI-compatible endpoint, called from this browser with their key. Its
 * responses have no server receipts, so a run hosted this way plays fully but unlocks nothing.
 */
export function customModels(cfg: AiConfig, saved: readonly AiResponse[] = []): { readonly turn: ModelCall; readonly ending: EndingCall } {
  let next = saved.reduce((m, r) => Math.max(m, r.seq), 0) + 1
  const ask = async (kind: 'turn' | 'ending', system: string, content: string): Promise<AiResponse> => {
    const text = await chat(cfg, system, content, CONFIG.cost.maxOutputTokens[kind], kind === 'ending', kind === 'ending' ? 90_000 : 40_000)
    return { seq: next++, text }
  }
  return {
    turn: ({ prefix, content }) => ask('turn', prefix, content),
    ending: ({ prefix, content }) => ask('ending', prefix, content),
  }
}
