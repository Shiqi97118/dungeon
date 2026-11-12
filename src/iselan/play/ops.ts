import type { OutcomeId, PlaceId } from '../data'
import { VOCAB } from '../data'
import type { ModelCall } from '../ai'
import { interactionInstanceId, recordedResult, type InteractionRequest, type InteractionResult } from '../interaction'
import {
  act, adjudicate, ARC_OUTCOMES, currentMember, INTERACTIONS, interact, move, proposeRewind, resolveArc, rewind, rewindVoters, roll, voteRewind, wrapUp,
  type EndingCall, type Table, type TableOptions,
} from './table'

/**
 * Everything a player can do to a table, as data: solo applies it in the browser, online the room
 * server applies it to the shared table. Both go through `applyOp`, so the rules are the same.
 */
export type TableOp =
  | { readonly t: 'act'; readonly text: string }
  | { readonly t: 'roll' }
  | { readonly t: 'move'; readonly placeId: PlaceId }
  | { readonly t: 'interact'; readonly req: InteractionRequest }
  | { readonly t: 'resolve'; readonly outcomes: readonly OutcomeId[] }
  | { readonly t: 'wrap' }
  | { readonly t: 'adjudicate' }
  | { readonly t: 'rewind'; readonly checkpointId: string }
  | { readonly t: 'propose'; readonly checkpointId: string }
  | { readonly t: 'vote'; readonly agree: boolean }

export interface Models {
  readonly turn: ModelCall | null
  readonly ending: EndingCall | null
}

export interface OpResult {
  readonly table: Table
  readonly result?: InteractionResult
}

const PLACES = new Set<string>(VOCAB.places.map((p) => p.id))
const OUTCOMES = new Set<string>(ARC_OUTCOMES)
const ACTIONS = new Set(['complete', 'skip', 'alternative'])
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null)

/** An op from the network, or null when it is not one. */
export function parseOp(raw: unknown): TableOp | null {
  const o = (raw ?? {}) as Record<string, unknown>
  switch (o.t) {
    case 'act': {
      const text = str(o.text, 200)
      return text ? { t: 'act', text } : null
    }
    case 'roll': case 'wrap': case 'adjudicate':
      return { t: o.t }
    case 'move':
      return typeof o.placeId === 'string' && PLACES.has(o.placeId) ? { t: 'move', placeId: o.placeId as PlaceId } : null
    case 'resolve': {
      const list = Array.isArray(o.outcomes) ? o.outcomes : []
      return list.length >= 1 && list.length <= 2 && list.every((x) => typeof x === 'string' && OUTCOMES.has(x)) ? { t: 'resolve', outcomes: list as OutcomeId[] } : null
    }
    case 'rewind': case 'propose': {
      const checkpointId = str(o.checkpointId, 40)
      return checkpointId ? { t: o.t, checkpointId } : null
    }
    case 'vote':
      return typeof o.agree === 'boolean' ? { t: 'vote', agree: o.agree } : null
    case 'interact': {
      const r = (o.req ?? {}) as Record<string, unknown>
      const requestId = str(r.requestId, 80)
      const instanceId = str(r.instanceId, 80)
      const inspected = ((r.params ?? {}) as Record<string, unknown>).inspected
      if (!requestId || !instanceId || !ACTIONS.has(r.action as string) || !Array.isArray(inspected) || inspected.length > 12) return null
      if (!inspected.every((x) => typeof x === 'string' && x.length <= 60)) return null
      return { t: 'interact', req: { requestId, instanceId, action: r.action as InteractionRequest['action'], params: { inspected: inspected as string[] } } }
    }
    default:
      return null
  }
}

/** The seats that may send `op` now; 'any' when every seat at the table may. */
export function seatsFor(t: Table, op: TableOp): readonly string[] | 'any' {
  const p = t.pending
  switch (op.t) {
    case 'roll':
      return p?.kind === 'check' ? [p.seatId] : []
    case 'interact':
      return p?.kind === 'interaction' ? [p.seatId] : 'any'
    case 'adjudicate':
    case 'rewind':
      return 'any'
    case 'propose':
    case 'vote':
      return rewindVoters(t)
    default:
      return [currentMember(t).seatId]
  }
}

/** Applies one op for `seatId`; throws with a reason the player can read when it is not allowed. */
export async function applyOp(t: Table, op: TableOp, seatId: string, models: Models, o: TableOptions = {}): Promise<OpResult> {
  const allowed = seatsFor(t, op)
  if (allowed !== 'any' && !allowed.includes(seatId)) throw new Error(op.t === 'propose' || op.t === 'vote' ? '只有在座的玩家可以表决回退' : '现在不是这个角色行动')
  if (t.pending?.kind === 'rewind' && op.t !== 'vote') throw new Error('正在表决回退，等所有人回答')
  switch (op.t) {
    case 'act': return { table: await act(t, op.text, models.turn, o) }
    case 'roll': return { table: await roll(t, models.turn, o) }
    case 'move': return { table: move(t, op.placeId, o) }
    case 'resolve': return { table: resolveArc(t, op.outcomes, o) }
    case 'wrap': return { table: wrapUp(t, o) }
    case 'adjudicate':
      if (t.pending?.kind !== 'ending') throw new Error('还没到写结局的时候')
      return { table: await adjudicate(t, models.ending, o) }
    case 'rewind': return { table: rewind(t, op.checkpointId) }
    case 'propose': return { table: proposeRewind(t, op.checkpointId, seatId) }
    case 'vote': return { table: voteRewind(t, seatId, op.agree) }
    case 'interact': {
      const base = (id: string) => interactionInstanceId(id)
      const def = Object.values(INTERACTIONS).find((d) => op.req.instanceId === base(d.textId) || op.req.instanceId.startsWith(`${base(d.textId)}@`))
      // A retry of a request that already settled gets the same answer (QTE-01 idempotence).
      const done = def && recordedResult(t.events, def, op.req.instanceId)
      return done ? { table: t, result: done } : interact(t, op.req, o)
    }
  }
}
