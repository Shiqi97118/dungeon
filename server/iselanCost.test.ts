// ENG-06 stage 1. Expected numbers are computed by hand from 12 §9.1/§9.2, not read back
// from the implementation: a test that mirrors costNano would pass even if both were wrong.
import { describe, expect, it } from 'vitest'
import { CONFIG } from '../src/iselan/config.js'
import { CostError, NANO_YUAN, admit, assertUsage, costNano, estimateNano, isPeak, priceAt } from './iselanCost.js'

const beijing = (iso: string) => new Date(iso)
// 2026-11-09 is a Monday; 11-14 Saturday, 11-15 Sunday. All strings carry +08:00.
const MON_0900 = beijing('2026-11-09T09:00:00+08:00')
const MON_0859 = beijing('2026-11-09T08:59:59+08:00')
const MON_1159 = beijing('2026-11-09T11:59:00+08:00')
const MON_1200 = beijing('2026-11-09T12:00:00+08:00')
const MON_1359 = beijing('2026-11-09T13:59:00+08:00')
const MON_1400 = beijing('2026-11-09T14:00:00+08:00')
const MON_1759 = beijing('2026-11-09T17:59:00+08:00')
const MON_1800 = beijing('2026-11-09T18:00:00+08:00')
const SAT_1000 = beijing('2026-11-14T10:00:00+08:00')
const SUN_1500 = beijing('2026-11-15T15:00:00+08:00')

const usage = (promptTokens: number, cachedTokens: number, completionTokens: number) => ({ promptTokens, cachedTokens, completionTokens })

const throwsCost = (fn: () => unknown, code: string) => {
  try {
    fn()
  } catch (e) {
    expect(e, '应当抛 CostError').toBeInstanceOf(CostError)
    expect((e as CostError).code).toBe(code)
    return
  }
  throw new Error('没有抛错')
}

describe('peak windows (12 §9.1, Beijing time)', () => {
  it('switches at 09:00 / 12:00 / 14:00 / 18:00 exactly', () => {
    expect(isPeak(MON_0859)).toBe(false)
    expect(isPeak(MON_0900)).toBe(true)
    expect(isPeak(MON_1159)).toBe(true)
    expect(isPeak(MON_1200)).toBe(false) // lunch is half price
    expect(isPeak(MON_1359)).toBe(false)
    expect(isPeak(MON_1400)).toBe(true)
    expect(isPeak(MON_1759)).toBe(true)
    expect(isPeak(MON_1800)).toBe(false)
  })

  it('is half price all weekend', () => {
    expect(isPeak(SAT_1000)).toBe(false)
    expect(isPeak(SUN_1500)).toBe(false)
  })

  it('reads Beijing time, not the host time zone (UTC 01:00 = 09:00 Beijing)', () => {
    expect(isPeak(beijing('2026-11-09T01:00:00Z'))).toBe(true)
    // UTC 17:30 Monday is 01:30 Tuesday in Beijing: a weekday, but idle hours.
    expect(isPeak(beijing('2026-11-09T17:30:00Z'))).toBe(false)
    // UTC 23:00 Sunday is 07:00 Monday Beijing: weekday, still idle.
    expect(isPeak(beijing('2026-11-15T23:00:00Z'))).toBe(false)
  })

  it('never drifts across a whole week of minutes', () => {
    let peak = 0
    for (let m = 0; m < 7 * 24 * 60; m++) {
      if (isPeak(new Date(Date.UTC(2026, 10, 8, 16, m)))) peak++ // 00:00 Monday Beijing
    }
    // 5 weekdays × (3h + 4h) = 35h.
    expect(peak).toBe(35 * 60)
  })
})

describe('pricing', () => {
  it('bills cache hit, cache miss and output separately (peak flash)', () => {
    // 600 miss × 2 元/1M (=2000 nano/token), 400 hit × 0.04 (=40), 200 out × 8 (=8000).
    expect(costNano('deepseek-flash', usage(1000, 400, 200), MON_0900)).toBe(1_200_000 + 16_000 + 1_600_000)
    expect(costNano('deepseek-flash', usage(1000, 400, 200), MON_0900) / NANO_YUAN).toBeCloseTo(0.002816, 9)
  })

  it('charges exactly half in idle hours, for both models', () => {
    const u = usage(4000, 1500, 1200)
    for (const model of Object.keys(CONFIG.cost.prices)) {
      const peak = costNano(model, u, MON_0900)
      const idle = costNano(model, u, MON_1800)
      expect(idle * 2, model).toBe(peak)
    }
    expect(priceAt('deepseek-v4-pro', MON_1800).cacheMiss * 2).toBe(priceAt('deepseek-v4-pro', MON_0900).cacheMiss)
  })

  it('matches the two estimates printed in 12 §9.2 (0.018 元 turn, 0.23 元 ending)', () => {
    const turn = estimateNano('deepseek-flash', 'turn', MON_0900) / NANO_YUAN
    expect(turn).toBeCloseTo(0.0176, 9)
    expect(Math.abs(turn - 0.018)).toBeLessThan(0.001)
    const ending = estimateNano('deepseek-v4-pro', 'ending', MON_0900) / NANO_YUAN
    expect(ending).toBeCloseTo(0.234, 9)
    expect(Math.abs(ending - 0.23)).toBeLessThan(0.005)
  })

  it('the pre-call estimate is never cheaper than the same call billed with cache hits', () => {
    const worst = CONFIG.cost.worstCase.turn
    const cached = costNano('deepseek-flash', usage(worst.inputTokens, worst.inputTokens, worst.outputTokens), MON_0900)
    expect(estimateNano('deepseek-flash', 'turn', MON_0900)).toBeGreaterThan(cached)
  })

  it('refuses to price a model that is not in CONFIG', () => {
    throwsCost(() => priceAt('deepseek-imaginary', MON_0900), 'unknown-model')
    throwsCost(() => costNano('deepseek-imaginary', usage(1, 0, 1), MON_0900), 'unknown-model')
  })
})

describe('hard cap admission (12 §9.3)', () => {
  const cap = CONFIG.cost.hardCapYuan * NANO_YUAN

  it('allows exactly the cap and rejects one nano more', () => {
    const estimate = estimateNano('deepseek-flash', 'turn', MON_0900)
    const exact = admit({ spentNano: cap - estimate, estimateNano: estimate })
    expect(exact.allowed).toBe(true)
    expect(exact.remainingNano).toBe(0)

    const over = admit({ spentNano: cap - estimate + 1, estimateNano: estimate })
    expect(over.allowed).toBe(false)
    expect(over.remainingNano).toBe(-1)
  })

  it('counts in-flight reservations, so parallel calls cannot oversubscribe the cap', () => {
    const estimate = estimateNano('deepseek-v4-pro', 'ending', MON_0900)
    let spent = 0
    let reserved = 0
    let admitted = 0
    for (let i = 0; i < 1000; i++) {
      const decision = admit({ spentNano: spent, reservedNano: reserved, estimateNano: estimate })
      if (!decision.allowed) break
      reserved += estimate // in flight, not yet settled
      admitted++
      if (i % 2 === 0) {
        spent += estimate // settle half of them at the estimated cost
        reserved -= estimate
      }
    }
    expect(admitted).toBeGreaterThan(100)
    expect(spent + reserved).toBeLessThanOrEqual(cap)
    // The next call must be the one that would break the cap.
    expect(admit({ spentNano: spent, reservedNano: reserved, estimateNano: estimate }).allowed).toBe(false)
  })

  it('rejects negative or non-integer amounts instead of clamping them', () => {
    throwsCost(() => admit({ spentNano: -1, estimateNano: 1 }), 'bad-usage')
    throwsCost(() => admit({ spentNano: 1.5, estimateNano: 1 }), 'bad-usage')
    throwsCost(() => admit({ spentNano: 0, reservedNano: Number.NaN, estimateNano: 1 }), 'bad-usage')
    throwsCost(() => admit({ spentNano: 0, estimateNano: Number.POSITIVE_INFINITY }), 'bad-usage')
  })
})

describe('usage validation', () => {
  it('rejects anomalies rather than billing them as zero', () => {
    throwsCost(() => assertUsage(usage(-1, 0, 0)), 'bad-usage')
    throwsCost(() => assertUsage(usage(10, -1, 0)), 'bad-usage')
    throwsCost(() => assertUsage(usage(10, 0, Number.NaN)), 'bad-usage')
    throwsCost(() => assertUsage(usage(10, 0, Number.POSITIVE_INFINITY)), 'bad-usage')
    throwsCost(() => assertUsage(usage(10.5, 0, 0)), 'bad-usage')
    throwsCost(() => assertUsage(usage(10, 11, 0)), 'bad-usage') // cache hit larger than input
    throwsCost(() => costNano('deepseek-flash', usage(10, 11, 0), MON_0900), 'bad-usage')
  })

  it('accepts a cached-everything prompt', () => {
    expect(costNano('deepseek-flash', usage(1000, 1000, 0), MON_0900)).toBe(40_000)
  })

  it('rejects an invalid date instead of silently treating it as idle', () => {
    throwsCost(() => isPeak(new Date('not a date')), 'bad-time')
  })
})
