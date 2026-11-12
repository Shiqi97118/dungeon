import { describe, expect, it } from 'vitest'
import { commitIntent, draft, stableStringify, type AnyEvent } from './events'
import { createSave, loadSave, OUTDATED_SAVE_MESSAGE, SAVE_VERSION, serializeSave } from './save'

const RUN = 'run-save'
const ctx = { runId: RUN, committedAt: '2026-11-11T08:00:00.000Z' }

function events(): readonly AnyEvent[] {
  let log = commitIntent([], 'i1', [draft('run_started', { mode: 'solo', partySize: 1, seed: 's', openingHook: 'memento' })], ctx).events
  log = commitIntent(log, 'i2', [draft('object_state_changed', { objectId: 'tide_well', state: 'exposed' })], ctx).events
  return log
}

const save = () => createSave({ runId: RUN, seed: 's', createdAt: ctx.committedAt, events: events(), profileId: 'p1' })

describe('save v5', () => {
  it('rejects ids that would write to Object.prototype, without throwing', () => {
    const s = save()
    const last = s.events.at(-1)!
    for (const [type, payload] of [
      ['text_shown', { textId: '__proto__', round: 7, count: 1, rewrittenLines: [] }],
      ['player_project_stage_changed', { projectId: '__proto__', stage: 'founded' }],
      ['seat_changed', { seatId: '__proto__', actorId: 'pc1', controller: 'human', inheritedChoices: 0 }],
    ] as const) {
      const forged = { ...last, seq: last.seq + 1, eventId: `${RUN}:${last.seq + 1}`, sourceIntentId: 'x', type, payload }
      const result = loadSave(JSON.stringify({ ...s, events: [...s.events, forged] }))
      expect(result.status).toBe('corrupt')
    }
    expect(({} as Record<string, unknown>).stage).toBeUndefined()
    expect(({} as Record<string, unknown>).lastRound).toBeUndefined()
  })

  it('round-trips and rebuilds the same snapshot', () => {
    const result = loadSave(serializeSave(save()))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.snapshotRebuilt).toBe(false)
    expect(result.save).toMatchObject({ version: SAVE_VERSION, runId: RUN, snapshotSeq: 2, profileId: 'p1' })
    expect(result.snapshot.objects.tide_well).toBe('exposed')
  })

  it('rebuilds a tampered snapshot from the log', () => {
    const s = save()
    const tampered = { ...s, snapshot: { ...s.snapshot, objects: { ...s.snapshot.objects, tide_well: 'destroyed' } } }
    const result = loadSave(JSON.stringify(tampered))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.snapshotRebuilt).toBe(true)
    expect(result.snapshot.objects.tide_well).toBe('exposed')
    expect(stableStringify(result.snapshot)).toBe(stableStringify(s.snapshot))
  })

  it.each([
    ['v4 save from the old chapter', { version: 4, state: { scene: 'x' } }, 4],
    ['save without a version', { scene: 'x' }, null],
  ])('reports a %s as outdated without throwing', (_, data, version) => {
    expect(loadSave(JSON.stringify(data))).toEqual({ status: 'outdated', version, message: OUTDATED_SAVE_MESSAGE, action: '开始新的旅程' })
  })

  it.each([
    ['broken JSON', '{', '有效的 JSON'],
    ['a newer version', JSON.stringify({ version: 6 }), '比游戏新'],
    ['an edited event', JSON.stringify({ ...save(), events: save().events.map((e) => (e.seq === 2 ? { ...e, payload: { objectId: 'tide_well', state: 'gold' } } : e)) }), '没有状态 gold'],
  ])('reports %s as corrupt', (_, raw, problem) => {
    const result = loadSave(raw)
    expect(result.status).toBe('corrupt')
    if (result.status === 'corrupt') expect(result.problems.join()).toContain(problem)
  })
})
