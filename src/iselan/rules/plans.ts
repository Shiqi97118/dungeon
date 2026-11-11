import type { FactionId, NpcStateId } from '../data'
import { VOCAB } from '../data'
import type { Snapshot } from '../events'
import { attitudeOf, darkLineStateOf, factionStateOf, npcStateOf, relationOf } from './conditions'

export interface PlanDef {
  readonly id: string
  /** Clock slot (04 §8 column, 12 §11) at which the plan is first checked. */
  readonly slot: number
  /** null = a world event with no faction behind it (slots 3 and 12). */
  readonly owner: FactionId | null
  readonly main: boolean
  /** 12 §11's extra prerequisites for version A (main) or for the plan to go ahead (secondary). */
  readonly extra?: (s: Snapshot) => boolean
}

const tideWell = (s: Snapshot) => s.objects.tide_well

/** 12 §11 main plans per slot plus 04 §8's secondary moves. The copper guild's are written out in full (12 §11). */
export const PLANS: readonly PlanDef[] = [
  { id: 'copper_registration', slot: 1, owner: 'copper_guild', main: true, extra: (s) => tideWell(s) !== 'exposed' },
  { id: 'crown_king_slip', slot: 2, owner: 'kalvis_crown', main: true },
  { id: 'namekeepers_list_in_capital', slot: 2, owner: 'namekeepers', main: false },
  { id: 'whitestone_breach', slot: 3, owner: null, main: true },
  { id: 'bellkeepers_muster', slot: 3, owner: 'bellkeepers', main: false },
  { id: 'mistsail_raids', slot: 3, owner: 'mistsail', main: false },
  { id: 'nameless_well_voices', slot: 3, owner: 'the_nameless', main: false },
  { id: 'copper_echo_comms', slot: 4, owner: 'copper_guild', main: true, extra: (s) => tideWell(s) === 'running' || tideWell(s) === 'guild_kept' },
  { id: 'academy_artificial_heart_paper', slot: 4, owner: 'star_academy', main: false },
  { id: 'silverleaf_close_border', slot: 4, owner: 'silverleaf_council', main: false },
  { id: 'ember_march', slot: 5, owner: 'ember_tribes', main: true },
  { id: 'crown_border_troops', slot: 5, owner: 'kalvis_crown', main: false },
  { id: 'namekeepers_assembly', slot: 5, owner: 'namekeepers', main: false },
  { id: 'bellkeepers_rehearsal', slot: 6, owner: 'bellkeepers', main: true },
  { id: 'mistsail_fake_heart_auction', slot: 6, owner: 'mistsail', main: false },
  { id: 'nameless_street_flicker', slot: 6, owner: 'the_nameless', main: false },
  { id: 'bellkeepers_great_arrest', slot: 7, owner: 'bellkeepers', main: true },
  { id: 'copper_buy_wells', slot: 7, owner: 'copper_guild', main: false, extra: (s) => darkLineStateOf(s, 'dl1') !== 'revealed' },
  { id: 'crown_secret_crown_bell', slot: 7, owner: 'kalvis_crown', main: false },
  { id: 'silverleaf_split', slot: 7, owner: 'silverleaf_council', main: false },
  { id: 'ember_skirmishes', slot: 7, owner: 'ember_tribes', main: false },
  { id: 'mistsail_ghost_fleet', slot: 8, owner: 'mistsail', main: true },
  { id: 'academy_cassandra_experiment', slot: 8, owner: 'star_academy', main: false },
  { id: 'namekeepers_radicals', slot: 8, owner: 'namekeepers', main: false },
  { id: 'nameless_thousand_voices', slot: 9, owner: 'the_nameless', main: true },
  { id: 'crown_requisition_or_war', slot: 10, owner: 'kalvis_crown', main: true },
  {
    id: 'copper_take_council', slot: 10, owner: 'copper_guild', main: false,
    extra: (s) => (relationOf(s, 'copper_guild') >= 0 || attitudeOf(s, 'cedric') >= 1) && s.objects.copper_tower === 'intact',
  },
  { id: 'academy_host_ritual_prep', slot: 10, owner: 'star_academy', main: false },
  { id: 'namekeepers_uprising', slot: 10, owner: 'namekeepers', main: false },
  { id: 'silverleaf_retreat', slot: 10, owner: 'silverleaf_council', main: false },
  { id: 'ember_war_or_peace', slot: 10, owner: 'ember_tribes', main: false },
  { id: 'nameless_mist_recedes', slot: 11, owner: 'the_nameless', main: true },
  { id: 'bellkeepers_second_seal', slot: 11, owner: 'bellkeepers', main: false },
  // 04 §8 「若与皇帝交易：开烬钟城」: the deal is not a vocabulary fact yet (CNT-03), so it cannot happen in the first release.
  { id: 'ember_open_bell_city', slot: 11, owner: 'ember_tribes', main: false, extra: () => false },
  { id: 'mistsail_toll', slot: 11, owner: 'mistsail', main: false },
  { id: 'world_crisis', slot: 12, owner: null, main: true },
]

export const mainPlan = (slot: number) => PLANS.find((p) => p.slot === slot && p.main)

/** Marker in `faction_plan_blocked.failedPreconditions` for a plan the party stopped (12 §11 step 1). */
export const BLOCKED_BY_PARTY = 'blocked_by_party'

export const OUT_OF_OFFICE: readonly NpcStateId[] = ['deposed', 'captive', 'dead', 'erased']

export function leaderInOffice(s: Snapshot, faction: FactionId): boolean {
  const leader = VOCAB.factions.find((f) => f.id === faction)?.leader
  return !leader || !OUT_OF_OFFICE.includes(npcStateOf(s, leader))
}

export function blockedByParty(s: Snapshot, faction: FactionId, planId: string, withinRounds: number): boolean {
  const b = s.factions[faction]?.blocked
  return !!b && b.planId === planId && b.failedPreconditions.includes(BLOCKED_BY_PARTY) && s.round - b.round < withinRounds
}

/** Why the owner cannot carry the plan out now; empty when it can. */
export function ownerProblems(s: Snapshot, plan: PlanDef, withinRounds: number): string[] {
  if (!plan.owner) return []
  const problems: string[] = []
  if (!leaderInOffice(s, plan.owner)) problems.push('leader_out_of_office')
  if (factionStateOf(s, plan.owner) === 'fallen') problems.push('faction_fallen')
  if (blockedByParty(s, plan.owner, plan.id, withinRounds)) problems.push(BLOCKED_BY_PARTY)
  return problems
}

