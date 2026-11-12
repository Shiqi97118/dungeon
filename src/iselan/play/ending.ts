import type { DirectionId, FactionId, NpcId, RegionId } from '../data'
import { VOCAB } from '../data'
import type { AnyEvent, ProjectSnapshot, Snapshot } from '../events'
import type { RunRecord } from '../profile/types'
import { d01Variant } from '../rules/directions'
import { ALL_UNITS } from '../texts'
import { PREGENS } from './pregens'
import { npcName, outcomeLabel } from './world'

/**
 * 06 §6: the three ending axes and the chronicle, read only from committed events, so the
 * ending page, the AI's evidence list and the profile's run record all say the same thing.
 */

export interface ChronicleEntry {
  readonly id: string
  readonly round: number
  readonly text: string
  /** `deed`: something the party did; `story`: a beat of the adventure; `world`: what happened around them. */
  readonly kind: 'deed' | 'story' | 'world'
}

const label = (m: Readonly<Record<string, string>>, id: string) => Object.entries(m).find(([, v]) => v === id)?.[0] ?? id
const named = <T extends { readonly id: string; readonly name: string }>(list: readonly T[], id: string) => list.find((x) => x.id === id)?.name ?? id
export const directionName = (id: DirectionId) => named(VOCAB.directions, id)
export const factionName = (id: FactionId) => named(VOCAB.factions, id)
const regionName = (id: RegionId) => named(VOCAB.regions, id)
/** Variants of one text share a title and differ by a bracketed note, e.g. 「（单人开场）」. */
const titleOf = (textId: string) => ALL_UNITS.find((u) => u.id === textId)?.entry.title.replace(/（[^）]*）$/, '')
const factName = (id: string) => VOCAB.facts.find((f) => f.id === id)?.name
const darkLineTitle = (id: string) => VOCAB.darkLines.find((d) => d.id === id)?.title ?? id
const evidenceName = (id: string) => {
  for (const d of VOCAB.darkLines) {
    const hit = Object.entries(d.evidence as Readonly<Record<string, string>>).find(([, v]) => v === id)
    if (hit) return hit[0]
  }
  return null
}

const PROJECT_KIND: Readonly<Record<ProjectSnapshot['kind'], string>> = {
  tavern: '酒馆', guild: '行会', caravan: '商队', sanctuary: '互助站', home: '家', custom: '事业',
}
const PROJECT_STAGE: Readonly<Record<ProjectSnapshot['stage'], string>> = {
  idea: '还只是构想', founded: '刚刚创办', operational: '正在运转', stable: '已经站稳', closed: '已经关闭',
}
const RISK: Readonly<Record<string, string>> = { tax: '征税', seal: '查封', brawl: '斗殴', patients: '病人涌入', other: '风波' }

/** Shown texts worth remembering: story beats and world events, not scenery. */
const MEMORABLE = /^(GH|GEN)-(BEAT|CLK)-/

/** Deeds that weigh most when explaining an ending: decisions, revelations, people won or lost. */
const WEIGHTY = /^(潮井之下|揭开|在.+筹划|事业)|成了你们的朋友|结下了怨/

/** The three deeds an offline ending cites: the weightiest first, then the latest. */
export function citedDeeds(chronicle: readonly ChronicleEntry[], n = 3): ChronicleEntry[] {
  const deeds = chronicle.filter((c) => c.kind === 'deed')
  const heavy = deeds.filter((c) => WEIGHTY.test(c.text)).slice(-n)
  const rest = deeds.filter((c) => !heavy.includes(c)).slice(-(n - heavy.length))
  return [...heavy, ...(heavy.length < n ? rest : [])].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
}

/** One line per thing that changed the story, oldest first. */
export function chronicleOf(events: readonly AnyEvent[]): ChronicleEntry[] {
  const out: ChronicleEntry[] = []
  let round = 0
  const seen = new Set<string>()
  const push = (text: string | null | undefined, kind: ChronicleEntry['kind'] = 'deed') => {
    if (!text || seen.has(text)) return
    seen.add(text)
    out.push({ id: `E${out.length + 1}`, round, text, kind })
  }
  for (const e of events) {
    const p = e.payload as Record<string, never>
    switch (e.type) {
      case 'round_started':
        round = (e.payload as { round: number }).round
        break
      case 'region_visited':
        push(`来到${regionName(p.regionId)}`, 'story')
        break
      case 'npc_met':
        push(`结识${npcName(p.npcId)}`)
        break
      case 'text_shown':
        if (MEMORABLE.test(p.textId)) push(titleOf(p.textId), /-CLK-/.test(p.textId) ? 'world' : 'story')
        break
      case 'core_arc_resolved':
        push(`${named(VOCAB.arcs, p.arcId)}：${(p.outcomes as readonly string[]).map((o) => outcomeLabel(o as never)).join('、')}`)
        break
      case 'truth_evidence_added': {
        const name = evidenceName(p.evidenceId)
        if (name) push(`取得证据：${name}`)
        break
      }
      case 'dark_line_changed':
        if (p.state === 'revealed') push(`揭开${darkLineTitle(p.darkLineId)}`)
        break
      case 'fact_established': {
        const name = factName(p.factId)
        if (name) push(name)
        break
      }
      case 'npc_state_changed':
        if (p.state !== 'active') push(`${npcName(p.npcId)}${label(VOCAB.npcStates as Record<string, string>, p.state)}`)
        break
      case 'npc_attitude_changed': {
        const { value, delta, towardsId } = e.payload as { value?: number; delta: number; towardsId: string }
        if (towardsId === 'party' && value !== undefined && Math.abs(value) >= 2 && Math.abs(value - delta) < 2) {
          push(value > 0 ? `${npcName(p.npcId)}成了你们的朋友` : `${npcName(p.npcId)}与你们结下了怨`)
        }
        break
      }
      case 'faction_state_changed':
        if (p.state !== 'default') push(`${factionName(p.factionId)}${label(VOCAB.factionStates as Record<string, string>, p.state)}`, 'world')
        break
      case 'player_project_created':
        push(`在${regionName(p.regionId)}筹划一家${PROJECT_KIND[p.kind as ProjectSnapshot['kind']]}`)
        break
      case 'player_project_stage_changed':
        if (p.stage !== 'idea') push(`事业${PROJECT_STAGE[p.stage as ProjectSnapshot['stage']]}`)
        break
      case 'player_project_risk':
        push(`事业经历了一次${RISK[p.risk] ?? '风波'}${(e.payload as { weathered: boolean }).weathered ? '，挺了过来' : ''}`)
        break
      case 'consent_given':
        push(`${(e.payload as { detail: string }).detail}`)
        break
      case 'world_crisis_started':
        push('世界陷入全面危机', 'world')
        break
      case 'ending_committed':
        push(`结局：${directionName(p.directionId)}`, 'story')
        break
    }
  }
  return out
}

export type Renown = '无名' | '地方传说' | '大陆传说'

export interface Axes {
  /** Null while the world is undecided (06 §6: a voluntary wrap-up with no world facts). */
  readonly world: { readonly primary: DirectionId; readonly secondary: DirectionId | null } | null
  readonly projects: readonly { readonly id: string; readonly text: string }[]
  readonly renown: Renown
  readonly characters: readonly { readonly actorId: string; readonly name: string; readonly text: string }[]
}

export function projectLine(p: ProjectSnapshot): string {
  const risks = p.risks.length ? `，经历了${p.risks.map((r) => RISK[r.risk] ?? '风波').join('、')}` : ''
  return `${regionName(p.regionId)}的${PROJECT_KIND[p.kind]}${PROJECT_STAGE[p.stage]}${risks}`
}

/** 06 §6 renown, by evidence: a legend beyond the region, a place that calls them "ours", or nobody yet. */
export function renownOf(s: Snapshot): Renown {
  if (s.legends.length) return '大陆传说'
  return d01Variant(s).variant === 'settle' ? '地方传说' : '无名'
}

export function axesOf(s: Snapshot, party: readonly { readonly actorId: string; readonly name: string; readonly seatId: string }[]): Axes {
  const e = s.ending
  const world = e && e.worldResolution === 'resolved'
    ? { primary: e.directionId, secondary: e.secondaryDirectionId !== e.directionId ? e.secondaryDirectionId : null }
    : null
  return {
    world,
    projects: Object.entries(s.projects).map(([id, p]) => ({ id, text: projectLine(p) })),
    renown: renownOf(s),
    characters: party.map((m) => {
      const pre = PREGENS.find((p) => p.id === m.actorId)
      const choices = s.seats[m.seatId]?.choices ?? 0
      return { actorId: m.actorId, name: m.name, text: [pre ? `${pre.title}，${pre.motive}` : null, `做出 ${choices} 次有效选择`].filter(Boolean).join('；') }
    }),
  }
}

export const worldLine = (a: Axes) =>
  a.world ? [directionName(a.world.primary), a.world.secondary ? directionName(a.world.secondary) : null].filter(Boolean).join(' · ') : '未决'

/** 12 §10.3 `run_records`: the summary the profile keeps for a finished run. */
export function summarizeRun(s: Snapshot, events: readonly AnyEvent[]): Pick<RunRecord, 'axes' | 'chronicle'> {
  const seats = Object.entries(s.seats).map(([seatId, seat]) => ({ seatId, actorId: seat.actorId, name: named(VOCAB.pcs, seat.actorId) }))
  const a = axesOf(s, seats)
  return {
    axes: {
      world: worldLine(a),
      projects: a.projects.map((p) => p.text).join('；') || '没有留下事业',
      renown: a.renown,
      characters: a.characters.map((c) => `${c.name}：${c.text}`).join('；'),
    },
    chronicle: chronicleOf(events).map((c) => `第 ${c.round} 轮 · ${c.text}`),
  }
}

/** People and factions the ending speaks of (06 §6 parts 5 and 6). */
export function endingCast(s: Snapshot) {
  const npcs = (Object.entries(s.npcs) as [NpcId, NonNullable<Snapshot['npcs'][NpcId]>][])
    .filter(([, n]) => n.met && Math.abs(n.attitude) >= 2)
    .map(([id, n]) => ({ id, name: npcName(id), attitude: n.attitude, state: n.state, impressions: n.impressions.slice(-2) }))
  const factions = (Object.entries(s.factions) as [FactionId, NonNullable<Snapshot['factions'][FactionId]>][])
    .filter(([, f]) => f.relation !== 0)
    .map(([id, f]) => ({ id, name: factionName(id), relation: f.relation, state: f.state }))
  return { npcs, factions }
}

const MAX_UNFINISHED = 3

/** 06 §6 part 7: story lines still open, as seeds for the next chapter. */
export function unfinishedOf(s: Snapshot): string[] {
  const out: string[] = []
  for (const [id, arc] of Object.entries(s.arcs)) if (arc && !arc.outcomes) out.push(`${named(VOCAB.arcs, id)}还没有结果`)
  for (const [id, d] of Object.entries(s.darkLines)) if (d && d.state !== 'revealed' && d.evidence.length) out.push(`${darkLineTitle(id)}只露出了一角`)
  for (const [id, p] of Object.entries(s.projects)) if (p.stage === 'idea' || p.stage === 'founded') out.push(`${projectLine(s.projects[id])}，还没等到结果`)
  return out.slice(0, MAX_UNFINISHED)
}
