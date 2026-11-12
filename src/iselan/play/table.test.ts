import { describe, expect, it } from 'vitest'
import { fakeModel } from '../ai/fake'
import type { ModelCall } from '../ai/turn'
import { CONFIG } from '../config'
import { reduceEvents, verifyLog } from '../events'
import { r1Met } from '../rules/choices'
import { d01Variant } from '../rules/directions'
import { hitAt, rollCheck } from './check'
import { loadTable, packTable, saveTable, unpackTable } from './persist'
import { chronicleOf, summarizeRun } from './ending'
import { act, adjudicate, canWrapUp, proposeRewind, vote, interact, move, openTable, resolveArc, rewind, roll, snapshotOf, wrapUp, type EndingCall, type Member, type Table } from './table'

const HELAN: Member = { seatId: 's1', actorId: 'helan', name: '哈兰', stats: { str: 2, dex: 0, ins: 1, soc: -1 }, controller: 'human' }
const o = { now: () => '2026-11-12T00:00:00.000Z', rng: () => 0.5 }
const open = (seed = 'seed-1') => openTable({ runId: 'run-play', seed, party: [HELAN], openingHook: 'memento' }, o)
const textIds = (t: Table) => t.screens.map((x) => x.textId).filter(Boolean)

/** Errands and walks around Grayport until the seat has its 31 choices, never touching the well. */
async function wandered(seed: string, strict = false): Promise<Table> {
  let t = open(seed)
  const model = fakeModel({ seed, strayRate: 0 })
  const places = ['gray_harbor.seven_lamps', 'gray_harbor.low_tide_street', 'gray_harbor.council_hall', 'gray_harbor.docks'] as const
  for (let i = 0; !r1Met(snapshotOf(t)) && i < 200; i++) {
    if (strict) {
      expect(canWrapUp(t)).toBe(false)
      expect(() => wrapUp(t, o)).toThrow()
    }
    if (t.pending?.kind === 'interaction') t = interact(t, { requestId: `ix-${i}`, instanceId: t.pending.instanceId, action: 'skip', params: { inspected: [] } }, o).table
    else if (t.pending?.kind === 'check') t = await roll(t, model, o)
    else if (i % 5 === 4) t = move(t, places[(i / 5) % places.length | 0] === snapshotOf(t).location?.placeId ? places[((i / 5 | 0) + 1) % places.length] : places[(i / 5 | 0) % places.length], o)
    else t = await act(t, `${ERRANDS[i % ERRANDS.length]}（第 ${i} 件小事）`, model, o)
  }
  expect(snapshotOf(t).seats.s1.choices).toBe(CONFIG.minChoicesPerSeat)
  expect(snapshotOf(t).arcs.gray_well?.outcomes ?? null).toBeNull()
  return t
}

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
    for (let i = 0; i < 8 && t.pending?.kind !== 'interaction'; i++) t = await act(t, `四处看看 ${i}`, model, o)
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

  it('offline, talking to someone present is checked and the roll moves their attitude by one', async () => {
    let t = await act(open(), '问罗莎最近酒馆里有什么怪事', null, o)
    expect(t.pending).toMatchObject({ kind: 'check', request: { skill: '交涉', difficulty: CONFIG.ai.offlineCheckDifficulty, reason: '罗莎的反应' } })
    t = await roll(t, null, o, [6, 6])
    expect(snapshotOf(t).npcs.rosa?.attitude).toBe(1)
    expect(snapshotOf(t).seats.s1.choices).toBe(1)
    t = await act(t, '冒充商会的人去骗罗莎', null, o)
    t = await roll(t, null, o, [1, 1])
    expect(snapshotOf(t).npcs.rosa?.attitude).toBe(0)
    t = await act(t, '四处看看墙上的寻人启事', null, o)
    expect(t.pending).toBeNull()
  })

  it('A1: only D01 after 31 choices of wandering, and no wrap-up before', async () => {
    let t = await wandered('a1', true)
    t = wrapUp(t, o)
    expect(t.pending).toEqual({ kind: 'ending', candidates: ['D01'] })
    t = await adjudicate(t, null, o)
    expect(snapshotOf(t).ending).toMatchObject({ directionId: 'D01', variant: d01Variant(snapshotOf(t)).variant, worldResolution: 'unresolved' })
    expect(textIds(t)).toContain(d01Variant(snapshotOf(t)).variant === 'settle' ? 'ED-01B' : 'ED-01')
    expect(t.screens.map((x) => x.heading).filter(Boolean)).toEqual(expect.arrayContaining(['第七声', '理由', '角色的尾声', '未竟之事']))
    const back = rewind(t, t.checkpoints.find((c) => c.label === '收束故事')!.id)
    expect(snapshotOf(back).ending).toBeNull()
    expect(snapshotOf(back).act).not.toBe(4)
    expect(canWrapUp(back)).toBe(true)
    expect(verifyLog('run-play', t.events)).toEqual([])
  })

  it('the ending AI picks among the candidates, cites the chronicle, and its reply is kept for the receipts', async () => {
    const t = wrapUp(await wandered('ai-end'), o)
    let seen = ''
    const ending: EndingCall = async ({ prefix, content }) => {
      seen = prefix + content
      return { seq: 99, text: JSON.stringify({ primary: 'D01', secondary: null, evidence: ['E1', 'E2', 'E3'], why: '你们在灰港走了很多路。\n雨一直没停。', weave: '', characters: [{ seat: 's1', text: '哈兰把工牌留在了七灯酒馆的吧台上。' }], projects: [], npcs: [], factions: [], unfinished: ['潮井之下还没有结果。'] }) }
    }
    const done = await adjudicate(t, ending, o)
    expect(seen).toContain('【编年史】')
    expect(done.responses.at(-1)).toMatchObject({ seq: 99 })
    expect(done.events.some((e) => e.sourceIntentId === 'ai:99' && e.type === 'ending_committed')).toBe(true)
    const paragraphs = done.screens.flatMap((x) => x.paragraphs)
    expect(paragraphs).toContain('哈兰把工牌留在了七灯酒馆的吧台上。')
    expect(paragraphs).toContain('雨一直没停。')
    expect(done.gaps.filter((g) => g.includes('理由只引用'))).toEqual([])
  })

  it('an ending outside the candidates is refused and the offline host decides', async () => {
    const t = wrapUp(await wandered('ai-bad'), o)
    let seq = 0
    const ending: EndingCall = async () => ({ seq: ++seq, text: JSON.stringify({ primary: 'D07', why: '起义' }) })
    const done = await adjudicate(t, ending, o)
    expect(snapshotOf(done).ending?.directionId).toBe('D01')
    expect(done.responses.length - t.responses.length).toBe(CONFIG.ai.parseRetries + 1)
    expect(done.gaps.some((g) => g.includes('D07'))).toBe(true)
  })

  it('the run summary has the three axes and a chronicle', async () => {
    const done = await adjudicate(wrapUp(await wandered('sum'), o), null, o)
    const s = snapshotOf(done)
    const sum = summarizeRun(s, done.events)
    expect(sum.axes).toMatchObject({ world: '未决' })
    expect(sum.chronicle.length).toBeGreaterThan(3)
    expect(sum.chronicle.at(-1)).toContain('未竟之歌')
    expect(chronicleOf(done.events).map((c) => c.id)).toEqual(chronicleOf(done.events).map((_, i) => `E${i + 1}`))
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
    const s0 = snapshotOf(t)
    expect(s0.arcs.gray_well?.beats).toContain('choice')
    const beatRounds = Object.entries(s0.texts).filter(([id]) => id.startsWith('GH-BEAT-')).map(([, x]) => x.lastRound).sort((a, b) => a - b)
    for (let i = 1; i < beatRounds.length; i++) expect(beatRounds[i] - beatRounds[i - 1]).toBeGreaterThanOrEqual(CONFIG.beatGapRounds)
    // A3: the decision comes before the clock can first reach 4.
    expect(s0.round).toBeLessThan(4 * CONFIG.clockCheckEvery)
    expect(textIds(t)).not.toContain('GH-BEAT-07')
    t = resolveArc(t, ['exposed'], o)
    const s = snapshotOf(t)
    expect(s.arcs.gray_well?.outcomes).toEqual(['exposed'])
    expect(s.objects.tide_well).toBe('exposed')
    expect(textIds(t)).toContain('GH-BEAT-07')
  })
})

describe('pacing', () => {
  it('the day moves one stretch per clock interval, starting on a rainy dusk', async () => {
    const { ambienceFor } = await import('./world')
    const n = CONFIG.roundsPerTimeOfDay
    expect(ambienceFor('x', 1)).toEqual({ time: '黄昏', weather: '雨' })
    expect(ambienceFor('x', n).time).toBe('黄昏')
    expect([n + 1, 2 * n + 1, 3 * n + 1].map((r) => ambienceFor('x', r).time)).toEqual(['夜', '黎明', '白天'])
  })
})

describe('save and rewind', () => {
  it('rewinds to just before a decision and lets the player choose again', async () => {
    const model = fakeModel({ seed: 'rw', strayRate: 0 })
    let t = await act(open('rw'), '打听怪病', model, o)
    const before = { events: t.events.length, screens: t.screens.length, round: snapshotOf(t).round }
    t = move(t, 'gray_harbor.docks', o)
    t = await act(t, '帮卢多搬货', model, o)
    expect(t.checkpoints.map((c) => c.label)).toEqual(['哈兰：打听怪病', '前往码头', '哈兰：帮卢多搬货'])
    t = rewind(t, t.checkpoints[1].id)
    const s = snapshotOf(t)
    expect(t.events).toHaveLength(before.events)
    expect(s.round).toBe(before.round)
    expect(s.location?.placeId).toBe('gray_harbor.seven_lamps')
    expect(t.screens).toHaveLength(before.screens + 1)
    expect(t.checkpoints).toHaveLength(1)
    t = move(t, 'gray_harbor.low_tide_street', o)
    expect(snapshotOf(t).location?.placeId).toBe('gray_harbor.low_tide_street')
    expect(verifyLog('run-play', t.events)).toEqual([])
  })

  it('a regretted outcome at the well can be chosen again', async () => {
    let t = open('regret')
    const model = fakeModel({ seed: 'regret', strayRate: 0 })
    for (let i = 0; i < 40 && !snapshotOf(t).arcs.gray_well?.beats.includes('choice'); i++) {
      if (t.pending?.kind === 'interaction') t = interact(t, { requestId: `ix-${i}`, instanceId: t.pending.instanceId, action: 'skip', params: { inspected: [] } }, o).table
      else if (t.pending?.kind === 'check') t = await roll(t, model, o)
      else t = await act(t, `追查潮井 ${i}`, model, o)
    }
    t = resolveArc(t, ['destroyed'], o)
    expect(snapshotOf(t).objects.tide_well).toBe('destroyed')
    const cp = t.checkpoints.find((c) => c.label.startsWith('潮井之下'))!
    t = rewind(t, cp.id)
    expect(snapshotOf(t).arcs.gray_well?.outcomes ?? null).toBeNull()
    t = resolveArc(t, ['exposed'], o)
    expect(snapshotOf(t).objects.tide_well).toBe('exposed')
  })

  it('saves and loads the table, screens and rewind points included', async () => {
    let t = await act(open('save'), '打听怪病', fakeModel({ seed: 'save' }), o)
    t = move(t, 'gray_harbor.docks', o)
    const r = loadTable(saveTable(t))
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.table.screens).toEqual(t.screens)
    expect(r.table.checkpoints).toEqual(t.checkpoints)
    expect(snapshotOf(r.table)).toEqual(snapshotOf(t))
    const back = rewind(r.table, r.table.checkpoints[1].id)
    expect(snapshotOf(back).location?.placeId).toBe('gray_harbor.seven_lamps')
  })

  it('a long run packs its rewind points compactly and unpacks them unchanged', async () => {
    const model = fakeModel({ seed: 'long' })
    let t = open('long')
    for (let i = 0; i < 12; i++) t = i % 4 === 3 ? move(t, i % 8 === 3 ? 'gray_harbor.docks' : 'gray_harbor.seven_lamps', o) : await act(t, `四处打听（${i}）`, model, o)
    while (t.pending?.kind === 'check') t = await roll(t, model, o)
    expect(t.checkpoints.length).toBeGreaterThan(8)
    const stored = JSON.parse(saveTable(t)).table.checkpoints
    expect(stored.filter((c: object) => 'recent' in c)).toHaveLength(1)
    const r = loadTable(saveTable(t))
    expect(r.status === 'ok' && r.table.checkpoints).toEqual(t.checkpoints)

    const packed = await packTable(t)
    const u = await unpackTable(packed, true)
    expect(u.status === 'ok' && u.table.checkpoints).toEqual(t.checkpoints)
    // The server trusts its own snapshot instead of replaying: it must be the replay's.
    if (u.status === 'ok') expect(snapshotOf(u.table)).toEqual(reduceEvents(t.runId, t.events))
    const c = await unpackTable(packed)
    expect(c.status === 'ok' && c.table.checkpoints).toEqual(t.checkpoints)
  })

  it('a tampered rewind point is refused on load', () => {
    const save = JSON.parse(saveTable(open('bad')))
    save.table.checkpoints = [{ id: 'cp:999', events: 999 }]
    expect(loadTable(JSON.stringify(save))).toMatchObject({ status: 'corrupt' })
  })

  it('a shared run rewinds only when every player at the table agrees', async () => {
    const FUHE: Member = { ...HELAN, seatId: 's2', actorId: 'fuhe', name: '芙蕾雅' }
    const model = fakeModel({ seed: 'two', strayRate: 0 })
    let t = openTable({ runId: 'run-two', seed: 'two', party: [HELAN, FUHE], openingHook: 'memento' }, o)
    t = move(t, 'gray_harbor.docks', o)
    t = await act(t, '芙蕾雅帮卢多搬货', model, o)
    const cp = t.checkpoints[0]
    expect(cp.label).toBe('前往码头')
    expect(() => rewind(t, cp.id)).toThrow('全员同意')

    const asked = proposeRewind(t, cp.id, 's1')
    expect(asked.pending).toMatchObject({ kind: 'rewind', agreed: ['s1'] })
    await expect(act(asked, '趁机行动', model, o)).rejects.toThrow()
    const refused = vote(asked, 's2', false)
    expect(refused.pending).toBeNull()
    expect(refused.events).toBe(t.events)

    const back = vote(proposeRewind(t, cp.id, 's2'), 's1', true)
    expect(back.pending).toBeNull()
    expect(snapshotOf(back).location?.placeId).toBe('gray_harbor.seven_lamps')
    expect(back.turn).toBe(0)
    expect(back.checkpoints).toEqual([])
  })
})
