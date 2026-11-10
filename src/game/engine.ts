import { produce } from 'immer'
import type {
  ActionDef, Boost, Character, CondId, CostId, EndingId, GameState, LocId, RollKind, RollReq, RollSpec, Stat, Tier,
} from './types.js'
import { STAT_NAMES } from './types.js'
import { CRISIS_ACTIONS, LOC_NAMES, LUDUO_ACTIONS, SCENES, crisisOutcome, luduoArrives, routeKnown } from './data/scenes.js'
import {
  addClue, addPressure, addStress, applyCost, echo, gainAdv, getChar, log, loseItem, narr, setFlag, sys,
} from './fx.js'
import { buildEnding, offlineCustomEnding } from './endings.js'
import { CLUES } from './data/clues.js'
import {
  AI_CONDS, CONDS, OVERFLOW_CONDS, addCond, canAct, clearBadConds, condLabel, condStatMod, condsOf, missHazard,
  onTurnStart, removeCond, rollInitiative, tickRound,
} from './conds.js'

export type { Boost } from './types.js'

export const SAVE_VERSION = 4

const d6 = () => 1 + Math.floor(Math.random() * 6)

export function newGame(party: Character[], safety: GameState['safety'], opts: { turns?: boolean } = {}): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    phase: 'play',
    party,
    location: 'gate',
    pressure: 1,
    visited: [],
    newVisitCount: 0,
    clues: [],
    flags: {},
    used: [],
    npcs: {
      ningrui: { met: false, where: '下落不明', attitude: '未知', status: '失踪' },
      joan: { met: false, where: '下落不明', attitude: '未知', status: '失踪' },
      evelyn: { met: false, where: '未知', attitude: '未知', status: '未知' },
      luduo: { met: false, where: '镇上', attitude: '未知', status: '安然' },
    },
    log: [],
    queue: [],
    crisis: null,
    memory: {},
    safety,
    ending: null,
    turn: 0,
    seq: 0,
  }
  return produce(s, (d) => {
    sys(d, '这是一场地下探索故事。你们可以调查、交涉、潜行、战斗、自创方案或撤退。失败会带来代价，但关键线索不会因此消失。')
    enter(d, 'gate')
    if (opts.turns) {
      sys(d, '回合制：每一轮按「灵巧×2 + 1d6 + 状态修正」决定行动顺序。中毒、失温会拖慢你，昏迷会让你错过回合。')
      startRound(d)
    }
  })
}

function startRound(d: GameState) {
  const t = d.turns ?? { round: 0, order: [], idx: 0, activeId: null }
  let order = rollInitiative(d.party.filter(canAct))
  if (t.round > 0) tickRound(d)
  if (!order.length) {
    d.party.forEach((c) => { c.out = false; removeCond(d, c.id, 'stun', true) })
    narr(d, '黑暗里，你们摸索着找到彼此的手，一个接一个地重新站了起来。')
    order = rollInitiative(d.party)
  }
  t.round += 1
  t.order = order
  t.idx = 0
  t.activeId = null
  d.turns = t
  const names = order.map((e) => `${getChar(d, e.id)?.name}(${e.total})`).join(' › ')
  log(d, 'turn', `第 ${t.round} 轮 · 先攻顺序：${names}`)
  beginTurn(d)
}

function beginTurn(d: GameState) {
  const t = d.turns!
  while (t.idx < t.order.length) {
    const c = getChar(d, t.order[t.idx].id)
    if (c && canAct(c)) break
    if (c) log(d, 'event', `${c.name}${c.out ? '暂时不在场' : '昏迷不醒'}，跳过回合`)
    t.idx += 1
  }
  if (t.idx >= t.order.length) return startRound(d)
  const c = getChar(d, t.order[t.idx].id)!
  t.activeId = c.id
  log(d, 'turn', `轮到 ${c.name}`, c.id)
  onTurnStart(d, c)
}

function nextTurn(d: GameState) {
  if (!d.turns) return
  d.turns.idx += 1
  beginTurn(d)
}

function settleTurn(d: GameState) {
  if (!d.turns || d.phase !== 'play' || d.queue.length || d.rolling || d.rollReq) return
  const active = getChar(d, d.turns.activeId ?? undefined)
  if (d.turnSpent || !active || !canAct(active)) {
    d.turnSpent = false
    nextTurn(d)
  }
}

export function activeChar(s: GameState): Character | undefined {
  return s.turns ? getChar(s, s.turns.activeId ?? undefined) : undefined
}

export function actingCharId(s: GameState): string | null {
  const p = s.queue[0]
  if (p?.type === 'cost') return p.actorId
  if (p?.type === 'overflow') return p.charId
  if (s.rolling) return s.rolling.actorId
  return s.turns?.activeId ?? null
}

function enter(d: GameState, to: LocId) {
  const scene = SCENES[to]
  const first = !d.visited.includes(to)
  d.location = to
  d.party.forEach((c) => { c.out = false; c.spentItems = [] })
  if (d.crisis) {
    narr(d, `你们甩开了${d.crisis.name}。它没有追来——它只是在黑暗里，学着你们远去的脚步声。`)
    d.crisis = null
  }
  log(d, 'sys', `§${scene.code}§${scene.title}`)
  if (first) {
    d.visited.push(to)
    log(d, 'read', scene.read)
    scene.onFirstEnter?.(d, {})
    if (to !== 'gate') {
      d.newVisitCount += 1
      if (d.newVisitCount >= 2 && d.newVisitCount % 2 === 0) {
        if (d.flags.skipVisitPressure) {
          delete d.flags.skipVisitPressure
          sys(d, '被砸碎的录音筒让这片区域的回声安静了一些——压力没有上涨。')
        } else {
          addPressure(d, 1, '深入矿井')
        }
      }
    }
    const explored = d.visited.filter((v) => v !== 'gate' && v !== 'A').length
    if (!d.flags.luduoArrived && d.npcs.luduo.met && to !== 'G' && to !== 'A' && (explored >= 2 || d.pressure >= 3)) {
      luduoArrives(d)
    }
  } else {
    sys(d, `你们回到了${scene.title}。`)
  }
  if (d.flags.finale && to !== 'G') {
    echo(d, '所有声音都在朝同一个方向坠落。井在呼唤你们——现在。')
  }
}

const MOVE_ORDER: LocId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

export function availableActions(s: GameState): ActionDef[] {
  if (s.phase !== 'play') return []
  if (s.flags.finale && s.location !== 'G') {
    return [{ id: 'rush_G', group: 'move', label: '冲向回声井核心', to: 'G' }]
  }
  const scene = SCENES[s.location]
  const list: ActionDef[] = []
  for (const a of scene.actions) {
    if (a.when && !a.when(s)) continue
    if (!a.repeatable && s.used.includes(a.id)) continue
    list.push(a)
  }
  if (s.crisis) list.push(...CRISIS_ACTIONS)
  if (s.flags.luduoHere === s.location) {
    for (const a of LUDUO_ACTIONS) {
      if (a.when && !a.when(s)) continue
      if (s.used.includes(a.id)) continue
      list.push(a)
    }
  }
  list.push(...careActions(s))
  if (s.location !== 'gate') {
    if (!s.flags[`rest_${s.location}`] && s.party.some((c) => c.stress > 0)) {
      list.push({ id: 'rest_short', group: 'act', label: '短暂休息，互相照料', hint: '每人承压 -1；每个地点一次' })
    }
    if (!s.flags[`camp_${s.location}`] && s.location !== 'G' && s.party.some((c) => c.stress >= 2)) {
      list.push({ id: 'rest_long', group: 'act', label: '扎营长时间休整', hint: '清空承压，但回声压力 +1' })
    }
    for (const loc of MOVE_ORDER) {
      if (loc === s.location || !routeKnown(s, loc)) continue
      if (s.location === 'G' && s.flags.finale) continue
      list.push({ id: `go_${loc}`, group: 'move', label: `前往${LOC_NAMES[loc]}`, to: loc, hint: s.visited.includes(loc) ? '已到访' : undefined })
    }
  }
  return list
}

const TREATABLE: CondId[] = ['poison', 'bleed', 'chill', 'tremble']

function careActions(s: GameState): ActionDef[] {
  const list: ActionDef[] = []
  for (const c of s.party) {
    if (condsOf(c).some((x) => x.id === 'stun')) {
      list.push({
        id: `wake_${c.id}`, group: 'act', label: `唤醒${c.name}`, hint: '解除昏迷', repeatable: true,
        run: (d) => {
          removeCond(d, c.id, 'stun', true)
          narr(d, `有人拍着${c.name}的脸，一遍遍叫着名字——直到那双眼睛重新聚焦。`)
        },
      })
    }
    const bad = condsOf(c).filter((x) => TREATABLE.includes(x.id))
    if (bad.length) {
      list.push({
        id: `aid_${c.id}`, group: 'act', label: `照料${c.name}（${bad.map((x) => CONDS[x.id].name).join('、')}）`, repeatable: true,
        roll: { stat: 'ins', specialties: ['急救者'], risk: '手忙脚乱会浪费时间，甚至让伤势恶化。', partialCosts: ['stress', 'item', 'pressure'], missCosts: ['stress', 'pressure'] },
        outcomes: {
          hit: (d) => { clearBadConds(d, c.id, TREATABLE); narr(d, `处理得干净利落。${c.name}的呼吸重新平稳下来。`) },
          partial: (d) => { const first = condsOf(getChar(d, c.id)!).find((x) => TREATABLE.includes(x.id)); if (first) removeCond(d, c.id, first.id); narr(d, '勉强处理好了最要紧的部分。') },
          miss: (d) => narr(d, '绷带、药粉、颤抖的手——情况没有好转，黑暗里的回声却更近了。'),
        },
      })
    }
  }
  return list
}

export function findAction(s: GameState, id: string): ActionDef | undefined {
  return availableActions(s).find((a) => a.id === id)
}

export interface RollCalc {
  stat: Stat
  statVal: number
  spec: string | null
  situ: number
  situLabel: string
  total: number
}

export function calcRoll(s: GameState, a: ActionDef, actor: Character, boost: Boost, statOverride?: Stat): RollCalc {
  const r = a.roll!
  const stat = statOverride ?? r.stat
  const statVal = actor.stats[stat]
  const spec = actor.specialties.find((x) => r.specialties.includes(x)) ?? null
  const cm = condStatMod(actor, stat)
  const auto = (r.mod ? r.mod(s) : 0) + cm
  let b = 0
  const labels: string[] = []
  if (auto - cm) labels.push(r.modLabel ?? '情境')
  if (cm) labels.push(condLabel(actor, stat))
  if (boost.kind === 'item') { b = 1; labels.push(`使用${boost.item}`) }
  if (boost.kind === 'help') { b = 1; labels.push(`${getChar(s, boost.id)?.name}协助`) }
  if (boost.kind === 'joan') { b = 1; labels.push('乔安协助') }
  const situ = Math.max(-1, Math.min(1, auto + b))
  const total = Math.max(-2, Math.min(3, statVal + (spec ? 1 : 0) + situ))
  return { stat, statVal, spec, situ, situLabel: labels.join('、'), total }
}

export function tierOf(sum: number): Tier {
  return sum >= 10 ? 'hit' : sum >= 7 ? 'partial' : 'miss'
}

export const TIER_LABEL: Record<Tier, string> = { hit: '完全成功', partial: '成功，但有代价', miss: '事情变复杂了' }

export type GameAction =
  | { type: 'perform'; id: string }
  | { type: 'roll'; id: string; actorId: string; boost: Boost; dice: [number, number]; mod: number }
  | { type: 'spendReroll'; charId: string }
  | { type: 'cost'; choice: CostId | 'soften' }
  | { type: 'overflow'; option: 'out' | 'item' | 'apart' | 'status' }
  | { type: 'memory'; charId: string; text: string }
  | { type: 'bells'; success: boolean; mistakes: number }
  | { type: 'volunteer'; who: string; text: string }
  | { type: 'deliver'; variant: 'oversight' | 'split' | 'hide' }
  | { type: 'free'; text: string; actorId: string; stat: Stat; dice: [number, number]; mod: number }
  | { type: 'ai'; actorText?: string; actorName?: string; narration: string; speaker?: string; effects?: AiEffects; roll?: { actorId: string; stat: Stat; dice: [number, number]; mod: number }; thenRoll?: RollReq }
  | { type: 'customEnding'; plan: string; paragraphs: string[] }
  | { type: 'takeaways'; takeaways: Record<string, string> }
  | { type: 'replace'; state: GameState }
  | { type: 'dismissQueue' }
  | { type: 'rollStart'; kind: RollKind; id?: string; actorId: string; boost: Boost; stat?: Stat; specOn?: boolean }
  | { type: 'rollReroll' }
  | { type: 'rollCommit'; ai?: { narration: string; speaker?: string; effects?: AiEffects }; paragraphs?: string[] }
  | { type: 'rollReq'; req: RollReq | null }
  | { type: 'rollReqCancel' }
  | { type: 'pass' }
  | { type: 'thinking'; text: string | null }

export interface AiNarration { narration: string; speaker?: string; effects?: AiEffects }

export interface AiEffects {
  pressure?: number
  stress?: { charId: string; delta: number }[]
  advantage?: { charId: string; delta: number }[]
  clues?: string[]
  loseItem?: string[]
  gainItem?: { charId: string; item: string }[]
  moveTo?: string
  npc?: { id: string; attitude?: string; where?: string; status?: string }[]
  flags?: string[]
  conds?: { charId: string; id: string; remove?: boolean }[]
  ending?: string
}

const AI_FLAG_WHITELIST = ['know_B', 'know_C', 'know_D', 'know_E', 'know_F', 'route_G', 'beastDone', 'ningPersuaded', 'ningDecided', 'joanJoined', 'evelynWith', 'xiaokui', 'laowen', 'rescueDone', 'sluiceReady', 'bellsSolved']

const BLOCKING: GameAction['type'][] = ['perform', 'roll', 'free', 'rollStart', 'pass', 'customEnding']

export function reduce(state: GameState, action: GameAction): GameState {
  if (action.type === 'replace') return action.state
  return produce(state, (d) => {
    d.turn += 1
    step(d, action)
    if (action.type !== 'thinking') d.thinking = null
    maybeFinish(d)
    settleTurn(d)
  })
}

function resolveActionRoll(d: GameState, id: string, actorId: string, boost: Boost, dice: [number, number], mod: number) {
  const a = findAction(d, id)
  const actor = getChar(d, actorId)
  if (!a || !a.roll || !actor) return
  const sum = dice[0] + dice[1] + mod
  const tier = tierOf(sum)
  log(d, 'player', a.label, actor.name)
  d.seq += 1
  d.log.push({ id: d.seq, kind: 'roll', text: `${actor.name} · ${STAT_NAMES[a.roll.stat]}检定`, dice, total: sum, tier })
  if (!a.repeatable) d.used.push(a.id)
  const helperId = boost.kind === 'help' ? boost.id : undefined
  if (boost.kind === 'item') actor.spentItems.push(boost.item)
  if (boost.kind === 'joan') d.flags.joanHelpedAt = d.location
  if (helperId) {
    const h = getChar(d, helperId)
    if (h && h.helpedAt !== d.location) {
      h.helpedAt = d.location
      gainAdv(d, h.id, '帮助他人')
    }
  }
  const ctx = { tier, actor, actorId: actor.id, helperId }
  if (a.id.startsWith('cr_')) crisisOutcome(d, tier, a.id)
  else a.outcomes?.[tier](d, ctx)
  afterRoll(d, tier, actor.id, a.id)
  queueCosts(d, a, tier, actor, helperId)
  d.turnSpent = true
}

function resolveFree(d: GameState, text: string, actorId: string, stat: Stat, dice: [number, number], mod: number) {
  const actor = getChar(d, actorId)
  if (!actor) return
  const sum = dice[0] + dice[1] + mod
  const tier = tierOf(sum)
  log(d, 'player', text, actor.name)
  d.seq += 1
  d.log.push({ id: d.seq, kind: 'roll', text: `${actor.name} · ${STAT_NAMES[stat]}检定（自由行动）`, dice, total: sum, tier })
  freeOutcome(d, tier, actor)
  afterRoll(d, tier, actor.id, 'free')
  d.turnSpent = true
}

function afterRoll(d: GameState, tier: Tier, actorId: string, actionId: string) {
  if (tier === 'miss') missHazard(d, actorId, actionId)
  if (tier === 'hit' && d.turns) addCond(d, actorId, 'focus', '抢到了节奏')
}

function validBoost(d: GameState, spec: RollSpec, actor: Character, stat: Stat, b: Boost): Boost {
  if (b.kind === 'item' && (spec.items ?? []).includes(b.item) && actor.items.includes(b.item) && !actor.spentItems.includes(b.item)) return b
  if (b.kind === 'help' && spec.allowHelp !== false) {
    const h = getChar(d, b.id)
    if (h && h.id !== actor.id && canAct(h)) return b
  }
  if (b.kind === 'joan' && d.flags.joanJoined && d.flags.joanHelpedAt !== d.location && stat !== 'str') return b
  return { kind: 'none' }
}

function step(d: GameState, action: GameAction) {
  if (d.rolling && action.type !== 'rollReroll' && action.type !== 'rollCommit' && action.type !== 'thinking') return
  if (BLOCKING.includes(action.type) && (d.queue.length > 0 || d.phase !== 'play')) return
  if (d.rollReq && (action.type === 'perform' || action.type === 'roll' || action.type === 'pass')) return
    switch (action.type) {
      case 'perform': {
        const a = findAction(d, action.id)
        if (!a) return
        if (a.locked?.(d) || a.roll) return
        d.turnSpent = true
        if (action.id === 'rest_short') return restShort(d)
        if (action.id === 'rest_long') return restLong(d)
        if (!a.repeatable && !a.id.startsWith('go_')) d.used.push(a.id)
        log(d, 'player', a.label, activeChar(d)?.name)
        a.run?.(d, {})
        if (a.to) enter(d, a.to)
        break
      }
      case 'roll': {
        resolveActionRoll(d, action.id, action.actorId, action.boost, action.dice, action.mod)
        break
      }
      case 'rollStart': {
        const actor = getChar(d, action.actorId)
        if (!actor || !canAct(actor)) return
        if (d.turns && d.turns.activeId !== actor.id) return
        let spec: RollSpec
        let title: string
        let text: string | undefined
        let kind: RollKind
        if (action.kind === 'action') {
          if (d.rollReq) return
          const a = findAction(d, action.id ?? '')
          if (!a?.roll || a.locked?.(d)) return
          spec = a.roll
          title = a.label
          kind = 'action'
        } else {
          const rq = d.rollReq
          if (!rq) return
          if (rq.actorId && d.turns && rq.actorId !== actor.id) return
          const stat = rq.statChoosable && action.stat && STAT_NAMES[action.stat] ? action.stat : rq.stat
          spec = { stat, specialties: [], risk: rq.risk }
          title = rq.title
          text = rq.text
          kind = rq.kind
        }
        const boost = validBoost(d, spec, actor, spec.stat, action.boost)
        const pseudo: ActionDef = { id: action.id ?? 'x', label: title, group: 'act', roll: spec }
        const calc = calcRoll(d, pseudo, actor, boost, spec.stat)
        const extra = kind !== 'action' && action.specOn && !calc.spec ? 1 : 0
        const mod = Math.max(-2, Math.min(3, calc.total + extra))
        d.seq += 1
        d.rolling = {
          kind, id: action.kind === 'action' ? action.id : undefined, title, text, risk: spec.risk,
          actorId: actor.id, stat: spec.stat, boost, mod, dice: [d6(), d6()], rerolled: false, nonce: d.seq,
        }
        d.rollReq = null
        break
      }
      case 'rollReroll': {
        const r = d.rolling
        const c = getChar(d, r?.actorId)
        if (!r || !c || r.rerolled || c.advantage <= 0) return
        if (tierOf(r.dice[0] + r.dice[1] + r.mod) === 'hit') return
        c.advantage -= 1
        const idx = r.dice[0] <= r.dice[1] ? 0 : 1
        r.dice[idx] = d6()
        r.rerolled = true
        d.seq += 1
        r.nonce = d.seq
        log(d, 'event', `${c.name} 花费 1 点优势，重掷一颗骰子`)
        break
      }
      case 'rollCommit': {
        const r = d.rolling
        if (!r) return
        d.rolling = null
        if (r.kind === 'action') resolveActionRoll(d, r.id ?? '', r.actorId, r.boost, r.dice, r.mod)
        else if (r.kind === 'free' || (r.kind === 'ai' && !action.ai)) resolveFree(d, r.text ?? r.title, r.actorId, r.stat, r.dice, r.mod)
        else if (r.kind === 'ai' && action.ai) {
          const actor = getChar(d, r.actorId)
          const sum = r.dice[0] + r.dice[1] + r.mod
          d.seq += 1
          d.log.push({ id: d.seq, kind: 'roll', text: `${actor?.name ?? ''} · ${STAT_NAMES[r.stat]}检定`, dice: r.dice, total: sum, tier: tierOf(sum) })
          aiNarrate(d, action.ai)
          afterRoll(d, tierOf(sum), r.actorId, 'free')
          d.turnSpent = true
        } else if (r.kind === 'final') {
          const tier = tierOf(r.dice[0] + r.dice[1] + r.mod)
          const plan = r.text ?? r.title
          const paragraphs = action.paragraphs?.length ? action.paragraphs : offlineCustomEnding(d, plan, tier)
          const actor = getChar(d, r.actorId)
          d.seq += 1
          d.log.push({ id: d.seq, kind: 'roll', text: `${actor?.name ?? ''} · 终局方案`, dice: r.dice, total: r.dice[0] + r.dice[1] + r.mod, tier })
          const e = buildEnding(d, 'custom', { custom: paragraphs })
          d.ending = { id: 'custom', title: e.title, paragraphs: e.paragraphs, takeaways: {}, customPlan: plan }
          d.phase = 'ending'
        }
        break
      }
      case 'rollReq': {
        d.rollReq = action.req
        break
      }
      case 'rollReqCancel': {
        if (d.rollReq?.cancellable) d.rollReq = null
        break
      }
      case 'pass': {
        const c = activeChar(d)
        if (!c) return
        log(d, 'event', `${c.name} 选择观望，结束了回合`)
        d.turnSpent = true
        break
      }
      case 'thinking': {
        d.thinking = action.text
        break
      }
      case 'spendReroll': {
        const c = getChar(d, action.charId)
        if (c && c.advantage > 0) {
          c.advantage -= 1
          log(d, 'event', `${c.name} 花费 1 点优势，重掷一颗骰子`)
        }
        break
      }
      case 'cost': {
        const p = d.queue[0]
        if (!p || p.type !== 'cost') return
        d.queue.shift()
        if (action.choice === 'soften') {
          const c = getChar(d, p.actorId)
          if (c && c.advantage > 0) {
            c.advantage -= 1
            log(d, 'event', `${c.name} 花费 1 点优势：代价降为轻微`)
            narr(d, '你们咬紧牙关，把损失压到了最小——只是虚惊一场，外加一点擦伤。')
          }
        } else {
          applyCost(d, action.choice, p.actorId)
        }
        break
      }
      case 'overflow': {
        const p = d.queue[0]
        if (!p || p.type !== 'overflow') return
        d.queue.shift()
        const c = getChar(d, p.charId)
        if (!c) return
        if (action.option === 'out') { c.out = true; narr(d, `${c.name}踉跄着退到岩壁边，暂时退出了眼前的危险。`) }
        if (action.option === 'apart') { c.out = true; narr(d, `回声扭曲了通道，${c.name}与队伍短暂地走散了——直到下一个地点才重新会合。`) }
        if (action.option === 'item') loseItem(d, c.id)
        if (action.option === 'status') {
          addCond(d, c.id, OVERFLOW_CONDS[Math.floor(Math.random() * OVERFLOW_CONDS.length)], '承压溢出')
        }
        break
      }
      case 'memory': {
        const p = d.queue[0]
        if (p?.type === 'memory') d.queue.shift()
        const c = getChar(d, action.charId)
        if (!c) return
        d.memory[c.id] = action.text
        log(d, 'player', action.text, c.name)
        echo(d, `倒影一字一字地重复：“${action.text}”`)
        narr(d, '然后它侧过身，指向晶壁深处的一道折光——那里有一条向下的路，通往一处七道门的门廊。')
        npc(d, '倒影', '记住它。在下面，会有东西想把它拿走。')
        setFlag(d, 'know_F')
        break
      }
      case 'bells': {
        const p = d.queue[0]
        if (p?.type !== 'bells') return
        d.queue.shift()
        if (p.mode === 'hall') {
          if (action.success) {
            setFlag(d, 'bellsSolved')
            narr(d, '六口钟依次鸣响。第七拍到来时，你们一起屏住了呼吸——整座礼堂的水面忽然静止，像一面镜子。那一刻，你们听见了第七音：它不是声音，是声音的缺席。')
            addClue(d, 'c_score')
            const m = d.party.find((c) => c.specialties.includes('演奏者')) ?? d.party[0]
            gainAdv(d, m.id, '解开钟序')
          } else {
            echo(d, '钟声乱成一团，水面上浮起无数张嘴，同时说着“再来一次”。')
            addPressure(d, 1, '钟声紊乱')
          }
        } else {
          if (action.success) {
            d.flags.endingTier = action.mistakes === 0 ? 'hit' : 'partial'
            d.flags.pendingEnding = 'seal'
          } else {
            echo(d, '钟序断了。井壁上的光城剧烈闪烁，像在嘲笑——不，它不会嘲笑。它只是在等。')
            addPressure(d, 1, '封存失败')
            sys(d, '你们可以再试一次，或者选择其他方案。')
          }
        }
        break
      }
      case 'volunteer': {
        const p = d.queue[0]
        if (p?.type === 'volunteer') d.queue.shift()
        d.flags.volunteer = action.who
        d.flags.volunteerMemory = action.text
        const c = getChar(d, action.who)
        const name = action.who === 'ningrui' ? '宁芮' : action.who === 'evelyn' ? '伊芙琳' : c?.name ?? '某人'
        log(d, 'player', `${name}愿意交出一段记忆：“${action.text}”`)
        if (c) c.statuses.push('交出了一段记忆')
        echo(d, '井安静下来，像是第一次被允许，而不是自己去拿。')
        sys(d, '现在进行校准：以自愿记忆校准第七音。')
        break
      }
      case 'deliver': {
        const p = d.queue[0]
        if (p?.type === 'deliver') d.queue.shift()
        d.flags.deliverVariant = action.variant
        d.flags.pendingEnding = 'deliver'
        break
      }
      case 'free': {
        resolveFree(d, action.text, action.actorId, action.stat, action.dice, action.mod)
        break
      }
      case 'ai': {
        if (d.queue.length || d.phase !== 'play') return
        if (action.actorText) log(d, 'player', action.actorText, action.actorName)
        if (action.roll) {
          const actor = getChar(d, action.roll.actorId)
          const sum = action.roll.dice[0] + action.roll.dice[1] + action.roll.mod
          d.seq += 1
          d.log.push({ id: d.seq, kind: 'roll', text: `${actor?.name ?? ''} · ${STAT_NAMES[action.roll.stat]}检定`, dice: action.roll.dice, total: sum, tier: tierOf(sum) })
        }
        aiNarrate(d, action)
        if (action.thenRoll) d.rollReq = action.thenRoll
        else d.turnSpent = true
        break
      }
      case 'customEnding': {
        const e = buildEnding(d, 'custom', { custom: action.paragraphs })
        d.ending = { id: 'custom', title: e.title, paragraphs: e.paragraphs, takeaways: {}, customPlan: action.plan }
        d.phase = 'ending'
        break
      }
      case 'takeaways': {
        if (d.ending) d.ending.takeaways = action.takeaways
        break
      }
      case 'dismissQueue': {
        d.queue.shift()
        break
      }
    }
}

function aiNarrate(d: GameState, a: AiNarration) {
  for (const para of a.narration.split(/\n+/).map((x) => x.trim()).filter(Boolean)) {
    log(d, 'ai', para.slice(0, 600), a.speaker)
  }
  if (a.effects) applyAiEffects(d, a.effects)
}

function npc(d: GameState, speaker: string, text: string) {
  log(d, 'npc', text, speaker)
}

function queueCosts(d: GameState, a: ActionDef, tier: Tier, actor: Character, helperId?: string) {
  const r = a.roll!
  if (tier === 'partial') {
    const opts: CostId[] = r.partialCosts ?? r.missCosts ?? ['stress', 'pressure', 'item']
    const list = helperId && !opts.includes('helper') ? [...opts, 'helper' as CostId] : opts
    d.queue.push({ type: 'cost', actorId: actor.id, options: list, tier, canSoften: actor.advantage > 0, reason: '成功，但必须付出代价' })
  }
  if (tier === 'miss') {
    if (helperId) addStress(d, helperId)
    if (r.missCosts) {
      d.queue.push({ type: 'cost', actorId: actor.id, options: r.missCosts, tier, canSoften: false, reason: '局势变得复杂' })
      if (d.pressure >= 4) {
        d.queue.push({ type: 'cost', actorId: actor.id, options: ['stress', 'item', 'beast'], tier, canSoften: false, reason: '井在主动回应——额外的环境代价' })
      }
    }
  }
}

const FREE_CLUES: Record<LocId, string[]> = {
  gate: [],
  A: ['a_badge', 'a_second'],
  B: ['b_logbook', 'b_note'],
  C: ['c_score', 'c_sluice'],
  D: ['d_carving', 'd_evelyn'],
  E: ['e_note', 'e_letter', 'e_skeleton'],
  F: ['f_handprints', 'f_reliefs', 'f_ritual'],
  G: [],
}

function freeOutcome(d: GameState, tier: Tier, actor: Character) {
  const pool = FREE_CLUES[d.location].filter((c) => !d.clues.includes(c))
  if (tier === 'miss') {
    narr(d, '你们的尝试在黑暗里撞上了别的东西。回声把你们的动作原样学了一遍，然后朝错误的方向传了出去。')
    d.queue.push({ type: 'cost', actorId: actor.id, options: ['stress', 'pressure', 'item'], tier, canSoften: false, reason: '局势变得复杂' })
    return
  }
  if (pool.length) {
    const id = pool[0]
    narr(d, tier === 'hit' ? '你们的做法出乎意料地奏效了。在别人可能忽略的地方，你们发现了一样东西。' : '费了一番功夫，你们终于有所收获——但也付出了些什么。')
    if (id === 'b_note') setFlag(d, 'know_E')
    addClue(d, id)
    if (CLUES[id]?.fact === 'paths' && id === 'f_ritual') setFlag(d, 'route_G')
  } else if (tier === 'hit') {
    narr(d, '这里已经没有更多秘密了，但这次行动让你们重新找回了节奏。')
    gainAdv(d, actor.id, '漂亮的自创方案')
  } else {
    narr(d, '你们没有找到新东西，但至少确认了自己的判断。')
  }
  if (tier === 'partial') {
    d.queue.push({ type: 'cost', actorId: actor.id, options: ['stress', 'pressure', 'item'], tier, canSoften: actor.advantage > 0, reason: '成功，但必须付出代价' })
  }
}

function applyAiEffects(d: GameState, e: AiEffects) {
  if (typeof e.pressure === 'number' && e.pressure !== 0) addPressure(d, Math.max(-1, Math.min(1, Math.round(e.pressure))), '主持人裁定')
  for (const s of e.stress ?? []) {
    if (s.delta > 0) addStress(d, s.charId, Math.min(1, s.delta))
    else if (s.delta < 0) { const c = getChar(d, s.charId); if (c) c.stress = Math.max(0, c.stress - 1) }
  }
  for (const a of e.advantage ?? []) {
    if (a.delta > 0) gainAdv(d, a.charId, '主持人奖励')
  }
  for (const c of e.clues ?? []) if (CLUES[c]) addClue(d, c)
  for (const cid of e.loseItem ?? []) loseItem(d, cid)
  for (const g of e.gainItem ?? []) {
    const c = getChar(d, g.charId)
    if (c && g.item && g.item.length < 20) { c.items.push(g.item); log(d, 'event', `${c.name} 获得「${g.item}」`) }
  }
  for (const n of e.npc ?? []) {
    const k = n.id as keyof GameState['npcs']
    if (d.npcs[k]) {
      d.npcs[k].met = true
      if (n.attitude) d.npcs[k].attitude = n.attitude.slice(0, 16)
      if (n.where) d.npcs[k].where = n.where.slice(0, 16)
      if (n.status) d.npcs[k].status = n.status.slice(0, 20)
    }
  }
  for (const fl of e.flags ?? []) if (AI_FLAG_WHITELIST.includes(fl)) setFlag(d, fl)
  for (const c of (e.conds ?? []).slice(0, 4)) {
    if (!getChar(d, c.charId) || !(AI_CONDS as string[]).includes(c.id)) continue
    if (c.remove) removeCond(d, c.charId, c.id as CondId)
    else addCond(d, c.charId, c.id as CondId, '主持人裁定')
  }
  if (e.moveTo && (MOVE_ORDER as string[]).includes(e.moveTo) && e.moveTo !== d.location && routeKnown(d, e.moveTo as LocId)) {
    enter(d, e.moveTo as LocId)
  }
}

function restShort(d: GameState) {
  d.flags[`rest_${d.location}`] = true
  log(d, 'player', '短暂休息，互相照料')
  narr(d, '你们背靠岩壁坐下，分享最后一点热水，互相检查伤口。没有人说话，但呼吸慢慢平稳下来。')
  d.party.forEach((c) => { if (c.stress > 0) c.stress -= 1 })
  d.party.forEach((c) => clearBadConds(d, c.id, ['poison', 'bleed', 'stun']))
  const medic = d.party.find((c) => c.specialties.includes('急救者') && !c.out)
  if (medic) {
    const worst = [...d.party].sort((a, b) => b.stress - a.stress)[0]
    if (worst && worst.stress > 0) {
      worst.stress -= 1
      narr(d, `${medic.name}多花了些时间照料${worst.name === medic.name ? '自己' : worst.name}。`)
    }
  }
  sys(d, '承压减轻。')
}

function restLong(d: GameState) {
  d.flags[`camp_${d.location}`] = true
  d.flags[`rest_${d.location}`] = true
  log(d, 'player', '扎营长时间休整')
  narr(d, '你们点起一小堆火，轮流守夜。睡梦里，有人听见自己的声音在很远的地方说话。')
  d.party.forEach((c) => { c.stress = 0; clearBadConds(d, c.id) })
  addPressure(d, 1, '长时间休息')
}

function maybeFinish(d: GameState) {
  const id = d.flags.pendingEnding as EndingId | undefined
  if (!id || d.queue.length > 0 || d.phase === 'ending') return
  const e = buildEnding(d, id, { variant: d.flags.deliverVariant as string | undefined })
  d.ending = { id, title: e.title, paragraphs: e.paragraphs, takeaways: {} }
  d.phase = 'ending'
}

export function sceneOf(s: GameState) {
  return SCENES[s.location]
}
