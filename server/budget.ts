// ENG-06 stage 2 — the 12 §9.3 spending ledger in D1, and the guard every AI call goes through.
// One ledger per stage and Beijing date; the 28 元 cap is site-wide, not per model.

import { CONFIG } from '../src/iselan/config.js'
import { HttpError } from './http.js'
import { CostError, NANO_YUAN, costNano, estimateNano } from './iselanCost.js'
import type { ModelUsage } from './iselanTurn.js'
import type { SqlDatabase } from './profileStore.js'

export type CallKind = 'turn' | 'ending'

export interface BudgetStore {
  /**
   * Holds `nano` against `bucket` in one atomic step, only if everything already held or spent in
   * that bucket plus `nano` stays within `capNano`. False means the call must not be made.
   */
  reserve(bucket: string, id: string, kind: CallKind, nano: number, capNano: number, t: number): Promise<boolean>
  /** Replaces a held amount with the billed cost. Rows that are not `held` are left alone. */
  settle(id: string, nano: number, t: number): Promise<void>
  /** Drops a hold; only for calls the provider certainly did not bill. */
  release(id: string): Promise<void>
  /** The outcome is unknown: the hold stays at its estimate for the rest of the day. */
  markUnknown(id: string, t: number): Promise<void>
  /** Everything counted against `bucket`: settled costs plus holds (in flight or unknown). */
  total(bucket: string): Promise<number>
  /** Counts one call for `key`; false once `limit` is passed. */
  count(bucket: string, key: string, limit: number): Promise<boolean>
}

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.cost.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })

/** The Beijing calendar date of `t`, e.g. `2026-11-12`; the ledger and the call counts turn over at Beijing midnight. */
export const beijingDay = (t: number) => DAY.format(new Date(t))

export const bucketOf = (stage: string, t: number) => `${stage}|${beijingDay(t)}`

const CAP_NANO = CONFIG.cost.hardCapYuan * NANO_YUAN
const RETAIN_MS = 40 * 86_400_000

export class MemoryBudgetStore implements BudgetStore {
  private rows = new Map<string, { bucket: string; state: 'held' | 'settled' | 'unknown'; nano: number }>()
  private counts = new Map<string, number>()

  // No await between the check and the write, so concurrent requests cannot both pass the check.
  async reserve(bucket: string, id: string, _kind: CallKind, nano: number, capNano: number, _t?: number) {
    if (this.rows.has(id) || this.sum(bucket) + nano > capNano) return false
    this.rows.set(id, { bucket, state: 'held', nano })
    return true
  }
  async settle(id: string, nano: number) {
    const r = this.rows.get(id)
    if (r?.state === 'held') this.rows.set(id, { ...r, state: 'settled', nano })
  }
  async release(id: string) {
    if (this.rows.get(id)?.state === 'held') this.rows.delete(id)
  }
  async markUnknown(id: string) {
    const r = this.rows.get(id)
    if (r?.state === 'held') this.rows.set(id, { ...r, state: 'unknown' })
  }
  private sum(bucket: string) {
    let n = 0
    for (const r of this.rows.values()) if (r.bucket === bucket) n += r.nano
    return n
  }
  async total(bucket: string) {
    return this.sum(bucket)
  }
  async count(bucket: string, key: string, limit: number) {
    const k = `${bucket}|${key}`
    const n = (this.counts.get(k) ?? 0) + 1
    this.counts.set(k, n)
    return n <= limit
  }
}

const SCHEMA = [
  `create table if not exists ai_spend (
    id text primary key, bucket text not null, kind text not null, state text not null,
    nano integer not null, created_at integer not null, updated_at integer not null
  )`,
  'create index if not exists ai_spend_bucket_idx on ai_spend (bucket)',
  'create index if not exists ai_spend_created_idx on ai_spend (created_at)',
  `create table if not exists ai_calls (
    bucket text not null, call_key text not null, count integer not null default 0,
    primary key (bucket, call_key)
  )`,
]

/** D1 runs each statement on its own, one at a time, so the check-and-insert in `reserve` cannot interleave with another request's. */
export class SqlBudgetStore implements BudgetStore {
  private ready: Promise<void> | null = null

  constructor(private db: SqlDatabase) {}

  private async q(sql: string, ...values: unknown[]) {
    this.ready ??= this.db.batch(SCHEMA.map((s) => this.db.prepare(s))).then(() => undefined).catch((e) => { this.ready = null; throw e })
    await this.ready
    return this.db.prepare(sql).bind(...values)
  }

  async reserve(bucket: string, id: string, kind: CallKind, nano: number, capNano: number, t: number) {
    await (await this.q('delete from ai_spend where created_at < ?1', t - RETAIN_MS)).run()
    const r = await (await this.q(
      `insert into ai_spend (id, bucket, kind, state, nano, created_at, updated_at)
       select ?1, ?2, ?3, 'held', ?4, ?6, ?6
       where (select coalesce(sum(nano), 0) from ai_spend where bucket = ?2) + ?4 <= ?5
       on conflict (id) do nothing`,
      id, bucket, kind, nano, capNano, t,
    )).run()
    return r.meta.changes > 0
  }
  async settle(id: string, nano: number, t: number) {
    await (await this.q(`update ai_spend set state = 'settled', nano = ?2, updated_at = ?3 where id = ?1 and state = 'held'`, id, nano, t)).run()
  }
  async release(id: string) {
    await (await this.q(`delete from ai_spend where id = ?1 and state = 'held'`, id)).run()
  }
  async markUnknown(id: string, t: number) {
    await (await this.q(`update ai_spend set state = 'unknown', updated_at = ?2 where id = ?1 and state = 'held'`, id, t)).run()
  }
  async total(bucket: string) {
    const r = await (await this.q('select coalesce(sum(nano), 0) as n from ai_spend where bucket = ?1', bucket)).first<{ n: number }>()
    return Number(r?.n ?? 0)
  }
  async count(bucket: string, key: string, limit: number) {
    const r = await (await this.q(
      `insert into ai_calls (bucket, call_key, count) values (?1, ?2, 1)
       on conflict (bucket, call_key) do update set count = count + 1
       returning count`,
      bucket, key,
    )).first<{ count: number }>()
    return Number(r?.count ?? Infinity) <= limit
  }
}

/** The provider answered with an error status: it did not bill the call, so the hold can go. */
export class ProviderRefused extends HttpError {}

export const BUDGET_OUT = '今天的 AI 主持额度已用完，已切换为离线规则主持'
export const CALLS_OUT = '今天的 AI 主持次数已用完，已切换为离线规则主持'

export interface GuardInput {
  readonly stage: string
  readonly kind: CallKind
  /** The model id the call is billed as; must be in `CONFIG.cost.prices`. */
  readonly model: string
  readonly now: number
  /** Per-caller counts for 12 §9.3 次数上限 (the global one is added here). */
  readonly counts: readonly { readonly key: string; readonly limit: number }[]
}

/**
 * 12 §9.3: count the call, hold its worst-case cost, make it, then book what it really cost.
 * `call` returns the provider's usage, or null when the provider did not report any.
 */
export async function guarded<T>(budget: BudgetStore, input: GuardInput, call: () => Promise<{ readonly value: T; readonly usage: ModelUsage | null }>): Promise<T> {
  const bucket = bucketOf(input.stage, input.now)
  const limits = CONFIG.cost.dailyLimits
  const global = input.kind === 'ending' ? { key: 'ending', limit: limits.endingGlobal } : { key: 'global', limit: limits.global }
  for (const c of [global, ...input.counts]) {
    if (!(await budget.count(bucket, c.key, c.limit))) throw new HttpError(429, CALLS_OUT)
  }

  let estimate: number
  try {
    estimate = estimateNano(input.model, input.kind, new Date(input.now))
  } catch (e) {
    if (e instanceof CostError) throw new HttpError(503, `当前 AI 模型不在价格表里，AI 主持暂停（${e.message}）`)
    throw e
  }
  const id = crypto.randomUUID()
  if (!(await budget.reserve(bucket, id, input.kind, estimate, CAP_NANO, input.now))) throw new HttpError(429, BUDGET_OUT)

  let out: Awaited<ReturnType<typeof call>>
  try {
    out = await call()
  } catch (e) {
    if (e instanceof ProviderRefused) await budget.release(id)
    else await budget.markUnknown(id, Date.now())
    throw e
  }
  let actual: number | null = null
  if (out.usage) {
    try {
      actual = costNano(input.model, out.usage, new Date(input.now))
    } catch (e) {
      if (!(e instanceof CostError)) throw e
    }
  }
  // Missing or malformed usage is never booked as zero: the estimate stands.
  if (actual === null) await budget.markUnknown(id, Date.now())
  else await budget.settle(id, actual, Date.now())
  return out.value
}
