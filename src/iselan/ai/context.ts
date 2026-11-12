import { CONFIG } from '../config'
import type { DirectionId, FactId, FactionId, NpcId, PlaceId, RegionId } from '../data'
import { VOCAB } from '../data'
import type { Snapshot } from '../events'
import { CLOCK_MAX } from '../rules/clock'
import { hasFact, npcStateOf, type SceneContext } from '../rules/conditions'
import type { Pick } from '../texts'
import { estimateTokens } from './tokens'

/** 12 §8.1: the ids the AI may use this round; anything else it proposes is dropped. */
export interface Allowlist {
  readonly npcs: readonly NpcId[]
  readonly factions: readonly FactionId[]
  readonly facts: readonly FactId[]
  readonly evidence: readonly { readonly darkLineId: keyof Snapshot['darkLines']; readonly evidenceId: string }[]
  readonly directions: readonly DirectionId[]
  readonly places: readonly PlaceId[]
  readonly projects: readonly string[]
  /** Player characters who may be asked for consent. */
  readonly actors: readonly string[]
}

export interface TurnInput {
  readonly actorId: string
  readonly actorName: string
  /** The player's words, as typed. */
  readonly text: string
  readonly ctx: SceneContext
  /** Texts already chosen for this moment (arrival, beat, clock event); shown after the narration. */
  readonly prewritten?: readonly Pick[]
  /** One line per past round, oldest first; only the last `recentRoundsInPrompt` are sent. */
  readonly recent?: readonly string[]
  /** Story lines in progress, as short lines. */
  readonly storyLines?: readonly string[]
  /** Narrows or widens the default allowlist. */
  readonly allow?: Partial<Allowlist>
  /** Set on the second call of a checked action: the roll the narration must follow. */
  readonly check?: CheckOutcome
}

export interface CheckOutcome {
  readonly skill: string
  readonly difficulty: number
  readonly reason: string
  readonly dice: readonly [number, number]
  readonly total: number
  readonly tier: 'hit' | 'partial' | 'miss'
}

const TIER_TEXT: Readonly<Record<CheckOutcome['tier'], string>> = { hit: '成功', partial: '成功但有代价', miss: '失利，局势变糟' }

const checkLines = (c: CheckOutcome) => [
  `${c.skill}，难度 ${c.difficulty}（${c.reason}）：掷出 ${c.dice[0]}+${c.dice[1]}，合计 ${c.total}，${TIER_TEXT[c.tier]}`,
  '按这个结果叙述行动的结局并提出相应变化，不要再提出 check',
]

export interface TurnContext {
  readonly content: string
  readonly allow: Allowlist
  readonly tokens: number
  /** Sections that were shortened to fit the budget. */
  readonly trimmed: readonly string[]
}

/** Facts only rules may establish; the AI never proposes them. */
export const RULE_OWNED_FACTS: ReadonlySet<string> = new Set(['fabian_faction_leads', 'astrion_sealed', 'special_partner'])

const npcName = (id: string) => VOCAB.npcs.find((n) => n.id === id)?.name ?? VOCAB.pcs.find((p) => p.id === id)?.name ?? id
const factionName = (id: string) => VOCAB.factions.find((f) => f.id === id)?.name ?? id
const regionName = (id: string) => VOCAB.regions.find((r) => r.id === id)?.name ?? id
const placeName = (id: string) => VOCAB.places.find((p) => p.id === id)?.name ?? id
const npcStateName = (state: string) => Object.entries(VOCAB.npcStates).find(([, v]) => v === state)?.[0] ?? state
const npcFaction = (id: string) => (VOCAB.npcs.find((n) => n.id === id) as { faction?: FactionId } | undefined)?.faction

/** 12 §8.1: the clock appears only as a description of the situation, never as a number. */
export function situationOf(s: Snapshot): string {
  if (s.clock.crisis) return '全面危机：各地的秩序正在崩塌，每过一段时间局势就更坏一分'
  const v = s.clock.value / CLOCK_MAX
  if (v < 0.25) return '表面平静，暗流尚未浮出水面'
  if (v < 0.5) return '暗流涌动，各方势力开始有所动作'
  if (v < 0.75) return '风暴将至，传闻与冲突越来越多'
  return '濒临崩溃，各方已经撕破脸'
}

const UNAVAILABLE = new Set(['dead', 'erased'])

export function defaultAllowlist(s: Snapshot, ctx: SceneContext, region: RegionId | null = s.location?.regionId ?? null): Allowlist {
  const people = [...new Set([...(ctx.present ?? []), ...(ctx.inParty ?? [])])]
  const npcs = people.filter((id): id is NpcId => VOCAB.npcs.some((n) => n.id === id) && !UNAVAILABLE.has(npcStateOf(s, id as NpcId)))
  const factions = [...new Set([...(ctx.factionsPresent ?? []), ...npcs.map(npcFaction).filter((f): f is FactionId => !!f)])]
  const held = (dl: keyof Snapshot['darkLines']) => new Set((s.darkLines[dl]?.evidence ?? []).map((e) => e.id))
  return {
    npcs,
    factions,
    facts: VOCAB.facts.filter((f) => !RULE_OWNED_FACTS.has(f.id) && !hasFact(s, f.id as FactId)).map((f) => f.id as FactId),
    evidence: VOCAB.darkLines.flatMap((d) =>
      Object.values(d.evidence).filter((e) => !held(d.id).has(e as never)).map((e) => ({ darkLineId: d.id, evidenceId: e as string }))),
    directions: [...CONFIG.sliceDirections],
    places: VOCAB.places.filter((p) => p.region === region).map((p) => p.id as PlaceId),
    projects: Object.keys(s.projects),
    actors: Object.values(s.seats).map((seat) => seat.actorId),
  }
}

interface Section {
  readonly title: string
  lines: string[]
  /** Higher survives longer; required sections are never shortened. */
  readonly priority: number
  readonly required?: boolean
  /** Which end loses lines first. */
  readonly dropFrom: 'start' | 'end'
}

function npcLines(s: Snapshot, ids: readonly string[]): string[] {
  return ids.map((id) => {
    const n = s.npcs[id as NpcId]
    if (!n) return `- ${npcName(id)}（${id}）：${npcStateName(npcStateOf(s, id as NpcId))}，初次相遇`
    const knows = n.knows.filter((k) => k.arrivesAtRound <= s.round).map((k) => k.factId)
    const parts = [
      `${npcStateName(n.state)}`,
      `对队伍态度 ${n.attitude >= 0 ? '+' : ''}${n.attitude}`,
      n.impressions.length ? `近期印象：${n.impressions.slice(-CONFIG.recentImpressions).join('；')}` : '',
      n.milestones.length ? `刻骨记忆：${n.milestones.join('；')}` : '',
      Object.keys(n.beliefs).length ? `信念：${Object.entries(n.beliefs).map(([k, b]) => `${k}=${b.position}`).join('；')}` : '',
      knows.length ? `知道：${knows.join('、')}` : '',
    ].filter(Boolean)
    return `- ${npcName(id)}（${id}）：${parts.join('｜')}`
  })
}

function allowLines(a: Allowlist): string[] {
  return [
    `人物：${a.npcs.join('、') || '无'}`,
    `势力：${a.factions.join('、') || '无'}`,
    `事实：${a.facts.join('、') || '无'}`,
    `证据：${a.evidence.map((e) => `${e.darkLineId}/${e.evidenceId}`).join('、') || '无'}`,
    `方向：${a.directions.join('、') || '无'}`,
    `地点：${a.places.join('、') || '无'}`,
    `事业：${a.projects.join('、') || '无'}`,
    `可征求同意的角色：${a.actors.join('、') || '无'}`,
  ]
}

/** 12 §8.1 round content, cut to `roundTokenBudget` by dropping the least important lines first. */
export function buildTurnContext(s: Snapshot, input: TurnInput): TurnContext {
  const base = defaultAllowlist(s, input.ctx)
  const allow: Allowlist = { ...base, ...input.allow }
  const where = s.location ? `${regionName(s.location.regionId)}${s.location.placeId ? ` · ${placeName(s.location.placeId)}` : ''}` : '未知'
  const people = [...new Set([...(input.ctx.inParty ?? []), ...(input.ctx.present ?? [])])]
  const arcs = Object.entries(s.arcs).map(([id, a]) => `- ${VOCAB.arcs.find((x) => x.id === id)?.name ?? id}：已到 ${a?.beats.join('、') || '起点'}${a?.outcomes ? `，结果 ${a.outcomes.join('、')}` : ''}`)
  const projects = Object.entries(s.projects).map(([id, p]) => `- 事业 ${id}（${p.kind}，${regionName(p.regionId)}）：${p.stage}`)
  const relations = Object.entries(s.factions).filter(([id]) => allow.factions.includes(id as FactionId)).map(([id, f]) => `- ${factionName(id)}（${id}）：对队伍 ${f!.relation >= 0 ? '+' : ''}${f!.relation}，${f!.state}`)
  const prewritten = (input.prewritten ?? []).map((p) => `[${p.unit.id}] ${p.paragraphs.join(' ')}`)
  const used = Object.entries(s.texts).sort((a, b) => a[1].lastRound - b[1].lastRound).map(([id]) => id).slice(-CONFIG.usedTextDigest)

  const sections: Section[] = [
    {
      title: '局势', priority: 100, required: true, dropFrom: 'end',
      lines: [`第 ${s.act} 幕｜地点：${where}｜${s.ambience ? `${s.ambience.time}，${s.ambience.weather}` : '时辰未明'}`, `大势：${situationOf(s)}`],
    },
    { title: '在场人物', priority: 60, dropFrom: 'end', lines: npcLines(s, people) },
    { title: '势力', priority: 40, dropFrom: 'end', lines: relations },
    { title: '进行中的故事线', priority: 50, dropFrom: 'end', lines: [...arcs, ...projects, ...(input.storyLines ?? []).map((l) => `- ${l}`)] },
    { title: '最近几轮', priority: 30, dropFrom: 'start', lines: (input.recent ?? []).slice(-CONFIG.recentRoundsInPrompt) },
    { title: '已用过的预写文本（不要复述）', priority: 10, dropFrom: 'start', lines: used.length ? [used.join('、')] : [] },
    { title: '本轮预写文本（接在你的叙述之后原样展示）', priority: 90, required: true, dropFrom: 'end', lines: prewritten },
    { title: '允许的编号（清单外一律无效）', priority: 95, required: true, dropFrom: 'end', lines: allowLines(allow) },
    { title: '当前行动者', priority: 100, required: true, dropFrom: 'end', lines: [`${input.actorName}（${input.actorId}）`] },
    { title: '玩家意图原文', priority: 100, required: true, dropFrom: 'end', lines: [input.text.slice(0, 200)] },
    { title: '检定结果', priority: 100, required: true, dropFrom: 'end', lines: input.check ? checkLines(input.check) : [] },
  ]

  const render = () => sections.filter((x) => x.lines.length).map((x) => `【${x.title}】\n${x.lines.join('\n')}`).join('\n')
  const trimmed = new Set<string>()
  let content = render()
  const shrinkable = sections.filter((x) => !x.required).sort((a, b) => a.priority - b.priority)
  for (const sec of shrinkable) {
    while (estimateTokens(content) > CONFIG.ai.roundTokenBudget && sec.lines.length) {
      if (sec.dropFrom === 'start') sec.lines.shift()
      else sec.lines.pop()
      trimmed.add(sec.title)
      content = render()
    }
  }
  return { content, allow, tokens: estimateTokens(content), trimmed: [...trimmed] }
}
