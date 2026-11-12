import type { Effect, FactId, ObjectId } from '../data'
import { draft, type AnyDraft, type Snapshot } from '../events'
import { hasFact } from './conditions'

/**
 * 12 §3.4: the object states and facts in a text's 后置 marked "before", as the events that
 * settle them. The ±n changes are settled separately (outcomes.ts); anything else is left to
 * the action that triggers the text.
 */
export function stagedDrafts(s: Snapshot, effects: readonly Effect[], source: string): AnyDraft[] {
  const out: AnyDraft[] = []
  for (const e of effects) {
    if (e.phase !== 'before') continue
    if ('object' in e && 'value' in e && e.op === 'eq' && s.objects[e.object as ObjectId] !== e.value) {
      out.push(draft('object_state_changed', { objectId: e.object as ObjectId, state: String(e.value) }))
    } else if ('fact' in e && e.op === 'eq' && e.value === true && !hasFact(s, e.fact as FactId)) {
      out.push(draft('fact_established', { factId: e.fact as FactId, source }))
    }
  }
  return out
}
