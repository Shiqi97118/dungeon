import { commitIntent, type AnyEvent, type CommitContext } from '../events'
import type { EvidenceDef, SkipCheck } from './evidence'
import { keyHotspots, missingKeys } from './evidence'
import type { GestureDef } from './gesture'
import { missingGuests, pickOf } from './gesture'
import type { InteractionRequest } from './session'

export type InteractionDef = EvidenceDef | GestureDef

export interface InteractionResult {
  readonly requestId: string
  readonly instanceId: string
  readonly outcome: 'completed' | 'skipped'
  /** Hotspot ids the result counts as found, or the `guest:gesture` picks. */
  readonly inspected: readonly string[]
  /** Set when skipped: the ordinary check the table still has to roll. */
  readonly check: SkipCheck | null
  /** True when the ledger already held this instance and nothing new was written. */
  readonly duplicate: boolean
}

/** The request is malformed; nothing was written, so the player may act again. */
export class InteractionRejected extends Error {}

/** One instance per text, or per text and character when each player meets it on their own. */
export const interactionInstanceId = (textId: string, actorId?: string) => (actorId ? `ix:${textId}@${actorId}` : `ix:${textId}`)

function actorOf(def: InteractionDef, instanceId: string): string | null | undefined {
  const base = interactionInstanceId(def.textId)
  if (instanceId === base) return null
  const actor = instanceId.startsWith(`${base}@`) ? instanceId.slice(base.length + 1) : ''
  return actor && !actor.includes('@') ? actor : undefined
}

function recorded(events: readonly AnyEvent[], def: InteractionDef, instanceId: string): InteractionResult | null {
  for (const e of events) {
    if (e.type !== 'interaction_completed' || e.payload.interactionInstanceId !== instanceId) continue
    const completed = e.payload.outcome === 'completed'
    return {
      requestId: e.sourceIntentId,
      instanceId,
      outcome: completed ? 'completed' : 'skipped',
      // Gestures are not kept in the ledger (they change nothing), so a reload shows none.
      inspected: completed && def.template === 'evidence' ? keyHotspots(def) : [],
      check: completed ? null : def.skipCheck,
      duplicate: true,
    }
  }
  return null
}

/** The settled result for an instance, if any; the UI opens on it after a reload. */
export const recordedResult = recorded

function checkEvidence(def: EvidenceDef, req: InteractionRequest, skip: boolean) {
  const known = new Set(def.hotspots.map((h) => h.id))
  const unknown = req.params.inspected.filter((id) => !known.has(id))
  if (unknown.length) throw new InteractionRejected(`没有这些检视点：${unknown.join('、')}`)
  if (!skip && missingKeys(def, req.params.inspected).length) throw new InteractionRejected('还有关键之处没看')
}

function checkGestures(def: GestureDef, req: InteractionRequest, skip: boolean, present: readonly string[]) {
  const guests = new Set(present)
  const gestures = new Set(def.gestures.map((g) => g.id))
  const seen = new Set<string>()
  for (const t of req.params.inspected) {
    const [guest, gesture, ...rest] = t.split(':')
    if (rest.length || !guests.has(guest) || !gestures.has(gesture)) throw new InteractionRejected(`无效的姿态：${t}`)
    if (seen.has(guest)) throw new InteractionRejected(`同一位宾客只能选一种姿态：${guest}`)
    seen.add(guest)
  }
  if (!skip && missingGuests(present, req.params.inspected).length) throw new InteractionRejected('还有在座的宾客没有照应到')
}

export interface SettleOptions {
  /** `dialogue-gesture`: the guests who actually came, from game state. */
  readonly present?: readonly string[]
}

/**
 * Settles one request into a single `interaction_completed`. The instance can settle once: a repeat
 * of the same request, or any later request for the same instance, returns the recorded result.
 */
export function settleInteraction(
  events: readonly AnyEvent[],
  def: InteractionDef,
  req: InteractionRequest,
  ctx: CommitContext,
  options: SettleOptions = {},
): { readonly events: readonly AnyEvent[]; readonly result: InteractionResult } {
  const actor = actorOf(def, req.instanceId)
  if (actor === undefined) throw new InteractionRejected('互动实例与条目不符')
  const done = recorded(events, def, req.instanceId)
  if (done) return { events, result: done }

  const skip = req.action === 'skip'
  if (def.template === 'evidence') checkEvidence(def, req, skip)
  else {
    const present = options.present ?? []
    const known = new Set(def.guests.map((g) => g.id))
    if (present.length < 2 || present.some((g) => !known.has(g))) throw new Error(`${def.textId}：在座宾客不合法（${present.join('、')}）`)
    checkGestures(def, req, skip, present)
  }

  const outcome = skip ? 'skipped' : 'completed'
  const r = commitIntent(events, req.requestId, [
    { type: 'interaction_completed', payload: { template: def.template, outcome, textId: def.textId, interactionInstanceId: req.instanceId }, actorIds: actor ? [actor] : [] },
  ], ctx)
  const picks = def.template === 'evidence' ? [...new Set(req.params.inspected)] : (options.present ?? []).map((g) => `${g}:${pickOf(req.params.inspected, g)}`)
  return {
    events: r.events,
    result: {
      requestId: req.requestId,
      instanceId: req.instanceId,
      outcome,
      inspected: skip ? [] : picks,
      check: skip ? def.skipCheck : null,
      duplicate: r.duplicate,
    },
  }
}
