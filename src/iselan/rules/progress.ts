import { CONFIG } from '../config'
import type { FactionStateId } from '../data'
import { draft, type AnyDraft, type Snapshot } from '../events'
import { activeSeats, r1Met } from './choices'
import { bellHeartsHeld, factionStateOf, hasFact, npcStateOf, truthLevel } from './conditions'
import { atDoor, coreArcsDone } from './directions'
import { OUT_OF_OFFICE } from './plans'

const ACT_TWO_CLOCK = 4
const ACT_THREE_CLOCK = 8
const ACT_THREE_TRUTH = 3

/** 02 §3: acts 2 and 3 follow progress. Act 4 only comes from `wrapUpDrafts` or `doorDrafts` (R4), never from the clock. */
export function actDrafts(s: Snapshot): AnyDraft[] {
  if (s.act === 1 && (coreArcsDone(s) >= 1 || s.clock.highest >= ACT_TWO_CLOCK)) return [draft('act_entered', { act: 2, via: 'progress' })]
  if (s.act === 2 && (truthLevel(s) >= ACT_THREE_TRUTH || s.clock.highest >= ACT_THREE_CLOCK)) return [draft('act_entered', { act: 3, via: 'progress' })]
  return []
}

/** R4: with R1 met, every player in a seat still in play agrees to bring the story to a close. */
export function wrapUpDrafts(s: Snapshot, agreeingSeatIds: readonly string[]): AnyDraft[] | null {
  if (s.act === 4 || !r1Met(s)) return null
  const humans = activeSeats(s).filter(([, seat]) => seat.controller === 'human')
  if (!humans.length || !humans.every(([id]) => agreeingSeatIds.includes(id))) return null
  return [draft('act_entered', { act: 4, via: 'wrap_up' })]
}

/** R4 / R7: the party stands at the seventh door and R1 is met. */
export function doorDrafts(s: Snapshot): AnyDraft[] | null {
  if (s.act === 4 || !atDoor(s) || !r1Met(s)) return null
  return [draft('act_entered', { act: 4, via: 'door' })]
}

/** R7: three bell hearts, or two and the great bellkeeper (or a successor) as guide. */
export function canEnterNamelessCity(s: Snapshot, guided: boolean): boolean {
  const { required, withGreatBellGuide } = CONFIG.cityEntryBellHearts
  const hearts = bellHeartsHeld(s)
  return hearts >= required || (guided && hearts >= withGreatBellGuide)
}

const GUILD_RANK: readonly FactionStateId[] = ['default', 'thwarted', 'turned', 'fallen']

/** 12 §11: the copper guild's state follows the tide well, Cedric and Fabian's faction; it never steps back. */
export function guildStateDrafts(s: Snapshot): AnyDraft[] {
  const current = factionStateOf(s, 'copper_guild')
  let target: FactionStateId = 'default'
  if (OUT_OF_OFFICE.includes(npcStateOf(s, 'cedric'))) target = 'fallen'
  else if (hasFact(s, 'fabian_faction_leads')) target = 'turned'
  else if (s.objects.tide_well === 'exposed' || s.objects.tide_well === 'destroyed') target = 'thwarted'
  if (GUILD_RANK.indexOf(target) <= GUILD_RANK.indexOf(current)) return []
  return [draft('faction_state_changed', { factionId: 'copper_guild', state: target })]
}
