import { describe, expect, it } from 'vitest'
import { judgeAchievements } from '../achievements'
import { CONFIG } from '../config'
import { attitudeOf } from '../rules/conditions'
import { summarizeRun } from './ending'
import { fakeModel } from '../ai/fake'
import { ModelUnavailable, type ModelCall } from '../ai/turn'
import { commitIntent, draft } from '../events'
import { availableDirections, endingCandidates, tierOpen } from '../rules/directions'
import { seatsReach } from '../rules/choices'
import { act, adjudicate, canWrapUp, currentMember, interact, joinTable, leaveSeat, move, openTable, resolveArc, roll, snapshotOf, vote, wrapUp, type Member, type Table } from './table'
import { applyOp } from './ops'
import { npcName, presentAt } from './world'

/**
 * 12 §12 acceptance scripts walked on the table itself. Elsewhere: A1 in table.test.ts; A7–A8
 * for rooms, and A9 (binding, export and import) in server/; A10's cap and Beijing midnight in
 * server/budget.test.ts; A11 in src/ui/reading/pages.test.ts; A12 in the browser scripts.
 */

const HELAN: Member = { seatId: 's1', actorId: 'helan', name: '哈兰', stats: { str: 2, dex: 0, ins: 1, soc: -1 }, controller: 'human' }
const o = { now: () => '2026-11-12T00:00:00.000Z', rng: () => 0.5 }
const HIT = [6, 6] as const
const SOCIAL = ['和{}聊聊近况', '帮{}一个小忙', '和{}做一笔小买卖', '冒充商会的人去骗{}']
const PLACES = ['gray_harbor.seven_lamps', 'gray_harbor.low_tide_street', 'gray_harbor.council_hall', 'gray_harbor.docks', 'gray_harbor.copper_tower', 'gray_harbor.silver_tongue_auction'] as const

/** One offline action, rolling any check with `dice` and skipping any interaction. */
async function doing(t: Table, text: string, dice: readonly [number, number] = HIT): Promise<Table> {
  let x = await act(t, text, null, o)
  while (x.pending) {
    if (x.pending.kind === 'check') x = await roll(x, null, o, dice)
    else if (x.pending.kind === 'interaction') x = interact(x, { requestId: `ix-${x.n}`, instanceId: x.pending.instanceId, action: 'skip', params: { inspected: [] } }, o).table
    else break
  }
  return x
}

/** Errands with the people around Grayport, place by place, until every seat has `n` choices. */
async function untilChoices(t0: Table, n: number): Promise<Table> {
  let t = t0
  const done = () => seatsReach(snapshotOf(t), n)
  for (let lap = 0; !done() && lap < 10; lap++) {
    for (const place of PLACES) {
      if (done()) break
      if (snapshotOf(t).location?.placeId !== place) t = move(t, place, o)
      for (const npc of presentAt(snapshotOf(t), place)) {
        for (const errand of SOCIAL) if (!done()) t = await doing(t, `${errand.replace('{}', npcName(npc))}（第 ${lap + 1} 回）`, lap % 2 ? [1, 1] : HIT)
      }
    }
  }
  expect(done()).toBe(true)
  return t
}

const untilR1 = (t: Table) => untilChoices(t, CONFIG.minChoicesPerSeat)

/** One AI-hosted action, rolling any check with a hit and skipping any interaction. */
async function aiStep(x: Table, text: string, model: ModelCall): Promise<Table> {
  let y = await act(x, text, model, o)
  while (y.pending?.kind === 'check' || y.pending?.kind === 'interaction') {
    y = y.pending.kind === 'check' ? await roll(y, model, o, HIT) : interact(y, { requestId: `ix-${y.n}`, instanceId: y.pending.instanceId, action: 'skip', params: { inspected: [] } }, o).table
  }
  return y
}

/** Follows the well: Ludo at the docks for the cause, Felix's ledger for the discovery, then the well. */
async function toChoice(t0: Table, model: ModelCall): Promise<Table> {
  let t = t0
  for (let i = 0; i < 80 && !snapshotOf(t).arcs.gray_well?.beats.includes('choice'); i++) {
    const s = snapshotOf(t)
    const beats = s.arcs.gray_well?.beats ?? []
    const want = !beats.includes('cause') && presentAt(s, 'gray_harbor.docks').length ? 'gray_harbor.docks' : !beats.includes('discovery') ? 'gray_harbor.silver_tongue_auction' : 'gray_harbor.tide_well'
    if (s.location?.placeId !== want) t = move(t, want, o)
    else t = await aiStep(t, `追查潮井的事（${i}）`, model)
  }
  expect(snapshotOf(t).arcs.gray_well?.beats).toContain('choice')
  return t
}

describe('12 §12 acceptance', () => {
  it('A2: a tavern in Grayport, run until stable, ends on D01 settled with the business axis and SB01/SB02', async () => {
    let t = openTable({ runId: 'run-a2', seed: 'a2', party: [HELAN], openingHook: 'memento' }, o)
    t = await doing(t, '在七灯酒馆旁边盘下一间铺子，开一家自己的小酒馆')
    expect(snapshotOf(t).projects.tavern?.stage).toBe('idea')

    t = await doing(t, '把酒馆开起来')
    expect(snapshotOf(t).projects.tavern?.stage).toBe('idea')
    const contact = presentAt(snapshotOf(t), snapshotOf(t).location!.placeId)[0]
    t = await doing(t, `和${npcName(contact)}聊聊开店的事`)
    expect(attitudeOf(snapshotOf(t), contact)).toBeGreaterThanOrEqual(1)

    t = await doing(t, '把酒馆开起来', [1, 1])
    expect(snapshotOf(t).projects.tavern?.stage).toBe('idea')
    t = await doing(t, '再凑一笔本钱，把酒馆开起来')
    expect(snapshotOf(t).projects.tavern).toMatchObject({ stage: 'founded', contactId: contact, name: '酒馆' })

    for (let i = 0; i < CONFIG.projectOperationalActions; i++) t = await doing(t, `照看酒馆的生意（第 ${i + 1} 天）`)
    expect(snapshotOf(t).projects.tavern?.stage).toBe('operational')

    t = await doing(t, '照看酒馆的生意（又一天）')
    expect(snapshotOf(t).projects.tavern).toMatchObject({ stage: 'stable', risks: [expect.objectContaining({ risk: 'brawl', weathered: true })] })

    t = await untilR1(t)
    expect(snapshotOf(t).arcs.gray_well?.outcomes ?? null).toBeNull()
    t = await adjudicate(wrapUp(t, o), null, o)
    const s = snapshotOf(t)
    expect(s.ending).toMatchObject({ directionId: 'D01', variant: 'settle' })
    const sum = summarizeRun(s, t.events)
    expect(sum.axes!.world).toBe('未决')
    expect(sum.axes!.projects).toContain('酒馆')
    expect(sum.axes!.projects).toContain(npcName(contact))
    expect(sum.axes!.projects).toContain('斗殴')
    const got = judgeAchievements(s, t.events).map((a) => a.achievementId)
    expect(got).toEqual(expect.arrayContaining(['SB01', 'SB02']))
  })

  it('A3: the well exposed before clock 4 reveals line one on two pieces of evidence, unlocks ST03/ST05, and the clock shows 4B', async () => {
    const model = fakeModel({ seed: 'a3', strayRate: 0 })
    let t = await toChoice(openTable({ runId: 'run-a3', seed: 'a3', party: [HELAN], openingHook: 'memento' }, o), model)
    const before = snapshotOf(t)
    expect(before.arcs.gray_well?.beats).toContain('choice')
    expect(before.clock.value).toBeLessThan(4)
    expect(before.darkLines.dl1?.evidence.length).toBeGreaterThanOrEqual(2)
    expect(before.darkLines.dl1?.state).toBe('revealed')
    expect(t.events.some((e) => e.type === 'truth_verified' && (e.payload as { truthId: string }).truthId === 'merchant_memory_well')).toBe(true)

    const d07 = before.directions.D07 ?? 0
    t = resolveArc(t, ['exposed'], o)
    const s = snapshotOf(t)
    expect(s.directions.D07).toBeGreaterThan(d07)
    expect(s.factions.copper_guild).toMatchObject({ state: 'thwarted' })
    expect(s.factions.copper_guild!.relation).toBeLessThan(before.factions.copper_guild?.relation ?? 0)
    expect(judgeAchievements(s, t.events).map((a) => a.achievementId)).toEqual(expect.arrayContaining(['ST03', 'ST05']))

    for (let i = 0; i < 200 && snapshotOf(t).clock.value < 4; i++) t = await aiStep(t, `在灰港四处走动（${i}）`, model)
    expect(snapshotOf(t).clock.value).toBeGreaterThanOrEqual(4)
    expect(t.screens.map((x) => x.textId)).toContain('GEN-CLK-04B')
  })

  it('A4: trading the well to the guild makes them special partners; D03 is a candidate and GH-BEAT-08 waits for the result', async () => {
    const model = fakeModel({ seed: 'a4', strayRate: 0 })
    let t = await toChoice(openTable({ runId: 'run-a4', seed: 'a4', party: [HELAN], openingHook: 'memento' }, o), model)
    expect(t.screens.map((x) => x.textId)).not.toContain('GH-BEAT-08')
    t = resolveArc(t, ['traded'], o)
    const s = snapshotOf(t)
    const at = t.events.findIndex((e) => e.type === 'core_arc_resolved')
    const shown = t.events.findIndex((e) => e.type === 'text_shown' && (e.payload as { textId: string }).textId === 'GH-BEAT-08')
    expect(shown).toBeGreaterThan(at)
    expect(s.facts).toHaveProperty('special_partner')
    t = await untilChoices(t, CONFIG.tierChoices[0])
    expect(tierOpen(snapshotOf(t), 1)).toBe(true)
    expect(availableDirections(snapshotOf(t))).toContain('D03')
    expect(endingCandidates(snapshotOf(t))).toContain('D03')
  })

  it('A5: with Ludo dead, his beat and lines are gone, GH-BEAT-07 drops its second paragraph, and the AI cannot move him', async () => {
    const ludoSpeaks = (text: string) => async () => ({ seq: 1, text: JSON.stringify({ narration: text, intents: ['交谈'], emotion: '悲伤', suggestions: ['一', '二', '三'], proposals: [{ kind: 'attitude', npcId: 'ludo', delta: 1 }] }) })
    let t = openTable({ runId: 'run-a5', seed: 'a5', party: [HELAN], openingHook: 'memento' }, o)
    t = { ...t, events: commitIntent(t.events, 'side:ludo', [draft('npc_state_changed', { npcId: 'ludo', state: 'dead' })], { runId: t.runId, committedAt: o.now() }).events }
    t = move(t, 'gray_harbor.docks', o)
    expect(presentAt(snapshotOf(t), 'gray_harbor.docks')).not.toContain('ludo')
    const said = await act(t, '在码头问问卢多', ludoSpeaks('卢多抬起头说：“你们来晚了。”'.repeat(4)), o)
    expect(snapshotOf(said).npcs.ludo?.attitude).toBe(snapshotOf(t).npcs.ludo?.attitude)
    expect(said.gaps).toContain('丢弃 attitude 提案：人物 ludo 不在本场景清单')
    expect(said.gaps.some((g) => g.includes('卢多'))).toBe(true)

    t = await toChoice(t, fakeModel({ seed: 'a5', strayRate: 0 }))
    const ids = t.screens.map((x) => x.textId)
    expect(ids).not.toContain('GH-BEAT-02')
    expect(t.screens.flatMap((x) => x.paragraphs).join('')).not.toMatch(/卢多[^，。]*说|“[^”]*”[^。]*卢多/)
    t = resolveArc(t, ['exposed'], o)
    const beat = t.screens.find((x) => x.textId === 'GH-BEAT-07')
    expect(beat).toBeDefined()
    expect(beat!.paragraphs.join('')).not.toContain('卢多')
  })

  it('A6: left alone, the clock reaches 12; the world crisis starts without forcing the end, worsens every 2 rounds, and D02 opens', async () => {
    const model = fakeModel({ seed: 'a6', strayRate: 0 })
    let t = openTable({ runId: 'run-a6', seed: 'a6', party: [HELAN], openingHook: 'memento' }, o)
    for (let i = 0; i < 600 && !snapshotOf(t).clock.crisis; i++) {
      const here = snapshotOf(t).location?.placeId
      t = i % 4 === 3 ? move(t, PLACES.find((p) => p !== here)!, o) : await aiStep(t, `在灰港闲逛，不去碰潮井（${i}）`, model)
    }
    const s = snapshotOf(t)
    expect(s.clock).toMatchObject({ value: 12, crisis: true })
    expect(s.arcs.gray_well?.outcomes ?? null).toBeNull()
    expect(s.act).toBeLessThan(4)
    expect(s.ending).toBeNull()
    const crisisRounds = () => snapshotOf(t).round - snapshotOf(t).clock.crisisStartedRound!
    for (let i = 0; crisisRounds() < CONFIG.crisisEscalateEvery; i++) t = await aiStep(t, `在危机里找口饭吃（${i}）`, model)
    expect(t.screens.map((x) => x.textId)).toContain('GEN-CLK-12B')
    for (let n = 1; n <= 2; n++) {
      for (let i = 0; crisisRounds() < CONFIG.crisisEscalateEvery * (n + 1); i++) t = await aiStep(t, `在危机里撑下去（${n}-${i}）`, model)
      expect(snapshotOf(t).clock.crisisStep).toBe(n)
    }
    expect(snapshotOf(t).ending).toBeNull()
    t = await untilR1(t)
    expect(availableDirections(snapshotOf(t))).toContain('D02')
  })

  it('A7: a third player joining at round 20 counts from the lowest seat', async () => {
    const FUHE: Member = { seatId: 's2', actorId: 'fuhe', name: '芙蕾雅', stats: { str: 0, dex: 1, ins: 2, soc: -1 }, controller: 'human' }
    const QILAN: Member = { seatId: 's3', actorId: 'qilan', name: '基兰', stats: { str: -1, dex: 1, ins: 2, soc: 0 }, controller: 'human' }
    let t = openTable({ runId: 'run-a7', seed: 'a7', party: [HELAN, FUHE], openingHook: 'memento' }, o)
    for (let i = 0; snapshotOf(t).round < 20 && i < 200; i++) {
      const s = snapshotOf(t)
      const npc = presentAt(s, s.location!.placeId)[i % 2]
      t = i % 6 === 5 ? move(t, PLACES[(i / 6 | 0) % PLACES.length] === s.location?.placeId ? PLACES[((i / 6 | 0) + 1) % PLACES.length] : PLACES[(i / 6 | 0) % PLACES.length], o) : await doing(t, `${SOCIAL[i % SOCIAL.length].replace('{}', npc ? npcName(npc) : '路人')}（${i}）`)
    }
    const before = snapshotOf(t)
    const low = Math.min(before.seats.s1.choices, before.seats.s2.choices)
    expect(t.checkpoints.length).toBeGreaterThan(0)
    t = joinTable(t, QILAN, o)
    expect(snapshotOf(t).seats.s3).toMatchObject({ choices: low, ownChoices: 0, mustOwn: true })
    expect(t.checkpoints).toEqual([])
    expect(() => joinTable(t, { ...QILAN, seatId: 's4' }, o)).toThrow()
    expect(t.party.map((m) => m.seatId)).toEqual(['s1', 's2', 's3'])
  })

  it('A7: with the counts already met, the late seat still blocks the end until its own 6', async () => {
    const QILAN: Member = { seatId: 's2', actorId: 'qilan', name: '基兰', stats: { str: -1, dex: 1, ins: 2, soc: 0 }, controller: 'human' }
    let t = await untilR1(openTable({ runId: 'run-a7b', seed: 'a7b', party: [HELAN], openingHook: 'memento' }, o))
    t = joinTable(t, QILAN, o)
    expect(snapshotOf(t).seats.s2.choices).toBe(snapshotOf(t).seats.s1.choices)
    expect(canWrapUp(t)).toBe(false)
    for (let i = 0; snapshotOf(t).seats.s2.ownChoices < CONFIG.minOwnChoicesAfterJoin && i < 60; i++) {
      const s = snapshotOf(t)
      if (currentMember(t).seatId === 's1') { t = await doing(t, `等一等新来的同伴（${i}）`); continue }
      expect(canWrapUp(t)).toBe(false)
      const npc = presentAt(s, s.location!.placeId)[0]
      t = i % 5 === 4 ? move(t, PLACES.find((p) => p !== s.location?.placeId)!, o) : await doing(t, `${SOCIAL[i % SOCIAL.length].replace('{}', npc ? npcName(npc) : '路人')}（新人 ${i}）`)
    }
    expect(canWrapUp(t)).toBe(true)
  })

  it('R4 online: closing the story waits for every player at the table; one no keeps it going', async () => {
    const QILAN: Member = { seatId: 's2', actorId: 'qilan', name: '基兰', stats: { str: -1, dex: 1, ins: 2, soc: 0 }, controller: 'human' }
    const models = { turn: null, ending: null }
    let t = await untilR1(openTable({ runId: 'run-r4', seed: 'r4', party: [HELAN], openingHook: 'memento', mode: 'online' }, o))
    t = joinTable(t, QILAN, o)
    for (let i = 0; !canWrapUp(t) && i < 60; i++) {
      const s = snapshotOf(t)
      if (currentMember(t).seatId === 's1') { t = await doing(t, `等一等新来的同伴（${i}）`); continue }
      const npc = presentAt(s, s.location!.placeId)[0]
      t = i % 5 === 4 ? move(t, PLACES.find((p) => p !== s.location?.placeId)!, o) : await doing(t, `${SOCIAL[i % SOCIAL.length].replace('{}', npc ? npcName(npc) : '路人')}（新人 ${i}）`)
    }
    expect(canWrapUp(t)).toBe(true)
    while (currentMember(t).seatId !== 's1') t = await doing(t, '再等一等')

    const asked = (await applyOp(t, { t: 'wrap' }, 's1', models, o)).table
    expect(asked.pending).toMatchObject({ kind: 'wrap', by: 's1', agreed: ['s1'] })
    expect(snapshotOf(asked).act).toBe(snapshotOf(t).act)
    await expect(applyOp(asked, { t: 'act', text: '趁机行动' }, 's1', models, o)).rejects.toThrow('表决')
    expect(() => joinTable(asked, { ...QILAN, seatId: 's3', actorId: 'other' }, o)).toThrow('表决')

    const refused = vote(asked, 's2', false, o)
    expect(refused.pending).toBeNull()
    expect(refused.events).toBe(t.events)
    expect(refused.screens.at(-1)?.paragraphs[0]).toBe('基兰不同意收束。')

    const again = (await applyOp(refused, { t: 'wrap' }, 's2', models, o)).table
    const closed = (await applyOp(again, { t: 'vote', agree: true }, 's1', models, o)).table
    expect(closed.pending?.kind).toBe('ending')
    expect(snapshotOf(closed).act).toBe(4)
    // The only one still to answer leaves: everyone left has agreed, so the story closes.
    expect(leaveSeat(again, 's1', o).pending?.kind).toBe('ending')
    // The one who asked leaves: the proposal goes with them.
    expect(leaveSeat(again, 's2', o).pending).toBeNull()
  })

  it('A10: with the host out of budget the turn is hosted offline and the reason is kept for the notice', async () => {
    const spent: ModelCall = async () => { throw new ModelUnavailable(429, '今天的 AI 费用已到上限') }
    const t = await act(openTable({ runId: 'run-a10', seed: 'a10', party: [HELAN], openingHook: 'memento' }, o), '四处打听消息', spent, o)
    expect(t.gaps).toContain('AI 不可用（429）：今天的 AI 费用已到上限')
    expect(t.responses).toEqual([])
    expect(t.screens.at(-1)?.paragraphs.length).toBeGreaterThan(0)
  })
})
