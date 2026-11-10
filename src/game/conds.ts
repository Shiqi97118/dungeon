import type { Character, CondId, GameState, InitEntry, Stat } from './types.js'
import { addStress, getChar, log, narr } from './fx.js'

export interface CondDef {
  name: string
  icon: string
  desc: string
  init: number
  rounds: number
  stat?: { stat: Stat; mod: number }
  skip?: boolean
  dot?: boolean
  good?: boolean
}

export const CONDS: Record<CondId, CondDef> = {
  poison: { name: '中毒', icon: '☣', desc: '吸入了矿井瘴气。先攻 -2；每回合开始时有一半几率承压 +1。', init: -2, rounds: 3, dot: true },
  stun: { name: '昏迷', icon: '✕', desc: '失去意识。跳过回合，直到同伴唤醒或一轮过去。', init: 0, rounds: 1, skip: true },
  tinnitus: { name: '耳鸣', icon: '≈', desc: '尖啸还在脑子里回荡。先攻 -1，洞察检定 -1。', init: -1, rounds: 2, stat: { stat: 'ins', mod: -1 } },
  tremble: { name: '颤抖', icon: '∿', desc: '手脚不听使唤。先攻 -1，灵巧检定 -1。', init: -1, rounds: 2, stat: { stat: 'dex', mod: -1 } },
  lost: { name: '迷失方向', icon: '⟲', desc: '分不清哪一串脚步声是自己的。先攻 -3。', init: -3, rounds: 2 },
  mute: { name: '短暂失声', icon: '∅', desc: '回声夺走了嗓音。交涉检定 -1。', init: 0, rounds: 2, stat: { stat: 'soc', mod: -1 } },
  bleed: { name: '割伤', icon: '⟋', desc: '晶刺划开了皮肉。先攻 -1，强韧检定 -1。', init: -1, rounds: 2, stat: { stat: 'str', mod: -1 } },
  chill: { name: '失温', icon: '❄', desc: '浸透了冰冷的地下水。先攻 -2，灵巧检定 -1。', init: -2, rounds: 2, stat: { stat: 'dex', mod: -1 } },
  focus: { name: '专注', icon: '✦', desc: '刚刚的成功让你抢到了节奏。下一轮先攻 +2。', init: 2, rounds: 1, good: true },
}

export const condsOf = (c: Character) => c.conds ?? []

export function hasCond(c: Character, id: CondId) {
  return condsOf(c).some((x) => x.id === id)
}

export function canAct(c: Character) {
  return !c.out && !hasCond(c, 'stun')
}

export function addCond(d: GameState, charId: string, id: CondId, why?: string) {
  const c = getChar(d, charId)
  if (!c) return
  const def = CONDS[id]
  c.conds ??= []
  const cur = c.conds.find((x) => x.id === id)
  if (cur) cur.rounds = Math.max(cur.rounds, def.rounds)
  else c.conds.push({ id, rounds: def.rounds })
  log(d, 'event', `${c.name} ${def.good ? '进入' : '陷入'}状态：${def.icon} ${def.name}${why ? `（${why}）` : ''}`)
}

export function removeCond(d: GameState, charId: string, id: CondId, quiet = false) {
  const c = getChar(d, charId)
  if (!c || !hasCond(c, id)) return
  c.conds = condsOf(c).filter((x) => x.id !== id)
  if (!quiet) log(d, 'event', `${c.name} 的「${CONDS[id].name}」解除了`)
}

export function clearBadConds(d: GameState, charId: string, only?: CondId[]) {
  const c = getChar(d, charId)
  if (!c) return
  for (const x of condsOf(c)) {
    if (CONDS[x.id].good) continue
    if (only && !only.includes(x.id)) continue
    removeCond(d, charId, x.id)
  }
}

export function condStatMod(c: Character, stat: Stat) {
  return condsOf(c).reduce((n, x) => n + (CONDS[x.id].stat?.stat === stat ? CONDS[x.id].stat!.mod : 0), 0)
}

export function condLabel(c: Character, stat: Stat) {
  return condsOf(c).filter((x) => CONDS[x.id].stat?.stat === stat).map((x) => CONDS[x.id].name).join('、')
}

const d6 = () => 1 + Math.floor(Math.random() * 6)

export function initiativeOf(c: Character, die = d6()): InitEntry {
  const notes = [`灵巧 ${c.stats.dex >= 0 ? '+' : ''}${c.stats.dex}×2`, `1d6=${die}`]
  let total = c.stats.dex * 2 + die
  for (const x of condsOf(c)) {
    const v = CONDS[x.id].init
    if (v) { total += v; notes.push(`${CONDS[x.id].name} ${v > 0 ? '+' : ''}${v}`) }
  }
  if (c.stress >= 3) { total -= 1; notes.push('承压已满 -1') }
  return { id: c.id, total, die, notes }
}

export function rollInitiative(party: Character[]): InitEntry[] {
  const list = party.filter((c) => !c.out).map((c) => initiativeOf(c))
  const dex = (id: string) => party.find((c) => c.id === id)?.stats.dex ?? 0
  return list.sort((a, b) => b.total - a.total || dex(b.id) - dex(a.id) || b.die - a.die)
}

export function tickRound(d: GameState) {
  for (const c of d.party) {
    if (!c.conds?.length) continue
    const keep = []
    for (const x of c.conds) {
      const rounds = x.rounds - 1
      if (rounds > 0) keep.push({ ...x, rounds })
      else if (x.id === 'stun') narr(d, `${c.name}猛地吸了一口气，醒了过来。`)
      else log(d, 'event', `${c.name} 的「${CONDS[x.id].name}」消退了`)
    }
    c.conds = keep
  }
}

export function onTurnStart(d: GameState, c: Character) {
  if (hasCond(c, 'poison') && Math.random() < 0.5) {
    log(d, 'event', `☣ 瘴气在${c.name}的肺里发作`)
    addStress(d, c.id)
  }
}

const HAZARDS: Partial<Record<string, { id: CondId; why: string; p: number }>> = {
  A: { id: 'poison', why: '翻倒的灯油与霉尘', p: 0.35 },
  B: { id: 'poison', why: '宿舍里淤积的瘴气', p: 0.5 },
  C: { id: 'chill', why: '跌进冰冷的积水', p: 0.5 },
  D: { id: 'bleed', why: '晶刺划伤', p: 0.5 },
  E: { id: 'tremble', why: '坍塌的余震', p: 0.35 },
  F: { id: 'mute', why: '门廊吞掉了声音', p: 0.35 },
  G: { id: 'lost', why: '光城里倒转的方向', p: 0.5 },
}

export function missHazard(d: GameState, actorId: string, actionId: string) {
  if (actionId.startsWith('cr_')) {
    if (actionId === 'cr_fight' && Math.random() < 0.4) addCond(d, actorId, 'stun', '被仿兽撞倒在地')
    else if (Math.random() < 0.5) addCond(d, actorId, 'tinnitus', '仿兽的尖啸')
    return
  }
  const h = HAZARDS[d.location]
  if (h && Math.random() < h.p) addCond(d, actorId, h.id, h.why)
}

export const OVERFLOW_CONDS: CondId[] = ['tremble', 'tinnitus', 'lost', 'mute', 'stun']

export const AI_CONDS: CondId[] = ['poison', 'stun', 'tinnitus', 'tremble', 'lost', 'mute', 'bleed', 'chill', 'focus']
