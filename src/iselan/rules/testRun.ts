import type { OpeningHookId } from '../data'
import { commitIntent, draft, reduceEvents, type AnyDraft, type AnyEvent, type Snapshot } from '../events'
import { openingDrafts, type OpeningSeat } from './initial'
import { startRound, withConsequences, type SettleOptions } from './settle'

/** Test helper: a run whose intents go through the real ledger and reducer. */
export class TestRun {
  readonly runId = 'run-rules'
  events: readonly AnyEvent[] = []
  private intent = 0
  private cache: Snapshot | null = null

  constructor(
    seats: readonly OpeningSeat[] = [{ seatId: 's1', actorId: 'helan', controller: 'human' }],
    seed = 'seed-1',
    openingHook: OpeningHookId = 'memento',
  ) {
    this.commit(openingDrafts({ mode: seats.length > 1 ? 'online' : 'solo', seed, openingHook, seats }))
  }

  get s(): Snapshot {
    return (this.cache ??= reduceEvents(this.runId, this.events))
  }

  commit(drafts: readonly AnyDraft[], intentId = `i${++this.intent}`): this {
    this.events = commitIntent(this.events, intentId, drafts, { runId: this.runId, committedAt: '2026-11-11T00:00:00.000Z' }).events
    this.cache = null
    return this
  }

  /** Commit `drafts` with every consequence the rules attach. */
  settle(drafts: readonly AnyDraft[], options?: SettleOptions, intentId?: string) {
    const r = withConsequences(this.s, drafts, [], options)
    this.commit(r.drafts, intentId)
    return r
  }

  round(round = this.s.round + 1) {
    const r = startRound(this.s, round)
    this.commit(r.drafts)
    return r
  }

  rounds(until: number) {
    const texts: string[] = []
    while (this.s.round < until) texts.push(...this.round().texts)
    return texts
  }

  /** Give a seat `n` counted choices with unique keys. */
  choices(seatId: string, n: number): this {
    const seat = this.s.seats[seatId]
    const drafts = Array.from({ length: n }, (_, i) =>
      draft('choice_counted', { seatId, actorId: seat.actorId, changeKinds: ['knowledge'], dedupeKey: `bulk:${this.intent}:${i}` }),
    )
    return this.commit(drafts)
  }

  setClock(to: number): this {
    return this.commit([draft('clock_advanced', { from: this.s.clock.value, to, cause: 'faction_plan', planId: 'test' })])
  }
}
