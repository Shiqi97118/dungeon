import { CONFIG } from '../config'
import type { ArcId } from '../data'
import { TEXT_BY_ID } from '../data'
import { draft, type AnyDraft, type Snapshot } from '../events'
import { allHold, crisisRounds, type SceneContext } from './conditions'
import { BLOCKED_BY_PARTY, mainPlan, ownerProblems, PLANS } from './plans'

export const CLOCK_MAX = 12

export interface RuleResult {
  readonly drafts: AnyDraft[]
  /** Prewritten texts the rules decided to show, in order; `text_shown` drafts are already in `drafts`. */
  readonly texts: string[]
}

export const clkTextId = (slot: number, version: 'A' | 'B') => `GEN-CLK-${String(slot).padStart(2, '0')}${version}`

export function textShownDraft(s: Snapshot, textId: string): AnyDraft {
  return draft('text_shown', { textId, round: s.round, count: (s.texts[textId]?.count ?? 0) + 1, rewrittenLines: [] })
}

function show(s: Snapshot, out: RuleResult, textId: string) {
  out.drafts.push(textShownDraft(s, textId))
  out.texts.push(textId)
}

function crisisStart(s: Snapshot, out: RuleResult) {
  if (s.clock.crisis) return
  out.drafts.push(draft('world_crisis_started', {}))
  show(s, out, clkTextId(CLOCK_MAX, 'A'))
}

export const clockCheckDue = (s: Snapshot) => s.round > 0 && s.round % CONFIG.clockCheckEvery === 0

export type ClockOutcome = 'A' | 'B' | 'stalled' | 'full'

/**
 * The scheduled check (R2, 12 §11) for slot = clock + 1. Version A or B moves the clock; a
 * world event already seen (R2a: slot ≤ highest reached) moves it again without its text.
 * Secondary plans of the slot are judged in the same check and never move the clock.
 */
export function checkClock(s: Snapshot): RuleResult & { readonly outcome: ClockOutcome } {
  const out: RuleResult = { drafts: [], texts: [] }
  const from = s.clock.value
  if (from >= CLOCK_MAX) return { ...out, outcome: 'full' }
  const slot = from + 1
  const firstTime = slot > s.clock.highest
  const plan = mainPlan(slot)!
  const ctx: SceneContext = { vars: firstTime ? { clock: slot, clock_first_reached: slot } : { clock: slot } }
  const window = CONFIG.planBlockedRounds

  let outcome: ClockOutcome
  let problems: string[] = []
  if (slot === CLOCK_MAX) {
    outcome = 'A'
  } else {
    problems = ownerProblems(s, plan, window)
    const aHolds = allHold(TEXT_BY_ID.get(clkTextId(slot, 'A'))?.requires, s, ctx) && (plan.extra?.(s) ?? true)
    const bHolds = allHold(TEXT_BY_ID.get(clkTextId(slot, 'B'))?.requires, s, ctx)
    if (problems.includes(BLOCKED_BY_PARTY)) outcome = 'stalled'
    else if (aHolds && !problems.length) outcome = 'A'
    else if (bHolds) outcome = 'B'
    else {
      outcome = 'stalled'
      if (!aHolds) problems.push('version_a')
      problems.push('version_b')
    }
  }

  if (outcome === 'stalled') {
    // Re-recording a party block would restart its window every check.
    if (plan.owner && !problems.includes(BLOCKED_BY_PARTY)) {
      out.drafts.push(draft('faction_plan_blocked', { factionId: plan.owner, planId: plan.id, failedPreconditions: problems }))
    }
  } else {
    if (outcome === 'A' && plan.owner && firstTime) out.drafts.push(draft('faction_plan_advanced', { factionId: plan.owner, planId: plan.id, stage: slot }))
    out.drafts.push(draft('clock_advanced', { from, to: slot, cause: 'faction_plan', planId: outcome === 'A' ? plan.id : `${plan.id}:B` }))
    if (slot === CLOCK_MAX) {
      if (firstTime) crisisStart(s, out)
    } else if (firstTime) show(s, out, clkTextId(slot, outcome as 'A' | 'B'))
  }

  for (const p of PLANS) {
    if (p.slot !== slot || p.main || !p.owner || s.plansAdvanced.includes(p.id)) continue
    if (ownerProblems(s, p, window).length || !(p.extra?.(s) ?? true)) continue
    out.drafts.push(draft('faction_plan_advanced', { factionId: p.owner, planId: p.id, stage: slot }))
  }
  return { ...out, outcome }
}

/**
 * R2: a major failure, irreversible ritual or public panic moves the clock once more, at most
 * once per check window. Returns null when the window is used up or the clock is full.
 */
export function extraAdvance(s: Snapshot, planId: string): RuleResult | null {
  const from = s.clock.value
  if (from >= CLOCK_MAX) return null
  if (s.clock.extras.some((x) => x.round > s.round - CONFIG.clockCheckEvery)) return null
  const out: RuleResult = { drafts: [draft('clock_advanced', { from, to: from + 1, cause: 'world_event', planId })], texts: [] }
  if (from + 1 === CLOCK_MAX && s.clock.highest < CLOCK_MAX) crisisStart(s, out)
  return out
}

/** R2: resolving a core adventure with 稳住局势 turns the clock back once per adventure. */
export function stabilizeReversal(s: Snapshot, arcId: ArcId): AnyDraft | null {
  const cause = `arc:${arcId}`
  if (!s.arcs[arcId]?.outcomes?.includes('stabilized') || s.clock.value <= 0 || s.clock.reversals.includes(cause)) return null
  return draft('clock_reversed', { from: s.clock.value, to: s.clock.value - 1, cause })
}

const CRISIS_TEXTS = ['X1', 'X2', 'X3', 'X4', 'X5', 'X6'].map((x) => `GEN-CLK-${x}`)
const CRISIS_FALLBACK = CRISIS_TEXTS[CRISIS_TEXTS.length - 1]

/**
 * R3 after `round_started`: in the second crisis round GEN-CLK-12B frames the crisis, then
 * every `crisisEscalateEvery` rounds it worsens, taking X1–X6 in order (X6 is the fallback).
 */
export function crisisTick(s: Snapshot): RuleResult {
  const out: RuleResult = { drafts: [], texts: [] }
  const rounds = crisisRounds(s)
  if (!s.clock.crisis || rounds <= 0) return out
  const every = CONFIG.crisisEscalateEvery
  if (rounds === every) {
    show(s, out, clkTextId(CLOCK_MAX, 'B'))
  } else if (rounds > every && rounds % every === 0) {
    const textId = CRISIS_TEXTS.find((t) => !s.texts[t]) ?? CRISIS_FALLBACK
    out.drafts.push(draft('crisis_escalated', { step: s.clock.crisisStep + 1, textId }))
    show(s, out, textId)
  }
  return out
}
