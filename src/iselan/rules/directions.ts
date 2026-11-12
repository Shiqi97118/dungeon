import { CONFIG } from '../config'
import type { DirectionId, FactionId, RegionId } from '../data'
import { VOCAB } from '../data'
import { draft, type AnyDraft, type Snapshot } from '../events'
import { r1Met, seatsReach } from './choices'
import { attitudeOf, bellHeartsHeld, darkLineStateOf, friendlyFactionCluster, hasFact, relationOf, truthLevel } from './conditions'
import { drawWeighted, rngFor } from './random'

const ROUND_CAP = 3

/** R6: in act 4 every push on a direction counts double. */
export const directionMultiplier = (s: Snapshot) => (s.act === 4 ? CONFIG.act4LastActions.directionPushMultiplier : 1)

/** 06 §2: change a direction score, holding the net change in one round within ±3. */
export function directionDraft(s: Snapshot, directionId: DirectionId, delta: number): AnyDraft | null {
  const used = s.directionsThisRound[directionId] ?? 0
  const wanted = delta * directionMultiplier(s)
  const allowed = Math.max(-ROUND_CAP, Math.min(ROUND_CAP, used + wanted)) - used
  if (!allowed) return null
  const value = (s.directions[directionId] ?? 0) + allowed
  return draft('direction_weight_changed', { directionId, delta: allowed, value })
}

export const coreArcsDone = (s: Snapshot) =>
  VOCAB.arcs.filter((a) => a.kind === 'core' && s.arcs[a.id]?.outcomes).length

export const reachedNamelessCity = (s: Snapshot) => (s.regions.nameless_city?.visits ?? 0) > 0

export const atDoor = (s: Snapshot) => s.location?.placeId === 'nameless_city.door'

const truthConfirmed = (s: Snapshot, id: string) => s.truths.some((t) => t.truthId === id)
const restsDone = (s: Snapshot) => s.namesInvoked.filter((n) => n.mode === 'rest').length
const destroyedNodes = (s: Snapshot) =>
  Object.values(s.bells.hearts).filter((h) => h?.holder === 'destroyed').length + Object.values(s.objects).filter((v) => v === 'destroyed').length

type Tier = 0 | 1 | 2 | 3 | 'disaster'
type Check = (s: Snapshot) => boolean

interface DirectionRule {
  readonly tier: Tier
  /** 06 §4 「前提」 (hard). Missing = no premise. */
  readonly premise?: Check
  /** 06 §4 「否定」: once true the direction is gone. */
  readonly negation?: Check
  /**
   * 12 §6.5: at least one signal must hold for anything but D01. null = signals not yet written
   * for this direction (CNT-03), so it cannot be a candidate in the first release.
   */
  readonly signal: Check | null
  /** 06 §6: the door outcome required when the party is at the door. */
  readonly door?: 'ring' | 'hold' | 'shatter'
  /** Tier 2: factions whose relation must have reached ±2. */
  readonly factions?: readonly FactionId[]
}

const crisisOrHunger: Check = (s) => s.clock.crisis || s.hunger >= 8

export const DIRECTION_RULES: Readonly<Record<DirectionId, DirectionRule>> = {
  D01: { tier: 0, signal: () => true },
  D02: { tier: 'disaster', premise: crisisOrHunger, signal: crisisOrHunger, door: 'ring' },
  D03: { tier: 1, signal: (s) => s.objects.tide_well === 'guild_kept' || attitudeOf(s, 'cedric') >= 2 || hasFact(s, 'special_partner') },
  D04: { tier: 1, signal: null },
  D05: { tier: 1, signal: null, door: 'hold' },
  D06: { tier: 1, signal: null },
  D07: { tier: 1, signal: (s) => attitudeOf(s, 'agatha') >= 2 || (darkLineStateOf(s, 'dl1') === 'revealed' && s.objects.tide_well === 'exposed') },
  D08: { tier: 1, signal: null },
  D09: { tier: 1, signal: null },
  D10: { tier: 1, signal: null },
  D11: { tier: 2, premise: (s) => friendlyFactionCluster(s) >= 3, signal: null, door: 'hold' },
  // 06 D12 also allows "unmasked but someone still deals with him"; that deal is not a vocabulary fact yet.
  D12: { tier: 2, premise: (s) => !hasFact(s, 'astrion_unmasked'), negation: (s) => hasFact(s, 'astrion_sealed'), signal: null, door: 'ring' },
  D13: { tier: 2, premise: (s) => destroyedNodes(s) >= 2, signal: null, door: 'shatter' },
  // 06 D14 needs Borin's contract or the academy's repair plan, neither a vocabulary fact yet.
  D14: { tier: 2, premise: () => false, signal: null },
  D15: { tier: 2, premise: (s) => hasFact(s, 'astrion_sealed'), signal: null },
  D16: { tier: 2, premise: (s) => truthLevel(s) >= 3 && (darkLineStateOf(s, 'dl3') === 'revealed' || darkLineStateOf(s, 'dl5') === 'revealed'), signal: null },
  D17: { tier: 3, premise: (s) => atDoor(s) && doorHearts(s) >= 4 && truthConfirmed(s, 'beyond_the_door'), signal: null, door: 'ring' },
  D18: { tier: 3, premise: (s) => atDoor(s) && truthConfirmed(s, 'beyond_the_door'), signal: null, door: 'ring' },
  D19: { tier: 3, premise: (s) => s.visitedPlaces.includes('nameless_city.square') && restsDone(s) >= 5, signal: null },
  // 06 D20 needs Evelyn, Cyrus or a successor to hand the duty to the party, not a vocabulary fact yet.
  D20: { tier: 3, premise: () => false, signal: null },
}

/**
 * 06 D17: hearts that can go into the door — the party's, plus those offered by allies at the
 * door. Allies' willingness is a scene fact the caller passes in.
 */
export function doorHearts(s: Snapshot, offeredByAllies = 0): number {
  return bellHeartsHeld(s) + offeredByAllies
}

/** 02 §7: whether a depth tier's thresholds are met. */
export function tierOpen(s: Snapshot, tier: Tier, factions: readonly FactionId[] = []): boolean {
  const [t1, t2, t3] = CONFIG.tierChoices
  switch (tier) {
    case 0:
      return r1Met(s)
    case 'disaster':
      return r1Met(s)
    case 1:
      return seatsReach(s, t1) && coreArcsDone(s) >= 1 && truthLevel(s) >= 2
    case 2:
      return seatsReach(s, t2) && coreArcsDone(s) >= 2 && truthLevel(s) >= 3 && factions.some((f) => Math.abs(relationOf(s, f)) >= 2)
    case 3:
      return seatsReach(s, t3) && reachedNamelessCity(s) && truthLevel(s) >= 4
  }
}

export type Unavailable = 'tier' | 'premise' | 'negation' | 'signal' | 'door'

/** 06 §3 step 1 for one direction: null when available, otherwise the first reason it is not. */
export function whyUnavailable(s: Snapshot, id: DirectionId): Unavailable | null {
  if (id === 'D01') return null
  const rule = DIRECTION_RULES[id]
  if (rule.tier !== 'disaster' && !tierOpen(s, rule.tier, rule.factions)) return 'tier'
  if (rule.premise && !rule.premise(s)) return 'premise'
  if (rule.negation?.(s)) return 'negation'
  if (!rule.signal?.(s)) return 'signal'
  if (atDoor(s) && rule.door && s.door?.outcome !== rule.door) return 'door'
  return null
}

const DIRECTION_IDS = VOCAB.directions.map((d) => d.id)

export const availableDirections = (s: Snapshot): DirectionId[] => DIRECTION_IDS.filter((id) => whyUnavailable(s, id) === null)

export const weightOf = (score: number) => Math.max(score, 0) + 1

/**
 * 06 §3 steps 2–4: drop directions at or below −3 (D01 stays if nothing is left), take
 * k = min(3, n), directions scoring ≥ 3 first, then a weighted draw seeded by the run.
 */
export function endingCandidates(s: Snapshot): DirectionId[] {
  const score = (id: DirectionId) => s.directions[id] ?? 0
  let pool = availableDirections(s).filter((id) => score(id) > CONFIG.excludeAtOrBelow)
  if (!pool.length) pool = ['D01']
  const k = Math.min(CONFIG.candidateCount, pool.length)
  const rng = rngFor(s.seed, 'ending-candidates')
  const weighted = (ids: DirectionId[]) => ids.map((item) => ({ item, weight: weightOf(score(item)) }))
  const strong = pool.filter((id) => score(id) >= 3)
  const first = drawWeighted(weighted(strong), k, rng)
  return [...first, ...drawWeighted(weighted(pool.filter((id) => !first.includes(id))), k - first.length, rng)]
}

/** 06 D01: 落地 when a project is still running or a region has two people at +2 or more; otherwise 远行. */
export function d01Variant(s: Snapshot): { readonly variant: 'settle'; readonly regionId: RegionId } | { readonly variant: 'wander' } {
  const project = Object.values(s.projects).find((p) => p.stage === 'operational' || p.stage === 'stable')
  if (project) return { variant: 'settle', regionId: project.regionId }
  const close = new Map<RegionId, number>()
  for (const npc of VOCAB.npcs) {
    if (!('region' in npc) || attitudeOf(s, npc.id) < 2) continue
    close.set(npc.region, (close.get(npc.region) ?? 0) + 1)
  }
  for (const [regionId, n] of close) if (n >= 2) return { variant: 'settle', regionId }
  return { variant: 'wander' }
}
