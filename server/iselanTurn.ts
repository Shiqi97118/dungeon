import { CONFIG } from '../src/iselan/config.js'
import { FIXED_PREFIX } from '../src/iselan/ai/prefix.js'
import { responseHash } from '../src/iselan/profile/digest.js'
import { gmEndpoint } from './gm.js'
import { HttpError } from './http.js'
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

let override: IselanModel | null | undefined

/** Tests swap in a fake model; pass undefined to go back to the configured provider. */
export function setIselanModel(m: IselanModel | null | undefined) {
  override = m
}

function providerModel(): IselanModel | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  const { baseUrl, model } = gmEndpoint(apiKey, process.env.GM_BASE_URL, process.env.GM_MODEL)
  return async ({ system, content, maxTokens }) => {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content }],
      temperature: 0.85,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }
    if (/api\.deepseek\.com/.test(baseUrl)) body.thinking = { type: 'disabled' }
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(40_000),
    })
    if (!res.ok) throw new HttpError(502, `AI 接口返回 ${res.status}`)
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
    } | null
    const u = data?.usage
    return {
      text: data?.choices?.[0]?.message?.content ?? '',
      model,
      usage: u ? {
        promptTokens: u.prompt_tokens ?? 0,
        cachedTokens: u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0,
        completionTokens: u.completion_tokens ?? 0,
      } : null,
    }
  }
}

export function iselanModel(): IselanModel | null {
  return override === undefined ? providerModel() : override
}

const RUN_ID = /^[A-Za-z0-9_-]{8,64}$/
/** The round content is built to fit roundTokenBudget; this only stops abuse. */
const MAX_CONTENT_CHARS = CONFIG.ai.roundTokenBudget * 4

export interface TurnRequest {
  readonly runId: string
  readonly seq: number
  readonly content: string
}

export function cleanTurnRequest(body: Record<string, unknown>): TurnRequest {
  const { runId, seq, content } = body
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) throw new HttpError(400, 'runId 格式错误')
  if (!Number.isInteger(seq) || (seq as number) < 1 || (seq as number) > 100_000) throw new HttpError(400, 'seq 格式错误')
  if (typeof content !== 'string' || !content.trim() || content.length > MAX_CONTENT_CHARS) throw new HttpError(400, '本轮内容缺失或过长')
  return { runId, seq: seq as number, content }
}

/**
 * 12 §8.1 and §8.4: send one round to the model behind the fixed prefix and write a receipt of the
 * response, so an uploaded run can prove its AI text came from here. Each (run, seq) is answered once.
 */
export async function iselanTurn(model: IselanModel, receipts: ProfileStore, req: TurnRequest, now: number) {
  if (await receipts.receipt(req.runId, req.seq)) throw new HttpError(409, `第 ${req.seq} 条 AI 回应已经发出，请使用下一个序号`)
  const reply = await model({ system: FIXED_PREFIX, content: req.content, maxTokens: CONFIG.cost.maxOutputTokens.turn })
  if (!(await receipts.putReceipt(req.runId, req.seq, await responseHash(reply.text), now))) {
    throw new HttpError(409, `第 ${req.seq} 条 AI 回应已经发出，请使用下一个序号`)
  }
  return { seq: req.seq, text: reply.text, reply }
}
