import { describe, expect, it } from 'vitest'
import type { AnyEvent } from '../events'
import { reduceEvents } from '../events'
import { BANQUET, LEDGER, missingGuests, pickToken, InteractionRejected, interactionInstanceId, openSession, recordedResult, reduceSession, settleInteraction, type Session, type SessionMsg } from '.'

const ctx = { runId: 'r1', committedAt: '2026-11-12T00:00:00.000Z' }
const id = interactionInstanceId(LEDGER.textId)
const run = (msgs: SessionMsg[], s: Session = openSession(id)) => msgs.reduce(reduceSession, s)
const inspectKeys: SessionMsg[] = [{ type: 'inspect', hotspotId: 'unit' }, { type: 'inspect', hotspotId: 'seven' }, { type: 'zoom', on: true }, { type: 'inspect', hotspotId: 'margin' }]

describe('evidence session', () => {
  it('locks the request once submitted and ignores input until it settles', () => {
    const s = run([...inspectKeys, { type: 'submit', action: 'complete' }])
    expect(s.phase).toBe('submitting')
    const after = run([{ type: 'inspect', hotspotId: 'columns' }, { type: 'zoom', on: false }, { type: 'submit', action: 'skip' }], s)
    expect(after).toBe(s)
  })

  it('keeps action, params and requestId across a timeout and retry', () => {
    const s = run([{ type: 'submit', action: 'skip' }])
    const req = s.request!
    const stalled = reduceSession(s, { type: 'stall', requestId: req.requestId, error: '超时' })
    expect(stalled.phase).toBe('stalled')
    expect(reduceSession(stalled, { type: 'submit', action: 'complete' })).toBe(stalled)
    const retried = reduceSession(stalled, { type: 'retry' })
    expect(retried.phase).toBe('submitting')
    expect(retried.request).toBe(req)
    expect(retried.attempts).toBe(2)

    const alt = run([...inspectKeys, { type: 'submit', action: 'alternative' }])
    const altRetry = run([{ type: 'stall', requestId: alt.request!.requestId, error: '网络' }, { type: 'retry' }], alt)
    expect(altRetry.request).toEqual({ requestId: `${id}#1`, instanceId: id, action: 'alternative', params: { inspected: ['unit', 'seven', 'margin'] } })
  })

  it('settles once; later or foreign callbacks change nothing', () => {
    const s = run([...inspectKeys, { type: 'submit', action: 'complete' }])
    const req = s.request!
    let events: readonly AnyEvent[] = []
    const first = settleInteraction(events, LEDGER, req, ctx)
    events = first.events
    const again = settleInteraction(events, LEDGER, req, ctx)
    expect(again.events).toBe(events)
    expect(events.filter((e) => e.type === 'interaction_completed')).toHaveLength(1)

    const settled = reduceSession(s, { type: 'settle', requestId: req.requestId, result: first.result })
    const late = { ...first.result, outcome: 'skipped' as const }
    expect(reduceSession(settled, { type: 'settle', requestId: req.requestId, result: late })).toBe(settled)
    expect(reduceSession(settled, { type: 'reject', requestId: req.requestId, error: 'x' })).toBe(settled)
    expect(reduceSession(s, { type: 'settle', requestId: 'other', result: first.result })).toBe(s)
  })

  it('a second request for a settled instance returns the recorded result without writing', () => {
    const skip = settleInteraction([], LEDGER, { requestId: `${id}#1`, instanceId: id, action: 'skip', params: { inspected: [] } }, ctx)
    expect(skip.result).toMatchObject({ outcome: 'skipped', check: LEDGER.skipCheck, duplicate: false })
    const other = settleInteraction(skip.events, LEDGER, { requestId: `${id}#2`, instanceId: id, action: 'complete', params: { inspected: ['unit', 'seven', 'margin'] } }, ctx)
    expect(other.events).toBe(skip.events)
    expect(other.result).toMatchObject({ outcome: 'skipped', requestId: `${id}#1`, duplicate: true })
    expect(reduceEvents('r1', other.events).interactions[id]).toEqual({ template: 'evidence', outcome: 'skipped', textId: 'GH-BEAT-04' })
  })

  it('in an online run each character settles their own instance, attributed to them', () => {
    const a = interactionInstanceId(LEDGER.textId, 'helan')
    const b = interactionInstanceId(LEDGER.textId, 'qilan')
    const first = settleInteraction([], LEDGER, { requestId: `${a}#1`, instanceId: a, action: 'skip', params: { inspected: [] } }, ctx)
    const second = settleInteraction(first.events, LEDGER, { requestId: `${b}#1`, instanceId: b, action: 'complete', params: { inspected: ['unit', 'seven', 'margin'] } }, ctx)
    expect(second.result).toMatchObject({ outcome: 'completed', duplicate: false })
    expect(second.events.filter((e) => e.type === 'interaction_completed').map((e) => e.actorIds)).toEqual([['helan'], ['qilan']])
    for (const bad of [`${id}@`, `${id}@a@b`, 'ix:GH-BEAT-05@helan']) {
      expect(() => settleInteraction([], LEDGER, { requestId: `${bad}#1`, instanceId: bad, action: 'skip', params: { inspected: [] } }, ctx)).toThrow(InteractionRejected)
    }
  })

  it('rejects incomplete or unknown inspections without writing, and frees the session', () => {
    const base = { requestId: `${id}#1`, instanceId: id, action: 'complete' as const }
    expect(() => settleInteraction([], LEDGER, { ...base, params: { inspected: ['unit'] } }, ctx)).toThrow(InteractionRejected)
    expect(() => settleInteraction([], LEDGER, { ...base, params: { inspected: ['unit', 'seven', 'margin', 'x'] } }, ctx)).toThrow(InteractionRejected)
    const s = run([{ type: 'inspect', hotspotId: 'unit' }, { type: 'submit', action: 'complete' }])
    const freed = reduceSession(s, { type: 'reject', requestId: s.request!.requestId, error: '还有关键之处没看' })
    expect(freed.phase).toBe('open')
    expect(reduceSession(freed, { type: 'submit', action: 'complete' }).request!.requestId).toBe(`${id}#2`)
  })

  it('the result can be collapsed and reopened, and a reload opens on the same result', () => {
    const s = run([...inspectKeys, { type: 'submit', action: 'complete' }])
    const { events, result } = settleInteraction([], LEDGER, s.request!, ctx)
    const settled = reduceSession(s, { type: 'settle', requestId: s.request!.requestId, result })
    const closed = reduceSession(settled, { type: 'showResult', open: false })
    expect(closed.resultOpen).toBe(false)
    expect(reduceSession(closed, { type: 'showResult', open: true }).result).toBe(result)
    const reloaded = openSession(id, recordedResult(events, LEDGER, id))
    expect(reloaded.phase).toBe('settled')
    expect(reloaded.result).toMatchObject({ outcome: 'completed', requestId: result.requestId, inspected: ['unit', 'seven', 'margin'] })
  })
})

describe('dialogue-gesture (GH-SCN-09)', () => {
  const gid = interactionInstanceId(BANQUET.textId)
  const present = ['envoy', 'grayrobe']
  const req = (action: 'complete' | 'skip' | 'alternative', inspected: string[], n = 1) => ({ requestId: `${gid}#${n}`, instanceId: gid, action, params: { inspected } })

  it('every guest who came gets one gesture; picking again replaces it', () => {
    let s = openSession(gid)
    s = reduceSession(s, { type: 'choose', guestId: 'envoy', gestureId: 'toast' })
    s = reduceSession(s, { type: 'choose', guestId: 'envoy', gestureId: 'silence' })
    expect(s.inspected).toEqual(['envoy:silence'])
    expect(missingGuests(present, s.inspected)).toEqual(['grayrobe'])
    s = reduceSession(s, { type: 'choose', guestId: 'grayrobe', gestureId: 'token' })
    expect(missingGuests(present, s.inspected)).toEqual([])
    s = reduceSession(s, { type: 'submit', action: 'complete' })
    expect(reduceSession(s, { type: 'choose', guestId: 'envoy', gestureId: 'toast' })).toBe(s)
  })

  it('completes with one interaction_completed and changes nothing else', () => {
    const r = settleInteraction([], BANQUET, req('complete', ['envoy:silence', 'grayrobe:token']), ctx, { present })
    expect(r.result).toMatchObject({ outcome: 'completed', inspected: ['envoy:silence', 'grayrobe:token'], check: null })
    expect(r.events.map((e) => e.type)).toEqual(['interaction_completed'])
    const before = reduceEvents('r1', [])
    const after = reduceEvents('r1', r.events)
    expect(after.factions).toEqual(before.factions)
    expect(after.npcs).toEqual(before.npcs)
    expect(after.facts).toEqual(before.facts)
  })

  it('rejects a missing guest, an absent guest, a doubled guest or an unknown gesture', () => {
    for (const bad of [['envoy:toast'], ['envoy:toast', 'grayrobe:toast', 'professor:toast'], ['envoy:toast', 'envoy:token', 'grayrobe:toast'], ['envoy:wave', 'grayrobe:toast'], ['envoy:toast:x', 'grayrobe:toast']]) {
      expect(() => settleInteraction([], BANQUET, req('complete', bad), ctx, { present })).toThrow(InteractionRejected)
    }
    expect(() => settleInteraction([], BANQUET, req('complete', ['envoy:toast']), ctx, { present: ['envoy'] })).toThrow(/在座宾客/)
  })

  it('skip settles as 交涉 12 and records once; a reload opens on the result', () => {
    const r = settleInteraction([], BANQUET, req('skip', []), ctx, { present })
    expect(r.result).toMatchObject({ outcome: 'skipped', check: BANQUET.skipCheck })
    const again = settleInteraction(r.events, BANQUET, req('complete', ['envoy:toast', 'grayrobe:toast'], 2), ctx, { present })
    expect(again.events).toBe(r.events)
    expect(recordedResult(r.events, BANQUET, gid)).toMatchObject({ outcome: 'skipped', duplicate: true })
  })

  it('every guest × gesture has a reaction', () => {
    for (const g of BANQUET.guests) for (const x of BANQUET.gestures) expect(BANQUET.reactions[pickToken(g.id, x.id)]).toBeTruthy()
    expect(Object.keys(BANQUET.reactions)).toHaveLength(BANQUET.guests.length * BANQUET.gestures.length)
  })
})
