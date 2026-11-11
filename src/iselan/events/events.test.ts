import { describe, expect, it } from 'vitest'
import { EVENT_TYPES } from '../data'
import { commitIntent, draft, EventRejectedError, reduceEvents, stableStringify, usedTexts, validateEvent, verifyLog, type AnyDraft, type AnyEvent } from '.'

const RUN = 'run-test'
const at = (i: number) => `2026-11-11T08:00:${String(i).padStart(2, '0')}.000Z`

/** A short Grayport opening: start, seat, enter the tavern, see a text, learn about the ledger. */
const SCRIPT: readonly (readonly [string, readonly AnyDraft[]])[] = [
  ['i1', [
    draft('run_started', { mode: 'solo', partySize: 1, seed: 'seed-1', openingHook: 'guild_contract' }),
    draft('seat_changed', { seatId: 's1', actorId: 'pc1', controller: 'human', inheritedChoices: 0 }),
  ]],
  ['i2', [
    draft('round_started', { round: 1 }),
    draft('location_changed', { regionId: 'gray_harbor', placeId: 'gray_harbor.seven_lamps' }, { regionId: 'gray_harbor' }),
    draft('ambience_changed', { time: '夜', weather: '雾' }),
    draft('text_shown', { textId: 'GH-ENV-01', round: 1, count: 1, rewrittenLines: [] }),
  ]],
  ['i3', [
    draft('npc_met', { npcId: 'felix' }),
    draft('npc_attitude_changed', { npcId: 'felix', towardsId: 'party', delta: 1, value: 1 }),
    draft('fact_established', { factId: 'memory_ledger_seen', source: 'felix' }),
    draft('choice_counted', { seatId: 's1', actorId: 'pc1', changeKinds: ['npc'], dedupeKey: 'r1:felix:talk' }),
  ]],
]

function play(script = SCRIPT) {
  let events: readonly AnyEvent[] = []
  script.forEach(([intent, drafts], i) => {
    events = commitIntent(events, intent, drafts, { runId: RUN, committedAt: at(i) }).events
  })
  return events
}

describe('event ledger', () => {
  it('assigns contiguous seq and deterministic ids, one block per intent', () => {
    const events = play()
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1))
    expect(events[0].eventId).toBe(`${RUN}:1`)
    expect(events.filter((e) => e.sourceIntentId === 'i2')).toHaveLength(4)
    expect(verifyLog(RUN, events)).toEqual([])
  })

  it('replays to the same snapshot: same intents → same log, and a stored log → same state', () => {
    const a = play()
    const b = play()
    expect(stableStringify(b)).toBe(stableStringify(a))
    const fromDisk = JSON.parse(JSON.stringify(a)) as AnyEvent[]
    expect(stableStringify(reduceEvents(RUN, fromDisk))).toBe(stableStringify(reduceEvents(RUN, a)))
    const s = reduceEvents(RUN, a)
    expect(s.seq).toBe(a.length)
    expect(s.location).toEqual({ regionId: 'gray_harbor', placeId: 'gray_harbor.seven_lamps' })
    expect(s.npcs.felix).toMatchObject({ met: true, attitude: 1 })
    expect(s.seats.s1).toMatchObject({ choices: 1, ownChoices: 1 })
    expect(usedTexts(s)).toEqual([{ textId: 'GH-ENV-01', count: 1, lastRound: 1 }])
  })

  it('a retried intent is applied once', () => {
    const events = play()
    const again = commitIntent(events, 'i3', SCRIPT[2][1], { runId: RUN, committedAt: at(9) })
    expect(again.duplicate).toBe(true)
    expect(again.committed).toEqual([])
    expect(again.events).toBe(events)
    expect(reduceEvents(RUN, again.events).seats.s1.choices).toBe(1)
  })

  it('commits all events of an intent or none', () => {
    const events = play()
    const bad = [
      draft('fact_established', { factId: 'ledger_held', source: 'test' }),
      draft('object_state_changed', { objectId: 'tide_well', state: 'flying' }),
    ]
    expect(() => commitIntent(events, 'i4', bad, { runId: RUN, committedAt: at(4) })).toThrow(EventRejectedError)
    expect(events).toHaveLength(play().length)
    expect(reduceEvents(RUN, events).facts.ledger_held).toBeUndefined()
  })

  it('facts change only through new events; committed events are immutable', () => {
    const events = play()
    const first = events.find((e) => e.type === 'fact_established')!
    expect(() => {
      ;(first.payload as { factId: string }).factId = 'ledger_held'
    }).toThrow(TypeError)
    expect(() => (events as AnyEvent[]).pop()).toThrow(TypeError)

    const retracted = commitIntent(events, 'i4', [draft('fact_retracted', { factId: 'memory_ledger_seen', reason: 'forged' })], { runId: RUN, committedAt: at(4) }).events
    expect(reduceEvents(RUN, retracted).facts.memory_ledger_seen).toBeUndefined()
    expect(reduceEvents(RUN, events).facts.memory_ledger_seen).toMatchObject({ source: 'felix', seq: first.seq })
    expect(retracted.slice(0, events.length)).toEqual(events)

    const restored = commitIntent(retracted, 'i5', [draft('fact_established', { factId: 'memory_ledger_seen', source: 'copy' })], { runId: RUN, committedAt: at(5) }).events
    expect(reduceEvents(RUN, restored).facts.memory_ledger_seen).toMatchObject({ source: 'copy' })
  })

  it('counts a repeated action once per seat and lets a replacement inherit choices', () => {
    const events = commitIntent(play(), 'i4', [
      draft('choice_counted', { seatId: 's1', actorId: 'pc1', changeKinds: ['npc'], dedupeKey: 'r1:felix:talk' }),
      draft('seat_changed', { seatId: 's1', actorId: 'pc2', controller: 'human', inheritedChoices: 1 }),
      draft('choice_counted', { seatId: 's1', actorId: 'pc2', changeKinds: ['fact'], dedupeKey: 'r2:ledger' }),
    ], { runId: RUN, committedAt: at(4) }).events
    expect(reduceEvents(RUN, events).seats.s1).toMatchObject({ actorId: 'pc2', choices: 2, ownChoices: 1 })
  })

  it('keeps the last three impressions and all milestones; clamps attitude', () => {
    const drafts: AnyDraft[] = ['a', 'b', 'c', 'd'].map((text) => draft('npc_impression_added', { npcId: 'felix', text, milestone: false }))
    drafts.push(draft('npc_impression_added', { npcId: 'felix', text: 'saved', milestone: true }))
    drafts.push(draft('npc_attitude_changed', { npcId: 'felix', towardsId: 'party', delta: 9, value: 9 }))
    const s = reduceEvents(RUN, commitIntent(play(), 'i4', drafts, { runId: RUN, committedAt: at(4) }).events)
    expect(s.npcs.felix).toMatchObject({ impressions: ['b', 'c', 'd'], milestones: ['saved'], attitude: 3 })
  })
})

describe('validateEvent', () => {
  it('accepts the script', () => {
    for (const [, drafts] of SCRIPT) for (const d of drafts) expect(validateEvent(d.type, d.payload, d.regionId)).toEqual([])
  })

  it('knows every event type', () => {
    for (const type of EVENT_TYPES) expect(validateEvent(type, null)).toEqual([`${type} 的 payload 不是对象`])
  })

  it.each([
    ['unknown type', 'made_up', {}, '未知事件类型'],
    ['missing field', 'npc_met', {}, '缺少字段 npcId'],
    ['extra field', 'npc_met', { npcId: 'felix', mood: 1 }, '多出字段 mood'],
    ['unknown id', 'npc_met', { npcId: 'nobody' }, 'npc 编号'],
    ['non-integer', 'round_started', { round: 1.5 }, '整数'],
    ['id-or-literal union', 'npc_attitude_changed', { npcId: 'felix', towardsId: 'npc', delta: 0, value: 0 }, 'npc|party'],
    ['state of another object', 'object_state_changed', { objectId: 'tide_well', state: 'sealed' }, '没有状态 sealed'],
    ['evidence of another dark line', 'truth_evidence_added', { darkLineId: 'dl2', evidenceId: 'felix_ledger', reliable: true }, '没有证据 felix_ledger'],
  ])('rejects %s', (_, type, payload, message) => {
    expect(validateEvent(type, payload).join('；')).toContain(message)
  })

  it('accepts the id branch of an id-or-literal union', () => {
    expect(validateEvent('npc_attitude_changed', { npcId: 'felix', towardsId: 'cedric', delta: -1, value: -1 })).toEqual([])
    expect(validateEvent('location_changed', { regionId: 'gray_harbor', placeId: 'none' })).toEqual([])
  })
})

describe('verifyLog', () => {
  it('reports gaps, foreign runs and split intents', () => {
    const events = JSON.parse(JSON.stringify(play())) as AnyEvent[]
    expect(verifyLog('other', events).join()).toContain('属于另一局')
    const gap = events.filter((e) => e.seq !== 2)
    expect(verifyLog(RUN, gap).join()).toContain('seq 应为 2')
    const split = events.map((e) => (e.seq === events.length ? { ...e, sourceIntentId: 'i1' } : e))
    expect(verifyLog(RUN, split).join()).toContain('不连续')
  })
})
