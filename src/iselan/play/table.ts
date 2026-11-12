import type { CheckOutcome, TurnInput } from '../ai/context'
import type { CheckRequest } from '../ai/proposals'
import { ENDING_PREFIX, endingContent, parseEnding, type EndingInput, type EndingReply } from '../ai/ending'
import { aiIntentId, ModelUnavailable, runAiTurn, type AiResponse, type ModelCall, type TurnResult } from '../ai/turn'
import { CONFIG } from '../config'
import type { ArcId, BeatId, DirectionId, IntentTag, OpeningHookId, OutcomeId, PlaceId, Tag } from '../data'
import { TEXTS, VOCAB } from '../data'
import { commitIntent, draft, reduceEvents, type AnyDraft, type AnyEvent, type Snapshot } from '../events'
import { BANQUET, interactionInstanceId, LEDGER, settleInteraction, type InteractionDef, type InteractionRequest, type InteractionResult } from '../interaction'
import { allHold, evalCond, type SceneContext } from '../rules/conditions'
import { choiceDraft, joinSeatDraft, r1Met, setControllerDraft, type ActionInput } from '../rules/choices'
import { d01Variant, endingCandidates } from '../rules/directions'
import { openingDrafts } from '../rules/initial'
import { wrapUpDrafts } from '../rules/progress'
import { tavernServiceDraft } from '../rules/projects'
import { preview, startRound, withConsequences } from '../rules/settle'
import { stagedDrafts } from '../rules/staged'
import { ALL_UNITS, fillPlaceholders, placeholderValues, sceneChange, selectFor, selectText, shownDrafts, type Pick as TextPick, type TextUnit } from '../texts'
import { rollCheck, statFor, type Stat } from './check'
import { specialtyBonus, type CharacterDraft } from './characterDraft'
import { chronicleOf, citedDeeds, directionName, endingCast, projectLine, unfinishedOf } from './ending'
import { PREGENS } from './pregens'
import { ambienceDrafts, banquetDrafts, outcomeLabel, placeName, presentAt, sceneContext } from './world'

export { outcomeLabel }

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
  readonly draft?: CharacterDraft
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
  /** 09 §3.3a: which part of a scene change this screen is. */
  readonly part?: 'closing' | 'transition' | 'arrival'
  /** 06 §6: the ending part this screen belongs to. */
  readonly heading?: string
}

export type Pending =
  | { readonly kind: 'check'; readonly seatId: string; readonly text: string; readonly request: CheckRequest; readonly stat: Stat; readonly intents: readonly IntentTag[]; readonly interaction?: string; readonly tavernService?: string }
  | { readonly kind: 'interaction'; readonly seatId: string; readonly textId: string; readonly instanceId: string }
  | { readonly kind: 'ending'; readonly candidates: readonly DirectionId[] }
  /** A rewind waiting on every player at the table; `resume` is what was pending before it. */
  | { readonly kind: 'rewind'; readonly checkpointId: string; readonly by: string; readonly agreed: readonly string[]; readonly resume: Pending | null }
  /** R4 online: closing the story waits on every player at the table. */
  | { readonly kind: 'wrap'; readonly by: string; readonly agreed: readonly string[] }

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
  /** Decisions the table may go back to, oldest first. */
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
/** For a log the server packed itself: its stored snapshot stands in for a replay. */
export function adoptSnapshot(events: readonly AnyEvent[], s: Snapshot) {
  if (s.seq === (events.at(-1)?.seq ?? 0)) cache.set(events, s)
}

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
  readonly memento: string | undefined

  constructor(base: Snapshot, prefix: string, actorName: string, memento?: string) {
    this.base = base
    this.prefix = prefix
    this.actorName = actorName
    this.memento = memento
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
  show(pick: TextPick, ctx: SceneContext, part?: Screen['part'], heading?: string) {
    const settle = d01Variant(this.cur)
    const values = placeholderValues(this.cur, { 角色: this.actorName, 纪念物: this.memento, 收束之地: settle.variant === 'settle' ? settle.regionId : undefined })
    const paragraphs = pick.paragraphs.map((p) => {
      const f = fillPlaceholders(p, values)
      if (f.missing.length) this.gaps.push(`${pick.unit.id}：占位符没有值 ${f.missing.join('、')}`)
      // 09: ** marks the core image the AI must keep; players see plain text.
      return f.text.replace(/\*\*/g, '')
    })
    const r = shownDrafts(this.cur, pick, ctx)
    this.gaps.push(...r.gaps)
    const beat = beatOf(pick.unit)
    const extra = beat && !this.cur.arcs[beat.arc]?.beats.includes(beat.beat) && !r.drafts.some((d) => d.type === 'arc_beat_reached')
      ? [draft('arc_beat_reached', { arcId: beat.arc, beat: beat.beat })] : []
    this.add([...r.drafts, ...extra])
    this.screen('text', paragraphs, { textId: pick.unit.id, title: pick.unit.entry.title, images: pick.images, ...(part ? { part } : {}), ...(heading ? { heading } : {}) })
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
  const tail = new Builder(after, `${intentId}+`, b.actorName, b.memento)
  ruleTexts(tail, settled.texts)
  actBridge(tail, before)
  let out: Table = { ...next, ...extra, screens: [...t.screens, ...b.screens], gaps: [...t.gaps, ...b.gaps, ...(extra.gaps ?? [])] }
  if (tail.drafts.length) out = commit(out, `${intentId}+texts`, tail.drafts, o)
  return { ...out, screens: [...out.screens, ...tail.screens], gaps: [...out.gaps, ...tail.gaps] }
}

/** Moves to the next seat; once everyone has acted, the next round starts with its clock check. */
/** 02 R1c: a seat whose player left keeps its character in the story but takes no more turns. */
const seated = (t: Table, i: number) => snapshotOf(t).seats[t.party[i].seatId]?.controller !== 'empty'

function advance(t: Table, o: TableOptions): Table {
  let turn = t.turn + 1
  while (turn < t.party.length && !seated(t, turn)) turn += 1
  if (turn < t.party.length) return { ...t, turn }
  const s = snapshotOf(t)
  const r = startRound(s, s.round + 1)
  const round = preview(s, r.drafts)
  const b = new Builder(round, `round:${round.round}`, '')
  b.add([...ambienceDrafts(round), ...banquetDrafts(round)])
  ruleTexts(b, r.texts)
  const out = commit({ ...t, turn: 0 }, `round:${round.round}`, [...r.drafts, ...b.drafts], o)
  const first = out.party.findIndex((_, i) => seated(out, i))
  return { ...out, turn: Math.max(0, first), screens: [...out.screens, ...b.screens], gaps: [...out.gaps, ...b.gaps] }
}

/**
 * A player left an online table (02 R1c): the seat empties, stops counting for R1 and for rewind
 * votes, and its turns are skipped. A roll or step it still owed passes to whoever acts next.
 */
export function leaveSeat(t0: Table, seatId: string, o: TableOptions = {}): Table {
  const s = snapshotOf(t0)
  const m = t0.party.find((x) => x.seatId === seatId)
  const d = setControllerDraft(s, seatId, 'empty')
  if (!m || !d || s.seats[seatId]?.controller === 'empty') return t0
  const { id, t } = nextId(t0, 'leave')
  const left = commit(t, id, [d], o)
  const note: Screen = { id: `${id}#1`, kind: 'note', paragraphs: [`${m.name}离开了这张桌子。`, '故事里的这个角色暂时退到幕后，其余的人接着走下去。'] }
  const out = { ...left, screens: [...left.screens, note] }
  if (out.pending?.kind === 'rewind') {
    const p = out.pending
    const agreed = p.agreed.filter((x) => x !== seatId)
    if (p.by === seatId || !agreed.length) return { ...out, pending: p.resume }
    if (rewindVoters(out).every((x) => agreed.includes(x))) return applyRewind({ ...out, pending: p.resume }, p.checkpointId)
    return { ...out, pending: { ...p, agreed } }
  }
  if (out.pending?.kind === 'wrap') {
    const p = out.pending
    const agreed = p.agreed.filter((x) => x !== seatId)
    const free = { ...out, pending: null }
    if (p.by === seatId || !agreed.length) return free.party[free.turn]?.seatId === seatId ? advance(free, o) : free
    if (rewindVoters(out).every((x) => agreed.includes(x))) return wrapUp(free, o)
    return { ...out, pending: { ...p, agreed } }
  }
  return !out.pending && out.party[out.turn]?.seatId === seatId ? advance(out, o) : out
}

/**
 * R1a: a player joins mid-run with a new character in a new seat, counting from the lowest
 * seat in play and needing their own choices before the story can close. Rewind points from
 * before the join are dropped: going back past it would leave the new seat without a character.
 */
export function joinTable(t0: Table, member: Member, o: TableOptions = {}): Table {
  const s = snapshotOf(t0)
  if (s.ending) throw new Error('这一局已经结束')
  if (voting(t0)) throw new Error('正在表决，稍后再加入')
  if (s.seats[member.seatId] || t0.party.some((m) => m.actorId === member.actorId)) throw new Error('这个角色已经在桌上了')
  const { id, t } = nextId(t0, 'join')
  const joined = commit(t, id, [joinSeatDraft(s, member.seatId, member.actorId, 'human')], o)
  const note: Screen = { id: `${id}#1`, kind: 'note', paragraphs: [`${member.name}推开门，加入了你们。`, `${member.name}要先亲手做满 ${CONFIG.minOwnChoicesAfterJoin} 件事，大家才能一起收束故事。`] }
  return { ...joined, party: [...joined.party, member], screens: [...joined.screens, note], checkpoints: [] }
}

export interface OpenInput {
  readonly runId: string
  readonly seed: string
  readonly party: readonly Member[]
  readonly openingHook: OpeningHookId
  /** Rooms are online even with one player at the start: others may join later (R1a). */
  readonly mode?: 'solo' | 'online'
}

/** GEN-BEAT opening at the Seven Lamps on a rainy dusk, then the arrival in Grayport. */
export function openTable(input: OpenInput, o: TableOptions = {}): Table {
  const t0: Table = { runId: input.runId, events: [], party: input.party, turn: 0, pending: null, screens: [], suggestions: [], gaps: [], responses: [], recent: [], n: 0, checkpoints: [] }
  const seats = input.party.map((m) => ({ seatId: m.seatId, actorId: m.actorId, controller: m.controller }))
  const opening = openingDrafts({ mode: input.mode ?? (input.party.length > 1 ? 'online' : 'solo'), seed: input.seed, openingHook: input.openingHook, seats })
  let s = preview(snapshotOf(t0), opening)
  const round = startRound(s, 1)
  s = preview(s, round.drafts)
  const b = new Builder(s, 'open', input.party[0]?.name ?? '', input.party[0]?.memento)
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

const DOCKS = 'gray_harbor.docks'
const DOCK_SETUP = 'GH-SCN-25'
const DOCK_RESCUE = 'GH-SCN-26'
const DOCK_DEATH = 'GH-SCN-27'
const COUNCIL_LEDGER = 'GH-SCN-28'
const INSPECT_ROPE = '检查码头吊索'
const SAVE_LUDO = '反摇绞盘救卢多'
const CUT_ROPE = '割断吊索（卢多会落水身亡）'
const READ_LEDGER = '查阅议会存档'
const SERVE_TAVERN = '酒馆开门营业'

function serviceOptions(s: Snapshot) {
  const taverns = Object.entries(s.projects).filter(([, p]) =>
    p.kind === 'tavern' && p.regionId === s.location?.regionId && (p.stage === 'operational' || p.stage === 'stable'))
  return taverns
    .filter(([, p]) => p.services.at(-1)?.round !== s.round)
    .map(([id, p]) => ({ id, label: taverns.length === 1 ? SERVE_TAVERN : `${SERVE_TAVERN}：${p.name ?? '酒馆'}（${id}）` }))
}

function sceneActions(s: Snapshot) {
  const place = s.location?.placeId
  if (place === 'gray_harbor.council_hall' && !s.texts[COUNCIL_LEDGER]) return [READ_LEDGER]
  if (place !== DOCKS || !presentAt(s, DOCKS).includes('ludo') || s.texts[DOCK_RESCUE] || s.texts[DOCK_DEATH]) return []
  return s.texts[DOCK_SETUP] ? [SAVE_LUDO, CUT_ROPE] : [INSPECT_ROPE]
}

export function tableActions(s: Snapshot): readonly string[] {
  return [...sceneActions(s), ...serviceOptions(s).map(({ label }) => label)]
}

function settleLocalAction(t: Table, b: Builder, target: string, method: string, o: TableOptions): Table {
  const m = currentMember(t)
  const choice = choiceDraft(b.base, {
    seatId: m.seatId, actorId: m.actorId, kind: 'act', sceneId: b.base.location?.placeId ?? 'none',
    target, method, drafts: b.drafts,
  })
  if (choice) b.add([choice])
  return advance(finishIntent(t, b, b.prefix, o, { pending: null }), o)
}

function playSceneAction(t: Table, m: Member, s: Snapshot, text: string, o: TableOptions): Table {
  const { id, t: tt } = nextId(t, 'act')
  const b = new Builder(s, id, m.name, m.memento)
  let textId = DOCK_SETUP
  let tag: Tag = INSPECT_ROPE
  if (text === READ_LEDGER) {
    textId = COUNCIL_LEDGER
    tag = READ_LEDGER
  } else if (text === SAVE_LUDO || text === CUT_ROPE) {
    const rescued = text === SAVE_LUDO
    b.add([draft('npc_state_changed', { npcId: 'ludo', state: rescued ? 'wounded' : 'dead' })])
    if (rescued) b.add([draft('npc_rescued', { subjectId: 'ludo' })])
    textId = rescued ? DOCK_RESCUE : DOCK_DEATH
    tag = rescued ? SAVE_LUDO : '割断吊索'
  }
  const ctx = sceneContext(b.cur, { tags: [tag] })
  const { pick } = selectFor(b.cur, 'action', { ids: [textId], ctx })
  if (!pick) throw new Error(`当前无法展示场景 ${textId}`)
  b.show(pick, ctx)
  return settleLocalAction(tt, b, textId, tag, o)
}

/** Same scene, same target, same way: the key `choiceDraft` uses to drop repeats (02 §2). */
function actionKey(t: Table, r: TurnResult, project: string | null = null): Pick<ActionInput, 'sceneId' | 'target' | 'method'> {
  const s = snapshotOf(t)
  // Each round's work on a project is its own choice (12 §6.3), not a repeat of last round's.
  if (project) return { sceneId: s.location?.placeId ?? 'none', target: `project:${project}`, method: `round:${s.round}` }
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
  const b = new Builder(s, intentId, m.name, m.memento)
  b.screens.push(...before)
  b.screen('narration', narrationScreen(r), { actorId: m.actorId })
  b.add(r.drafts)
  const tags: Tag[] = [...(ctx.tags ?? []), ...r.tags]
  const actx = { ...ctx, tags }
  b.pick(selectFor(b.cur, 'action', { ctx: actx }), actx)
  const pending = storyBeats(b, ctx, m.seatId)
  const invested = r.invested ? { projectId: r.invested, settled: ['task' as const] } : {}
  const choice = choiceDraft(s, { seatId: m.seatId, actorId: m.actorId, kind: 'act', ...actionKey(t, r, r.invested), drafts: b.drafts.filter((d) => d.type !== 'text_shown'), ...invested })
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
  if (sceneActions(s).includes(text)) return playSceneAction(t, m, s, text, o)
  if ([INSPECT_ROPE, SAVE_LUDO, CUT_ROPE, READ_LEDGER].includes(text)) throw new Error('当前场景无法执行这项行动')
  if (text === SERVE_TAVERN || text.startsWith(`${SERVE_TAVERN}：`)) {
    const service = serviceOptions(s).find(({ label }) => label === text)
    if (!service) throw new Error('需要一家本地正在运转的酒馆，每家酒馆每轮只结算一班')
    const request = { skill: '交涉', difficulty: 12, reason: '招呼客人、安排酒食，结算本班营业收支' }
    return { ...t, pending: { kind: 'check', seatId: m.seatId, text, request, stat: 'soc', intents: ['交易'], tavernService: service.id } }
  }
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
  const bonus = specialtyBonus(m.draft, p.stat)
  const outcome = rollCheck(p.request, p.stat, m.stats[p.stat] + bonus, d)
  const s = snapshotOf(t)
  const ctx = sceneContext(s)
  const free = { ...t, pending: null }
  const rollScreen: Screen = {
    id: `roll:${t.n}`, kind: 'roll', actorId: m.actorId,
    paragraphs: [`${m.name} · ${outcome.skill}检定（难度 ${outcome.difficulty}）`, `${d[0]} + ${d[1]} + ${m.stats[p.stat]}${bonus ? ' + 1（专长）' : ''} = ${outcome.total}　${{ hit: '成功', partial: '有代价的成功', miss: '失利' }[outcome.tier]}`],
  }
  if (p.tavernService !== undefined) {
    const { id, t: tt } = nextId(free, 'act')
    const b = new Builder(s, id, m.name, m.memento)
    const service = tavernServiceDraft(p.tavernService, outcome.tier)
    b.screens.push(rollScreen)
    b.add([service])
    const { revenue, cost } = service.payload
    b.screen('note', [`酒馆本班收入 ${revenue} 银克朗，酒食、灯油与人手共花 ${cost} 银克朗。`])
    return settleLocalAction(tt, b, p.tavernService, `营业:${s.round}`, o)
  }
  const r = await runAiTurn(s, turnInput(t, m, p.text, ctx, [], outcome), model)
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
  const b = new Builder(s, id, m.name, m.memento)
  const moved = [draft('location_changed', { regionId: 'gray_harbor', placeId })]
  b.add(moved)
  const arrival = sceneContext(b.cur)
  const change = sceneChange(b.cur, {
    closing: [`${m.name}离开了${from ? placeName(from) : '原处'}，身后的声音一点点落远。`], travel: false,
    arrival: placeId === DOCKS ? sceneContext(b.cur, { tags: ['抵达码头'] }) : arrival,
    // Each arrival is a new dock scene, even when multiple seats move in the same round.
    ...(placeId === DOCKS ? { arrivalIds: ['GH-SCN-29', 'GH-SCN-30'], sceneInstanceSince: b.cur.round + 1 } : {}),
  })
  b.screen('narration', change.closing, { part: 'closing' })
  if (change.transition) b.show(change.transition, arrival, 'transition')
  if (change.arrival) b.show(change.arrival, arrival, 'arrival')
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

export const ARC_OUTCOMES: readonly OutcomeId[] = ['exposed', 'handed_over', 'traded', 'seized', 'destroyed']

/** The party's decision at the well (GH-BEAT-06): resolves the core adventure and shows its result beat. */
export function resolveArc(t0: Table, outcomes: readonly OutcomeId[], o: TableOptions = {}): Table {
  assertFree(t0)
  if (!outcomeOpen(snapshotOf(t0))) throw new Error('潮井之下还没到抉择的时候')
  const t = checkpoint(t0, `潮井之下：${outcomes.map(outcomeLabel).join('、')}`)
  const s = snapshotOf(t)
  const m = currentMember(t)
  const { id, t: tt } = nextId(t, 'resolve')
  const resolved = withConsequences(s, [draft('core_arc_resolved', { arcId: 'gray_well', outcomes: [...outcomes] })])
  const b = new Builder(s, id, m.name, m.memento)
  b.add(resolved.drafts)
  const ctx = sceneContext(b.cur, { vars: { outcome: outcomes[0] } })
  b.pick(selectFor(b.cur, 'beat', { ctx }), ctx)
  const choice = choiceDraft(s, { seatId: m.seatId, actorId: m.actorId, kind: 'act', sceneId: 'gray_well', target: 'gray_well', method: 'resolve', drafts: resolved.drafts })
  if (choice) b.add([choice])
  return advance(finishIntent(tt, b, id, o), o)
}

/** R4: every human seat agrees to close the story; R1 must already hold. */
export const canWrapUp = (t: Table) => r1Met(snapshotOf(t)) && snapshotOf(t).act !== 4

/** A table waiting on a rewind or wrap-up vote; nothing else moves until it is answered. */
export const voting = (t: Table) => t.pending?.kind === 'rewind' || t.pending?.kind === 'wrap'

/** Closes the story now; with more than one player at the table this needs `proposeWrap`. */
export function wrapUp(t0: Table, o: TableOptions = {}): Table {
  assertFree(t0)
  const drafts = wrapUpDrafts(snapshotOf(t0), rewindVoters(t0))
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

/** Calls the ending model once; the server proxy uses the ending prefix and model (12 §9.3). */
export type EndingCall = (req: { readonly prefix: string; readonly content: string }) => Promise<AiResponse>

function endingInput(t: Table, s: Snapshot, candidates: readonly DirectionId[]): EndingInput {
  const settle = d01Variant(s)
  const opening = (id: DirectionId) => {
    const variant = id === 'D01' ? settle.variant : 'none'
    const probe = preview(s, [draft('ending_committed', { directionId: id, secondaryDirectionId: id, variant, worldResolution: id === 'D01' ? 'unresolved' : 'resolved' })])
    return selectFor(probe, 'ending').pick?.paragraphs ?? []
  }
  const cast = endingCast(s)
  return {
    setting: `队伍在${s.location?.placeId ? placeName(s.location.placeId) : '灰港'}${s.actVia === 'door' ? '的门前' : '收束了这段故事'}`,
    candidates: candidates.map((id) => ({ id, opening: opening(id) })),
    chronicle: chronicleOf(t.events),
    party: t.party.map((m) => {
      const pre = PREGENS.find((p) => p.id === m.actorId)
      const about = m.draft ? `${m.draft.ancestry} · ${m.draft.job}；动机：${m.draft.motive}`
        : pre ? `${pre.title}；动机：${pre.motive}；钩子：${pre.hook}` : '自创角色'
      return { seatId: m.seatId, name: m.name, about, memento: m.memento }
    }),
    projects: Object.entries(s.projects).map(([id, p]) => ({ id, text: projectLine(p) })),
    npcs: cast.npcs,
    factions: cast.factions,
    unfinished: unfinishedOf(s),
  }
}

const FRIEND_LINES = ['说起你们时，用的是“我们的朋友”。', '后来还常常提起你们，像提起一场好天气。', '在门口给你们留了一盏灯。']
const FOE_LINES = ['至今不愿听到你们的名字。', '提起你们时，总要停顿一下。', '把你们的事记得很清楚，一件也没忘。']
const ALLY_LINES = ['记着你们帮过的忙。', '的门对你们一直开着。', '在议事时替你们说过话。']
const RIVAL_LINES = ['的账本上，你们那一页还没合上。', '派人打听过你们的去向。', '提起你们时，没有人笑。']

/** 06 §3 without the AI: the most favoured candidate, ties in candidate order. */
function offlineEnding(s: Snapshot, input: EndingInput): EndingReply {
  const ids = input.candidates.map((c) => c.id)
  const primary = ids.reduce((best, id) => ((s.directions[id] ?? 0) > (s.directions[best] ?? 0) ? id : best), ids[0])
  const deeds = citedDeeds(input.chronicle).map((c) => c.text)
  const why = deeds.length
    ? `回头看，是这些事把你们带到了这里：${deeds.join('；')}。${primary === 'D01' ? '可你们这一段，在世界的故事写完之前就落了笔。' : `世界因此朝着“${directionName(primary)}”倾斜。`}`
    : '你们来过，看过，也走了一段路。世界的故事还很长，你们这一段在这里落了笔。'
  const characters: Record<string, string> = {}
  for (const m of offlineCharacters(input)) characters[m.seatId] = m.text
  const npcs: Record<string, string> = {}
  input.npcs.forEach((n, i) => { npcs[n.id] = `${n.name}${(n.attitude > 0 ? FRIEND_LINES : FOE_LINES)[i % FRIEND_LINES.length]}` })
  const factions: Record<string, string> = {}
  input.factions.forEach((f, i) => { factions[f.id] = `${f.name}${(f.relation > 0 ? ALLY_LINES : RIVAL_LINES)[i % ALLY_LINES.length]}` })
  const projects: Record<string, string> = {}
  for (const p of input.projects) projects[p.id] = `${p.text}。`
  return { primary, secondary: null, evidence: [], why, weave: '', characters, projects, npcs, factions, unfinished: input.unfinished.length ? input.unfinished.map((u) => `${u}。`) : ['远处的钟还在等第七声。'] }
}

function offlineCharacters(input: EndingInput) {
  return input.party.map((m) => {
    const why = m.about.match(/动机：([^；]+)/)?.[1]
    return { seatId: m.seatId, text: `${m.name}${why ? `一直没有忘记自己为什么来：${why}。` : '把这一路记在了心里。'}${m.memento ? `那${m.memento.replace(/^一(枚|封|把|块|只|本|张|件|个)/, '$1')}一直带在身边。` : ''}` }
  })
}

/**
 * 06 §3 steps 5–7 and §6: the AI (or the offline host) picks among the candidates, then the
 * ending is committed and its parts go on screen: the opening text, the reasons, and the epilogues.
 */
export async function adjudicate(t0: Table, model: EndingCall | null, o: TableOptions = {}): Promise<Table> {
  const p = t0.pending
  if (p?.kind !== 'ending') throw new Error('还没有到结局')
  const s = snapshotOf(t0)
  const input = endingInput(t0, s, p.candidates)
  const responses: AiResponse[] = []
  const gaps: string[] = []
  let ai: { reply: EndingReply; seq: number } | null = null
  if (model) {
    const content = endingContent(input)
    for (let attempt = 0; attempt <= CONFIG.ai.parseRetries && !ai; attempt++) {
      let res: AiResponse
      try {
        res = await model({ prefix: ENDING_PREFIX, content })
      } catch (e) {
        gaps.push(e instanceof ModelUnavailable ? `结局 AI 不可用（${e.status}）：${e.message}` : '结局 AI 调用失败')
        break
      }
      responses.push(res)
      const r = parseEnding(res.text, input)
      if (r.ok) {
        ai = { reply: r.reply, seq: res.seq }
        gaps.push(...r.notes)
      } else gaps.push(r.problem)
    }
  }
  const offline = offlineEnding(s, input)
  const reply = ai?.reply ?? offline
  const t1 = checkpoint({ ...t0, responses: [...t0.responses, ...responses] }, `结局：${p.candidates.map(directionName).join(' / ')}`)
  const { id, t } = ai ? { id: aiIntentId(ai.seq), t: t1 } : nextId(t1, 'ending')
  const variant = reply.primary === 'D01' ? d01Variant(s).variant : 'none'
  const m = currentMember(t)
  const b = new Builder(s, id, m.name, m.memento)
  b.add([draft('ending_committed', {
    directionId: reply.primary, secondaryDirectionId: reply.secondary ?? reply.primary, variant,
    worldResolution: reply.primary === 'D01' ? 'unresolved' : 'resolved',
  })])
  const sel = selectFor(b.cur, 'ending')
  if (sel.gap && sel.gap.reason !== 'none') b.gaps.push(`文本缺口：END ${sel.gap.reason}`)
  if (sel.pick) b.show(sel.pick, {}, undefined, '第七声')
  b.screen('narration', [reply.weave].filter(Boolean), { heading: '第七声' })
  b.screen('narration', reply.why.split(/\n+/).filter(Boolean), { heading: '理由' })
  const pick = <K extends 'characters' | 'projects' | 'npcs' | 'factions'>(k: K, key: string) => reply[k][key] ?? offline[k][key]
  b.screen('narration', t.party.map((x) => pick('characters', x.seatId)).filter(Boolean), { heading: '角色的尾声' })
  b.screen('narration', input.projects.map((x) => pick('projects', x.id)).filter(Boolean), { heading: '事业的尾声' })
  b.screen('narration', input.npcs.map((x) => pick('npcs', x.id)).filter(Boolean), { heading: '人物的尾声' })
  b.screen('narration', input.factions.map((x) => pick('factions', x.id)).filter(Boolean), { heading: '势力的尾声' })
  b.screen('narration', reply.unfinished.length ? reply.unfinished : offline.unfinished, { heading: '未竟之事' })
  return finishIntent({ ...t, pending: null }, b, id, o, { gaps })
}

/** Seats whose players must agree to a rewind: humans still at the table (02 R1c leavers drop out). */
export const rewindVoters = (t: Table): string[] =>
  Object.entries(snapshotOf(t).seats).filter(([, seat]) => seat.controller === 'human').map(([id]) => id)

/** A solo run, or one player left at the table, rewinds without a vote. */
export const rewindNeedsVote = (t: Table) => snapshotOf(t).mode !== 'solo' && rewindVoters(t).length > 1

function checkpoint(t: Table, label: string): Table {
  const cp: Checkpoint = {
    id: `cp:${t.events.length}`, round: snapshotOf(t).round, label, events: t.events.length, screens: t.screens.length,
    turn: t.turn, pending: t.pending, suggestions: t.suggestions, recent: t.recent,
  }
  return { ...t, checkpoints: [...t.checkpoints, cp] }
}

function checkpointOf(t: Table, checkpointId: string) {
  const i = t.checkpoints.findIndex((c) => c.id === checkpointId)
  if (i < 0) throw new Error('没有这个回退点')
  return { i, cp: t.checkpoints[i] }
}

function applyRewind(t: Table, checkpointId: string): Table {
  const { i, cp } = checkpointOf(t, checkpointId)
  const screens = t.screens.slice(0, cp.screens)
  return {
    ...t,
    events: t.events.slice(0, cp.events),
    screens: [...screens, { id: `rewind:${t.n + 1}`, kind: 'note', paragraphs: [`回到了第 ${cp.round} 轮，“${cp.label}”之前。`, '之后发生的事都没有发生过，可以重新选择。'] }],
    turn: cp.turn, pending: cp.pending, suggestions: cp.suggestions, recent: cp.recent,
    checkpoints: t.checkpoints.slice(0, i), n: t.n + 1,
  }
}

/**
 * Back to just before a decision, so the player can choose again. Everything after it leaves
 * the log; AI responses stay in `responses` because their receipts already exist on the server,
 * and achievements already unlocked stay unlocked (they belong to the profile, not the run).
 * With more than one player at the table this needs everyone's agreement: use `proposeRewind`.
 */
export function rewind(t: Table, checkpointId: string): Table {
  if (rewindNeedsVote(t)) throw new Error('联机局回退需要全员同意')
  return applyRewind(t, checkpointId)
}

/** A player asks to go back; play pauses until every other player at the table answers. */
export function proposeRewind(t: Table, checkpointId: string, seatId: string): Table {
  if (voting(t)) throw new Error('已经有一个提议在等待表决')
  if (!rewindVoters(t).includes(seatId)) throw new Error('只有在座的玩家可以提议回退')
  const { cp } = checkpointOf(t, checkpointId)
  const by = t.party.find((m) => m.seatId === seatId)?.name ?? seatId
  const proposal: Pending = { kind: 'rewind', checkpointId, by: seatId, agreed: [seatId], resume: t.pending }
  const note: Screen = { id: `vote:${t.n + 1}`, kind: 'note', paragraphs: [`${by}提议回到第 ${cp.round} 轮，“${cp.label}”之前。`, '所有在座的玩家都同意才会回退；有人反对就照常继续。'] }
  return { ...t, n: t.n + 1, pending: proposal, screens: [...t.screens, note] }
}

/** R4 online: a player asks to close the story; it closes once every player at the table agrees. */
export function proposeWrap(t: Table, seatId: string): Table {
  assertFree(t)
  if (!rewindVoters(t).includes(seatId)) throw new Error('只有在座的玩家可以提议收束')
  if (!canWrapUp(t) || !wrapUpDrafts(snapshotOf(t), rewindVoters(t))) throw new Error('还不能收束：每位玩家都要先做满足够的选择')
  const by = t.party.find((m) => m.seatId === seatId)?.name ?? seatId
  const note: Screen = { id: `vote:${t.n + 1}`, kind: 'note', paragraphs: [`${by}提议收束故事，就此写下这支队伍的结局。`, '所有在座的玩家都同意才会收束；有人反对就照常继续。'] }
  return { ...t, n: t.n + 1, pending: { kind: 'wrap', by: seatId, agreed: [seatId] }, screens: [...t.screens, note] }
}

/**
 * One player's answer to a rewind or wrap-up proposal. The last yes carries it out; any no drops
 * it and play goes on where it was.
 */
export function vote(t: Table, seatId: string, agree: boolean, o: TableOptions = {}): Table {
  const p = t.pending
  if (p?.kind !== 'rewind' && p?.kind !== 'wrap') throw new Error('没有待表决的提议')
  if (!rewindVoters(t).includes(seatId)) throw new Error('只有在座的玩家可以表决')
  const name = t.party.find((m) => m.seatId === seatId)?.name ?? seatId
  const resume = p.kind === 'rewind' ? p.resume : null
  if (!agree) {
    const note: Screen = { id: `vote:${t.n + 1}`, kind: 'note', paragraphs: [`${name}不同意${p.kind === 'rewind' ? '回退' : '收束'}。`, '故事照常继续。'] }
    return { ...t, n: t.n + 1, pending: resume, screens: [...t.screens, note] }
  }
  const agreed = [...new Set([...p.agreed, seatId])]
  if (!rewindVoters(t).every((id) => agreed.includes(id))) return { ...t, pending: { ...p, agreed } }
  return p.kind === 'rewind' ? applyRewind({ ...t, pending: resume }, p.checkpointId) : wrapUp({ ...t, pending: null }, o)
}
