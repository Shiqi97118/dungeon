import { describe, expect, it } from 'vitest'
import { fakeModel } from '../ai/fake'
import type { ModelCall } from '../ai/turn'
import { CONFIG } from '../config'
import { verifyLog } from '../events'
import { r1Met } from '../rules/choices'
import { d01Variant } from '../rules/directions'
import { hitAt, rollCheck } from './check'
import { act, canWrapUp, chooseEnding, interact, move, openTable, resolveArc, roll, snapshotOf, wrapUp, type Member, type Table } from './table'

const HELAN: Member = { seatId: 's1', actorId: 'helan', name: '哈兰', stats: { str: 2, dex: 0, ins: 1, soc: -1 }, controller: 'human' }
const o = { now: () => '2026-11-12T00:00:00.000Z', rng: () => 0.5 }
const open = (seed = 'seed-1') => openTable({ runId: 'run-play', seed, party: [HELAN], openingHook: 'memento' }, o)
const textIds = (t: Table) => t.screens.map((x) => x.textId).filter(Boolean)

/** Replies with the same proposal every time, so the same action repeats exactly. */
const sameModel = (proposal: object): ModelCall => {
  let seq = 0
  return async () => ({
    seq: ++seq,
    text: JSON.stringify({ narration: '你又照原样做了一遍。'.repeat(12), intents: ['交谈'], emotion: '谨慎', suggestions: ['一', '二', '三'], proposals: [proposal] }),
  })
}

describe('check', () => {
  it('difficulty 12 is the ordinary 10+ hit and moves one step per 3 points', () => {
    expect([hitAt(9), hitAt(12), hitAt(15), hitAt(18)]).toEqual([9, 10, 11, 12])
    const req = { skill: '洞察', difficulty: 12, reason: '' }
    expect(rollCheck(req, 'ins', 1, [5, 4]).tier).toBe('hit')
    expect(rollCheck(req, 'ins', 1, [3, 3]).tier).toBe('partial')
    expect(rollCheck(req, 'ins', 1, [1, 2]).tier).toBe('miss')
  })
})

const ERRANDS = ['四处打听消息', '帮人搬货', '和老板讨价还价', '把见闻记下来', '偷偷跟着一个陌生人', '找个地方歇歇脚', '在钟前祈祷']

describe('table', () => {
  it('opens on the rainy dusk at the Seven Lamps with the opening beats and the hook', () => {
    const t = open()
    const s = snapshotOf(t)
    expect(textIds(t).slice(0, 3)).toEqual(['GEN-BEAT-01', 'GEN-BEAT-02', 'GEN-BEAT-06'])
    expect(textIds(t)).toContain('GH-ENV-01')
    expect(s.round).toBe(1)
    expect(s.location).toEqual({ regionId: 'gray_harbor', placeId: 'gray_harbor.seven_lamps' })
    expect(s.ambience).toEqual({ time: '黄昏', weather: '雨' })
    expect(s.npcs.rosa?.met).toBe(true)
    expect(verifyLog('run-play', t.events)).toEqual([])
  })

  it('an action is narrated, opens the first beat, counts, and moves the round on', async () => {
    const t = await act(open(), '向罗莎打听最近低潮街的怪病', fakeModel({ seed: 'a' }), o)
    const s = snapshotOf(t)
    expect(t.screens.some((x) => x.kind === 'narration')).toBe(true)
    expect(textIds(t)).toContain('GH-BEAT-01')
    expect(s.arcs.gray_well?.beats).toEqual(['cause'])
    expect(s.round).toBe(2)
    expect(s.seats.s1.choices).toBe(1)
    expect(t.events.some((e) => e.sourceIntentId === 'ai:1')).toBe(true)
  })

  it('a check pauses for the roll, then a second call narrates the result', async () => {
    const contents: string[] = []
    const base = fakeModel({ seed: 'c', checkRate: 1 })
    const model: ModelCall = (req) => (contents.push(req.content), base(req))
    const paused = await act(open(), '撬开地窖的锁', model, o)
    expect(paused.pending?.kind).toBe('check')
    expect(snapshotOf(paused).round).toBe(1)
    await expect(act(paused, '再做一件事', model, o)).rejects.toThrow()
    const t = await roll(paused, model, o, [6, 6])
    expect(t.pending).toBeNull()
    expect(contents[1]).toContain('【检定结果】')
    expect(contents[1]).toContain('掷出 6+6')
    expect(t.screens.some((x) => x.kind === 'roll')).toBe(true)
    expect(t.responses).toHaveLength(2)
    expect(t.events.some((e) => e.sourceIntentId === 'ai:2')).toBe(true)
  })

  it('moving plays closing, transition and arrival, and meets who is there', () => {
    const t = move(open(), 'gray_harbor.docks', o)
    const s = snapshotOf(t)
    const moved = t.screens.slice(t.screens.findIndex((x) => x.id.startsWith('move:')))
    expect(moved[0].kind).toBe('narration')
    expect(moved.filter((x) => x.kind === 'text').length).toBeGreaterThanOrEqual(2)
    expect(s.location?.placeId).toBe('gray_harbor.docks')
    expect(s.npcs.ludo?.met).toBe(true)
    expect(s.seats.s1.choices).toBe(1)
  })

  it('the same action in the same place does not count twice', async () => {
    const model = sameModel({ kind: 'attitude', npcId: 'rosa', delta: 1, reason: '客气' })
    let t = await act(open(), '跟罗莎寒暄', model, o)
    t = await act(t, '跟罗莎寒暄', model, o)
    expect(snapshotOf(t).seats.s1.choices).toBe(1)
  })

  it('the ledger opens the evidence interaction at the auction house, and a skip leaves a check', async () => {
    const model = fakeModel({ seed: 'l' })
    let t = await act(open(), '打听怪病', model, o)
    t = move(t, 'gray_harbor.silver_tongue_auction', o)
    for (let i = 0; i < 4 && t.pending?.kind !== 'interaction'; i++) t = await act(t, `四处看看 ${i}`, model, o)
    expect(t.pending).toMatchObject({ kind: 'interaction', textId: 'GH-BEAT-04' })
    const p = t.pending as Extract<Table['pending'], { kind: 'interaction' }>
    const { table, result } = interact(t, { requestId: 'ix-1', instanceId: p.instanceId, action: 'skip', params: { inspected: [] } }, o)
    expect(result.check).toMatchObject({ skill: '洞察', difficulty: 12 })
    expect(table.pending?.kind).toBe('check')
    const done = await roll(table, null, o, [5, 5])
    expect(done.pending).toBeNull()
    expect(snapshotOf(done).darkLines.dl1?.evidence.map((e) => e.id)).toContain('felix_ledger')
  })

  it('a bought invitation schedules the banquet, and the tower opens the gesture interaction', async () => {
    const model = sameModel({ kind: 'fact', factId: 'bought_invitation_from_felix', reason: '从菲利克斯手里买下请柬' })
    let t = move(open('banquet'), 'gray_harbor.silver_tongue_auction', o)
    t = await act(t, '向菲利克斯买一张请柬', model, o)
    expect(textIds(t)).toContain('GH-SCN-10')
    while (t.pending?.kind === 'interaction' && t.pending.textId !== 'GH-SCN-09') {
      t = interact(t, { requestId: `skip-${t.n}`, instanceId: t.pending.instanceId, action: 'skip', params: { inspected: [] } }, o).table
      if (t.pending?.kind === 'check') t = await roll(t, null, o, [4, 4])
    }
    expect(snapshotOf(t).objects.tower_banquet).toBe('tonight')
    t = move(t, 'gray_harbor.copper_tower', o)
    expect(t.pending).toMatchObject({ kind: 'interaction', textId: 'GH-SCN-09' })
    const p = t.pending as Extract<Table['pending'], { kind: 'interaction' }>
    const { table, result } = interact(t, { requestId: 'feast', instanceId: p.instanceId, action: 'complete', params: { inspected: ['envoy:toast', 'professor:silence', 'grayrobe:token'] } }, o)
    expect(result.outcome).toBe('completed')
    const s = snapshotOf(table)
    expect(s.objects.tower_banquet).toBe('held')
    expect(s.factions.kalvis_crown?.contacted).toBe(true)
    expect(table.pending).toBeNull()
  })

  it('A1: only D01 after 31 choices of wandering, and no wrap-up before', async () => {
    let t = open('a1')
    const model = fakeModel({ seed: 'a1', strayRate: 0 })
    const places = ['gray_harbor.seven_lamps', 'gray_harbor.low_tide_street', 'gray_harbor.council_hall', 'gray_harbor.docks'] as const
    for (let i = 0; !r1Met(snapshotOf(t)) && i < 200; i++) {
      expect(canWrapUp(t)).toBe(false)
      expect(() => wrapUp(t, o)).toThrow()
      if (t.pending?.kind === 'interaction') t = interact(t, { requestId: `ix-${i}`, instanceId: t.pending.instanceId, action: 'skip', params: { inspected: [] } }, o).table
      else if (t.pending?.kind === 'check') t = await roll(t, model, o)
      else if (i % 5 === 4) t = move(t, places[(i / 5) % places.length | 0] === snapshotOf(t).location?.placeId ? places[((i / 5 | 0) + 1) % places.length] : places[(i / 5 | 0) % places.length], o)
      else t = await act(t, `${ERRANDS[i % ERRANDS.length]}（第 ${i} 件小事）`, model, o)
    }
    expect(snapshotOf(t).seats.s1.choices).toBe(CONFIG.minChoicesPerSeat)
    expect(snapshotOf(t).arcs.gray_well?.outcomes ?? null).toBeNull()
    t = wrapUp(t, o)
    expect(t.pending).toEqual({ kind: 'ending', candidates: ['D01'] })
    t = chooseEnding(t, 'D01', null, o)
    expect(snapshotOf(t).ending).toMatchObject({ directionId: 'D01', variant: d01Variant(snapshotOf(t)).variant, worldResolution: 'unresolved' })
    expect(verifyLog('run-play', t.events)).toEqual([])
  })

  it('resolving the well shows the result beat only after the outcome is written', async () => {
    let t = open('arc')
    const model = fakeModel({ seed: 'arc', strayRate: 0 })
    expect(() => resolveArc(t, ['exposed'], o)).toThrow()
    for (let i = 0; i < 40 && !snapshotOf(t).arcs.gray_well?.beats.includes('choice'); i++) {
      if (t.pending?.kind === 'interaction') t = interact(t, { requestId: `ix-${i}`, instanceId: t.pending.instanceId, action: 'skip', params: { inspected: [] } }, o).table
      else if (t.pending?.kind === 'check') t = await roll(t, model, o)
      else t = await act(t, `追查潮井 ${i}`, model, o)
    }
    expect(snapshotOf(t).arcs.gray_well?.beats).toContain('choice')
    expect(textIds(t)).not.toContain('GH-BEAT-07')
    t = resolveArc(t, ['exposed'], o)
    const s = snapshotOf(t)
    expect(s.arcs.gray_well?.outcomes).toEqual(['exposed'])
    expect(s.objects.tide_well).toBe('exposed')
    expect(textIds(t)).toContain('GH-BEAT-07')
  })
})
