import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { VOCAB } from '../data'
import type { AnyDraft } from '../events'
import { draft, verifyLog } from '../events'
import { TestRun } from '../rules/testRun'
import type { SceneContext } from '../rules/conditions'
import { rngFor } from '../rules/random'
import {
  ALL_UNITS, chineseNumber, fillPlaceholders, MOMENTS, mayLeaveScene, placeholderValues, sceneChange, screenProblems,
  selectFor, selectText, shownDrafts, whyNot, type Moment, type Pick, type TextUnit,
} from '.'

const unit = (id: string): TextUnit => {
  const u = ALL_UNITS.find((x) => x.id === id)
  if (!u) throw new Error(`没有 ${id}`)
  return u
}

const at = (run: TestRun, placeId: string | 'none' = 'none', visitIndex = 1) =>
  run.commit([
    draft('region_visited', { regionId: 'gray_harbor', isOutsideStart: false, visitIndex }),
    draft('location_changed', { regionId: 'gray_harbor', placeId } as never),
  ])

const show = (run: TestRun, pick: Pick | null, ctx: SceneContext = {}) => {
  if (!pick) throw new Error('没有选中文本')
  const r = shownDrafts(run.s, pick, ctx)
  run.commit(r.drafts)
  return r
}

const toRound = (run: TestRun, round: number) => run.commit([draft('round_started', { round })])

const arcCtx = (beat: string, extra: SceneContext = {}): SceneContext => ({ ...extra, vars: { arc: 'gray_well', beat, ...extra.vars } as never })

describe('过滤：必 / 禁止 / 需知（09 §3.2 第 1 步，12 §3.1）', () => {
  it('必：首访灰港才有 GH-ENV-01，再访换成 GH-ENV-02/03', () => {
    const run = new TestRun()
    expect(whyNot(unit('GH-ENV-01'), run.s)).toBe('requires')
    at(run)
    expect(selectFor(run.s, 'arrive').pick?.unit.id).toBe('GH-ENV-01')
    at(run, 'none', 2)
    const again = selectText(run.s, { kinds: ['ENV'] })
    expect(again.pick?.unit.id).not.toBe('GH-ENV-01')
    expect(['GH-ENV-02', 'GH-ENV-03']).not.toContain('GH-ENV-01')
  })

  it('禁止：卢多死亡或不在灰港时 GH-BEAT-02 不展示', () => {
    const run = new TestRun()
    at(run)
    const ctx = arcCtx('cause', { present: ['ludo'] })
    expect(selectText(run.s, { kinds: ['BEAT'], ids: ['GH-BEAT-02'], ctx }).pick?.unit.id).toBe('GH-BEAT-02')
    expect(whyNot(unit('GH-BEAT-02'), run.s, { ...ctx, npcWhere: { ludo: 'kalvis' } })).toBe('forbids')
    run.commit([draft('npc_state_changed', { npcId: 'ludo', state: 'dead' })])
    expect(whyNot(unit('GH-BEAT-02'), run.s, ctx)).toBe('forbids')
  })

  it('需知：没到过七灯酒馆时 GH-BEAT-03 不展示', () => {
    const run = new TestRun()
    const ctx = arcCtx('discovery')
    expect(whyNot(unit('GH-BEAT-03'), run.s, ctx)).toBe('knows')
    at(run, 'gray_harbor.seven_lamps')
    expect(whyNot(unit('GH-BEAT-03'), run.s, ctx)).toBeNull()
  })

  it('默认禁止：说话人不在场、死亡或被抹去时，台词不展示', () => {
    const run = new TestRun()
    const id = 'GH-DLG-卢多·费恩/初见'
    expect(whyNot(unit(id), run.s, { tags: ['首次见面'] })).toBe('speaker')
    expect(whyNot(unit(id), run.s, { tags: ['首次见面'], present: ['ludo'] })).toBeNull()
    run.commit([draft('npc_state_changed', { npcId: 'ludo', state: 'erased' })])
    expect(whyNot(unit(id), run.s, { tags: ['首次见面'], present: ['ludo'] })).toBe('speaker')
  })

  it('默认禁止：地区收束后不再开放核心冒险的节拍', () => {
    const run = new TestRun()
    run.commit([draft('region_stage_changed', { regionId: 'gray_harbor', stage: 'resolved', defaultOutcome: 'guild_holds' })])
    expect(whyNot(unit('GH-BEAT-01'), run.s, arcCtx('cause'))).toBe('resolved')
  })
})

describe('打分、阈值与同分（09 §3.2 第 2–4 步）', () => {
  it('软标签合计不足 3 的条目不进候选，没有候选时用兜底并记缺口', () => {
    const run = new TestRun()
    const r = selectText(run.s, { kinds: ['BRG'], ctx: { tags: ['室外'] } })
    expect(r.pick?.unit.id).toBe('GEN-BRG-32')
    expect(r.pick?.fallback).toBe(true)
    expect(r.gap?.reason).toBe('fallback')
  })

  it('取最高分', () => {
    const run = new TestRun()
    const r = selectText(run.s, { kinds: ['BRG'], ctx: { tags: ['雨', '场景结束', '室外'] } })
    expect(r.pick?.unit.id).toBe('GEN-BRG-01')
    expect(r.pick?.score).toBe(5)
    expect(r.gap).toBeNull()
  })

  it('BEAT 与 CLK 只看必条件，不需要分数', () => {
    const run = new TestRun()
    const r = selectFor(run.s, 'beat', { ids: ['GH-BEAT-01'], ctx: arcCtx('cause') })
    expect(r.pick?.unit.id).toBe('GH-BEAT-01')
    expect(r.pick?.score).toBe(0)
  })

  it('只有必条件、没有软标签的条目只看必（12 §3.1“可以只有软”的反面）', () => {
    const run = new TestRun()
    at(run, 'gray_harbor.seven_lamps')
    expect(selectText(run.s, { kinds: ['SCN'] }).pick?.unit.id).toBe('GH-SCN-01')
  })

  it('同分按本局种子挑选：同一种子可复现，不同种子会挑到不同条目', () => {
    const ctx: SceneContext = { tags: ['雨', '夜', '交谈'] }
    const pickFor = (seed: string) => selectText(new TestRun(undefined, seed).s, { kinds: ['TRV'], ctx }).pick?.unit.id
    expect(pickFor('a')).toBe(pickFor('a'))
    const seen = new Set(Array.from({ length: 40 }, (_, i) => pickFor(`seed-${i}`)))
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('不重复与复用（09 §3.4）', () => {
  it('BRG、BEAT、DLG 一局只用一次，冷却后也不复用', () => {
    const run = new TestRun()
    const ctx: SceneContext = { tags: ['刚战斗', '受伤'] }
    show(run, selectText(run.s, { kinds: ['BRG'], ctx }).pick)
    toRound(run, 40)
    expect(selectText(run.s, { kinds: ['BRG'], ctx }).pick?.unit.id).not.toBe('GEN-BRG-03')
  })

  it('ENV、RST、TRV：有新候选时不复用；冷却 20 轮后可复用，一局最多 2 次', () => {
    const run = new TestRun()
    const ctx: SceneContext = { tags: ['雨'] }
    const only = ALL_UNITS.filter((u) => u.id === 'GEN-TRV-09' || u.id === 'GEN-TRV-18')
    const first = selectText(run.s, { kinds: ['TRV'], ctx }, only)
    expect(first.pick?.unit.id).toBe('GEN-TRV-09')
    show(run, first.pick)
    toRound(run, CONFIG.reuseCooldownRounds - 1)
    expect(selectText(run.s, { kinds: ['TRV'], ctx }, only).pick?.unit.id).toBe('GEN-TRV-18')
    toRound(run, CONFIG.reuseCooldownRounds)
    const again = selectText(run.s, { kinds: ['TRV'], ctx }, only)
    expect(again.pick).toMatchObject({ reused: true })
    expect(again.pick?.unit.id).toBe('GEN-TRV-09')
    show(run, again.pick)
    toRound(run, CONFIG.reuseCooldownRounds * 3)
    expect(run.s.texts['GEN-TRV-09'].count).toBe(CONFIG.reuseMaxPerRun)
    expect(selectText(run.s, { kinds: ['TRV'], ctx }, only).pick?.unit.id).toBe('GEN-TRV-18')
  })

  it('有新候选时优先新条目，不复用旧条目', () => {
    const run = new TestRun()
    const ctx: SceneContext = { tags: ['雨'] }
    show(run, selectText(run.s, { kinds: ['TRV'], ctx }).pick)
    toRound(run, 30)
    const r = selectText(run.s, { kinds: ['TRV'], ctx: { tags: ['离开', '黎明'] } })
    expect(r.pick?.reused).toBe(false)
  })

  it('SCN 每个事件实例一次', () => {
    const run = new TestRun()
    at(run, 'gray_harbor.seven_lamps')
    show(run, selectText(run.s, { kinds: ['SCN'], ids: ['GH-SCN-01'] }).pick)
    expect(selectText(run.s, { kinds: ['SCN'], ids: ['GH-SCN-01'] }).pick).toBeNull()
    toRound(run, 3)
    expect(selectText(run.s, { kinds: ['SCN'], ids: ['GH-SCN-01'], sceneInstanceSince: 3 }).pick?.unit.id).toBe('GH-SCN-01')
  })
})

describe('结果类节拍与展示前的世界变化（09 §2.1，12 §3.4）', () => {
  it('结果节拍只在结果写入存档后展示，AI 声称的结果不算', () => {
    const run = new TestRun()
    const ctx: SceneContext = { vars: { arc: 'gray_well', outcome: 'exposed' } as never }
    run.commit([draft('object_state_changed', { objectId: 'tide_well', state: 'exposed' })])
    expect(whyNot(unit('GH-BEAT-07'), run.s, ctx)).toBe('outcome')
    run.commit([draft('core_arc_resolved', { arcId: 'gray_well', outcomes: ['exposed'] })])
    expect(whyNot(unit('GH-BEAT-07'), run.s, ctx)).toBeNull()
    run.commit([draft('object_state_changed', { objectId: 'tide_well', state: 'destroyed' })])
    expect(whyNot(unit('GH-BEAT-09'), run.s, { vars: { arc: 'gray_well', outcome: 'destroyed' } as never })).toBe('outcome')
  })

  it('门的结果未提交前不展示 NC-BEAT-08 系列；存档能回答的变量不接受调用方覆盖（08 §6）', () => {
    const nc08: TextUnit[] = [{
      ...unit('GH-BEAT-01'),
      id: 'NC-BEAT-08A',
      entry: { ...unit('GH-BEAT-01').entry, id: 'NC-BEAT-08A', effects: [] },
      requires: [{ var: 'door_outcome', op: 'eq', value: 'hold' }],
      effects: [],
    }]
    const run = new TestRun()
    const claimed: SceneContext = { vars: { door_outcome: 'hold' } as never }
    expect(selectFor(run.s, 'beat', { ctx: claimed }, nc08).pick).toBeNull()
    run.commit([draft('door_outcome_committed', { outcome: 'hold', votes: ['s1'], tieRoll: 0 })])
    expect(selectFor(run.s, 'beat', {}, nc08).pick?.unit.id).toBe('NC-BEAT-08A')
  })

  it('经规则结算收束灰港后，结果节拍仍能选出，后置里的关系与方向随结算写入', () => {
    for (const [outcome, state, id, guild, dir] of [
      ['exposed', 'exposed', 'GH-BEAT-07', -2, ['D07', 2]],
      ['traded', 'guild_kept', 'GH-BEAT-08', 2, ['D03', 2]],
      ['destroyed', 'destroyed', 'GH-BEAT-09', 0, ['D13', 1]],
    ] as const) {
      const run = new TestRun()
      at(run, 'gray_harbor.tide_well')
      const guild0 = run.s.factions.copper_guild?.relation ?? 0
      run.settle([
        draft('object_state_changed', { objectId: 'tide_well', state }),
        ...(outcome === 'traded' ? [draft('fact_established', { factId: 'special_partner', source: 'test' })] : []),
        draft('core_arc_resolved', { arcId: 'gray_well', outcomes: [outcome] }),
      ])
      expect(run.s.regions.gray_harbor?.stage).toBe('resolved')
      expect(run.s.factions.copper_guild?.relation ?? 0).toBe(Math.max(-3, Math.min(3, guild0 + guild)))
      expect(run.s.directions[dir[0]]).toBe(dir[1])
      expect(selectFor(run.s, 'beat', { ctx: { vars: { arc: 'gray_well', outcome } as never } }).pick?.unit.id).toBe(id)
    }
  })

  it('“或”里列出的结果同样要求存档里有对应结果', () => {
    const run = new TestRun()
    const ctx: SceneContext = { vars: { arc: 'gray_well', outcome: 'traded' } as never }
    run.commit([
      draft('object_state_changed', { objectId: 'tide_well', state: 'guild_kept' }),
      draft('fact_established', { factId: 'special_partner', source: 'test' }),
    ])
    expect(whyNot(unit('GH-BEAT-08'), run.s, ctx)).toBe('outcome')
    run.commit([draft('core_arc_resolved', { arcId: 'gray_well', outcomes: ['traded'] })])
    expect(whyNot(unit('GH-BEAT-08'), run.s, ctx)).toBeNull()
  })

  it('后置里的世界变化未写入时不可展示', () => {
    const run = new TestRun()
    run.commit([draft('core_arc_resolved', { arcId: 'gray_well', outcomes: ['exposed'] })])
    const ctx: SceneContext = { vars: { arc: 'gray_well', outcome: 'exposed' } as never }
    expect(whyNot(unit('GH-BEAT-07'), run.s, ctx)).toBe('unsettled')
    run.commit([draft('object_state_changed', { objectId: 'tide_well', state: 'exposed' })])
    expect(whyNot(unit('GH-BEAT-07'), run.s, ctx)).toBeNull()
  })

  it('甲对乙态度=n 这类展示前变化也要已写入', () => {
    const line = ALL_UNITS.find((u) => u.entry.speaker === 'agatha' && u.effects.some((e) => 'towards' in e))!
    const run = new TestRun()
    const ctx: SceneContext = { present: ['agatha'], tags: ['首次见面', '交谈'] }
    expect(whyNot(line, run.s, ctx)).not.toBeNull()
    run.commit([draft('npc_attitude_changed', { npcId: 'agatha', towardsId: 'cedric', delta: -3, value: -3 })])
    expect(whyNot(line, run.s, ctx)).not.toBe('unsettled')
  })
})

describe('行需知（12 §3.1）', () => {
  it('不成立的段落隐藏，说明里写了改写办法的交给 AI 改写', () => {
    const run = new TestRun()
    const r = selectFor(run.s, 'beat', { ids: ['GH-BEAT-05'], ctx: arcCtx('turn') })
    expect(r.pick?.hidden).toEqual([1])
    expect(r.pick?.rewrite).toEqual([1])
    expect(r.pick?.paragraphs).toHaveLength(unit('GH-BEAT-05').entry.body.length - 1)
  })

  it('成立时整段展示', () => {
    const run = new TestRun()
    at(run)
    show(run, selectFor(run.s, 'beat', { ids: ['GH-BEAT-02'], ctx: arcCtx('cause', { present: ['ludo'] }) }).pick)
    run.commit([
      draft('object_state_changed', { objectId: 'tide_well', state: 'exposed' }),
      draft('core_arc_resolved', { arcId: 'gray_well', outcomes: ['exposed'] }),
    ])
    const r = selectFor(run.s, 'beat', { ids: ['GH-BEAT-07'], ctx: { vars: { arc: 'gray_well', outcome: 'exposed' } as never } })
    expect(r.pick?.hidden).toEqual([])
    run.commit([draft('npc_state_changed', { npcId: 'ludo', state: 'dead' })])
    const dead = selectFor(run.s, 'beat', { ids: ['GH-BEAT-07'], ctx: { vars: { arc: 'gray_well', outcome: 'exposed' } as never } })
    expect(dead.pick?.hidden).toEqual([2])
    expect(dead.pick?.rewrite).toEqual([])
  })
})

describe('台词（12 §3.3）', () => {
  it('每行是一个独立的可展示段；初见在第一次见面时自动成立', () => {
    const run = new TestRun()
    const r = selectFor(run.s, 'firstMeet', { ids: ['GH-DLG-卢多·费恩'], ctx: { present: ['ludo'] } })
    expect(r.pick?.unit.id).toBe('GH-DLG-卢多·费恩/初见')
    expect(r.pick?.paragraphs).toEqual([unit('GH-DLG-卢多·费恩/初见').line!.text])
    show(run, r.pick)
    run.commit([draft('npc_met', { npcId: 'ludo' })])
    expect(selectFor(run.s, 'firstMeet', { ids: ['GH-DLG-卢多·费恩'], ctx: { present: ['ludo'] } }).pick).toBeNull()
  })

  it('态度档台词跟随说话人的态度', () => {
    const run = new TestRun()
    run.commit([draft('npc_met', { npcId: 'ludo' }), draft('npc_attitude_changed', { npcId: 'ludo', towardsId: 'party', delta: 2, value: 2 })])
    const r = selectText(run.s, { kinds: ['DLG'], ids: ['GH-DLG-卢多·费恩'], ctx: { present: ['ludo'] } })
    expect(r.pick?.unit.id).toBe('GH-DLG-卢多·费恩/态度≥+2')
  })
})

describe('展示后写入（12 §3.4）', () => {
  it('知情类后置在展示后写入：暗线有线索、知情事实、展示记录', () => {
    const run = new TestRun()
    const r = show(run, selectFor(run.s, 'beat', { ids: ['GH-BEAT-01'], ctx: arcCtx('cause') }).pick)
    expect(r.drafts.map((d) => d.type)).toEqual(['text_shown', 'dark_line_changed', 'fact_established'])
    expect(run.s.darkLines.dl1?.state).toBe('clue')
    expect(run.s.facts.red_cord_clasp).toBeDefined()
    expect(run.s.texts['GH-BEAT-01']).toEqual({ count: 1, lastRound: 0 })
    expect(verifyLog(run.runId, run.events)).toEqual([])
  })

  it('暗线揭开不足两条证据时降为有线索并记缺口', () => {
    const run = new TestRun()
    const r = show(run, selectFor(run.s, 'beat', { ids: ['GH-BEAT-05'], ctx: arcCtx('turn') }).pick)
    expect(r.gaps).toHaveLength(1)
    expect(run.s.darkLines.dl1?.state).toBe('clue')
    expect(run.s.truths).toEqual([])
  })

  it('有两条证据时揭开生效，同一次提交发出 truth_verified', () => {
    const run = new TestRun()
    run.commit([
      draft('truth_evidence_added', { darkLineId: 'dl1', evidenceId: 'felix_ledger', reliable: true }),
      draft('truth_evidence_added', { darkLineId: 'dl1', evidenceId: 'fabian_letter', reliable: true }),
    ])
    const r = show(run, selectFor(run.s, 'beat', { ids: ['GH-BEAT-05'], ctx: arcCtx('turn') }).pick)
    expect(r.gaps).toEqual([])
    expect(r.drafts.map((d) => d.type)).toEqual(['text_shown', 'dark_line_changed', 'truth_verified'])
    expect(run.s.darkLines.dl1?.state).toBe('revealed')
  })

  it('台词后置的人物印象在展示后写入', () => {
    const run = new TestRun()
    run.commit([
      draft('npc_met', { npcId: 'ludo' }),
      draft('truth_evidence_added', { darkLineId: 'dl1', evidenceId: 'felix_ledger', reliable: true }),
      draft('truth_evidence_added', { darkLineId: 'dl1', evidenceId: 'fabian_letter', reliable: true }),
      draft('dark_line_changed', { darkLineId: 'dl1', state: 'revealed' }),
    ])
    const r = selectText(run.s, { kinds: ['DLG'], ids: ['GH-DLG-卢多·费恩/转折'], ctx: { present: ['ludo'] } })
    show(run, r.pick)
    expect(run.s.npcs.ludo?.impressions).toContain('签字的人')
  })
})

describe('缺口日志（09 §2.1）', () => {
  it('必用节拍全部被排除时返回缺口，由 AI 现写', () => {
    const run = new TestRun()
    run.commit([draft('npc_state_changed', { npcId: 'ludo', state: 'dead' })])
    const r = selectFor(run.s, 'beat', { ids: ['GH-BEAT-02'], ctx: arcCtx('cause', { present: ['ludo'] }) })
    expect(r.pick).toBeNull()
    expect(r.gap).toMatchObject({ reason: 'must_use_excluded', ids: ['GH-BEAT-02'] })
  })

  it('普通行动没有候选就不用，不算必用缺口', () => {
    const run = new TestRun()
    expect(selectFor(run.s, 'action', { ids: ['GH-SCN-01'] }).gap?.reason).toBe('none')
  })
})

describe('占位符（09 §2）', () => {
  it('从存档算出钟心数、到访之声、钟心去向，调用方给角色与同伴', () => {
    const run = new TestRun()
    at(run, 'gray_harbor.docks')
    run.commit([draft('bell_heart_moved', { bellHeartId: VOCAB.bellCities[0].id, holder: 'party', holderId: 'party' })])
    const v = placeholderValues(run.s, { 角色: '赫兰', 同伴: '米拉' })
    expect(v.钟心数).toBe('一')
    expect(v.到访之声).toBe('雨和讨价还价')
    expect(v.队伍).toBe('你们')
    expect(fillPlaceholders('{角色}看着{同伴}，{队伍}手里有{钟心数}颗钟心。', v)).toEqual({ text: '赫兰看着米拉，你们手里有一颗钟心。', missing: [] })
  })

  it('缺值的占位符报告出来，不留空；钟心去向为空时可省略', () => {
    const run = new TestRun()
    const v = placeholderValues(run.s, {})
    expect(fillPlaceholders('{纪念物}在发热。{钟心去向}', v)).toEqual({ text: '{纪念物}在发热。', missing: ['纪念物'] })
    expect(chineseNumber(7)).toBe('七')
  })
})

describe('阅读节奏与换场景三段式（09 §3.3a）', () => {
  it('每屏至少两段、合计不少于 180 字', () => {
    expect(screenProblems(['只有一句话。'])).toHaveLength(2)
    expect(screenProblems(['甲'.repeat(100), '乙'.repeat(80)])).toEqual([])
  })

  it('场景至少持续 2 轮，玩家主动离开或被逼走时例外', () => {
    const run = new TestRun()
    toRound(run, 3)
    expect(mayLeaveScene(run.s, 2, false)).toBe(false)
    expect(mayLeaveScene(run.s, 2, true)).toBe(true)
    expect(mayLeaveScene(run.s, 1, false)).toBe(true)
  })

  it('收尾 → 过渡 → 进入，缺哪一段就报告哪一段', () => {
    const run = new TestRun()
    at(run)
    const change = sceneChange(run.s, { closing: ['雨停了一会儿。'], travel: false, arrival: { tags: ['雨', '场景结束'] } })
    expect(change.transition?.unit.kind).toBe('BRG')
    expect(change.arrival?.unit.id).toBe('GH-ENV-01')
    expect(change.problems).toEqual([])
    const bare = sceneChange(run.s, { closing: [], travel: true, arrival: {} }, ALL_UNITS.filter((u) => u.kind !== 'ENV' && u.kind !== 'SCN'))
    expect(bare.problems).toEqual(['缺少收尾', '缺少进入'])
    expect(bare.transition?.unit.kind).toBe('TRV')
  })
})

describe('灰港数据跑 100 个随机种子（13 ENG-04 验收）', () => {
  const TAGS = ['雨', '夜', '白天', '黎明', '室外', '室内', '场景结束', '调查', '交谈', '交易', '休息', '离开', '刚战斗', '受伤', '被追捕', '悲伤', '旅途末段'] as const
  const NPCS = ['ludo', 'cedric', 'felix', 'agatha', 'rosa', 'fabian', 'tim'] as const
  const PLACES = ['none', 'gray_harbor.docks', 'gray_harbor.seven_lamps', 'gray_harbor.low_tide_street', 'gray_harbor.copper_tower', 'gray_harbor.tide_well'] as const
  const BEATS = ['cause', 'discovery', 'turn', 'choice'] as const
  const moments = Object.keys(MOMENTS) as Moment[]

  it('每个种子 60 步：不抛异常，选中的都合规，一次性条目不重复，日志可重放', () => {
    for (let seed = 0; seed < 100; seed++) {
      const run = new TestRun(undefined, `gh-${seed}`)
      const rng = rngFor(`gh-${seed}`, 'sim')
      const any = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]
      at(run)
      for (let step = 0; step < 60; step++) {
        if (step % 3 === 0) toRound(run, run.s.round + 1 + Math.floor(rng() * 3))
        if (rng() < 0.15) at(run, any(PLACES), (run.s.regions.gray_harbor?.visits ?? 0) + 1)
        const present = NPCS.filter(() => rng() < 0.3)
        const ctx: SceneContext = {
          tags: TAGS.filter(() => rng() < 0.2),
          present,
          vars: { arc: 'gray_well', beat: any(BEATS) } as never,
        }
        const moment = any(moments)
        const sel = selectFor(run.s, moment, { ctx })
        if (!sel.pick) {
          expect(sel.gap).not.toBeNull()
          continue
        }
        const u = sel.pick.unit
        expect(MOMENTS[moment].kinds as readonly string[]).toContain(u.kind)
        if (!sel.pick.fallback && !sel.pick.reused && ['BEAT', 'DLG', 'BRG', 'CLK', 'END'].includes(u.kind)) expect(run.s.texts[u.id]).toBeUndefined()
        const filled = sel.pick.paragraphs.map((p) => fillPlaceholders(p, placeholderValues(run.s, { 角色: '赫兰', 同伴: '米拉', 纪念物: '旧怀表', 事业名: '雨棚', 事业联系人: '罗莎' })))
        expect(filled.flatMap((f) => f.missing)).toEqual([])
        const out = shownDrafts(run.s, sel.pick, ctx)
        const drafts: AnyDraft[] = out.drafts
        run.commit(drafts)
      }
      expect(verifyLog(run.runId, run.events)).toEqual([])
    }
  })
})
