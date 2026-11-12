import type { CheckOutcome, TurnInput } from '../ai/context'
import type { CheckRequest } from '../ai/proposals'
import { runAiTurn, type AiResponse, type ModelCall, type TurnResult } from '../ai/turn'
import { CONFIG } from '../config'
import type { ArcId, BeatId, DirectionId, IntentTag, OpeningHookId, OutcomeId, PlaceId, Tag } from '../data'
import { TEXTS, VOCAB } from '../data'
import { commitIntent, draft, reduceEvents, type AnyDraft, type AnyEvent, type Snapshot } from '../events'
import { BANQUET, interactionInstanceId, LEDGER, settleInteraction, type InteractionDef, type InteractionRequest, type InteractionResult } from '../interaction'
import { allHold, evalCond, type SceneContext } from '../rules/conditions'
import { choiceDraft, r1Met, type ActionInput } from '../rules/choices'
import { d01Variant, endingCandidates } from '../rules/directions'
import { openingDrafts } from '../rules/initial'
import { wrapUpDrafts } from '../rules/progress'
import { preview, startRound, withConsequences } from '../rules/settle'
import { stagedDrafts } from '../rules/staged'
import { ALL_UNITS, fillPlaceholders, placeholderValues, sceneChange, selectFor, selectText, shownDrafts, type Pick as TextPick, type TextUnit } from '../texts'
import { rollCheck, statFor, type Stat } from './check'
import { ambienceDrafts, banquetDrafts, placeName, sceneContext } from './world'

/**
 * The table: one solo or shared run driven through the ledger. Every operation commits whole
 * intents and returns a new table; screens are what the reader shows, in order.
 */

export interface Member {
  readonly seatId: string
  readonly actorId: string
  readonly name: string
  readonly stats: Readonly<Record<Stat, number>>
  readonly memento?: string
  readonly controller: 'human' | 'ai'
}

export interface Screen {
  readonly id: string
  readonly kind: 'text' | 'narration' | 'roll' | 'note'
  readonly paragraphs: readonly string[]
  readonly textId?: string
  readonly title?: string
  readonly images?: readonly string[]
  readonly actorId?: string
}

export type Pending =
  | { readonly kind: 'check'; readonly seatId: string; readonly text: string; readonly request: CheckRequest; readonly stat: Stat; readonly intents: readonly IntentTag[]; readonly interaction?: string }
  | { readonly kind: 'interaction'; readonly seatId: string; readonly textId: string; readonly instanceId: string }
  | { readonly kind: 'ending'; readonly candidates: readonly DirectionId[] }

export interface Table {
  readonly runId: string
  readonly events: readonly AnyEvent[]
  readonly party: readonly Member[]
  /** Index into `party` of the seat that acts next. */
  readonly turn: number
  readonly pending: Pending | null
  readonly screens: readonly Screen[]
  readonly suggestions: readonly string[]
  /** 12 §8.3 gap log: dropped proposals, missing texts, model failures. */
  readonly gaps: readonly string[]
  /** Every AI response, kept for the upload receipts (12 §8.4). */
  readonly responses: readonly AiResponse[]
  /** One line per settled action, for the prompt's recent rounds. */
  readonly recent: readonly string[]
  /** Local intent counter for intents that are not AI responses. */
  readonly n: number
  /** Decisions the solo player may go back to, oldest first. */
  readonly checkpoints: readonly Checkpoint[]
}

/** The table as it stood just before one decision; rewinding restores it. */
export interface Checkpoint {
  readonly id: string
  readonly round: number
  readonly label: string
  readonly events: number
  readonly screens: number
  readonly turn: number
  readonly pending: Pending | null
  readonly suggestions: readonly string[]
  readonly recent: readonly string[]
}

export interface TableOptions {
  readonly now?: () => string
  readonly rng?: () => number
}

export const INTERACTIONS: Readonly<Record<string, InteractionDef>> = { [LEDGER.textId]: LEDGER, [BANQUET.textId]: BANQUET }

const cache = new WeakMap<readonly AnyEvent[], Snapshot>()
export function snapshotOf(t: Pick<Table, 'runId' | 'events'>): Snapshot {
  let s = cache.get(t.events)
  if (!s) cache.set(t.events, (s = reduceEvents(t.runId, t.events)))
  return s
}

const stamp = (o: TableOptions) => o.now?.() ?? new Date().toISOString()

function commit(t: Table, intentId: string, drafts: readonly AnyDraft[], o: TableOptions): Table {
  const r = commitIntent(t.events, intentId, drafts, { runId: t.runId, committedAt: stamp(o) })
  // The table never replays its own intents, so a repeat id means two responses shared a number.
  if (r.duplicate) throw new Error(`意图 ${intentId} 已在存档里`)
  return { ...t, events: r.events }
}

const nextId = (t: Table, tag: string) => ({ id: `${tag}:${t.n + 1}`, t: { ...t, n: t.n + 1 } })

/** Collects drafts and screens for one intent, previewing as it goes so later picks see earlier ones. */
class Builder {
  drafts: AnyDraft[] = []
  screens: Screen[] = []
  gaps: string[] = []
  cur: Snapshot
  private k = 0
  readonly base: Snapshot
  readonly prefix: string
  readonly actorName: string

  constructor(base: Snapshot, prefix: string, actorName: string) {
    this.base = base
    this.prefix = prefix
    this.actorName = actorName
    this.cur = base
  }

  add(drafts: readonly AnyDraft[]) {
    if (!drafts.length) return
    this.drafts.push(...drafts)
    this.cur = preview(this.cur, drafts)
  }

  screen(kind: Screen['kind'], paragraphs: readonly string[], extra: Partial<Screen> = {}) {
    if (!paragraphs.length) return
    this.screens.push({ id: `${this.prefix}#${++this.k}`, kind, paragraphs, ...extra })
  }

  /** Puts a pick on screen and writes what showing it settles. */
  show(pick: TextPick, ctx: SceneContext) {
    const values = placeholderValues(this.cur, { 角色: this.actorName })
    const paragraphs = pick.paragraphs.map((p) => {
      const f = fillPlaceholders(p, values)
      if (f.missing.length) this.gaps.push(`${pick.unit.id}：占位符没有值 ${f.missing.join('、')}`)
      return f.text
    })
    const r = shownDrafts(this.cur, pick, ctx)
    this.gaps.push(...r.gaps)
    const beat = beatOf(pick.unit)
    const extra = beat && !this.cur.arcs[beat.arc]?.beats.includes(beat.beat) && !r.drafts.some((d) => d.type === 'arc_beat_reached')
      ? [draft('arc_beat_reached', { arcId: beat.arc, beat: beat.beat })] : []
    this.add([...r.drafts, ...extra])
    this.screen('text', paragraphs, { textId: pick.unit.id, title: pick.unit.entry.title, images: pick.images })
  }

  pick(sel: { pick: TextPick | null; gap: { reason: string; kinds: readonly string[] } | null }, ctx: SceneContext): TextPick | null {
    if (sel.gap && sel.gap.reason !== 'none') this.gaps.push(`文本缺口：${sel.gap.kinds.join('/')} ${sel.gap.reason}`)
    if (sel.pick) this.show(sel.pick, ctx)
    return sel.pick
  }
}

const reqVar = (u: TextUnit, name: string) =>
  (u.requires.find((c) => 'var' in c && c.var === name && c.op === 'eq') as { value?: string } | undefined)?.value

function beatOf(u: TextUnit): { arc: ArcId; beat: BeatId } | null {
  if (u.kind !== 'BEAT') return null
  const arc = reqVar(u, 'arc') as ArcId | undefined
  const beat = reqVar(u, 'beat') as BeatId | undefined
  return arc && beat ? { arc, beat } : null
}

const GH_BEATS = TEXTS.filter((x) => x.kind === 'BEAT' && x.id.startsWith('GH-BEAT-')).map((x) => x.id)

const STAGES: readonly BeatId[] = ['cause', 'discovery', 'turn', 'choice']

/**
 * The beat to show now, if one is due: another unseen beat of the stage already reached when it
 * fits (Ludo at the docks, Felix's ledger), otherwise the next stage. Beats wait `beatGapRounds`
 * rounds after the last one so the party has room to act in between.
 */
export function dueBeat(s: Snapshot, ctx: SceneContext): TextPick | null {
  if (s.location?.regionId !== 'gray_harbor' || s.act === 4 || s.arcs.gray_well?.outcomes) return null
  const last = Math.max(-1, ...GH_BEATS.map((id) => s.texts[id]?.lastRound ?? -1))
  if (last >= 0 && s.round - last < CONFIG.beatGapRounds) return null
  const reached = (s.arcs.gray_well?.beats ?? []).map((b) => STAGES.indexOf(b)).filter((i) => i >= 0)
  const furthest = reached.length ? Math.max(...reached) : -1
  const stages = [...new Set([furthest, Math.min(furthest + 1, STAGES.length - 1)].filter((i) => i >= 0))].map((i) => STAGES[i])
  for (const beat of stages) {
    const sel = selectText(s, { kinds: ['BEAT'], ctx: { ...ctx, vars: { ...ctx.vars, arc: 'gray_well', beat } }, salt: `beat:${beat}` })
    if (sel.pick && !sel.pick.fallback) return sel.pick
  }
  return null
}

/** The core adventure waits on the party's decision once its choice beat has been shown. */
export const outcomeOpen = (s: Snapshot) => !!s.arcs.gray_well?.beats.includes('choice') && !s.arcs.gray_well.outcomes

/**
 * SCN texts whose 后置 sets a state before they are shown (the invitation, the banquet itself):
 * eligible on their conditions now, and showing them commits that state with them.
 */
function stagedScene(s: Snapshot, ctx: SceneContext): { pick: TextPick; drafts: AnyDraft[] } | null {
  for (const u of ALL_UNITS) {
    if (u.kind !== 'SCN' || s.texts[u.id] || !u.effects.some((e) => e.phase === 'before')) continue
    if (!allHold(u.requires, s, ctx) || u.forbids.some((c) => evalCond(c, s, ctx)) || !allHold(u.knows, s, ctx)) continue
    const drafts = stagedDrafts(s, u.effects, u.id)
    if (!drafts.length) continue
    const pick: TextPick = { unit: u, score: 0, reused: false, fallback: false, paragraphs: u.entry.body, hidden: [], rewrite: [], images: u.entry.images }
    return { pick, drafts }
  }
  return null
}

function meetings(b: Builder, ctx: SceneContext) {
  const fresh = (ctx.present ?? []).filter((id) => VOCAB_NPC.has(id) && !b.cur.npcs[id as keyof Snapshot['npcs']]?.met)
  if (!fresh.length) return
  b.pick(selectFor(b.cur, 'firstMeet', { ctx }), ctx)
  b.add(fresh.map((npcId) => draft('npc_met', { npcId: npcId as keyof Snapshot['npcs'] })))
}

const VOCAB_NPC = new Set<string>(VOCAB.npcs.map((n) => n.id))

/** Beat, staged scene, and interaction hand-off after an action or an arrival. */
function storyBeats(b: Builder, ctx: SceneContext, seatId: string): Pending | null {
  let pending: Pending | null = null
  const beat = dueBeat(b.cur, ctx)
  if (beat) {
    b.show(beat, ctx)
    if (INTERACTIONS[beat.unit.id]) pending = { kind: 'interaction', seatId, textId: beat.unit.id, instanceId: interactionInstanceId(beat.unit.id) }
  }
  const staged = stagedScene(b.cur, ctx)
  if (staged) {
    b.add(staged.drafts)
    b.show(staged.pick, ctx)
    if (!pending && INTERACTIONS[staged.pick.unit.id]) pending = { kind: 'interaction', seatId, textId: staged.pick.unit.id, instanceId: interactionInstanceId(staged.pick.unit.id) }
  }
  return pending
}

/** Act and clock texts the rules returned by id. */
function ruleTexts(b: Builder, ids: readonly string[]) {
  for (const id of ids) {
    const u = ALL_UNITS.find((x) => x.id === id)
    if (u) b.screen('text', u.entry.body, { textId: id, title: u.entry.title, images: u.entry.images })
  }
}

function actBridge(b: Builder, before: Snapshot) {
  if (b.cur.act === before.act) return
  const transition = before.act === 1 && b.cur.act === 2 ? '1_2' : before.act === 2 && b.cur.act === 3 ? '2_3' : null
  const ctx: SceneContext = transition ? { vars: { act_transition: transition } } : {}
  b.pick(selectFor(b.cur, 'act', { ctx }), ctx)
}

function finishIntent(t: Table, b: Builder, intentId: string, o: TableOptions, extra: Partial<Table> = {}): Table {
  const settled = withConsequences(b.base, b.drafts)
  const next = commit(t, intentId, settled.drafts, o)
  const before = b.base
  const after = preview(before, settled.drafts)
  const tail = new Builder(after, `${intentId}+`, b.actorName)
  ruleTexts(tail, settled.texts)
  actBridge(tail, before)
  let out: Table = { ...next, ...extra, screens: [...t.screens, ...b.screens], gaps: [...t.gaps, ...b.gaps, ...(extra.gaps ?? [])] }
  if (tail.drafts.length) out = commit(out, `${intentId}+texts`, tail.drafts, o)
  return { ...out, screens: [...out.screens, ...tail.screens], gaps: [...out.gaps, ...tail.gaps] }
}

/** Moves to the next seat; once everyone has acted, the next round starts with its clock check. */
function advance(t: Table, o: TableOptions): Table {
  const turn = t.turn + 1
  if (turn < t.party.length) return { ...t, turn }
  const s = snapshotOf(t)
  const r = startRound(s, s.round + 1)
  const round = preview(s, r.drafts)
  const b = new Builder(round, `round:${round.round}`, '')
  b.add([...ambienceDrafts(round), ...banquetDrafts(round)])
  ruleTexts(b, r.texts)
  const out = commit({ ...t, turn: 0 }, `round:${round.round}`, [...r.drafts, ...b.drafts], o)
  return { ...out, screens: [...out.screens, ...b.screens], gaps: [...out.gaps, ...b.gaps] }
}

export interface OpenInput {
  readonly runId: string
  readonly seed: string
  readonly party: readonly Member[]
  readonly openingHook: OpeningHookId
}

/** GEN-BEAT opening at the Seven Lamps on a rainy dusk, then the arrival in Grayport. */
export function openTable(input: OpenInput, o: TableOptions = {}): Table {
  const t0: Table = { runId: input.runId, events: [], party: input.party, turn: 0, pending: null, screens: [], suggestions: [], gaps: [], responses: [], recent: [], n: 0, checkpoints: [] }
  const seats = input.party.map((m) => ({ seatId: m.seatId, actorId: m.actorId, controller: m.controller }))
  const opening = openingDrafts({ mode: input.party.length > 1 ? 'online' : 'solo', seed: input.seed, openingHook: input.openingHook, seats })
  let s = preview(snapshotOf(t0), opening)
  const round = startRound(s, 1)
  s = preview(s, round.drafts)
  const b = new Builder(s, 'open', input.party[0]?.name ?? '')
  b.add([
    draft('first_hook_taken', { regionId: 'gray_harbor', hookId: input.openingHook }),
    draft('region_visited', { regionId: 'gray_harbor', isOutsideStart: false, visitIndex: 1 }),
    draft('location_changed', { regionId: 'gray_harbor', placeId: 'gray_harbor.seven_lamps' }),
  ])
  b.add(ambienceDrafts(b.cur))
  const opens = TEXTS.filter((x) => x.kind === 'BEAT' && x.id.startsWith('GEN-BEAT-')).map((x) => x.id)
  const ctx: SceneContext = { ...sceneContext(b.cur), vars: { phase: 'opening' } }
  for (const id of opens) {
    const sel = selectText(b.cur, { kinds: ['BEAT'], ids: [id], ctx, salt: 'opening' })
    if (sel.pick) b.show(sel.pick, ctx)
  }
  const here = sceneContext(b.cur)
  for (const kind of ['ENV', 'SCN'] as const) {
    const sel = selectText(b.cur, { kinds: [kind], ctx: here, salt: `opening:${kind}` })
    if (sel.pick && !sel.pick.fallback) b.show(sel.pick, here)
  }
  meetings(b, here)
  const t = commit(t0, 'open', [...opening, ...round.drafts, ...b.drafts], o)
  return { ...t, screens: b.screens, gaps: b.gaps, suggestions: ['四处看看，听听酒馆里的人在说什么', '找老板娘罗莎打听最近的怪事', '去码头碰碰运气'] }
}

export const currentMember = (t: Table): Member => t.party[t.turn]

function assertFree(t: Table) {
  if (t.pending) throw new Error(`还有未完成的步骤：${t.pending.kind}`)
  if (snapshotOf(t).ending) throw new Error('这一局已经结束')
}

function turnInput(t: Table, m: Member, text: string, ctx: SceneContext, prewritten: readonly TextPick[], check?: CheckOutcome): TurnInput {
  return { actorId: m.actorId, actorName: m.name, text, ctx, prewritten, recent: t.recent, ...(check ? { check } : {}) }
}

const narrationScreen = (r: TurnResult) => r.reply.narration.split(/\n+/).map((p) => p.trim()).filter(Boolean)

/** Same scene, same target, same way: the key `choiceDraft` uses to drop repeats (02 §2). */
function actionKey(t: Table, r: TurnResult): Pick<ActionInput, 'sceneId' | 'target' | 'method'> {
  const s = snapshotOf(t)
  const subject = r.drafts
    .map((d) => d.payload as Record<string, unknown>)
    .map((p) => p.npcId ?? p.factionId ?? p.factId ?? p.evidenceId ?? p.projectId ?? p.placeId)
    .find((x): x is string => typeof x === 'string')
  return { sceneId: s.location?.placeId ?? s.location?.regionId ?? 'none', target: subject ?? 'none', method: r.reply.intents[0] ?? '其他' }
}

async function settleTurn(t: Table, m: Member, r: TurnResult, ctx: SceneContext, o: TableOptions, before: readonly Screen[] = []): Promise<Table> {
  const s = snapshotOf(t)
  let tt = t
  let intentId = r.intentId
  if (!intentId) ({ id: intentId, t: tt } = nextId(t, 'act'))
  const b = new Builder(s, intentId, m.name)
  b.screens.push(...before)
  b.screen('narration', narrationScreen(r), { actorId: m.actorId })
  b.add(r.drafts)
  const tags: Tag[] = [...(ctx.tags ?? []), ...r.tags]
  const actx = { ...ctx, tags }
  b.pick(selectFor(b.cur, 'action', { ctx: actx }), actx)
  const pending = storyBeats(b, ctx, m.seatId)
  const choice = choiceDraft(s, { seatId: m.seatId, actorId: m.actorId, kind: 'act', ...actionKey(t, r), drafts: b.drafts.filter((d) => d.type !== 'text_shown') })
  if (choice) b.add([choice])
  const recent = [...tt.recent, `第 ${s.round} 轮 ${m.name}：${r.reply.narration.slice(0, 40)}`].slice(-CONFIG.recentRoundsInPrompt)
  const out = finishIntent(tt, b, intentId, o, { pending, suggestions: r.reply.suggestions, recent, responses: [...tt.responses, ...r.responses], gaps: [...r.gaps] })
  return pending ? out : advance(out, o)
}

/** 07 §1: one free action. A check proposal pauses for the roll; otherwise the action settles now. */
export async function act(t0: Table, text: string, model: ModelCall | null, o: TableOptions = {}): Promise<Table> {
  assertFree(t0)
  const t = checkpoint(t0, `${currentMember(t0).name}：${text.slice(0, 24)}`)
  const m = currentMember(t)
  const s = snapshotOf(t)
  const ctx = sceneContext(s)
  const r = await runAiTurn(s, turnInput(t, m, text, ctx, []), model)
  if (r.checks.length) {
    const request = r.checks[0]
    const b = new Builder(s, `pre:${t.n + 1}`, m.name)
    b.screen('narration', narrationScreen(r), { actorId: m.actorId })
    return {
      ...t, n: t.n + 1, screens: [...t.screens, ...b.screens], responses: [...t.responses, ...r.responses], gaps: [...t.gaps, ...r.gaps],
      pending: { kind: 'check', seatId: m.seatId, text, request, stat: statFor(request, r.reply.intents), intents: r.reply.intents },
    }
  }
  return settleTurn(t, m, r, ctx, o)
}

/** Rolls the pending check and asks the host to narrate its result. */
export async function roll(t: Table, model: ModelCall | null, o: TableOptions = {}, dice?: readonly [number, number]): Promise<Table> {
  const p = t.pending
  if (p?.kind !== 'check') throw new Error('没有待掷的检定')
  const m = t.party.find((x) => x.seatId === p.seatId)!
  const rng = o.rng ?? Math.random
  const d = dice ?? ([1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)] as const)
  const outcome = rollCheck(p.request, p.stat, m.stats[p.stat], d)
  const s = snapshotOf(t)
  const ctx = sceneContext(s)
  const r = await runAiTurn(s, turnInput(t, m, p.text, ctx, [], outcome), model)
  const free = { ...t, pending: null }
  const rollScreen: Screen = {
    id: `roll:${t.n}`, kind: 'roll', actorId: m.actorId,
    paragraphs: [`${m.name} · ${outcome.skill}检定（难度 ${outcome.difficulty}）`, `${d[0]} + ${d[1]} + ${m.stats[p.stat]} = ${outcome.total}　${{ hit: '成功', partial: '有代价的成功', miss: '失利' }[outcome.tier]}`],
  }
  return settleTurn(free, m, { ...r, checks: [] }, ctx, o, [rollScreen])
}

/** Moves within Grayport: closing, transition and arrival (09 §3.3a); counts as the seat's action. */
export function move(t0: Table, placeId: PlaceId, o: TableOptions = {}): Table {
  assertFree(t0)
  if (snapshotOf(t0).location?.placeId === placeId) throw new Error('已经在这里')
  const t = checkpoint(t0, `前往${placeName(placeId)}`)
  const m = currentMember(t)
  const s = snapshotOf(t)
  const from = s.location?.placeId
  const { id, t: tt } = nextId(t, 'move')
  const b = new Builder(s, id, m.name)
  const moved = [draft('location_changed', { regionId: 'gray_harbor', placeId })]
  b.add(moved)
  const arrival = sceneContext(b.cur)
  const change = sceneChange(b.cur, { closing: [`${m.name}离开了${from ? placeName(from) : '原处'}，身后的声音一点点落远。`], travel: false, arrival })
  b.screen('narration', change.closing)
  if (change.transition) b.show(change.transition, arrival)
  if (change.arrival) b.show(change.arrival, arrival)
  b.gaps.push(...change.problems.filter((x) => x !== '缺少收尾').map((x) => `换场：${x}`))
  meetings(b, arrival)
  const pending = storyBeats(b, arrival, m.seatId)
  const choice = choiceDraft(s, { seatId: m.seatId, actorId: m.actorId, kind: 'act', sceneId: from ?? 'none', target: placeId, method: '离开', drafts: moved })
  if (choice) b.add([choice])
  const out = finishIntent(tt, b, id, o, { pending })
  return pending ? out : advance(out, o)
}

/** Settles the pending interaction; a skip leaves the template's ordinary check to roll. */
export function interact(t: Table, req: InteractionRequest, o: TableOptions = {}): { table: Table; result: InteractionResult } {
  const p = t.pending
  if (p?.kind !== 'interaction' || req.instanceId !== p.instanceId) throw new Error('没有这个待完成的互动')
  const def = INTERACTIONS[p.textId]
  const present = def.template === 'dialogue-gesture' ? def.guests.map((g) => g.id) : undefined
  const r = settleInteraction(t.events, def, req, { runId: t.runId, committedAt: stamp(o) }, { present })
  if (r.result.check) {
    const m = t.party.find((x) => x.seatId === p.seatId)!
    const request: CheckRequest = { skill: r.result.check.skill, difficulty: r.result.check.difficulty, reason: def.title }
    return { table: { ...t, events: r.events, pending: { kind: 'check', seatId: m.seatId, text: `（${def.title}：不细看，凭本事应对）`, request, stat: statFor(request, []), intents: [], interaction: p.textId } }, result: r.result }
  }
  return { table: advance({ ...t, events: r.events, pending: null }, o), result: r.result }
}

const OUTCOME_LABEL: Readonly<Record<OutcomeId, string>> = {
  exposed: '公开', handed_over: '交给商会', traded: '与他交易', destroyed: '毁掉潮井', seized: '自己掌控', stabilized: '稳住局势', failed: '撤退',
}
export const ARC_OUTCOMES: readonly OutcomeId[] = ['exposed', 'handed_over', 'traded', 'seized', 'destroyed']
export const outcomeLabel = (id: OutcomeId) => OUTCOME_LABEL[id]

/** The party's decision at the well (GH-BEAT-06): resolves the core adventure and shows its result beat. */
export function resolveArc(t0: Table, outcomes: readonly OutcomeId[], o: TableOptions = {}): Table {
  assertFree(t0)
  if (!outcomeOpen(snapshotOf(t0))) throw new Error('潮井之下还没到抉择的时候')
  const t = checkpoint(t0, `潮井之下：${outcomes.map(outcomeLabel).join('、')}`)
  const s = snapshotOf(t)
  const m = currentMember(t)
  const { id, t: tt } = nextId(t, 'resolve')
  const resolved = withConsequences(s, [draft('core_arc_resolved', { arcId: 'gray_well', outcomes: [...outcomes] })])
  const b = new Builder(s, id, m.name)
  b.add(resolved.drafts)
  const ctx = sceneContext(b.cur, { vars: { outcome: outcomes[0] } })
  b.pick(selectFor(b.cur, 'beat', { ctx }), ctx)
  const choice = choiceDraft(s, { seatId: m.seatId, actorId: m.actorId, kind: 'act', sceneId: 'gray_well', target: 'gray_well', method: 'resolve', drafts: resolved.drafts })
  if (choice) b.add([choice])
  return advance(finishIntent(tt, b, id, o), o)
}

/** R4: every human seat agrees to close the story; R1 must already hold. */
export const canWrapUp = (t: Table) => r1Met(snapshotOf(t)) && snapshotOf(t).act !== 4

export function wrapUp(t0: Table, o: TableOptions = {}): Table {
  assertFree(t0)
  const drafts = wrapUpDrafts(snapshotOf(t0), t0.party.filter((m) => m.controller === 'human').map((m) => m.seatId))
  if (!drafts) throw new Error('还不能收束：每位玩家都要先做满足够的选择')
  const t = checkpoint(t0, '收束故事')
  const s = snapshotOf(t)
  const { id, t: tt } = nextId(t, 'wrap')
  const b = new Builder(s, id, currentMember(t).name)
  b.add(drafts)
  const ctx: SceneContext = {}
  b.pick(selectFor(b.cur, 'act', { ctx }), ctx)
  const out = finishIntent(tt, b, id, o)
  return { ...out, pending: { kind: 'ending', candidates: endingCandidates(snapshotOf(out)) } }
}

/** 06 §3 step 6, by the players for now: commits the ending with its D01 variant. */
export function chooseEnding(t: Table, directionId: DirectionId, secondary: DirectionId | null = null, o: TableOptions = {}): Table {
  const p = t.pending
  if (p?.kind !== 'ending' || !p.candidates.includes(directionId)) throw new Error('这个方向不在候选里')
  const s = snapshotOf(t)
  const variant = directionId === 'D01' ? d01Variant(s).variant : 'none'
  const drafts = [draft('ending_committed', { directionId, secondaryDirectionId: secondary ?? directionId, variant, worldResolution: directionId === 'D01' ? 'unresolved' : 'resolved' })]
  const { id, t: tt } = nextId({ ...checkpoint(t, `结局：${directionId}`), pending: null }, 'ending')
  return commit(tt, id, drafts, o)
}

/** Rewinding is solo only: in a shared run the others would lose their turns too. */
export const canRewind = (t: Table) => t.party.filter((m) => m.controller === 'human').length === 1

function checkpoint(t: Table, label: string): Table {
  if (!canRewind(t)) return t
  const cp: Checkpoint = {
    id: `cp:${t.events.length}`, round: snapshotOf(t).round, label, events: t.events.length, screens: t.screens.length,
    turn: t.turn, pending: t.pending, suggestions: t.suggestions, recent: t.recent,
  }
  return { ...t, checkpoints: [...t.checkpoints, cp] }
}

/**
 * Back to just before a decision, so the player can choose again. Everything after it leaves
 * the log; AI responses stay in `responses` because their receipts already exist on the server,
 * and achievements already unlocked stay unlocked (they belong to the profile, not the run).
 */
export function rewind(t: Table, checkpointId: string): Table {
  if (!canRewind(t)) throw new Error('联机局不能回退')
  const i = t.checkpoints.findIndex((c) => c.id === checkpointId)
  if (i < 0) throw new Error('没有这个回退点')
  const cp = t.checkpoints[i]
  const screens = t.screens.slice(0, cp.screens)
  return {
    ...t,
    events: t.events.slice(0, cp.events),
    screens: [...screens, { id: `rewind:${t.n + 1}`, kind: 'note', paragraphs: [`回到了第 ${cp.round} 轮，“${cp.label}”之前。`, '之后发生的事都没有发生过，你可以重新选择。'] }],
    turn: cp.turn, pending: cp.pending, suggestions: cp.suggestions, recent: cp.recent,
    checkpoints: t.checkpoints.slice(0, i), n: t.n + 1,
  }
}
