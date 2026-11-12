import { applyEvent, draft, type AnyDraft, type AnyEvent, type Snapshot } from '../events'
import { checkClock, clockCheckDue, crisisTick, extraAdvance, stabilizeReversal, type ClockOutcome, type RuleResult } from './clock'
import { HUNGER_CLOCK_PLAN, HUNGER_EXTRA_CLOCK, hungerRoundDrafts } from './hunger'
import { guildStateDrafts, actDrafts } from './progress'
import { projectDrafts } from './projects'
import { regionDrafts } from './regions'
import { truthLayerDrafts } from './truths'
import { outcomeDrafts } from './outcomes'
import type { ArcId, OutcomeId } from '../data'

/** The snapshot as it would be after committing `drafts` (same order, so seq numbers match the real commit). */
export function preview(s: Snapshot, drafts: readonly AnyDraft[]): Snapshot {
  return drafts.reduce(
    (cur, d, i) =>
      applyEvent(cur, {
        schemaVersion: 1, eventId: `preview:${s.seq + i + 1}`, runId: s.runId, seq: cur.seq + 1, type: d.type, payload: d.payload,
        actorIds: [], accountIds: [], partyId: null, sourceIntentId: 'preview', committedAt: '', visibility: 'party',
      } as AnyEvent),
    s,
  )
}

export interface SettleOptions {
  /** Taverns whose books the settlement judged profitable this time (12 §6.3). */
  readonly profitable?: ReadonlySet<string>
}

type Rule = (s: Snapshot, o: SettleOptions) => RuleResult | AnyDraft[] | null

const asResult = (r: RuleResult | AnyDraft[] | null): RuleResult => (!r ? { drafts: [], texts: [] } : Array.isArray(r) ? { drafts: r, texts: [] } : r)

/** Consequences that follow from state alone, in the order they are applied. Each is idempotent once committed. */
const CONSEQUENCES: readonly Rule[] = [
  (s) => guildStateDrafts(s),
  (s) => {
    for (const arcId of Object.keys(s.arcs) as ArcId[]) {
      const d = stabilizeReversal(s, arcId)
      if (d) return [d]
    }
    return null
  },
  (s) => (s.hunger >= HUNGER_EXTRA_CLOCK && !s.clock.extras.some((x) => x.planId === HUNGER_CLOCK_PLAN) ? extraAdvance(s, HUNGER_CLOCK_PLAN) : null),
  (s) => regionDrafts(s),
  (s, o) => projectDrafts(s, o.profitable),
  (s) => truthLayerDrafts(s),
  (s) => actDrafts(s),
]

const PASS_LIMIT = 10

/** Runs the consequence rules to a fixed point after `drafts`, returning everything to commit in one intent. */
export function withConsequences(s: Snapshot, drafts: readonly AnyDraft[], texts: readonly string[] = [], options: SettleOptions = {}): RuleResult {
  const out: RuleResult = { drafts: [...drafts], texts: [...texts] }
  let cur = preview(s, drafts)
  for (const d of drafts) {
    if (d.type !== 'core_arc_resolved') continue
    const p = d.payload as { arcId: ArcId; outcomes: readonly OutcomeId[] }
    const extra = outcomeDrafts(cur, p.arcId, p.outcomes)
    out.drafts.push(...extra)
    cur = preview(cur, extra)
  }
  for (let pass = 0; pass < PASS_LIMIT; pass++) {
    let changed = false
    for (const rule of CONSEQUENCES) {
      const r = asResult(rule(cur, options))
      if (!r.drafts.length) continue
      changed = true
      out.drafts.push(...r.drafts)
      out.texts.push(...r.texts)
      cur = preview(cur, r.drafts)
    }
    if (!changed) return out
  }
  throw new Error('规则后果没有收敛')
}

/** One intent at the start of a round: the round itself, crisis, hunger, and the clock check when due. */
export function startRound(s: Snapshot, round: number, options: SettleOptions = {}): RuleResult & { readonly clock: ClockOutcome | null } {
  // Clock checks, crisis framing and reuse cooldowns all assume rounds go up one at a time.
  if (round !== s.round + 1) throw new Error(`轮数必须逐轮推进：当前第 ${s.round} 轮，收到第 ${round} 轮`)
  const drafts: AnyDraft[] = [draft('round_started', { round })]
  const texts: string[] = []
  let cur = preview(s, drafts)
  let clock: ClockOutcome | null = null
  const steps: ((x: Snapshot) => RuleResult)[] = [
    crisisTick,
    (x) => ({ drafts: hungerRoundDrafts(x), texts: [] }),
    (x) => {
      if (!clockCheckDue(x)) return { drafts: [], texts: [] }
      const r = checkClock(x)
      clock = r.outcome
      return r
    },
  ]
  for (const step of steps) {
    const r = step(cur)
    drafts.push(...r.drafts)
    texts.push(...r.texts)
    cur = preview(cur, r.drafts)
  }
  return { ...withConsequences(s, drafts, texts, options), clock }
}
