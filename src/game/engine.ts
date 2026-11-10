import { produce } from 'immer'
import type { ActionDef, Character, CostId, EndingId, GameState, LocId, Stat, Tier } from './types'
import { STAT_NAMES } from './types'
import { CRISIS_ACTIONS, LOC_NAMES, LUDUO_ACTIONS, SCENES, crisisOutcome, luduoArrives, routeKnown } from './data/scenes'
import {
  addClue, addPressure, addStress, applyCost, echo, gainAdv, getChar, log, loseItem, narr, setFlag, sys,
} from './fx'
import { buildEnding } from './endings'
import { CLUES } from './data/clues'

export const SAVE_VERSION = 3

export function newGame(party: Character[], safety: GameState['safety']): GameState {
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
  })
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

export function findAction(s: GameState, id: string): ActionDef | undefined {
  return availableActions(s).find((a) => a.id === id)
}

export type Boost = { kind: 'none' } | { kind: 'item'; item: string } | { kind: 'help'; id: string } | { kind: 'joan' }

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
  const auto = r.mod ? r.mod(s) : 0
  let b = 0
  const labels: string[] = []
  if (auto) labels.push(r.modLabel ?? '情境')
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
  | { type: 'ai'; actorText?: string; narration: string; speaker?: string; effects?: AiEffects; roll?: { actorId: string; stat: Stat; dice: [number, number]; mod: number } }
  | { type: 'customEnding'; plan: string; paragraphs: string[] }
  | { type: 'takeaways'; takeaways: Record<string, string> }
  | { type: 'replace'; state: GameState }
  | { type: 'dismissQueue' }

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
  ending?: string
}

const AI_FLAG_WHITELIST = ['know_B', 'know_C', 'know_D', 'know_E', 'know_F', 'route_G', 'beastDone', 'ningPersuaded', 'ningDecided', 'joanJoined', 'evelynWith', 'xiaokui', 'laowen', 'rescueDone', 'sluiceReady', 'bellsSolved']

export function reduce(state: GameState, action: GameAction): GameState {
  if (action.type === 'replace') return action.state
  return produce(state, (d) => {
    d.turn += 1
    switch (action.type) {
      case 'perform': {
        const a = findAction(d, action.id)
        if (!a) return
        if (a.locked?.(d)) return
        if (action.id === 'rest_short') return restShort(d)
        if (action.id === 'rest_long') return restLong(d)
        if (!a.repeatable && !a.id.startsWith('go_')) d.used.push(a.id)
        log(d, 'player', a.label)
        a.run?.(d, {})
        if (a.to) enter(d, a.to)
        break
      }
      case 'roll': {
        const a = findAction(d, action.id)
        const actor = getChar(d, action.actorId)
        if (!a || !a.roll || !actor) return
        const sum = action.dice[0] + action.dice[1] + action.mod
        const tier = tierOf(sum)
        log(d, 'player', a.label, actor.name)
        d.seq += 1
        d.log.push({ id: d.seq, kind: 'roll', text: `${actor.name} · ${STAT_NAMES[a.roll.stat]}检定`, dice: action.dice, total: sum, tier })
        if (!a.repeatable) d.used.push(a.id)
        const helperId = action.boost.kind === 'help' ? action.boost.id : undefined
        if (action.boost.kind === 'item') actor.spentItems.push(action.boost.item)
        if (action.boost.kind === 'joan') d.flags.joanHelpedAt = d.location
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
        queueCosts(d, a, tier, actor, helperId)
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
          const st = ['颤抖', '耳鸣', '迷失方向', '短暂失声'][Math.floor(Math.random() * 4)]
          c.statuses.push(st)
          log(d, 'event', `${c.name} 获得短期状态：${st}`)
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
        const actor = getChar(d, action.actorId)
        if (!actor) return
        const sum = action.dice[0] + action.dice[1] + action.mod
        const tier = tierOf(sum)
        log(d, 'player', action.text, actor.name)
        d.seq += 1
        d.log.push({ id: d.seq, kind: 'roll', text: `${actor.name} · ${STAT_NAMES[action.stat]}检定（自由行动）`, dice: action.dice, total: sum, tier })
        freeOutcome(d, tier, actor)
        break
      }
      case 'ai': {
        if (action.actorText) log(d, 'player', action.actorText)
        if (action.roll) {
          const actor = getChar(d, action.roll.actorId)
          const sum = action.roll.dice[0] + action.roll.dice[1] + action.roll.mod
          d.seq += 1
          d.log.push({ id: d.seq, kind: 'roll', text: `${actor?.name ?? ''} · ${STAT_NAMES[action.roll.stat]}检定`, dice: action.roll.dice, total: sum, tier: tierOf(sum) })
        }
        for (const para of action.narration.split(/\n+/).map((x) => x.trim()).filter(Boolean)) {
          log(d, 'ai', para, action.speaker)
        }
        if (action.effects) applyAiEffects(d, action.effects)
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
    maybeFinish(d)
  })
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
  if (e.moveTo && (MOVE_ORDER as string[]).includes(e.moveTo) && e.moveTo !== d.location && routeKnown(d, e.moveTo as LocId)) {
    enter(d, e.moveTo as LocId)
  }
}

function restShort(d: GameState) {
  d.flags[`rest_${d.location}`] = true
  log(d, 'player', '短暂休息，互相照料')
  narr(d, '你们背靠岩壁坐下，分享最后一点热水，互相检查伤口。没有人说话，但呼吸慢慢平稳下来。')
  d.party.forEach((c) => { if (c.stress > 0) c.stress -= 1 })
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
  d.party.forEach((c) => { c.stress = 0 })
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
