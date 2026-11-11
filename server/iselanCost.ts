// ENG-06 stage 1 — pure cost arithmetic for the AI host (no D1, no HTTP, no API keys).
// Spec: docs/story/12-开工规格.md §9 (price table, Beijing peak hours, 28 元 hard cap).
// Money is an integer count of nano-yuan (1e-9 元) so repeated addition never drifts.

import { CONFIG } from '../src/iselan/config.js'
import type { ModelUsage } from './iselanTurn.js'

/** Money unit. Every number named `...Nano` in this module is an integer count of these. */
export const NANO_YUAN = 1_000_000_000

/** Largest value we accept; keeps all products inside Number.MAX_SAFE_INTEGER. */
const MAX_SAFE = Number.MAX_SAFE_INTEGER

export type CostErrorCode = 'unknown-model' | 'bad-price' | 'bad-usage' | 'bad-time' | 'overflow'

export class CostError extends Error {
  constructor(readonly code: CostErrorCode, message: string) {
    super(message)
    this.name = 'CostError'
  }
}

export type ModelId = keyof typeof CONFIG.cost.prices

export interface PriceNanoPerToken {
  /** 元 per million tokens × 1000, i.e. nano-yuan charged for one token. */
  readonly cacheHit: number
  readonly cacheMiss: number
  readonly output: number
}

export interface Admission {
  readonly allowed: boolean
  /** Hard cap from CONFIG (28 元), in nano-yuan. */
  readonly capNano: number
  /** spent + in-flight + this estimate. */
  readonly totalNano: number
  /** cap − total; negative when rejected, so callers can log the overrun. */
  readonly remainingNano: number
}

/** 元 per million tokens → nano-yuan per token, refusing prices finer than 0.01 元. */
function perToken(price: number, label: string): number {
  const centi = Math.round(price * 100)
  if (!Number.isFinite(price) || price < 0 || Math.abs(centi / 100 - price) > 1e-9) {
    throw new CostError('bad-price', `价格必须是不超过两位小数的非负数：${label}=${price}`)
  }
  return centi * 10
}

function componentNano(model: string, band: 'peak' | 'idle', key: 'cacheHit' | 'cacheMiss' | 'output'): number {
  const table = CONFIG.cost.prices as Record<string, Record<string, Record<string, number>>>
  const row = table[model]
  if (!row) throw new CostError('unknown-model', `价格表里没有模型 ${JSON.stringify(model)}；不给未定价模型任何额度保证`)
  const value = row[band]?.[key]
  if (typeof value !== 'number') throw new CostError('bad-price', `模型 ${model} 的 ${band}.${key} 价格缺失`)
  return perToken(value, `${model}.${band}.${key}`)
}

/** Beijing wall-clock parts of `at`, independent of the host time zone. */
function beijingClock(at: Date): { weekday: number; minutes: number } {
  if (Number.isNaN(at.getTime())) throw new CostError('bad-time', '时间无效')
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CONFIG.cost.timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  if (weekday < 0) throw new CostError('bad-time', '无法读取北京时间的星期')
  return { weekday, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

/** 12 §9.1: Beijing weekday 9:00–12:00 and 14:00–18:00 are billed at peak; everything else at half. */
export function isPeak(at: Date): boolean {
  const { weekday, minutes } = beijingClock(at)
  if (weekday === 0 || weekday === 6) return false
  return CONFIG.cost.peakHours.some(([start, end]) => minutes >= start * 60 && minutes < end * 60)
}

export function priceAt(model: string, at: Date): PriceNanoPerToken {
  const band = isPeak(at) ? 'peak' : 'idle'
  return {
    cacheHit: componentNano(model, band, 'cacheHit'),
    cacheMiss: componentNano(model, band, 'cacheMiss'),
    output: componentNano(model, band, 'output'),
  }
}

function tokenCount(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new CostError('bad-usage', `${label} 必须是非负整数用法用量：${String(value)}`)
  }
  return value
}

/** Validates provider-reported usage; anomalies are rejected, never billed as zero. */
export function assertUsage(usage: ModelUsage): ModelUsage {
  const prompt = tokenCount(usage.promptTokens, 'promptTokens')
  const cached = tokenCount(usage.cachedTokens, 'cachedTokens')
  const completion = tokenCount(usage.completionTokens, 'completionTokens')
  if (cached > prompt) {
    throw new CostError('bad-usage', `缓存命中 token 大于输入：cached=${cached} > prompt=${prompt}`)
  }
  return { promptTokens: prompt, cachedTokens: cached, completionTokens: completion }
}

/** Actual cost of one call, from the usage the provider reported. */
export function costNano(model: string, usage: ModelUsage, at: Date): number {
  const priced = priceAt(model, at)
  const { promptTokens, cachedTokens, completionTokens } = assertUsage(usage)
  const miss = promptTokens - cachedTokens
  const total = miss * priced.cacheMiss + cachedTokens * priced.cacheHit + completionTokens * priced.output
  if (!Number.isSafeInteger(total) || total > MAX_SAFE) throw new CostError('overflow', '费用超出安全整数范围')
  return total
}

/** 12 §9.2: pre-call estimate. Every prompt token is charged at the cache-miss price. */
export function estimateNano(model: string, kind: 'turn' | 'ending', at: Date): number {
  const worst = CONFIG.cost.worstCase[kind]
  return costNano(model, { promptTokens: worst.inputTokens, cachedTokens: 0, completionTokens: worst.outputTokens }, at)
}

/**
 * 12 §9.3: allow the call only when spent + in-flight + this estimate stays within the
 * hard cap; exactly at the cap is still allowed, one nano above is not.
 */
export function admit(params: {
  readonly spentNano: number
  readonly reservedNano?: number
  readonly estimateNano: number
}): Admission {
  const capNano = CONFIG.cost.hardCapYuan * NANO_YUAN
  if (!Number.isSafeInteger(capNano)) throw new CostError('bad-price', '硬上限不是整数纳元')
  const spent = tokenCount(params.spentNano, 'spentNano')
  const reserved = tokenCount(params.reservedNano ?? 0, 'reservedNano')
  const estimate = tokenCount(params.estimateNano, 'estimateNano')
  const totalNano = spent + reserved + estimate
  if (!Number.isSafeInteger(totalNano)) throw new CostError('overflow', '费用合计超出安全整数范围')
  return { allowed: totalNano <= capNano, capNano, totalNano, remainingNano: capNano - totalNano }
}
