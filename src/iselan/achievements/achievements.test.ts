import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { draft, verifyLog } from '../events'
import type { UnlockRecord } from '../profile'
import { TestRun } from '../rules/testRun'
import { CATALOG, V1_ACHIEVEMENTS } from './catalog'
import { HIDDEN_ICONS } from './hiddenIcons'
import { judgeAchievements } from './judge'
import { grayportRun } from './sampleRun'
import { catalogView } from './view'

const ICONS = new URL('../../../docs/product/narrative-v1/assets/icons/svg/', import.meta.url)
const judge = (run: TestRun) => judgeAchievements(run.s, run.events)
const ids = (run: TestRun) => judge(run).map((e) => e.achievementId)
const unlock = (achievementId: string, notified = false): UnlockRecord => ({ achievementId, runId: 'r1', eventId: 'r1:1', unlockedAt: 1, notified })

describe('成就目录（02 §2、§10）', () => {
  it('50 项编号唯一，分类、稀有度、可见性取值合法', () => {
    expect(CATALOG).toHaveLength(50)
    expect(new Set(CATALOG.map((a) => a.id)).size).toBe(50)
    for (const a of CATALOG) {
      expect(['ST', 'RE', 'EX', 'SB', 'LG']).toContain(a.category)
      expect(['common', 'rare', 'epic', 'legendary']).toContain(a.rarity)
      expect(['public', 'hint', 'secret']).toContain(a.visibility)
      expect(['event', 'count']).toContain(a.rule.op)
    }
  })

  it('首版 10 项都在目录里，且都是首版能判定的 event 规则', () => {
    expect(V1_ACHIEVEMENTS).toHaveLength(10)
    for (const id of V1_ACHIEVEMENTS) expect(CATALOG.find((a) => a.id === id)?.rule.op).toBe('event')
  })

  it('隐藏与秘密成就的图标只在服务端，与设计包文件逐字一致', () => {
    const hidden = CATALOG.filter((a) => a.visibility !== 'public').map((a) => a.id)
    expect(Object.keys(HIDDEN_ICONS).sort()).toEqual(hidden.sort())
    for (const id of hidden) expect(HIDDEN_ICONS[id]).toBe(readFileSync(new URL(`${id}.svg`, ICONS), 'utf8'))
  })
})

describe('首版成就判定（12 §6.1）', () => {
  it('一局灰港走下来 10 项全部达成，各自归到达成它的那条事件', () => {
    const run = grayportRun()
    expect(verifyLog(run.runId, run.events)).toEqual([])
    const earned = judge(run)
    expect(earned.map((e) => e.achievementId).sort()).toEqual([...V1_ACHIEVEMENTS].sort())
    const expected: Record<string, [string, Record<string, unknown>]> = {
      ST01: ['run_started', {}],
      ST02: ['first_hook_taken', { regionId: 'gray_harbor' }],
      ST03: ['truth_verified', { truthId: 'merchant_memory_well' }],
      ST05: ['core_arc_resolved', { arcId: 'gray_well' }],
      ST11: ['ending_committed', { directionId: 'D01' }],
      RE01: ['npc_met', { npcId: 'ludo' }],
      RE03: ['npc_trust_earned', { npcId: 'ludo' }],
      SB01: ['player_project_created', { kind: 'tavern' }],
      SB02: ['business_operational', { kind: 'tavern', regionId: 'gray_harbor' }],
      LG07: ['truth_verified', { truthId: 'merchant_funds_namekeepers' }],
    }
    for (const e of earned) {
      const ev = run.events.find((x) => x.eventId === e.eventId)!
      expect(ev.type).toBe(expected[e.achievementId][0])
      expect(ev.payload).toMatchObject(expected[e.achievementId][1])
    }
    const seqs = earned.map((e) => run.events.find((x) => x.eventId === e.eventId)!.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
  })

  it('确定性：同一日志判定结果完全一致；同一成就只归到第一次达成', () => {
    const run = grayportRun()
    run.settle([draft('npc_met', { npcId: 'felix' })])
    expect(judge(run)).toEqual(judge(run))
    const re01 = judge(run).find((e) => e.achievementId === 'RE01')!
    expect(run.events.find((e) => e.eventId === re01.eventId)?.payload).toEqual({ npcId: 'ludo' })
  })

  it('刚开局只有 ST01', () => {
    expect(ids(new TestRun())).toEqual(['ST01'])
  })

  it('条件字段不符时不解锁：别的结局、别的真相、互助站、证据不足的揭开', () => {
    const run = new TestRun()
    run.commit([
      draft('ending_committed', { directionId: 'D07', secondaryDirectionId: 'D03', variant: 'none', worldResolution: 'resolved' }),
      draft('truth_verified', { truthId: 'web_devours', layer: 2 }),
      draft('business_operational', { projectId: 'p1', kind: 'tavern', regionId: 'nameless_city' }),
      draft('civic_service_operational', { projectId: 'p2', kind: 'shelter' }),
      draft('dark_line_changed', { darkLineId: 'dl1', state: 'clue' }),
    ])
    expect(ids(run)).toEqual(['ST01'])
  })

  it('其余 40 项即使事件出现也不判定（后续版本开放）', () => {
    const run = new TestRun()
    run.commit([draft('truth_verified', { truthId: 'bellkeeper_price', layer: 0 })])
    expect(ids(run)).toEqual(['ST01'])
  })
})

describe('图鉴视图（02 §6，秘密成就不泄露）', () => {
  const hidden = CATALOG.filter((a) => a.visibility !== 'public')
  const leaks = (text: string, defs: typeof hidden) =>
    defs.flatMap((a) => [a.name, a.description, a.flavor, HIDDEN_ICONS[a.id]].filter((s) => text.includes(s)).map((s) => `${a.id}:${s.slice(0, 20)}`))

  it('没解锁时：隐藏与秘密成就不带名称、说明、寄语、稀有度、图标；提示类只给提示', () => {
    const v = catalogView([])
    expect(leaks(JSON.stringify(v), hidden)).toEqual([])
    const lg07 = v.cards.find((c) => c.id === 'LG07')!
    expect(lg07).toMatchObject({ name: null, description: null, hint: null, flavor: null, rarity: null, iconSvg: null, status: 'locked' })
    expect(v.cards.find((c) => c.id === 'EX08')).toMatchObject({ name: null, hint: '跟随无名之路，直到地图停止说话。', status: 'later' })
  })

  it('解锁 LG07 后只露出 LG07，其余秘密仍然隐藏', () => {
    const v = catalogView([unlock('LG07')])
    const def = CATALOG.find((a) => a.id === 'LG07')!
    expect(v.cards.find((c) => c.id === 'LG07')).toMatchObject({ name: def.name, description: def.description, status: 'unlocked', iconSvg: HIDDEN_ICONS.LG07 })
    expect(leaks(JSON.stringify(v), hidden.filter((a) => a.id !== 'LG07'))).toEqual([])
  })

  it('首版 10 项为“未获得”，其余 40 项为“后续版本开放”；进度含隐藏数量', () => {
    const v = catalogView([unlock('ST01'), unlock('RE01', true)])
    expect(v.cards.filter((c) => c.status === 'later')).toHaveLength(40)
    expect(v.cards.filter((c) => c.status === 'locked').map((c) => c.id).sort()).toEqual(V1_ACHIEVEMENTS.filter((x) => x !== 'ST01' && x !== 'RE01').sort())
    expect(v).toMatchObject({ unlocked: 2, total: 50, v1Unlocked: 2, v1Total: 10 })
    expect(v.categories.find((c) => c.id === 'RE')).toEqual({ id: 'RE', name: '人物与关系', total: 10, unlocked: 1 })
    expect(v.categories.find((c) => c.id === 'LG')).toEqual({ id: 'LG', name: '隐藏与传奇', total: 10, unlocked: 0 })
    expect(v.cards.find((c) => c.id === 'RE01')?.unlock).toEqual({ runId: 'r1', unlockedAt: 1, notified: true })
  })

  it('公开成就没解锁也显示完整名称与目标', () => {
    const st05 = catalogView([]).cards.find((c) => c.id === 'ST05')!
    expect(st05).toMatchObject({ name: '潮井之下', description: '完成灰港核心冒险，无论结果。', status: 'locked', unlock: null })
  })
})
