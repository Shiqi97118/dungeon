import { produce, type Draft } from 'immer'
import { CONFIG } from '../config'
import type {
  ArcId, BeatId, BellCityId, DarkLineId, DarkLineStateId, DirectionId, EventPayloads, EvidenceId, FactId,
  FactionId, FactionStateId, InteractionId, NpcId, NpcStateId, ObjectId, OpeningHookId, OutcomeId, PlaceId, RegionId, TruthId,
} from '../data'
import { VOCAB } from '../data'
import type { AnyEvent } from './types'

type P<T extends keyof EventPayloads> = EventPayloads[T]

export interface SeatState {
  readonly actorId: string
  readonly controller: P<'seat_changed'>['controller']
  /** Counts toward the seat's quota, including choices inherited from a previous occupant. */
  readonly choices: number
  /** Made by the current occupant in person since joining (not while an AI stands in). */
  readonly ownChoices: number
  /** Joined mid-run or took over from another character, so R1a/R1b's own-choice minimum applies. */
  readonly mustOwn: boolean
  readonly dedupeKeys: readonly string[]
}

export interface NpcSnapshot {
  readonly state: NpcStateId
  readonly met: boolean
  /** Towards the party, −3…+3. */
  readonly attitude: number
  readonly towards: Readonly<Partial<Record<NpcId, number>>>
  /** Most recent non-milestone impressions, oldest first. */
  readonly impressions: readonly string[]
  readonly milestones: readonly string[]
  readonly knows: readonly { readonly factId: FactId; readonly via: P<'npc_learned'>['via']; readonly fromId: string; readonly arrivesAtRound: number }[]
  readonly beliefs: Readonly<Record<string, { readonly position: string; readonly evidenceEventIds: readonly string[] }>>
  /** npc_trust_earned, npc_rescued, npc_oath_kept:<oathId>, … in the order they happened. */
  readonly marks: readonly string[]
}

export interface FactionSnapshot {
  readonly state: FactionStateId
  /** Towards the party, −3…+3. */
  readonly relation: number
  readonly towards: Readonly<Partial<Record<FactionId, number>>>
  readonly contacted: boolean
  readonly plan: { readonly planId: string; readonly stage: number } | null
  readonly blocked: { readonly planId: string; readonly round: number; readonly failedPreconditions: readonly string[] } | null
}

export interface ProjectSnapshot {
  readonly kind: P<'player_project_created'>['kind']
  readonly regionId: RegionId
  readonly stage: P<'player_project_stage_changed'>['stage']
  readonly foundedRound: number | null
  readonly operationalRound: number | null
  /** Distinct rounds with a counted choice tagged `project:<id>`. */
  readonly investedRounds: readonly number[]
  readonly risks: readonly (P<'player_project_risk'> & { readonly round: number })[]
  readonly marks: readonly string[]
  /** Set at founding (12 §6.3): what the party calls it and the local contact who vouched for it. */
  readonly name: string | null
  readonly contactId: NpcId | null
}

/** State derived from the event log (08 §4). Never edited directly; rebuild with `reduceEvents`. */
export interface Snapshot {
  readonly runId: string
  readonly seq: number
  readonly mode: P<'run_started'>['mode'] | null
  readonly partySize: number
  readonly seed: string
  readonly openingHook: OpeningHookId | null
  readonly round: number
  readonly act: number
  readonly actVia: P<'act_entered'>['via'] | null
  readonly seats: Readonly<Record<string, SeatState>>
  readonly consents: readonly P<'consent_given'>[]
  readonly hooksTaken: readonly P<'first_hook_taken'>[]
  readonly arcs: Readonly<Partial<Record<ArcId, { readonly beats: readonly BeatId[]; readonly outcomes: readonly OutcomeId[] | null }>>>
  readonly texts: Readonly<Record<string, { readonly count: number; readonly lastRound: number }>>
  readonly clock: {
    readonly value: number
    readonly highest: number
    readonly crisis: boolean
    readonly crisisStartedRound: number | null
    readonly crisisStep: number
    /** Extra advances outside the scheduled check (R2), by planId. */
    readonly extras: readonly { readonly planId: string; readonly round: number }[]
    readonly reversals: readonly string[]
  }
  readonly plansAdvanced: readonly string[]
  readonly factions: Readonly<Partial<Record<FactionId, FactionSnapshot>>>
  readonly treaties: readonly P<'faction_treaty_signed'>[]
  readonly regions: Readonly<Partial<Record<RegionId, { readonly stage: P<'region_stage_changed'>['stage']; readonly defaultOutcome: string | null; readonly visits: number; readonly stabilized: boolean }>>>
  readonly location: { readonly regionId: RegionId; readonly placeId: PlaceId | null } | null
  readonly ambience: P<'ambience_changed'> | null
  readonly places: readonly PlaceId[]
  readonly visitedPlaces: readonly PlaceId[]
  readonly routes: readonly string[]
  readonly facts: Readonly<Partial<Record<FactId, { readonly source: string; readonly seq: number }>>>
  readonly objects: Readonly<Record<ObjectId, string>>
  readonly darkLines: Readonly<Partial<Record<DarkLineId, { readonly state: DarkLineStateId; readonly evidence: readonly { readonly id: EvidenceId; readonly reliable: boolean }[] }>>>
  readonly truths: readonly { readonly truthId: TruthId; readonly layer: number }[]
  readonly records: readonly P<'historical_record_verified'>[]
  readonly correctedPeriods: readonly string[]
  readonly memoryFragments: readonly string[]
  readonly npcs: Readonly<Partial<Record<NpcId, NpcSnapshot>>>
  readonly hunger: number
  readonly namesInvoked: readonly P<'name_invoked'>[]
  readonly bells: {
    readonly verifiedCities: readonly BellCityId[]
    readonly hearts: Readonly<Partial<Record<BellCityId, { readonly holder: P<'bell_heart_moved'>['holder']; readonly holderId: string }>>>
    readonly dispositions: Readonly<Partial<Record<BellCityId, string>>>
    readonly ringPrevented: P<'bell_ring_prevented'> | null
  }
  readonly door: P<'door_outcome_committed'> | null
  readonly interactions: Readonly<Record<string, { readonly template: InteractionId; readonly outcome: P<'interaction_completed'>['outcome']; readonly textId: string }>>
  readonly directions: Readonly<Partial<Record<DirectionId, number>>>
  /** Net change per direction in the current round, for the ±3 per round cap. */
  readonly directionsThisRound: Readonly<Partial<Record<DirectionId, number>>>
  readonly ending: P<'ending_committed'> | null
  readonly legends: readonly string[]
  readonly resolutions: readonly ({ readonly kind: 'nonviolent'; readonly severity: string } | { readonly kind: 'custom'; readonly importance: string })[]
  readonly projects: Readonly<Record<string, ProjectSnapshot>>
  readonly homes: readonly P<'home_established'>[]
}

/** `choice_counted.changeKinds` entry marking a choice invested in a player project. */
export const PROJECT_KIND_PREFIX = 'project:'

const ATTITUDE_RANGE = [-3, 3] as const
const HUNGER_RANGE = [0, 10] as const
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v))

export function initialSnapshot(runId: string): Snapshot {
  return {
    runId, seq: 0, mode: null, partySize: 0, seed: '', openingHook: null, round: 0, act: 1, actVia: null,
    seats: {}, consents: [], hooksTaken: [], arcs: {}, texts: {},
    clock: { value: 0, highest: 0, crisis: false, crisisStartedRound: null, crisisStep: 0, extras: [], reversals: [] },
    plansAdvanced: [],
    factions: {}, treaties: [], regions: {}, location: null, ambience: null, places: [], visitedPlaces: [], routes: [],
    facts: {}, objects: Object.fromEntries(VOCAB.objects.map((o) => [o.id, o.initial])) as Record<ObjectId, string>,
    darkLines: {}, truths: [], records: [], correctedPeriods: [], memoryFragments: [],
    npcs: {}, hunger: 0, namesInvoked: [],
    bells: { verifiedCities: [], hearts: {}, dispositions: {}, ringPrevented: null },
    door: null, interactions: {}, directions: {}, directionsThisRound: {}, ending: null, legends: [], resolutions: [], projects: {}, homes: [],
  }
}

const newNpc = (): NpcSnapshot => ({ state: 'active', met: false, attitude: 0, towards: {}, impressions: [], milestones: [], knows: [], beliefs: {}, marks: [] })
const newFaction = (): FactionSnapshot => ({ state: 'default', relation: 0, towards: {}, contacted: false, plan: null, blocked: null })

function npc(s: Draft<Snapshot>, id: NpcId): Draft<NpcSnapshot> {
  return (s.npcs[id] ??= newNpc() as Draft<NpcSnapshot>)
}
function faction(s: Draft<Snapshot>, id: FactionId): Draft<FactionSnapshot> {
  return (s.factions[id] ??= newFaction() as Draft<FactionSnapshot>)
}
function region(s: Draft<Snapshot>, id: RegionId) {
  return (s.regions[id] ??= { stage: 'calm', defaultOutcome: null, visits: 0, stabilized: false })
}
function darkLine(s: Draft<Snapshot>, id: DarkLineId) {
  return (s.darkLines[id] ??= { state: 'untouched', evidence: [] })
}
const pushOnce = <T>(list: T[], v: T) => {
  if (!list.includes(v)) list.push(v)
}

function apply(s: Draft<Snapshot>, e: AnyEvent): void {
  switch (e.type) {
    case 'run_started': {
      const { mode, partySize, seed, openingHook } = e.payload
      Object.assign(s, { mode, partySize, seed, openingHook })
      return
    }
    case 'round_started':
      s.round = e.payload.round
      s.directionsThisRound = {}
      return
    case 'seat_changed': {
      const { seatId, actorId, controller, inheritedChoices } = e.payload
      const prev = s.seats[seatId]
      s.seats[seatId] =
        prev && prev.actorId === actorId
          ? { ...prev, controller }
          : { actorId, controller, choices: inheritedChoices, ownChoices: 0, mustOwn: prev !== undefined || s.round > 0, dedupeKeys: [] }
      return
    }
    case 'choice_counted': {
      const seat = s.seats[e.payload.seatId]
      if (!seat || seat.dedupeKeys.includes(e.payload.dedupeKey)) return
      seat.choices += 1
      if (seat.controller === 'human') seat.ownChoices += 1
      seat.dedupeKeys.push(e.payload.dedupeKey)
      for (const kind of e.payload.changeKinds) {
        const p = kind.startsWith(PROJECT_KIND_PREFIX) ? s.projects[kind.slice(PROJECT_KIND_PREFIX.length)] : undefined
        if (p) pushOnce(p.investedRounds, s.round)
      }
      return
    }
    case 'consent_given':
      s.consents.push({ ...e.payload })
      return
    case 'act_entered':
      s.act = e.payload.act
      s.actVia = e.payload.via
      return
    case 'first_hook_taken':
      s.hooksTaken.push({ ...e.payload })
      return
    case 'arc_beat_reached': {
      const arc = (s.arcs[e.payload.arcId] ??= { beats: [], outcomes: null })
      pushOnce(arc.beats, e.payload.beat)
      return
    }
    case 'core_arc_resolved':
      ;(s.arcs[e.payload.arcId] ??= { beats: [], outcomes: null }).outcomes = [...e.payload.outcomes]
      return
    case 'text_shown': {
      const t = (s.texts[e.payload.textId] ??= { count: 0, lastRound: 0 })
      t.count += 1
      t.lastRound = e.payload.round
      return
    }
    case 'clock_advanced':
      s.clock.value = e.payload.to
      s.clock.highest = Math.max(s.clock.highest, e.payload.to)
      if (e.payload.cause === 'world_event') s.clock.extras.push({ planId: e.payload.planId, round: s.round })
      return
    case 'clock_reversed':
      s.clock.value = e.payload.to
      s.clock.reversals.push(e.payload.cause)
      return
    case 'world_crisis_started':
      s.clock.crisis = true
      s.clock.crisisStartedRound ??= s.round
      return
    case 'crisis_escalated':
      s.clock.crisisStep = e.payload.step
      return
    case 'faction_plan_advanced': {
      const f = faction(s, e.payload.factionId)
      f.plan = { planId: e.payload.planId, stage: e.payload.stage }
      f.blocked = null
      pushOnce(s.plansAdvanced, e.payload.planId)
      return
    }
    case 'faction_plan_blocked':
      faction(s, e.payload.factionId).blocked = { planId: e.payload.planId, round: s.round, failedPreconditions: [...e.payload.failedPreconditions] }
      return
    case 'faction_state_changed':
      faction(s, e.payload.factionId).state = e.payload.state
      return
    case 'faction_relation_changed': {
      const f = faction(s, e.payload.factionId)
      const value = clamp(e.payload.value, ATTITUDE_RANGE)
      if (e.payload.towardsFactionId === 'party') f.relation = value
      else f.towards[e.payload.towardsFactionId] = value
      return
    }
    case 'faction_contacted':
      faction(s, e.payload.factionId).contacted = true
      return
    case 'faction_treaty_signed':
      s.treaties.push({ treatyId: e.payload.treatyId, factionIds: [...e.payload.factionIds] })
      return
    case 'region_stage_changed': {
      const r = region(s, e.payload.regionId)
      r.stage = e.payload.stage
      r.defaultOutcome = e.payload.defaultOutcome || null
      return
    }
    case 'region_crisis_stabilized':
      region(s, e.payload.regionId).stabilized = true
      return
    case 'region_visited':
      region(s, e.payload.regionId).visits = e.payload.visitIndex
      return
    case 'location_changed':
      s.location = { regionId: e.payload.regionId, placeId: e.payload.placeId === 'none' ? null : e.payload.placeId }
      if (e.payload.placeId !== 'none') pushOnce(s.visitedPlaces, e.payload.placeId)
      return
    case 'ambience_changed':
      s.ambience = { ...e.payload }
      return
    case 'place_discovered':
      pushOnce(s.places, e.payload.placeId)
      return
    case 'route_discovered':
      pushOnce(s.routes, e.payload.routeId)
      return
    case 'fact_established':
      s.facts[e.payload.factId] ??= { source: e.payload.source, seq: e.seq }
      return
    case 'fact_retracted':
      delete s.facts[e.payload.factId]
      return
    case 'object_state_changed':
      s.objects[e.payload.objectId] = e.payload.state
      return
    case 'dark_line_changed':
      darkLine(s, e.payload.darkLineId).state = e.payload.state
      return
    case 'truth_evidence_added': {
      const d = darkLine(s, e.payload.darkLineId)
      const id = e.payload.evidenceId as EvidenceId
      const found = d.evidence.find((x) => x.id === id)
      if (found) found.reliable ||= e.payload.reliable
      else d.evidence.push({ id, reliable: e.payload.reliable })
      return
    }
    case 'truth_verified':
      if (!s.truths.some((t) => t.truthId === e.payload.truthId)) s.truths.push({ ...e.payload })
      return
    case 'historical_record_verified':
      if (!s.records.some((r) => r.recordId === e.payload.recordId)) s.records.push({ ...e.payload })
      return
    case 'historical_falsehood_corrected':
      pushOnce(s.correctedPeriods, e.payload.historicalPeriod)
      return
    case 'memory_fragment_verified':
      pushOnce(s.memoryFragments, e.payload.fragmentId)
      return
    case 'npc_met':
      npc(s, e.payload.npcId).met = true
      return
    case 'npc_state_changed':
      npc(s, e.payload.npcId).state = e.payload.state
      return
    case 'npc_attitude_changed': {
      const n = npc(s, e.payload.npcId)
      const value = clamp(e.payload.value, ATTITUDE_RANGE)
      if (e.payload.towardsId === 'party') n.attitude = value
      else n.towards[e.payload.towardsId] = value
      return
    }
    case 'npc_impression_added': {
      const n = npc(s, e.payload.npcId)
      if (e.payload.milestone) n.milestones.push(e.payload.text)
      else n.impressions = [...n.impressions, e.payload.text].slice(-CONFIG.recentImpressions)
      return
    }
    case 'npc_learned': {
      const { factId, via, fromId, arrivesAtRound } = e.payload
      npc(s, e.payload.npcId).knows.push({ factId, via, fromId, arrivesAtRound })
      return
    }
    case 'npc_belief_changed':
      npc(s, e.payload.npcId).beliefs[e.payload.beliefId] = { position: e.payload.position, evidenceEventIds: [...e.payload.evidenceEventIds] }
      return
    case 'npc_rescued':
      pushOnce(npc(s, e.payload.subjectId).marks, e.type)
      return
    case 'npc_oath_kept':
      pushOnce(npc(s, e.payload.npcId).marks, `${e.type}:${e.payload.oathId}`)
      return
    case 'npc_trust_earned':
    case 'npc_name_restored':
    case 'npc_reconciled':
    case 'npc_help_from_former_enemy':
    case 'npc_relationship_repaired':
    case 'npc_arc_resolved':
    case 'personal_farewell_kept':
      pushOnce(npc(s, e.payload.npcId).marks, e.type)
      return
    case 'hunger_changed':
      s.hunger = clamp(e.payload.value, HUNGER_RANGE)
      return
    case 'name_invoked':
      s.namesInvoked.push({ ...e.payload })
      return
    case 'bell_city_verified':
      pushOnce(s.bells.verifiedCities, e.payload.cityId)
      return
    case 'bell_heart_moved':
      s.bells.hearts[e.payload.bellHeartId] = { holder: e.payload.holder, holderId: e.payload.holderId }
      return
    case 'bell_heart_disposition_verified':
      s.bells.dispositions[e.payload.bellHeartId] = e.payload.disposition
      return
    case 'bell_ring_prevented':
      s.bells.ringPrevented = { ...e.payload }
      return
    case 'door_outcome_committed':
      s.door ??= { ...e.payload, votes: [...e.payload.votes] }
      return
    case 'interaction_completed':
      s.interactions[e.payload.interactionInstanceId] ??= { template: e.payload.template, outcome: e.payload.outcome, textId: e.payload.textId }
      return
    case 'direction_weight_changed': {
      const id = e.payload.directionId
      s.directions[id] = e.payload.value
      s.directionsThisRound[id] = (s.directionsThisRound[id] ?? 0) + e.payload.delta
      return
    }
    case 'ending_committed':
      s.ending ??= { ...e.payload }
      return
    case 'legend_recognized':
      pushOnce(s.legends, e.payload.legendId)
      return
    case 'nonviolent_crisis_resolved':
      s.resolutions.push({ kind: 'nonviolent', severity: e.payload.severity })
      return
    case 'custom_resolution_verified':
      s.resolutions.push({ kind: 'custom', importance: e.payload.importance })
      return
    case 'player_project_created':
      s.projects[e.payload.projectId] ??= {
        kind: e.payload.kind, regionId: e.payload.regionId, stage: 'idea', foundedRound: null, operationalRound: null, investedRounds: [], risks: [], marks: [], name: null, contactId: null,
      }
      return
    case 'player_project_stage_changed': {
      const p = s.projects[e.payload.projectId]
      if (!p) return
      p.stage = e.payload.stage
      if (e.payload.stage === 'founded') p.foundedRound ??= s.round
      if (e.payload.stage === 'operational') p.operationalRound ??= s.round
      return
    }
    case 'player_project_details': {
      const p = s.projects[e.payload.projectId]
      if (p) Object.assign(p, { name: e.payload.name, contactId: e.payload.contactId })
      return
    }
    case 'player_project_risk':
      s.projects[e.payload.projectId]?.risks.push({ ...e.payload, round: s.round })
      return
    case 'business_operational':
    case 'business_profitable':
    case 'trade_route_established':
    case 'civic_service_operational':
    case 'player_organization_created': {
      const p = s.projects[e.payload.projectId]
      if (p) pushOnce(p.marks, e.type)
      return
    }
    case 'home_established':
      s.homes.push({ ...e.payload })
      return
    default: {
      const unhandled: never = e
      throw new Error(`未处理的事件类型 ${(unhandled as AnyEvent).type}`)
    }
  }
}

export function applyEvent(s: Snapshot, e: AnyEvent): Snapshot {
  return produce(s, (d) => {
    apply(d, e)
    d.seq = e.seq
  })
}

export function reduceEvents(runId: string, events: readonly AnyEvent[]): Snapshot {
  return events.reduce(applyEvent, initialSnapshot(runId))
}

/** Text ids shown so far with their counts — the `usedTexts` view of 08 §4. */
export function usedTexts(s: Snapshot): readonly { readonly textId: string; readonly count: number; readonly lastRound: number }[] {
  return Object.entries(s.texts).map(([textId, t]) => ({ textId, ...t }))
}

/** Key-order independent JSON, for comparing a stored snapshot with a rebuilt one. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}
