import { CONFIG } from '../src/iselan/config.js'
import { FIXED_PREFIX } from '../src/iselan/ai/prefix.js'
import { ENDING_PREFIX } from '../src/iselan/ai/ending.js'
import { responseHash } from '../src/iselan/profile/digest.js'
import { gmEndpoint } from './provider.js'
import { HttpError } from './http.js'
import { ProviderRefused, type CallKind } from './budget.js'
import type { ProfileStore } from './profileStore.js'

export interface ModelUsage {
  readonly promptTokens: number
  /** Prompt tokens served from the provider's prefix cache, billed at the cache-hit price. */
  readonly cachedTokens: number
  readonly completionTokens: number
}

export interface ModelReply {
  readonly text: string
  readonly model: string
  readonly usage: ModelUsage | null
}

export type IselanModel = (req: { readonly system: string; readonly content: string; readonly maxTokens: number }) => Promise<ModelReply>

let override: { readonly model: IselanModel | null; readonly id: string } | undefined

/** Tests swap in a fake model, billed as `id`; pass undefined to go back to the configured provider. */
export function setIselanModel(m: IselanModel | null | undefined, id = 'deepseek-flash') {
  override = m === undefined ? undefined : { model: m, id }
}

/** 12 §9.3: the ending uses `GM_ENDING_MODEL` when set, otherwise the everyday model. */
function endpoint(kind: CallKind) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  const daily = gmEndpoint(apiKey, process.env.GM_BASE_URL, process.env.GM_MODEL)
  const ending = process.env.GM_ENDING_MODEL?.trim()
  return { apiKey, baseUrl: daily.baseUrl, model: kind === 'ending' && ending ? ending : daily.model }
}

/** The model id a call of `kind` is priced as; null when no model is configured. */
export function iselanModelId(kind: CallKind = 'turn'): string | null {
  if (override !== undefined) return override.model ? override.id : null
  return endpoint(kind)?.model ?? null
}

const REFUSED = new Set([400, 401, 402, 403, 404, 422, 429])

const count = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null)

/** Reported usage, or null when any part is missing or implausible; null keeps the estimate booked. */
export function usageOf(u: { prompt_tokens?: unknown; completion_tokens?: unknown; prompt_cache_hit_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown } } | undefined): ModelUsage | null {
  if (!u) return null
  const promptTokens = count(u.prompt_tokens)
  const completionTokens = count(u.completion_tokens)
  const rawCached = u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens
  const cachedTokens = rawCached === undefined ? 0 : count(rawCached)
  if (!promptTokens || completionTokens === null || cachedTokens === null || cachedTokens > promptTokens) return null
  return { promptTokens, cachedTokens, completionTokens }
}

function providerModel(kind: CallKind): IselanModel | null {
  const ep = endpoint(kind)
  if (!ep) return null
  const { apiKey, baseUrl, model } = ep
  return async ({ system, content, maxTokens }) => {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content }],
      temperature: 0.85,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }
    if (/api\.deepseek\.com/.test(baseUrl)) body.thinking = { type: kind === 'ending' ? 'enabled' : 'disabled' }
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(40_000),
    })
    // Only a 4xx means the provider turned the request away unprocessed; a 5xx may still be billed.
    if (!res.ok) throw new (REFUSED.has(res.status) ? ProviderRefused : HttpError)(502, `AI 接口返回 ${res.status}`)
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
    } | null
    const u = data?.usage
    return {
      text: data?.choices?.[0]?.message?.content ?? '',
      model,
      usage: usageOf(u),
    }
  }
}

export function iselanModel(kind: CallKind = 'turn'): IselanModel | null {
  return override === undefined ? providerModel(kind) : override.model
}

const RUN_ID = /^[A-Za-z0-9_-]{8,64}$/
/** The content is built to fit its token budget; this only stops abuse. */
const MAX_CONTENT_CHARS: Readonly<Record<CallKind, number>> = { turn: CONFIG.ai.roundTokenBudget * 4, ending: CONFIG.cost.worstCase.ending.inputTokens * 4 }
const PREFIX: Readonly<Record<CallKind, string>> = { turn: FIXED_PREFIX, ending: ENDING_PREFIX }

export interface TurnRequest {
  readonly runId: string
  readonly seq: number
  readonly content: string
}

export function cleanTurnRequest(body: Record<string, unknown>, kind: CallKind = 'turn'): TurnRequest {
  const { runId, seq, content } = body
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) throw new HttpError(400, 'runId 格式错误')
  if (!Number.isInteger(seq) || (seq as number) < 1 || (seq as number) > 100_000) throw new HttpError(400, 'seq 格式错误')
  if (typeof content !== 'string' || !content.trim() || content.length > MAX_CONTENT_CHARS[kind]) throw new HttpError(400, '本轮内容缺失或过长')
  return { runId, seq: seq as number, content }
}

/**
 * 12 §8.1 and §8.4: send one round (or the ending) to the model behind its fixed prefix and write a
 * receipt of the response, so an uploaded run can prove its AI text came from here. Each (run, seq) is answered once.
 */
export async function iselanTurn(model: IselanModel, receipts: ProfileStore, req: TurnRequest, now: number, kind: CallKind = 'turn') {
  if (await receipts.receipt(req.runId, req.seq)) throw new HttpError(409, `第 ${req.seq} 条 AI 回应已经发出，请使用下一个序号`)
  const reply = await model({ system: PREFIX[kind], content: req.content, maxTokens: CONFIG.cost.maxOutputTokens[kind] })
  if (!(await receipts.putReceipt(req.runId, req.seq, await responseHash(reply.text), now))) {
    throw new HttpError(409, `第 ${req.seq} 条 AI 回应已经发出，请使用下一个序号`)
  }
  return { seq: req.seq, text: reply.text, reply }
}
