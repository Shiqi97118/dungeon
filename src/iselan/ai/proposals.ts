import { CONFIG } from '../config'
import type { DirectionId, FactId, FactionId, NpcId, PlaceId, RegionId } from '../data'
import { VOCAB } from '../data'
import { draft, type AnyDraft, type Snapshot } from '../events'
import { attitudeOf, hasFact, npcStateOf, relationOf } from '../rules/conditions'
import { directionDraft } from '../rules/directions'
import { closeProject, createProject, foundProject, PROJECT_KIND_NAME, projectRiskDraft, projectRunning } from '../rules/projects'
import { rngFor } from '../rules/random'
import { preview } from '../rules/settle'
import type { Allowlist } from './context'
import type { RawProposal } from './reply'

/** A roll the program makes before the AI narrates the outcome. */
export interface CheckRequest {
  readonly skill: string
  readonly difficulty: number
  readonly reason: string
}

/** A permanent consequence the player must accept first (07 §7); answering yes commits `consent_given`. */
export interface ConsentRequest {
  readonly actorId: string
  readonly consequence: 'death' | 'memory_loss' | 'stay_behind' | 'other'
  readonly detail: string
}

export interface ClipResult {
  readonly drafts: AnyDraft[]
  readonly checks: CheckRequest[]
  readonly consents: ConsentRequest[]
  /** 12 §8.3: every dropped proposal, for the gap log. */
  readonly gaps: string[]
  /** The running project this action was put into (12 §6.3 运转). */
  invested: string | null
}

export interface ClipOptions {
  /** Whether the party can pay to found a project this round (rules decide, 12 §6.3); defaults to the roll. */
  readonly funded?: boolean
  /**
   * The roll this action already made. Founding (money or goods) and a project's risk are
   * settled by a check: without one, the proposal becomes the check and applies on the roll.
   */
  readonly checked?: 'hit' | 'partial' | 'miss'
}

/** 12 §8.2: what the AI may never propose, by the kinds it might try. */
const FORBIDDEN: Readonly<Record<string, string>> = {
  clock: '大势时钟', darkLine: '暗线状态', dark_line: '暗线状态', bellHeart: '钟心归属', bell_heart: '钟心归属',
  death: '人物死亡', erase: '人物被抹去', npcState: '人物状态', npc_state: '人物状态', achievement: '成就',
  door: '门的结果', ending: '结局方向',
}

const DIFFICULTY = { min: 5, max: 20 } as const
const IMPRESSION_MAX = 40
const UNAVAILABLE = new Set(['dead', 'erased'])
const RANGE = 3
const PROJECT_KINDS = ['tavern', 'guild', 'caravan', 'sanctuary', 'home', 'custom'] as const
const PROJECT_RISKS = ['tax', 'seal', 'brawl', 'patients', 'other'] as const
const RISK_NAME: Readonly<Record<(typeof PROJECT_RISKS)[number], string>> = { tax: '征税', seal: '查封', brawl: '斗殴', patients: '病人涌入', other: '风波' }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null)
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const isNpc = (id: unknown): id is NpcId => typeof id === 'string' && VOCAB.npcs.some((n) => n.id === id)

/**
 * 12 §8.3 steps 2–5: drop ids outside the round's allowlist, clip numbers to their limits,
 * drop proposals that contradict the log, and turn the rest into drafts for one transaction.
 * Proposals are applied in order on a running preview, so two changes to one person add up
 * and the per-round direction cap still holds.
 */
export function clipProposals(s0: Snapshot, proposals: readonly RawProposal[], allow: Allowlist, options: ClipOptions = {}): ClipResult {
  const out: ClipResult = { drafts: [], checks: [], consents: [], gaps: [], invested: null }
  const needCheck = (skill: string, reason: string) => {
    if (!out.checks.length) out.checks.push({ skill, difficulty: CONFIG.ai.offlineCheckDifficulty, reason })
  }
  let s = s0
  const add = (ds: readonly AnyDraft[]) => {
    out.drafts.push(...ds)
    s = preview(s, ds)
  }
  const drop = (p: RawProposal, why: string) => out.gaps.push(`丢弃 ${p.kind} 提案：${why}`)
  const touched = new Set<string>()

  for (const p of proposals) {
    if (FORBIDDEN[p.kind]) {
      drop(p, `AI 不能提出${FORBIDDEN[p.kind]}`)
      continue
    }
    switch (p.kind) {
      case 'attitude': {
        const npc = p.npcId
        const delta = int(p.delta)
        if (!isNpc(npc) || !allow.npcs.includes(npc)) { drop(p, `人物 ${String(npc)} 不在本场景清单`); break }
        if (UNAVAILABLE.has(npcStateOf(s, npc))) { drop(p, `${npc} 已死亡或被抹去`); break }
        if (!delta) { drop(p, '变化量无效'); break }
        if (touched.has(`attitude:${npc}`)) { drop(p, `同一回应里重复调整 ${npc} 的态度`); break }
        touched.add(`attitude:${npc}`)
        const max = p.major === true ? CONFIG.majorDeltaMax : CONFIG.attitudeDeltaMax
        const cur = attitudeOf(s, npc)
        const value = clamp(cur + clamp(delta, -max, max), -RANGE, RANGE)
        if (value === cur) { drop(p, `${npc} 的态度已在上下限`); break }
        add([draft('npc_attitude_changed', { npcId: npc, towardsId: 'party', delta: value - cur, value })])
        break
      }
      case 'relation': {
        const faction = p.factionId as FactionId
        const delta = int(p.delta)
        if (!allow.factions.includes(faction)) { drop(p, `势力 ${String(faction)} 不在本场景清单`); break }
        if (!delta) { drop(p, '变化量无效'); break }
        if (touched.has(`relation:${faction}`)) { drop(p, `同一回应里重复调整 ${faction} 的关系`); break }
        touched.add(`relation:${faction}`)
        const cur = relationOf(s, faction)
        const value = clamp(cur + clamp(delta, -CONFIG.factionDeltaPerEvent, CONFIG.factionDeltaPerEvent), -RANGE, RANGE)
        if (value === cur) { drop(p, `${faction} 的关系已在上下限`); break }
        add([draft('faction_relation_changed', { factionId: faction, towardsFactionId: 'party', delta: value - cur, value })])
        break
      }
      case 'fact': {
        const fact = p.factId as FactId
        if (!allow.facts.includes(fact)) { drop(p, `事实 ${String(fact)} 不在本场景清单`); break }
        if (hasFact(s, fact)) { drop(p, `事实 ${fact} 已成立`); break }
        add([draft('fact_established', { factId: fact, source: 'ai' })])
        break
      }
      case 'evidence': {
        const ok = allow.evidence.some((e) => e.darkLineId === p.darkLineId && e.evidenceId === p.evidenceId)
        if (!ok) { drop(p, `证据 ${String(p.darkLineId)}/${String(p.evidenceId)} 不在本场景清单`); break }
        const dl = p.darkLineId as keyof Snapshot['darkLines']
        if ((s.darkLines[dl]?.evidence ?? []).some((e) => e.id === p.evidenceId)) { drop(p, '证据已获得'); break }
        add([draft('truth_evidence_added', { darkLineId: dl, evidenceId: p.evidenceId as string, reliable: p.reliable !== false })])
        break
      }
      case 'impression': {
        const npc = p.npcId
        const text = str(p.text, IMPRESSION_MAX)
        if (!isNpc(npc) || !allow.npcs.includes(npc)) { drop(p, `人物 ${String(npc)} 不在本场景清单`); break }
        if (UNAVAILABLE.has(npcStateOf(s, npc))) { drop(p, `${npc} 已死亡或被抹去`); break }
        if (!text) { drop(p, '印象为空'); break }
        add([draft('npc_impression_added', { npcId: npc, text, milestone: false })])
        break
      }
      case 'learned': {
        const npc = p.npcId
        const fact = p.factId as FactId
        const via = p.via
        if (!isNpc(npc) || UNAVAILABLE.has(npcStateOf(s, npc))) { drop(p, `人物 ${String(npc)} 无效、已死亡或被抹去`); break }
        if (via !== 'witnessed' && via !== 'told' && via !== 'rumor') { drop(p, '知情途径无效'); break }
        if (via !== 'rumor' && !allow.npcs.includes(npc)) { drop(p, `${npc} 不在场，只能经传闻得知`); break }
        if (!hasFact(s, fact)) { drop(p, `事实 ${String(fact)} 尚未成立，人物无从得知`); break }
        if (s.npcs[npc]?.knows.some((k) => k.factId === fact)) { drop(p, `${npc} 已经知道 ${fact}`); break }
        const { min, max } = CONFIG.rumorDelayRounds
        const delay = via === 'rumor' ? min + Math.floor(rngFor(s.seed, 'rumor', s.round, npc, fact)() * (max - min + 1)) : 0
        add([draft('npc_learned', { npcId: npc, factId: fact, via, fromId: 'party', arrivesAtRound: s.round + delay })])
        break
      }
      case 'project': {
        const id = str(p.projectId, 40)
        if (!id) { drop(p, '事业编号无效'); break }
        if (p.stage === 'idea') {
          const region = s.location?.regionId as RegionId | undefined
          const kind = PROJECT_KINDS.find((k) => k === p.projectKind)
          if (!kind) { drop(p, '事业类型无效'); break }
          const ds = region ? createProject(s, id, kind, region) : null
          if (!ds) { drop(p, `无法新建事业 ${id}`); break }
          add(ds)
        } else if (!allow.projects.includes(id)) {
          drop(p, `事业 ${id} 不在本场景清单`)
        } else if (p.stage === 'founded') {
          const contact = p.contactId
          if (!isNpc(contact) || !allow.npcs.includes(contact)) { drop(p, '创办需要在场的联系人'); break }
          const funded = options.funded ?? (options.checked ? options.checked !== 'miss' : undefined)
          if (funded === undefined) { needCheck('交涉', `筹措${PROJECT_KIND_NAME[s.projects[id]?.kind ?? 'custom']}的本钱与物资`); break }
          const r = foundProject(s, id, funded, contact, str(p.name, 20) ?? undefined)
          if ('refused' in r) { drop(p, `创办条件不满足（${r.refused}）`); break }
          add(r.drafts)
        } else if (p.stage === 'closed') {
          const ds = closeProject(s, id)
          if (!ds) { drop(p, `事业 ${id} 无法关闭`); break }
          add(ds)
        } else if (p.stage === 'invest') {
          if (!projectRunning(s.projects[id])) { drop(p, `事业 ${id} 还没创办或已关闭`); break }
          out.invested = id
        } else if (p.stage === 'risk') {
          const risk = PROJECT_RISKS.find((r) => r === p.risk)
          const cur = s.projects[id]
          if (!risk) { drop(p, '风险类型无效'); break }
          if (!cur || !['operational', 'stable'].includes(cur.stage)) { drop(p, `事业 ${id} 还没运转，谈不上风险`); break }
          if (!options.checked) { needCheck(risk === 'brawl' ? '强韧' : '交涉', `${PROJECT_KIND_NAME[cur.kind]}遇到${RISK_NAME[risk]}`); break }
          add([projectRiskDraft(id, risk, options.checked !== 'miss')])
        } else {
          drop(p, '运转与稳定由规则推进；投入用 invest，风险用 risk')
        }
        break
      }
      case 'direction': {
        const id = p.directionId as DirectionId
        const delta = int(p.delta)
        if (!allow.directions.includes(id)) { drop(p, `方向 ${String(id)} 不在本场景清单`); break }
        if (!delta) { drop(p, '变化量无效'); break }
        const d = directionDraft(s, id, clamp(delta, -CONFIG.majorDeltaMax, CONFIG.majorDeltaMax))
        if (!d) { drop(p, `${id} 本轮已到上限`); break }
        add([d])
        break
      }
      case 'place': {
        const name = str(p.name, 30)
        const region = p.regionId as RegionId
        const place = VOCAB.places.find((x) => x.region === region && (x.name === name || x.id === name))
        if (!place) { drop(p, `新地点“${name ?? ''}”暂不入账（首版只开放词表中的地点）`); break }
        if (!allow.places.includes(place.id as PlaceId)) { drop(p, `地点 ${place.id} 不在本场景清单`); break }
        if (s.places.includes(place.id as PlaceId)) { drop(p, `地点 ${place.id} 已发现`); break }
        add([draft('place_discovered', { placeId: place.id as PlaceId, regionId: region, aiCreated: false })])
        break
      }
      case 'check': {
        const skill = str(p.skill, 20)
        const difficulty = int(p.difficulty)
        if (!skill || difficulty === null) { drop(p, '检定缺少能力或难度'); break }
        if (out.checks.length) { drop(p, '一次行动只检定一次'); break }
        out.checks.push({ skill, difficulty: clamp(difficulty, DIFFICULTY.min, DIFFICULTY.max), reason: str(p.reason, 80) ?? '' })
        break
      }
      case 'consent': {
        const actor = p.actorId
        const c = p.consequence
        if (typeof actor !== 'string' || !allow.actors.includes(actor)) { drop(p, `角色 ${String(actor)} 不在本局`); break }
        if (c !== 'death' && c !== 'memory_loss' && c !== 'stay_behind' && c !== 'other') { drop(p, '永久后果类型无效'); break }
        out.consents.push({ actorId: actor, consequence: c, detail: str(p.detail, 80) ?? '' })
        break
      }
      default:
        drop(p, '未知的提案类型')
    }
  }
  return out
}
