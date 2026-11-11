import type { EventPayloads } from '../data'
import { draft, type AnyDraft, type Snapshot } from '../events'
import { directionDraft } from './directions'

const HUNGER_MAX = 10
type Cause = EventPayloads['hunger_changed']['cause']
type NameMode = EventPayloads['name_invoked']['mode']

export function hungerDraft(s: Snapshot, delta: number, cause: Cause): AnyDraft {
  const value = Math.max(0, Math.min(HUNGER_MAX, s.hunger + delta))
  return draft('hunger_changed', { delta: value - s.hunger, value, cause })
}

const NAME_DELTA: Readonly<Record<NameMode, number>> = { call: 1, read: 1, rest: -1 }

/**
 * 04 §7: calling or reading a name feeds the nameless (+1), laying one to rest calms them (−1)
 * and strengthens the resting chorus (D19). One settlement per action — the caller commits this
 * once per intent — and a name can be laid to rest only once (null then).
 */
export function nameDrafts(s: Snapshot, nameId: string, mode: NameMode): AnyDraft[] | null {
  if (mode === 'rest' && s.namesInvoked.some((n) => n.nameId === nameId && n.mode === 'rest')) return null
  const out: AnyDraft[] = [draft('name_invoked', { nameId, mode }), hungerDraft(s, NAME_DELTA[mode], mode)]
  if (mode === 'rest') {
    const d = directionDraft(s, 'D19', 1)
    if (d) out.push(d)
  }
  return out
}

export const HUNGER_LOUD = 5
export const HUNGER_EXTRA_CLOCK = 8
export const HUNGER_D12_EVERY = 3
export const HUNGER_CLOCK_PLAN = 'hunger_8'

/** 04 §7: at hunger ≥ 5 the emperor's voice grows — D12 +1 every 3 rounds (called after `round_started`). */
export function hungerRoundDrafts(s: Snapshot): AnyDraft[] {
  if (s.hunger < HUNGER_LOUD || s.round % HUNGER_D12_EVERY !== 0) return []
  const d = directionDraft(s, 'D12', 1)
  return d ? [d] : []
}
