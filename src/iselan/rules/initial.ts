import type { FactionId, NpcId, OpeningHookId } from '../data'
import { draft, type AnyDraft } from '../events'

/** 05 §3–§5 「初始态度」 that are not 0. */
export const INITIAL_ATTITUDES: Readonly<Partial<Record<NpcId, number>>> = {
  astrion: 1, cyrus: -1, orlando: 1, agatha: 1, vyaser: -1, ludo: 1, borin: 1, saka: 1, oswald: 1, marcus: -1,
}

/** 04 §2: faction relations towards the party that are not 0. */
export const INITIAL_PARTY_RELATIONS: Readonly<Partial<Record<FactionId, number>>> = {
  namekeepers: 1, bellkeepers: -1, silverleaf_council: -1,
}

/** 04 §4, row faction towards column faction; 0 entries omitted. */
export const INITIAL_FACTION_RELATIONS: Readonly<Partial<Record<FactionId, Readonly<Partial<Record<FactionId, number>>>>>> = {
  copper_guild: { kalvis_crown: -1, bellkeepers: -1, star_academy: 1, mistsail: -3 },
  kalvis_crown: { copper_guild: -1, bellkeepers: 1, star_academy: 1, namekeepers: -2, ember_tribes: -3, mistsail: -2 },
  bellkeepers: { copper_guild: -1, kalvis_crown: 1, star_academy: -1, namekeepers: -3, silverleaf_council: 1, mistsail: -2 },
  star_academy: { copper_guild: 1, kalvis_crown: 1, bellkeepers: -1, silverleaf_council: -1 },
  namekeepers: { kalvis_crown: -2, bellkeepers: -3, ember_tribes: 1, mistsail: 1 },
  silverleaf_council: { bellkeepers: 1, star_academy: -1 },
  ember_tribes: { kalvis_crown: -3, namekeepers: 1 },
  mistsail: { copper_guild: -3, kalvis_crown: -2, bellkeepers: -2, namekeepers: 1 },
}

export interface OpeningSeat {
  readonly seatId: string
  readonly actorId: string
  readonly controller: 'human' | 'ai'
}

/** Events of the opening intent: the run, its seats, and the starting attitudes and relations as facts in the log. */
export function openingDrafts(input: { mode: 'solo' | 'online'; seed: string; openingHook: OpeningHookId; seats: readonly OpeningSeat[] }): AnyDraft[] {
  const out: AnyDraft[] = [draft('run_started', { mode: input.mode, partySize: input.seats.length, seed: input.seed, openingHook: input.openingHook })]
  for (const seat of input.seats) out.push(draft('seat_changed', { ...seat, inheritedChoices: 0 }))
  for (const [npcId, value] of Object.entries(INITIAL_ATTITUDES) as [NpcId, number][]) {
    out.push(draft('npc_attitude_changed', { npcId, towardsId: 'party', delta: value, value }))
  }
  for (const [factionId, value] of Object.entries(INITIAL_PARTY_RELATIONS) as [FactionId, number][]) {
    out.push(draft('faction_relation_changed', { factionId, towardsFactionId: 'party', delta: value, value }))
  }
  for (const [factionId, row] of Object.entries(INITIAL_FACTION_RELATIONS) as [FactionId, Partial<Record<FactionId, number>>][]) {
    for (const [towardsFactionId, value] of Object.entries(row) as [FactionId, number][]) {
      out.push(draft('faction_relation_changed', { factionId, towardsFactionId, delta: value, value }))
    }
  }
  return out
}
