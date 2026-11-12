import { CONFIG } from '../config'
import type { ArcId, Atom, CompiledText, Cond, DialogueLine, Effect, OutcomeId, RegionId, Soft, Tag, TextKind } from '../data'
import { TEXTS, VOCAB } from '../data'
import type { Snapshot } from '../events'
import { allHold, evalCond, npcStateOf, type SceneContext } from '../rules/conditions'
import { rngFor } from '../rules/random'

/** One showable unit: a whole entry, or one line of a DLG entry (id `entry/label`). */
export interface TextUnit {
  readonly id: string
  readonly entry: CompiledText
  readonly line?: DialogueLine
  readonly kind: TextKind
  readonly requires: readonly Cond[]
  readonly soft: readonly Soft[]
  readonly forbids: readonly Cond[]
  readonly knows: readonly Cond[]
  readonly effects: readonly Effect[]
}

export function unitsOf(entry: CompiledText): TextUnit[] {
  const base = { entry, kind: entry.kind, requires: entry.requires ?? [], soft: entry.soft ?? [], forbids: entry.forbids ?? [], knows: entry.knows ?? [], effects: entry.effects ?? [] }
  if (!entry.lines?.length) return [{ id: entry.id, ...base }]
  return entry.lines.map((line) => ({
    ...base,
    id: line.id,
    line,
    requires: [...base.requires, ...line.requires],
    soft: [...base.soft, ...line.soft],
    forbids: [...base.forbids, ...(line.forbids ?? [])],
    knows: [...base.knows, ...(line.knows ?? [])],
    effects: [...base.effects, ...(line.effects ?? [])],
  }))
}

export const ALL_UNITS: readonly TextUnit[] = TEXTS.flatMap(unitsOf)

/** 09 §3.4: kinds shown once per run; SCN once per event instance; the rest may come back after a cooldown. */
const ONCE: ReadonlySet<TextKind> = new Set(['BEAT', 'DLG', 'BRG', 'CLK', 'END'])
const REUSABLE: ReadonlySet<TextKind> = new Set(['ENV', 'RST', 'TRV'])
/** 09 §3.2 step 3: BEAT and CLK are picked on 必 alone. */
const NO_SCORE: ReadonlySet<TextKind> = new Set(['BEAT', 'CLK'])

export type Ineligible = 'requires' | 'forbids' | 'knows' | 'unsettled' | 'speaker' | 'resolved' | 'outcome'

export const regionOfText = (id: string): RegionId | null =>
  (VOCAB.textRegions as Readonly<Record<string, RegionId | null>>)[id.split('-')[0]] ?? null

const varValue = (conds: readonly Cond[], name: string) =>
  conds.find((c): c is Extract<Atom, { var: unknown }> => 'var' in c && c.var === name && c.op === 'eq')?.value

/** A world change in 后置 that must already be settled before the text may be shown (12 §3.4). */
function settled(e: Effect, s: Snapshot, ctx: SceneContext): boolean {
  if (e.phase !== 'before') return true
  if ('npc' in e && 'towards' in e) return (s.npcs[e.npc as keyof Snapshot['npcs']]?.towards[e.towards as keyof Snapshot['npcs']] ?? 0) === e.value
  // ±n changes carry no target state to check against; a result beat's are written with the resolution (rules/outcomes.ts).
  if ('delta' in e) return true
  if ('impression' in e || 'contact' in e || 'evidence' in e) return true
  return evalCond(e as Atom, s, ctx)
}

/**
 * What the log can answer on its own, merged into the caller's context: 首访/再访 and
 * 完成/未完成核心冒险 for the current region, and people present standing where the party
 * stands. Intent, emotion and party tags still come from the caller.
 */
export function withLogContext(s: Snapshot, ctx: SceneContext = {}): SceneContext {
  const here = s.location?.placeId ?? s.location?.regionId
  const region = s.location?.regionId
  if (!here || !region) return ctx
  const tags: Tag[] = [...(ctx.tags ?? [])]
  const visits = s.regions[region]?.visits ?? 0
  if (visits > 0) tags.push(visits === 1 ? '首访' : '再访')
  const core = VOCAB.arcs.find((a) => a.region === region && a.kind === 'core')
  if (core) tags.push(s.arcs[core.id as ArcId]?.outcomes?.length ? '完成核心冒险' : '未完成核心冒险')
  const npcWhere = { ...Object.fromEntries([...(ctx.present ?? []), ...(ctx.inParty ?? [])].map((id) => [id, here])), ...ctx.npcWhere }
  return { ...ctx, tags, npcWhere }
}

/**
 * Variables the log answers. Text selection never lets the caller override them, so an AI
 * claim (e.g. a door outcome not yet committed, 08 §6 NC-BEAT-08) cannot unlock a text.
 */
const LOG_VARS: ReadonlySet<string> = new Set([
  'act', 'party_size', 'clock', 'crisis_rounds', 'truth_level', 'bell_hearts_held', 'hunger', 'opening_hook',
  'door_outcome', 'act4_entry', 'friendly_faction_cluster', 'location', 'visited_place', 'text_shown',
])

function logOnly(ctx: SceneContext): SceneContext {
  if (!ctx.vars) return ctx
  return { ...ctx, vars: Object.fromEntries(Object.entries(ctx.vars).filter(([k]) => !LOG_VARS.has(k))) }
}

/** Why a unit cannot be shown now, ignoring usage and score; null when it can. */
export function whyNot(u: TextUnit, s: Snapshot, ctx: SceneContext = {}): Ineligible | null {
  if (!allHold(u.requires, s, ctx)) return 'requires'
  if (u.forbids.some((c) => evalCond(c, s, ctx))) return 'forbids'
  if (!allHold(u.knows, s, ctx)) return 'knows'
  if (!u.effects.every((e) => settled(e, s, ctx))) return 'unsettled'
  const speaker = u.entry.speaker
  if (speaker && (!(ctx.present ?? []).includes(speaker) || ['dead', 'erased'].includes(npcStateOf(s, speaker as keyof Snapshot['npcs'])))) return 'speaker'
  const outcomes = u.requires
    .flatMap((c) => ('any' in c ? c.any : [c]))
    .filter((a): a is Extract<Atom, { var: unknown }> => 'var' in a && a.var === 'outcome' && a.op === 'eq')
    .map((a) => a.value as OutcomeId)
  const isResult = outcomes.length > 0 || varValue(u.requires, 'beat') === 'outcome'
  // 02 §11: a resolved region no longer opens its core adventure; its result beats and aftermath texts stay.
  const region = regionOfText(u.entry.id)
  if (u.kind === 'BEAT' && !isResult && region && s.regions[region]?.stage === 'resolved') return 'resolved'
  // 09 §2.1: a result beat only describes an outcome already in the log.
  if (isResult) {
    const arc = (varValue(u.requires, 'arc') ?? ctx.vars?.arc) as ArcId | undefined
    const done = (arc && s.arcs[arc]?.outcomes) || []
    const claimed = ctx.vars?.outcome as OutcomeId | undefined
    if (claimed !== undefined ? !done.includes(claimed) : outcomes.length ? !outcomes.some((o) => done.includes(o)) : !done.length) return 'outcome'
  }
  return null
}

export const scoreOf = (u: TextUnit, s: Snapshot, ctx: SceneContext = {}) => u.soft.reduce((n, x) => (evalCond(x.when, s, ctx) ? n + x.weight : n), 0)

/**
 * 09 §3.2 step 3. Units with no 软 at all are picked on 必 alone, like BEAT and CLK; otherwise
 * an entry written with only hard conditions (e.g. 首访 ENV) could never appear.
 */
const passesScore = (u: TextUnit, score: number) => NO_SCORE.has(u.kind) || !u.soft.length || score >= CONFIG.softThreshold

export interface TextRequest {
  readonly kinds: readonly TextKind[]
  readonly ctx?: SceneContext
  /** Restrict to these entry or line ids (e.g. one speaker's DLG). */
  readonly ids?: readonly string[]
  /** SCN shown before this round belong to an earlier event instance and may play again. */
  readonly sceneInstanceSince?: number
  /** 09 §3.3: the moment needs this text (beat, clock event, act change); its absence is a gap. */
  readonly mustUse?: boolean
  /** Separates draws within one round. */
  readonly salt?: string
}

export interface Gap {
  readonly round: number
  readonly kinds: readonly TextKind[]
  readonly reason: 'fallback' | 'none' | 'must_use_excluded'
  readonly ids?: readonly string[]
}

export interface Pick {
  readonly unit: TextUnit
  readonly score: number
  readonly reused: boolean
  readonly fallback: boolean
  /** Paragraphs to show, with 行需知 applied (1-based numbers of the hidden ones in `hidden`). */
  readonly paragraphs: readonly string[]
  readonly hidden: readonly number[]
  /** Hidden paragraphs whose 说明 tells the AI how to rewrite them instead (12 §3.1 行需知). */
  readonly rewrite: readonly number[]
  readonly images: readonly string[]
}

export interface Selection {
  readonly pick: Pick | null
  readonly gap: Gap | null
}

type Usage = 'fresh' | 'reusable' | 'used'

function usage(u: TextUnit, s: Snapshot, req: TextRequest): Usage {
  const seen = s.texts[u.id]
  if (!seen) return 'fresh'
  if (u.kind === 'SCN' && req.sceneInstanceSince !== undefined && seen.lastRound < req.sceneInstanceSince) return 'fresh'
  if (ONCE.has(u.kind) || u.kind === 'SCN') return 'used'
  if (REUSABLE.has(u.kind) && seen.count < CONFIG.reuseMaxPerRun && s.round - seen.lastRound >= CONFIG.reuseCooldownRounds) return 'reusable'
  return 'used'
}

function paragraphsOf(u: TextUnit, s: Snapshot, ctx: SceneContext): { paragraphs: string[]; hidden: number[]; rewrite: number[] } {
  if (u.line) return { paragraphs: [u.line.text], hidden: [], rewrite: [] }
  const hidden: number[] = []
  const paragraphs = u.entry.body.filter((_, i) => {
    const conds = u.entry.lineKnows?.[String(i + 1)]
    if (conds && !allHold(conds, s, ctx)) {
      hidden.push(i + 1)
      return false
    }
    return true
  })
  const note = u.entry.note ?? ''
  const rewrite = hidden.filter((n) => note.includes(`第 ${n} 段`) && note.includes('改'))
  return { paragraphs, hidden, rewrite }
}

/** DLG lines tagged 首次见面 apply while the speaker has not been met yet. */
function unitContext(u: TextUnit, s: Snapshot, ctx: SceneContext): SceneContext {
  const speaker = u.entry.speaker
  if (!speaker || s.npcs[speaker as keyof Snapshot['npcs']]?.met) return ctx
  return { ...ctx, tags: [...(ctx.tags ?? []), '首次见面'] }
}

function best<C extends { u: TextUnit; score: number }>(cands: readonly C[], s: Snapshot, req: TextRequest): C {
  const top = Math.max(...cands.map((c) => c.score))
  const tied = cands.filter((c) => c.score === top).sort((a, b) => (a.u.id < b.u.id ? -1 : 1))
  const rng = rngFor(s.seed, 'text', s.round, req.salt ?? req.kinds.join(','))
  return tied[Math.floor(rng() * tied.length)]
}

/** 09 §3.2–§3.4: filter, score, threshold, pick the best with seeded ties, reuse after cooldown, then fallback. */
export function selectText(s: Snapshot, req: TextRequest, units: readonly TextUnit[] = ALL_UNITS): Selection {
  const ctx = withLogContext(s, logOnly(req.ctx ?? {}))
  const scored = units
    .filter((u) => req.kinds.includes(u.kind) && (!req.ids || req.ids.includes(u.id) || req.ids.includes(u.entry.id)))
    .map((u) => ({ u, ctx: unitContext(u, s, ctx) }))
    .filter(({ u, ctx }) => whyNot(u, s, ctx) === null)
    .map(({ u, ctx }) => ({ u, ctx, score: scoreOf(u, s, ctx), use: usage(u, s, req) }))
  const regular = scored.filter((c) => !c.u.entry.fallback && passesScore(c.u, c.score))
  const finish = (c: { u: TextUnit; ctx: SceneContext; score: number }, reused: boolean, fallback: boolean): Pick => ({
    unit: c.u, score: c.score, reused, fallback, images: c.u.entry.images, ...paragraphsOf(c.u, s, c.ctx),
  })
  const gap = (reason: Gap['reason']): Gap => ({ round: s.round, kinds: req.kinds, reason, ...(req.ids ? { ids: req.ids } : {}) })

  const fresh = regular.filter((c) => c.use === 'fresh')
  if (fresh.length) return { pick: finish(best(fresh, s, req), false, false), gap: null }
  const reusable = regular.filter((c) => c.use === 'reusable')
  if (reusable.length) return { pick: finish(best(reusable, s, req), true, false), gap: null }
  const fallbacks = scored.filter((c) => c.u.entry.fallback)
  if (fallbacks.length) {
    const c = best(fallbacks, s, req)
    return { pick: finish(c, s.texts[c.u.id] !== undefined, true), gap: gap('fallback') }
  }
  return { pick: null, gap: gap(req.mustUse ? 'must_use_excluded' : 'none') }
}

/** 09 §3.3: what each moment asks for. Moments marked `mustUse` log a gap when nothing fits. */
export const MOMENTS = {
  beat: { kinds: ['BEAT'], mustUse: true },
  clock: { kinds: ['CLK'], mustUse: true },
  act: { kinds: ['BRG'], mustUse: true },
  arrive: { kinds: ['ENV', 'SCN'], mustUse: false },
  firstMeet: { kinds: ['DLG'], mustUse: false },
  action: { kinds: ['ENV', 'SCN', 'DLG', 'RST'], mustUse: false },
  leave: { kinds: ['BRG', 'TRV'], mustUse: false },
} as const satisfies Record<string, { kinds: readonly TextKind[]; mustUse: boolean }>

export type Moment = keyof typeof MOMENTS

export function selectFor(s: Snapshot, moment: Moment, req: Omit<TextRequest, 'kinds' | 'mustUse'> = {}, units: readonly TextUnit[] = ALL_UNITS): Selection {
  const m = MOMENTS[moment]
  let ids = req.ids
  if (moment === 'firstMeet') {
    const firstLines = units.filter((u) => u.line?.label === '初见').map((u) => u.id)
    ids = ids ? ids.flatMap((id) => firstLines.filter((l) => l === id || l.startsWith(`${id}/`))) : firstLines
  }
  return selectText(s, { ...req, ids, kinds: m.kinds, mustUse: m.mustUse, salt: req.salt ?? moment }, units)
}
