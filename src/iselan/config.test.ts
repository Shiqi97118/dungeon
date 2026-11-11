import { describe, expect, it } from 'vitest'
import catalogRaw from '../../docs/product/narrative-v1/data/achievements.v1.json?raw'
import spec from '../../docs/story/12-开工规格.md?raw'
import { CONFIG } from './config'
import { VOCAB, type DirectionId, type InteractionId, type RegionId } from './data'

function section(title: string): string {
  const start = spec.indexOf(`\n## ${title}`)
  const end = spec.indexOf('\n## ', start + 1)
  expect(start, `12-开工规格.md has a section "${title}"`).toBeGreaterThan(-1)
  return spec.slice(start, end === -1 ? undefined : end)
}

describe('config', () => {
  it('has every key listed in 12 §7', () => {
    const rows = section('7.').split('\n').filter((l) => l.startsWith('| `'))
    const keys = rows.flatMap((r) => [...r.split('|')[1].matchAll(/`([A-Za-z0-9]+)`/g)].map((m) => m[1]))
    expect(keys.length).toBeGreaterThan(20)
    for (const k of keys) expect(CONFIG, `CONFIG.${k}`).toHaveProperty(k)
  })

  it('keeps the daily hard cap under the 30 元 budget (12 §9)', () => {
    const { cost } = CONFIG
    expect(cost.dailyBudgetYuan).toBe(30)
    expect(cost.hardCapYuan).toBeLessThan(cost.dailyBudgetYuan)
    const text = section('9.')
    for (const n of Object.values(cost.dailyLimits)) expect(text).toContain(String(n))
    expect(text).toContain(`${cost.hardCapYuan} 元`)
  })

  it('prices every model in the 12 §9.1 table, idle at half the peak price', () => {
    const table = section('9.').split('\n').filter((l) => l.startsWith('| `'))
    const models = table.map((r) => r.match(/`([^`]+)`/)![1])
    expect(Object.keys(CONFIG.cost.prices).sort()).toEqual(models.sort())
    for (const p of Object.values(CONFIG.cost.prices)) {
      for (const k of ['cacheHit', 'cacheMiss', 'output'] as const) expect(p.idle[k]).toBeCloseTo(p.peak[k] / 2)
    }
  })

  it('names only vocabulary ids for the slice', () => {
    const region: RegionId = CONFIG.sliceRegion
    const directions: readonly DirectionId[] = CONFIG.sliceDirections
    const interactions: readonly InteractionId[] = CONFIG.sliceInteractions
    expect(VOCAB.regions.map((r) => r.id)).toContain(region)
    expect(directions).toContain('D01')
    expect(interactions).toHaveLength(2)
  })

  it('lists 10 slice achievements that exist in the catalog', () => {
    const ids = new Set((JSON.parse(catalogRaw) as { achievements: { id: string }[] }).achievements.map((a) => a.id))
    expect(CONFIG.sliceAchievements).toHaveLength(10)
    for (const a of CONFIG.sliceAchievements) expect(ids.has(a), a).toBe(true)
  })
})
