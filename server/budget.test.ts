import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CONFIG } from '../src/iselan/config.js'
import { BUDGET_OUT, CALLS_OUT, MemoryBudgetStore, ProviderRefused, SqlBudgetStore, beijingDay, bucketOf, guarded, type BudgetStore, type GuardInput } from './budget.js'
import { handleGm } from './gmProxy.js'
import { HttpError } from './http.js'
import { NANO_YUAN, costNano, estimateNano } from './iselanCost.js'
import { iselanModelId, setIselanModel, type IselanModel } from './iselanTurn.js'
import { anonymousViewer, setPlatform } from './platform.js'
import { MemoryProfileStore } from './profileStore.js'
import { sqliteD1 } from './sqliteD1.js'
import { MemoryStore } from './store.js'

const CAP = CONFIG.cost.hardCapYuan * NANO_YUAN
// 2026-11-12 is a Thursday. 02:00Z = Beijing 10:00 (peak); 13:00Z = Beijing 21:00 (idle).
const PEAK = Date.parse('2026-11-12T02:00:00Z')
const IDLE = Date.parse('2026-11-12T13:00:00Z')
const usage = { promptTokens: 3000, cachedTokens: 1500, completionTokens: 800 }
const input = (over: Partial<GuardInput> = {}): GuardInput => ({ stage: 'production', kind: 'turn', model: 'deepseek-flash', now: PEAK, counts: [], ...over })

function suite(name: string, make: () => BudgetStore) {
  describe(`费用账（${name}）`, () => {
    let b: BudgetStore
    beforeEach(() => { b = make() })

    it('reserve is all-or-nothing at the cap: exactly the cap fits, one nano more does not', async () => {
      const bucket = bucketOf('production', PEAK)
      expect(await b.reserve(bucket, 'a', 'turn', CAP - 10, CAP, PEAK)).toBe(true)
      expect(await b.reserve(bucket, 'b', 'turn', 11, CAP, PEAK)).toBe(false)
      expect(await b.reserve(bucket, 'c', 'turn', 10, CAP, PEAK)).toBe(true)
      expect(await b.total(bucket)).toBe(CAP)
      expect(await b.reserve(bucket, 'a', 'turn', 0, CAP, PEAK)).toBe(false)
    })

    it('stops calling once spent plus the estimate would pass 28 元', async () => {
      const bucket = bucketOf('production', PEAK)
      const est = estimateNano('deepseek-flash', 'turn', new Date(PEAK))
      await b.reserve(bucket, 'filler', 'turn', CAP - est + 1, CAP, PEAK)
      let called = 0
      await expect(guarded(b, input(), async () => { called++; return { value: 1, usage } })).rejects.toThrow(BUDGET_OUT)
      expect(called).toBe(0)
      await b.release('filler')
      await b.reserve(bucket, 'filler2', 'turn', CAP - est, CAP, PEAK)
      await expect(guarded(b, input(), async () => { called++; return { value: 1, usage } })).resolves.toBe(1)
      expect(called).toBe(1)
    })

    it('books the real cost at the price of the hour the call started', async () => {
      await guarded(b, input(), async () => ({ value: 1, usage }))
      await guarded(b, input({ now: IDLE }), async () => ({ value: 1, usage }))
      const peak = costNano('deepseek-flash', usage, new Date(PEAK))
      expect(await b.total(bucketOf('production', PEAK))).toBe(peak + costNano('deepseek-flash', usage, new Date(IDLE)))
      // 1500×2 + 1500×0.04 + 800×8 元 per million tokens
      expect(peak).toBe(Math.round((1500 * 2 + 1500 * 0.04 + 800 * 8) * 1000))
      expect(costNano('deepseek-flash', usage, new Date(IDLE)) * 2).toBe(peak)
    })

    it('an unknown outcome keeps the hold; only a provider refusal releases it', async () => {
      const bucket = bucketOf('production', PEAK)
      const est = estimateNano('deepseek-flash', 'turn', new Date(PEAK))
      await expect(guarded(b, input(), async () => { throw new DOMException('timed out', 'TimeoutError') })).rejects.toThrow()
      expect(await b.total(bucket)).toBe(est)
      await expect(guarded(b, input(), async () => { throw new TypeError('network') })).rejects.toThrow()
      expect(await b.total(bucket)).toBe(est * 2)
      await expect(guarded(b, input(), async () => { throw new ProviderRefused(502, 'AI 接口返回 500') })).rejects.toThrow(HttpError)
      expect(await b.total(bucket)).toBe(est * 2)
    })

    it('missing or malformed usage is booked at the estimate, never as zero', async () => {
      const bucket = bucketOf('production', PEAK)
      const est = estimateNano('deepseek-flash', 'turn', new Date(PEAK))
      await guarded(b, input(), async () => ({ value: 1, usage: null }))
      await guarded(b, input(), async () => ({ value: 1, usage: { promptTokens: 10, cachedTokens: 20, completionTokens: 1 } }))
      await guarded(b, input(), async () => ({ value: 1, usage: { promptTokens: -1, cachedTokens: 0, completionTokens: 1 } }))
      expect(await b.total(bucket)).toBe(est * 3)
    })

    it('the ledger and the counts turn over at Beijing midnight, not UTC midnight', async () => {
      const before = Date.parse('2026-11-12T15:59:59Z')
      const after = Date.parse('2026-11-12T16:00:00Z')
      expect(beijingDay(before)).toBe('2026-11-12')
      expect(beijingDay(after)).toBe('2026-11-13')
      await b.reserve(bucketOf('production', before), 'x', 'turn', CAP, CAP, before)
      await expect(guarded(b, input({ now: before }), async () => ({ value: 1, usage }))).rejects.toThrow(BUDGET_OUT)
      await expect(guarded(b, input({ now: after }), async () => ({ value: 2, usage }))).resolves.toBe(2)
      expect(await b.total(bucketOf('preview', before))).toBe(0)
    })

    it('enforces the call counts: 20 endings a day site-wide, and per-caller limits', async () => {
      for (let i = 0; i < CONFIG.cost.dailyLimits.endingGlobal; i++) await guarded(b, input({ kind: 'ending', now: IDLE }), async () => ({ value: i, usage }))
      await expect(guarded(b, input({ kind: 'ending', now: IDLE }), async () => ({ value: 0, usage }))).rejects.toThrow(CALLS_OUT)
      const mine = input({ counts: [{ key: 'user:a', limit: 2 }] })
      await guarded(b, mine, async () => ({ value: 1, usage }))
      await guarded(b, mine, async () => ({ value: 1, usage }))
      await expect(guarded(b, mine, async () => ({ value: 1, usage }))).rejects.toThrow(CALLS_OUT)
      await expect(guarded(b, input({ counts: [{ key: 'user:b', limit: 2 }] }), async () => ({ value: 1, usage }))).resolves.toBe(1)
    })

    it('refuses an unpriced model before calling it', async () => {
      let called = 0
      await expect(guarded(b, input({ model: 'grok-4.7' }), async () => { called++; return { value: 1, usage } })).rejects.toMatchObject({ status: 503 })
      expect(called).toBe(0)
    })

    it('parallel reservations never overshoot the cap', async () => {
      const bucket = bucketOf('production', PEAK)
      const part = CAP / 4
      const ok = await Promise.all(Array.from({ length: 10 }, (_, i) => b.reserve(bucket, `p${i}`, 'turn', part, CAP, PEAK)))
      expect(ok.filter(Boolean)).toHaveLength(4)
      expect(await b.total(bucket)).toBe(CAP)
    })
  })
}

suite('内存', () => new MemoryBudgetStore())
suite('SQLite / D1', () => new SqlBudgetStore(sqliteD1()))

describe('AI 接口经过费用守卫', () => {
  const headers = { 'x-echo-client': '1', 'x-echo-uid': 'device-budget-0123456789', 'content-type': 'application/json' }
  const post = async (body: Record<string, unknown>) => {
    const res = await handleGm(new Request('http://localhost/api/gm', { method: 'POST', headers, body: JSON.stringify(body) }))
    return { status: res.status, data: (await res.json()) as Record<string, unknown> }
  }
  let budget: MemoryBudgetStore
  let calls: number
  beforeEach(() => {
    budget = new MemoryBudgetStore()
    calls = 0
    const profiles = new MemoryProfileStore()
    const store = new MemoryStore()
    setPlatform({ viewer: async (r) => anonymousViewer(r), store: () => store, profiles: () => profiles, budget: () => budget })
    const model: IselanModel = async () => {
      calls++
      return { text: '{}', model: 'deepseek-flash', usage }
    }
    setIselanModel(model)
  })
  afterEach(() => setIselanModel(undefined))

  it('books each turn and, once the day is spent, answers 429 without calling the model', async () => {
    const body = { op: 'iselan_turn', runId: 'run-budget-0001', content: '【玩家意图原文】\n看看' }
    expect((await post({ ...body, seq: 1 })).status).toBe(200)
    const bucket = bucketOf('production', Date.now())
    const spent = await budget.total(bucket)
    expect(spent).toBeGreaterThan(0)
    await budget.reserve(bucket, 'rest', 'turn', CAP - spent, CAP, Date.now())
    const r = await post({ ...body, seq: 2 })
    expect(r).toMatchObject({ status: 429, data: { error: BUDGET_OUT } })
    expect(calls).toBe(1)
  })

  it('reports the AI host unavailable where there is no ledger', async () => {
    setPlatform({ viewer: async (r) => anonymousViewer(r), store: () => new MemoryStore(), profiles: () => new MemoryProfileStore(), budget: () => null })
    expect((await post({ op: 'iselan_turn', runId: 'run-budget-0001', seq: 1, content: 'x' })).status).toBe(503)
    expect(calls).toBe(0)
  })
})

describe('结局模型变量', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
    setIselanModel(undefined)
  })
  it('GM_ENDING_MODEL prices the ending; without it the ending falls back to the everyday model', () => {
    setIselanModel(undefined)
    process.env.OPENAI_API_KEY = 'sk-test-not-a-real-key'
    process.env.GM_BASE_URL = 'https://api.deepseek.com'
    process.env.GM_MODEL = 'deepseek-flash'
    delete process.env.GM_ENDING_MODEL
    expect(iselanModelId('ending')).toBe('deepseek-flash')
    process.env.GM_ENDING_MODEL = 'deepseek-v4-pro'
    expect(iselanModelId('ending')).toBe('deepseek-v4-pro')
    expect(iselanModelId('turn')).toBe('deepseek-flash')
    expect(estimateNano('deepseek-v4-pro', 'ending', new Date(PEAK))).toBeGreaterThan(estimateNano('deepseek-flash', 'ending', new Date(PEAK)))
  })
})
