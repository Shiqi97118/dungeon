import { commitIntent, type AnyEvent, type CommitContext } from '../events'
import type { EvidenceDef } from './evidence'
import { keyHotspots, missingKeys } from './evidence'
import type { InteractionRequest } from './session'

export interface InteractionResult {
  readonly requestId: string
  readonly instanceId: string
  readonly outcome: 'completed' | 'skipped'
  /** Hotspot ids the result counts as found. */
  readonly inspected: readonly string[]
  /** Set when skipped: the ordinary check the table still has to roll. */
  readonly check: EvidenceDef['skipCheck'] | null
  /** True when the ledger already held this instance and nothing new was written. */
  readonly duplicate: boolean
}

/** The request is malformed; nothing was written, so the player may act again. */
export class InteractionRejected extends Error {}

/** One instance per text, or per text and character when each player meets it on their own. */
export const interactionInstanceId = (textId: string, actorId?: string) => (actorId ? `ix:${textId}@${actorId}` : `ix:${textId}`)

function actorOf(def: EvidenceDef, instanceId: string): string | null | undefined {
  const base = interactionInstanceId(def.textId)
  if (instanceId === base) return null
  const actor = instanceId.startsWith(`${base}@`) ? instanceId.slice(base.length + 1) : ''
  return actor && !actor.includes('@') ? actor : undefined
}

function recorded(events: readonly AnyEvent[], def: EvidenceDef, instanceId: string): InteractionResult | null {
  for (const e of events) {
    if (e.type !== 'interaction_completed' || e.payload.interactionInstanceId !== instanceId) continue
    const completed = e.payload.outcome === 'completed'
    return {
      requestId: e.sourceIntentId,
      instanceId,
      outcome: completed ? 'completed' : 'skipped',
      inspected: completed ? keyHotspots(def) : [],
      check: completed ? null : def.skipCheck,
      duplicate: true,
    }
  }
  return null
}

/** The settled result for an instance, if any; the UI opens on it after a reload. */
export const recordedResult = recorded

/**
 * Settles one request into a single `interaction_completed`. The instance can settle once: a repeat
 * of the same request, or any later request for the same instance, returns the recorded result.
 */
export function settleInteraction(
  events: readonly AnyEvent[],
  def: EvidenceDef,
  req: InteractionRequest,
  ctx: CommitContext,
): { readonly events: readonly AnyEvent[]; readonly result: InteractionResult } {
  const actor = actorOf(def, req.instanceId)
  if (actor === undefined) throw new InteractionRejected('互动实例与条目不符')
  const done = recorded(events, def, req.instanceId)
  if (done) return { events, result: done }

  const known = new Set(def.hotspots.map((h) => h.id))
  const unknown = req.params.inspected.filter((id) => !known.has(id))
  if (unknown.length) throw new InteractionRejected(`没有这些检视点：${unknown.join('、')}`)
  const skip = req.action === 'skip'
  if (!skip && missingKeys(def, req.params.inspected).length) throw new InteractionRejected('还有关键之处没看')

  const outcome = skip ? 'skipped' : 'completed'
  const r = commitIntent(events, req.requestId, [
    { type: 'interaction_completed', payload: { template: def.template, outcome, textId: def.textId, interactionInstanceId: req.instanceId }, actorIds: actor ? [actor] : [] },
  ], ctx)
  return {
    events: r.events,
    result: {
      requestId: req.requestId,
      instanceId: req.instanceId,
      outcome,
      inspected: skip ? [] : [...new Set(req.params.inspected)],
      check: skip ? def.skipCheck : null,
      duplicate: r.duplicate,
    },
  }
}
