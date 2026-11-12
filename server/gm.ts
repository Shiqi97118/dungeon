import { configGm, type Gm } from '../src/game/session.js'
import type { GameState } from '../src/game/types.js'
import { promptTokens } from '../src/game/ai.js'
import { CONFIG } from '../src/iselan/config.js'
import { guarded, type BudgetStore, type CallKind } from './budget.js'
import { HttpError } from './http.js'

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

export const legacyModel = () => gmEndpoint(process.env.OPENAI_API_KEY?.trim() ?? '', process.env.GM_BASE_URL, process.env.GM_MODEL).model

/** Prompts above this are refused rather than billed past the estimate the cap assumes. */
const MAX_PROMPT = { turn: CONFIG.cost.worstCase.turn.inputTokens * 2, ending: CONFIG.cost.worstCase.ending.inputTokens * 2 }

/**
 * The legacy host behind the shared 28 元 cap and daily counts. It reports no usage, so each
 * call stays booked at its estimate, sized from the actual prompt.
 */
export function meteredGm(gm: Gm, budget: BudgetStore, stage: string, counts: readonly { key: string; limit: number }[] = []): Gm {
  const run = async <T,>(kind: CallKind, s: GameState, extra: string, call: () => Promise<T>) => {
    const inputTokens = promptTokens(s, extra)
    if (inputTokens > MAX_PROMPT[kind]) throw new HttpError(413, '存档内容过长，AI 主持人无法处理')
    return guarded(budget, { stage, kind, model: legacyModel(), now: Date.now(), counts, inputTokens }, async () => ({ value: await call(), usage: null }))
  }
  return {
    propose: (s, text, actorName) => run('turn', s, `${actorName ?? ''}${text}`, () => gm.propose(s, text, actorName)),
    resolve: (s, text, r) => run('turn', s, `${text}${r.actorName}${r.risk}`, () => gm.resolve(s, text, r)),
    ending: (s, plan, tier) => run('ending', s, plan, () => gm.ending(s, plan, tier)),
  }
}
