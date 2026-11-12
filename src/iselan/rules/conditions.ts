import type { ActorId, Atom, Cond, FactionId, NpcId, Op, PlaceId, RegionId, Tag, VariableId } from '../data'
import { VOCAB } from '../data'
import type { Snapshot } from '../events'

/**
 * What the log cannot know about the moment a condition is asked: who is in the scene, the
 * current adventure beat, and so on. Values in `vars` override the ones derived from the
 * snapshot (the clock check evaluates CLK texts with `clock` set to the slot being checked).
 */
export interface SceneContext {
  readonly tags?: readonly Tag[]
  readonly present?: readonly ActorId[]
  readonly inParty?: readonly ActorId[]
  readonly factionsPresent?: readonly FactionId[]
  readonly npcWhere?: Readonly<Partial<Record<ActorId, PlaceId | RegionId>>>
  readonly vars?: Readonly<Partial<Record<VariableId, number | string>>>
}

const FACTION_IDS = VOCAB.factions.map((f) => f.id)

export function compare(op: Op, a: number | string | undefined, b: number | string): boolean {
  if (a === undefined) return op === 'ne'
  switch (op) {
    case 'eq':
      return a === b
    case 'ne':
      return a !== b
  }
  if (typeof a !== 'number' || typeof b !== 'number') return false
  switch (op) {
    case 'ge':
      return a >= b
    case 'le':
      return a <= b
    case 'gt':
      return a > b
    case 'lt':
      return a < b
  }
}

export const truthLevel = (s: Snapshot) => s.truths.reduce((n, t) => Math.max(n, t.layer), 0)
export const bellHeartsHeld = (s: Snapshot) => Object.values(s.bells.hearts).filter((h) => h?.holder === 'party').length
export const crisisRounds = (s: Snapshot) => (s.clock.crisisStartedRound === null ? 0 : s.round - s.clock.crisisStartedRound)
export const attitudeOf = (s: Snapshot, npc: NpcId) => s.npcs[npc]?.attitude ?? 0
export const relationOf = (s: Snapshot, faction: FactionId) => s.factions[faction]?.relation ?? 0
export const npcStateOf = (s: Snapshot, npc: NpcId) => s.npcs[npc]?.state ?? 'active'
export const factionStateOf = (s: Snapshot, faction: FactionId) => s.factions[faction]?.state ?? 'default'
export const darkLineStateOf = (s: Snapshot, id: keyof Snapshot['darkLines']) => s.darkLines[id]?.state ?? 'untouched'
export const hasFact = (s: Snapshot, fact: keyof Snapshot['facts']) => s.facts[fact] !== undefined

/** Mutual relation between two factions: the lower of the two directed values. */
export function factionPair(s: Snapshot, a: FactionId, b: FactionId): number {
  return Math.min(s.factions[a]?.towards[b] ?? 0, s.factions[b]?.towards[a] ?? 0)
}

/** 互友势力数: size of the largest group of factions whose pairwise relations are all ≥ +2. */
export function friendlyFactionCluster(s: Snapshot): number {
  let best = 0
  for (let mask = 1; mask < 1 << FACTION_IDS.length; mask++) {
    const group = FACTION_IDS.filter((_, i) => mask & (1 << i))
    if (group.length <= best) continue
    if (group.every((a, i) => group.slice(i + 1).every((b) => factionPair(s, a, b) >= 2))) best = group.length
  }
  return best === 1 ? 0 : best
}

export function deriveTags(s: Snapshot): Tag[] {
  const tags: Tag[] = []
  if (s.ambience) tags.push(s.ambience.time, s.ambience.weather)
  if (s.clock.crisis) tags.push('全面危机')
  if (s.act === 4) tags.push('进入第四幕')
  return tags
}

function variable(s: Snapshot, id: VariableId): number | string | undefined {
  switch (id) {
    case 'act':
      return s.act
    case 'party_size':
      return s.partySize
    case 'clock':
      return s.clock.value
    case 'crisis_rounds':
      return crisisRounds(s)
    case 'truth_level':
      return truthLevel(s)
    case 'bell_hearts_held':
      return bellHeartsHeld(s)
    case 'hunger':
      return s.hunger
    case 'opening_hook':
      return s.openingHook ?? undefined
    case 'door_outcome':
      return s.door?.outcome
    case 'main_direction':
      return s.ending?.directionId
    case 'ending_variant':
      return s.ending && s.ending.variant !== 'none' ? s.ending.variant : undefined
    case 'act4_entry':
      return s.act !== 4 ? undefined : s.actVia === 'door' ? 'at_door' : s.actVia === 'wrap_up' ? 'wrap_up' : undefined
    case 'friendly_faction_cluster':
      return friendlyFactionCluster(s)
    default:
      return undefined
  }
}

function evalAtom(a: Atom, s: Snapshot, ctx: SceneContext): boolean {
  if ('tag' in a) return deriveTags(s).includes(a.tag) || (ctx.tags ?? []).includes(a.tag)
  if ('fact' in a) return compare(a.op, hasFact(s, a.fact) ? 1 : 0, 1)
  if ('var' in a) {
    const value = ctx.vars?.[a.var]
    if (value !== undefined) return compare(a.op, value, a.value)
    switch (a.var) {
      case 'location': {
        const at = s.location
        const hit = !!at && (at.placeId === a.value || at.regionId === a.value)
        return a.op === 'ne' ? !hit : a.op === 'eq' && hit
      }
      case 'visited_place': {
        const hit = s.visitedPlaces.includes(a.value as PlaceId)
        return a.op === 'ne' ? !hit : a.op === 'eq' && hit
      }
      case 'text_shown': {
        const hit = s.texts[a.value as string] !== undefined
        return a.op === 'ne' ? !hit : a.op === 'eq' && hit
      }
    }
    return compare(a.op, variable(s, a.var), a.value)
  }
  if ('darkLine' in a) return compare(a.op, darkLineStateOf(s, a.darkLine), a.value)
  if ('object' in a) return compare(a.op, s.objects[a.object], a.value)
  if ('attitude' in a) {
    if (a.attitude === '*') return Object.values(s.npcs).some((n) => compare(a.op, n?.attitude ?? 0, a.value))
    return compare(a.op, attitudeOf(s, a.attitude as NpcId), a.value)
  }
  if ('relation' in a) {
    if (a.relation === '*') return Object.values(s.factions).some((f) => compare(a.op, f?.relation ?? 0, a.value))
    return compare(a.op, relationOf(s, a.relation), a.value)
  }
  if ('faction' in a) {
    if ('presence' in a) {
      const here = (ctx.factionsPresent ?? []).includes(a.faction)
      return a.presence === 'absent' ? !here : here
    }
    return compare(a.op, factionStateOf(s, a.faction), a.value)
  }
  if ('presence' in a) {
    const present = (ctx.present ?? []).includes(a.npc) || (ctx.inParty ?? []).includes(a.npc)
    switch (a.presence) {
      case 'present':
        return present
      case 'absent':
        return !present
      case 'in_party':
        return (ctx.inParty ?? []).includes(a.npc)
      case 'met':
        return s.npcs[a.npc as NpcId]?.met === true
    }
  }
  if ('state' in a) return compare(a.op, npcStateOf(s, a.npc as NpcId), a.state)
  if ('whereOp' in a) {
    const where = ctx.npcWhere?.[a.npc]
    const place = VOCAB.places.find((p) => p.id === where)
    const hit = where === a.place || place?.region === a.place
    return a.whereOp === 'ne' ? !hit : a.whereOp === 'eq' && hit
  }
  const unhandled: never = a
  throw new Error(`未处理的条件 ${JSON.stringify(unhandled)}`)
}

export function evalCond(c: Cond, s: Snapshot, ctx: SceneContext = {}): boolean {
  return 'any' in c ? c.any.some((a) => evalAtom(a, s, ctx)) : evalAtom(c, s, ctx)
}

export const allHold = (conds: readonly Cond[] | undefined, s: Snapshot, ctx: SceneContext = {}) => (conds ?? []).every((c) => evalCond(c, s, ctx))
