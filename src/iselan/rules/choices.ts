import { CONFIG } from '../config'
import type { EventType } from '../data'
import { draft, PROJECT_KIND_PREFIX, type AnyDraft, type SeatState, type Snapshot } from '../events'

/** 02 §2: what a settled action must change to count as a choice. */
export type ChangeKind = 'resource' | 'relation' | 'knowledge' | 'location' | 'risk' | 'task'

/**
 * Turns that never count (02 §2): watching, being skipped, choices inside a cost / strain
 * prompt, and steps inside an interaction template.
 */
export type ActionKind = 'act' | 'rest' | 'observe' | 'skipped' | 'pressure' | 'interaction'

const CHANGE_BY_EVENT: Partial<Record<EventType, ChangeKind>> = {
  bell_heart_moved: 'resource',
  object_state_changed: 'resource',
  npc_attitude_changed: 'relation',
  faction_relation_changed: 'relation',
  faction_contacted: 'relation',
  faction_treaty_signed: 'relation',
  npc_trust_earned: 'relation',
  npc_reconciled: 'relation',
  npc_relationship_repaired: 'relation',
  npc_rescued: 'relation',
  npc_state_changed: 'risk',
  fact_established: 'knowledge',
  fact_retracted: 'knowledge',
  truth_evidence_added: 'knowledge',
  truth_verified: 'knowledge',
  dark_line_changed: 'knowledge',
  historical_record_verified: 'knowledge',
  memory_fragment_verified: 'knowledge',
  place_discovered: 'knowledge',
  route_discovered: 'knowledge',
  location_changed: 'location',
  region_visited: 'location',
  arc_beat_reached: 'task',
  core_arc_resolved: 'task',
  player_project_created: 'task',
  player_project_stage_changed: 'task',
  player_project_risk: 'task',
  business_operational: 'task',
  tavern_service_settled: 'resource',
  civic_service_operational: 'task',
}

export interface ActionInput {
  readonly seatId: string
  readonly actorId: string
  readonly kind: ActionKind
  /** Scene, target and method identify "the same action" for de-duplication. */
  readonly sceneId: string
  readonly target: string
  readonly method: string
  /** Events the action's settlement will commit. */
  readonly drafts: readonly AnyDraft[]
  /** Changes the settlement made outside the log, e.g. resources or wounds on the character sheet. */
  readonly settled?: readonly ChangeKind[]
  /** For a rest: whether it actually lowered a wound or strain. */
  readonly riskReduced?: boolean
  /** The action was invested in this player project (12 §6.3). */
  readonly projectId?: string
}

export function changeKindsOf(drafts: readonly AnyDraft[], settled: readonly ChangeKind[] = []): ChangeKind[] {
  const kinds = new Set<ChangeKind>(settled)
  for (const d of drafts) {
    const k = CHANGE_BY_EVENT[d.type]
    if (k) kinds.add(k)
  }
  return [...kinds].sort()
}

const REST_PREFIX = 'rest@'

/** The `choice_counted` draft for a settled action, or null when it does not count (02 §2, R1). */
export function choiceDraft(s: Snapshot, a: ActionInput): AnyDraft | null {
  if (a.kind !== 'act' && a.kind !== 'rest') return null
  const seat = s.seats[a.seatId]
  if (!seat || seat.controller === 'empty' || seat.actorId !== a.actorId) return null
  let dedupeKey: string
  let kinds: string[]
  if (a.kind === 'rest') {
    if (!a.riskReduced) return null
    if (seat.dedupeKeys.at(-1)?.startsWith(REST_PREFIX)) return null
    dedupeKey = `${REST_PREFIX}${s.round}`
    kinds = ['risk']
  } else {
    kinds = changeKindsOf(a.drafts, a.settled)
    if (!kinds.length) return null
    dedupeKey = `${a.sceneId}|${a.target}|${a.method}`
  }
  if (seat.dedupeKeys.includes(dedupeKey)) return null
  if (a.projectId) kinds = [...kinds, `${PROJECT_KIND_PREFIX}${a.projectId}`]
  return draft('choice_counted', { seatId: a.seatId, actorId: a.actorId, changeKinds: kinds, dedupeKey })
}

export const activeSeats = (s: Snapshot): [string, SeatState][] => Object.entries(s.seats).filter(([, seat]) => seat.controller !== 'empty')

/** Every seat still taking part has `min` choices, and late joiners / replacements their own minimum (R1, R1a–R1c). */
export function seatsReach(s: Snapshot, min: number): boolean {
  const seats = activeSeats(s)
  return seats.length > 0 && seats.every(([, seat]) => seat.choices >= min && (!seat.mustOwn || seat.ownChoices >= CONFIG.minOwnChoicesAfterJoin))
}

export const r1Met = (s: Snapshot) => seatsReach(s, CONFIG.minChoicesPerSeat)

/** R1a: a new seat starts from the lowest count among seats in play. */
export function joinSeatDraft(s: Snapshot, seatId: string, actorId: string, controller: 'human' | 'ai'): AnyDraft {
  const counts = activeSeats(s).map(([, seat]) => seat.choices)
  return draft('seat_changed', { seatId, actorId, controller, inheritedChoices: counts.length ? Math.min(...counts) : 0 })
}

/** R1b: a new character in the same seat keeps the seat's count. */
export function replaceCharacterDraft(s: Snapshot, seatId: string, actorId: string, controller: 'human' | 'ai' = 'human'): AnyDraft {
  return draft('seat_changed', { seatId, actorId, controller, inheritedChoices: s.seats[seatId]?.choices ?? 0 })
}

/**
 * R1b/R1c: same character, different controller. 'ai' = an AI stands in for an away player
 * (counts for the seat, not the player); 'empty' = the player left and nobody took over.
 */
export function setControllerDraft(s: Snapshot, seatId: string, controller: 'human' | 'ai' | 'empty'): AnyDraft | null {
  const seat = s.seats[seatId]
  if (!seat) return null
  return draft('seat_changed', { seatId, actorId: seat.actorId, controller, inheritedChoices: seat.choices })
}
