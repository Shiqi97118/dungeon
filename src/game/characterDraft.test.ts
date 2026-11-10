import { describe, expect, it } from 'vitest'
import {
  JOBS,
  ANCESTRIES,
  STAT_BUDGET,
  SPECIALTY_NAMES,
  isDraftValid,
  randomDraft,
  draftToCharacter,
  randomPlayableCharacter,
  type CharacterDraft,
} from './characterDraft.js'
import { STAT_ORDER } from './types.js'
import { ITEMS } from './data/characters.js'
import type { Character } from './types.js'

const ROUNDS = 400
const SORTED_BUDGET = STAT_BUDGET.slice().sort((a, b) => a - b) // [-1, 0, 1, 2]

const REQUIRED_KEYS: (keyof Character)[] = [
  'id', 'name', 'title', 'stats', 'specialties', 'items', 'spentItems',
  'motive', 'hook', 'memento', 'reason', 'stress', 'advantage',
  'statuses', 'out', 'sigil', 'hue',
]

function draftFixture(): CharacterDraft {
  return {
    name: '测试者',
    job: JOBS[0],
    ancestry: ANCESTRIES[0],
    stats: { str: 2, dex: 1, ins: 0, soc: -1 },
    specialties: [SPECIALTY_NAMES[0], SPECIALTY_NAMES[1]],
  }
}

describe('随机车卡常量表', () => {
  it('恰好 12 职业、8 种族且各自无重复', () => {
    expect(JOBS).toHaveLength(12)
    expect(ANCESTRIES).toHaveLength(8)
    expect(new Set(JOBS).size).toBe(12)
    expect(new Set(ANCESTRIES).size).toBe(8)
  })

  it('属性预算为 +2/+1/0/-1，专长白名单非空且无重复', () => {
    expect(SORTED_BUDGET).toEqual([-1, 0, 1, 2])
    expect(SPECIALTY_NAMES.length).toBeGreaterThanOrEqual(2)
    expect(new Set(SPECIALTY_NAMES).size).toBe(SPECIALTY_NAMES.length)
  })
})

describe('randomDraft 多次生成始终合法', () => {
  it('属性预算：四属性恰为 +2/+1/0/-1 各一次，且均为有限数', () => {
    for (let i = 0; i < ROUNDS; i++) {
      const d = randomDraft()
      const vals = STAT_ORDER.map((k) => d.stats[k]).sort((a, b) => a - b)
      expect(vals).toEqual(SORTED_BUDGET)
      expect(STAT_ORDER.every((k) => Number.isFinite(d.stats[k]))).toBe(true)
    }
  })

  it('专长：恰好两项、互异且都在白名单内', () => {
    for (let i = 0; i < ROUNDS; i++) {
      const d = randomDraft()
      expect(d.specialties).toHaveLength(2)
      expect(new Set(d.specialties).size).toBe(2)
      expect(d.specialties.every((s) => SPECIALTY_NAMES.includes(s))).toBe(true)
    }
  })

  it('职业/种族来自合法表、姓名非空，草稿恒通过 isDraftValid', () => {
    for (let i = 0; i < ROUNDS; i++) {
      const d = randomDraft()
      expect(JOBS).toContain(d.job)
      expect(ANCESTRIES).toContain(d.ancestry)
      expect(d.name.trim().length).toBeGreaterThan(0)
      expect(isDraftValid(d)).toBe(true)
    }
  })

  it('职业与种族取值确有随机性（不是恒定第一项）', () => {
    const jobs = new Set(Array.from({ length: 200 }, () => randomDraft().job))
    const ancestries = new Set(Array.from({ length: 200 }, () => randomDraft().ancestry))
    expect(jobs.size).toBeGreaterThan(1)
    expect(ancestries.size).toBeGreaterThan(1)
  })
})

describe('takenNames 去重与姓名池耗尽', () => {
  it('真实生成一个姓名加入 takenNames 后，再生成始终避开已用名', () => {
    // 占用名来自真实生成器（确实在姓名池内），不是编造的不在池中的名字。
    // 若去重未接上，400 次采样几乎必现与该名冲突。
    const first = randomPlayableCharacter().name
    expect(first.trim().length).toBeGreaterThan(0)
    const taken = [first]
    for (let i = 0; i < ROUNDS; i++) {
      const d = randomDraft(taken)
      expect(taken).not.toContain(d.name)
      expect(d.name.trim().length).toBeGreaterThan(0)
      expect(isDraftValid(d)).toBe(true)
    }
  })

  it('连续生成远超姓名池数量仍互不重复，耗尽后使用稳定可区分后缀', () => {
    const taken: string[] = []
    const names: string[] = []
    // RANDOM_NAMES 只有 12 个；连续生成 40 个必然耗尽并触发后缀分支。
    for (let i = 0; i < 40; i++) {
      const d = randomDraft(taken)
      expect(taken).not.toContain(d.name)
      expect(d.name.trim().length).toBeGreaterThan(0)
      taken.push(d.name)
      names.push(d.name)
    }
    expect(new Set(names).size).toBe(names.length) // 全程不重复
    // 真实姓名不含数字，出现带数字的即可区分后缀名。
    const suffixed = names.filter((n) => /\d/.test(n))
    expect(suffixed.length).toBeGreaterThan(0)
    expect(new Set(suffixed).size).toBe(suffixed.length)
    // 同一已用名集合下后缀稳定（确定性，不随机漂移）。
    expect(randomDraft(taken).name).toBe(randomDraft(taken).name)
  })

  it('randomPlayableCharacter 连续生成同样去重，且所有随机入口都含职业/种族', () => {
    const taken: string[] = []
    const names: string[] = []
    for (let i = 0; i < 40; i++) {
      const c = randomPlayableCharacter(taken)
      expect(taken).not.toContain(c.name)
      taken.push(c.name)
      names.push(c.name)
      const [ancestry, job] = c.title.split(' · ')
      expect(ANCESTRIES).toContain(ancestry)
      expect(JOBS).toContain(job)
    }
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('isDraftValid 拒绝非法草稿', () => {
  it('合法草稿通过', () => {
    expect(isDraftValid(draftFixture())).toBe(true)
  })

  it('空姓名 / 非法职业 / 非法种族被拒', () => {
    expect(isDraftValid({ ...draftFixture(), name: '   ' })).toBe(false)
    expect(isDraftValid({ ...draftFixture(), job: '不存在的职业' })).toBe(false)
    expect(isDraftValid({ ...draftFixture(), ancestry: '不存在的种族' })).toBe(false)
  })

  it('属性预算被破坏（重复值 / 越界值）被拒', () => {
    expect(isDraftValid({ ...draftFixture(), stats: { str: 2, dex: 2, ins: 0, soc: -1 } })).toBe(false)
    expect(isDraftValid({ ...draftFixture(), stats: { str: 9, dex: 1, ins: 0, soc: -1 } })).toBe(false)
  })

  it('专长重复 / 不在白名单 / 数量不为 2 被拒', () => {
    const s = SPECIALTY_NAMES[0]
    expect(isDraftValid({ ...draftFixture(), specialties: [s, s] })).toBe(false)
    expect(isDraftValid({ ...draftFixture(), specialties: [s, '自造专长'] })).toBe(false)
    expect(isDraftValid({ ...draftFixture(), specialties: [s] })).toBe(false)
    expect(isDraftValid({ ...draftFixture(), specialties: [s, SPECIALTY_NAMES[1], SPECIALTY_NAMES[2]] })).toBe(false)
  })
})

describe('draftToCharacter / randomPlayableCharacter', () => {
  it('基础必填字段齐全，装备沿用现有合法 ITEMS 生成器', () => {
    for (let i = 0; i < ROUNDS; i++) {
      const c = randomPlayableCharacter()
      for (const k of REQUIRED_KEYS) {
        expect(c[k]).toBeDefined()
      }
      expect(c.id.length).toBeGreaterThan(0)
      expect(c.name.trim().length).toBeGreaterThan(0)
      expect(c.title).toContain(' · ')
      expect(STAT_ORDER.every((k) => typeof c.stats[k] === 'number')).toBe(true)
      expect(c.specialties).toHaveLength(2)
      expect(c.items.length).toBeGreaterThan(0)
      expect(c.items.every((x) => ITEMS.includes(x))).toBe(true)
      expect(Array.isArray(c.spentItems)).toBe(true)
      expect(Array.isArray(c.statuses)).toBe(true)
      expect(c.stress).toBe(0)
      expect(c.out).toBe(false)
    }
  })

  it('保留微调后的姓名/属性/专长，标题为「种族 · 职业」且不含数值加成', () => {
    const d: CharacterDraft = {
      name: '  自定义名字  ',
      job: JOBS[3],
      ancestry: ANCESTRIES[5],
      stats: { str: -1, dex: 2, ins: 1, soc: 0 },
      specialties: [SPECIALTY_NAMES[2], SPECIALTY_NAMES[4]],
    }
    const c = draftToCharacter(d)
    expect(c.name).toBe('自定义名字')
    expect(c.stats).toEqual(d.stats)
    expect(c.specialties).toEqual(d.specialties)
    expect(c.title).toBe(`${d.ancestry} · ${d.job}`)
    expect(c.items.every((x) => ITEMS.includes(x))).toBe(true)
  })
})
