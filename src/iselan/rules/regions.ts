import type { ArcId, BellCityId, DirectionId, FactionId, RegionId } from '../data'
import { VOCAB } from '../data'
import { draft, type AnyDraft, type Snapshot } from '../events'
import { factionStateOf, hasFact, darkLineStateOf } from './conditions'
import { directionDraft } from './directions'
import { hungerDraft } from './hunger'
import { PLANS } from './plans'

type Stage = 'calm' | 'unrest' | 'converging' | 'resolved'
const ORDER: readonly Stage[] = ['calm', 'unrest', 'converging', 'resolved']

interface RegionRule {
  readonly arc: ArcId
  /** 02 §11: the clock value is the earliest moment; the plan must have actually gone ahead. */
  readonly unrest: { readonly clock: number; readonly plan: string }
  readonly converge: { readonly clock: number; readonly plan: string }
  readonly defaultOutcome: string
  readonly heart?: { readonly id: BellCityId; readonly holder: 'faction' | 'origin'; readonly holderId: string }
  readonly directions: readonly (readonly [DirectionId, number, ((s: Snapshot) => boolean)?])[]
  readonly hunger?: number
}

/** 02 §11, regions that can converge on their own. */
export const REGION_RULES: Readonly<Partial<Record<RegionId, RegionRule>>> = {
  gray_harbor: {
    arc: 'gray_well', unrest: { clock: 7, plan: 'copper_buy_wells' }, converge: { clock: 10, plan: 'copper_take_council' },
    defaultOutcome: 'tide_well_to_guild', directions: [['D03', 2]],
  },
  kalvis: {
    arc: 'crown_bell_arc', unrest: { clock: 7, plan: 'crown_secret_crown_bell' }, converge: { clock: 10, plan: 'crown_requisition_or_war' },
    defaultOutcome: 'crown_bell_to_crown', heart: { id: 'crown_bell', holder: 'faction', holderId: 'kalvis_crown' },
    directions: [['D04', 2], ['D12', 1, (s) => !hasFact(s, 'astrion_unmasked')]],
  },
  whitestone: {
    arc: 'seventh_door_echo', unrest: { clock: 3, plan: 'whitestone_breach' }, converge: { clock: 9, plan: 'nameless_thousand_voices' },
    defaultOutcome: 'rock_bell_stays_in_well', heart: { id: 'rock_bell', holder: 'origin', holderId: 'rock_bell' },
    directions: [['D02', 1]], hunger: 2,
  },
  silverleaf: {
    arc: arcOf('silverleaf'), unrest: { clock: 7, plan: 'silverleaf_split' }, converge: { clock: 10, plan: 'silverleaf_retreat' },
    defaultOutcome: 'leaf_bell_sealed_in_trees', heart: { id: 'leaf_bell', holder: 'origin', holderId: 'leaf_bell' }, directions: [['D10', 2]],
  },
  bell_valley: {
    arc: arcOf('bell_valley'), unrest: { clock: 6, plan: 'bellkeepers_rehearsal' }, converge: { clock: 11, plan: 'bellkeepers_second_seal' },
    defaultOutcome: 'river_bell_to_bellkeepers', heart: { id: 'river_bell', holder: 'faction', holderId: 'bellkeepers' },
    directions: [['D05', 2], ['D12', 1, (s) => darkLineStateOf(s, 'dl9') !== 'revealed']],
  },
  ember_plains: {
    arc: arcOf('ember_plains'), unrest: { clock: 5, plan: 'ember_march' }, converge: { clock: 10, plan: 'ember_war_or_peace' },
    defaultOutcome: 'ember_bell_stays', heart: { id: 'ember_bell', holder: 'origin', holderId: 'ember_bell' }, directions: [['D06', 2]],
  },
  silent_sea: {
    arc: arcOf('silent_sea'), unrest: { clock: 8, plan: 'mistsail_ghost_fleet' }, converge: { clock: 11, plan: 'mistsail_toll' },
    defaultOutcome: 'mist_bell_on_mute_song', heart: { id: 'mist_bell', holder: 'faction', holderId: 'mistsail' }, directions: [],
  },
}

function arcOf(region: RegionId): ArcId {
  const arc = VOCAB.arcs.find((a) => a.region === region && a.kind === 'core')
  if (!arc) throw new Error(`${region} 没有核心冒险`)
  return arc.id
}

const ownerOf = (planId: string): FactionId | null => PLANS.find((p) => p.id === planId)?.owner ?? null

function planStands(s: Snapshot, planId: string): boolean {
  const owner = ownerOf(planId)
  return s.plansAdvanced.includes(planId) && (!owner || factionStateOf(s, owner) !== 'fallen')
}

const stageOf = (s: Snapshot, region: RegionId): Stage => s.regions[region]?.stage ?? 'calm'

/** The party is in the middle of this region's core adventure: convergence waits (02 §11). */
function inCoreArc(s: Snapshot, rule: RegionRule, region: RegionId) {
  const arc = s.arcs[rule.arc]
  return !!arc && arc.beats.length > 0 && !arc.outcomes && s.location?.regionId === region
}

/**
 * 02 §11 after any change: a resolved core adventure settles its region; otherwise regions
 * move forward by the highest clock reached and the plan that drives them. Stages never go back.
 */
export function regionDrafts(s: Snapshot): AnyDraft[] {
  const out: AnyDraft[] = []
  for (const [region, rule] of Object.entries(REGION_RULES) as [RegionId, RegionRule][]) {
    const stage = stageOf(s, region)
    if (stage === 'resolved') continue
    if (s.arcs[rule.arc]?.outcomes) {
      out.push(draft('region_stage_changed', { regionId: region, stage: 'resolved', defaultOutcome: '' }))
      continue
    }
    const at = ORDER.indexOf(stage)
    if (at < 2 && s.clock.highest >= rule.converge.clock && planStands(s, rule.converge.plan) && !inCoreArc(s, rule, region)) {
      out.push(draft('region_stage_changed', { regionId: region, stage: 'converging', defaultOutcome: rule.defaultOutcome }), ...convergeEffects(s, region, rule))
    } else if (at < 1 && s.clock.highest >= rule.unrest.clock && planStands(s, rule.unrest.plan)) {
      out.push(draft('region_stage_changed', { regionId: region, stage: 'unrest', defaultOutcome: '' }))
    }
  }
  return out
}

function convergeEffects(s: Snapshot, region: RegionId, rule: RegionRule): AnyDraft[] {
  const out: AnyDraft[] = []
  if (region === 'gray_harbor' && s.objects.tide_well === 'running') out.push(draft('object_state_changed', { objectId: 'tide_well', state: 'guild_kept' }))
  if (rule.heart) {
    const current = s.bells.hearts[rule.heart.id]
    if (!current || current.holder === 'origin') out.push(draft('bell_heart_moved', { bellHeartId: rule.heart.id, holder: rule.heart.holder, holderId: rule.heart.holderId }))
  }
  for (const [id, delta, when] of rule.directions) {
    if (when && !when(s)) continue
    const d = directionDraft(s, id, delta)
    if (d) out.push(d)
  }
  if (rule.hunger) out.push(hungerDraft(s, rule.hunger, 'clock'))
  return out
}
