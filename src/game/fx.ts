import type { Character, CostId, GameState, LogKind, NpcId } from './types.js'
import { CLUES } from './data/clues.js'

export const PRESSURE_EVENTS: Record<number, string> = {
  1: '远处传来彼此熟悉、却还没有人说过的话。',
  2: '回声开始成形。岩壁上掠过你们自己的影子副本，比你们慢半拍。',
  3: '通道改变了。你们身后的岔口多出一条从未见过的路，而刚才说过的某句话，忽然想不起来了。',
  4: '井开始主动回应你们。每一次脚步，都有另一串脚步应和。危险场面中的失败，将带来额外代价。',
  5: '深处传来沉重的开门声——核心之门开启了。所有听见它的人都在被吸引过去。',
  6: '井进入失控读写。所有声音同时响起。没有时间再拖延了。',
}

export function log(d: GameState, kind: LogKind, text: string, speaker?: string) {
  d.seq += 1
  d.log.push({ id: d.seq, kind, text, speaker })
}

export const narr = (d: GameState, text: string) => log(d, 'narr', text)
export const npc = (d: GameState, speaker: string, text: string) => log(d, 'npc', text, speaker)
export const sys = (d: GameState, text: string) => log(d, 'sys', text)
export const echo = (d: GameState, text: string) => log(d, 'echo', text)

export function toast(d: GameState, text: string) {
  d.seq += 1
  d.lastToast = { id: d.seq, text }
}

export function addClue(d: GameState, id: string) {
  if (d.clues.includes(id)) return false
  const c = CLUES[id]
  if (!c) return false
  d.clues.push(id)
  log(d, 'clue', id)
  toast(d, `新线索：${c.title}`)
  return true
}

export function hasClue(s: GameState, id: string) {
  return s.clues.includes(id)
}

export function flag(s: GameState, k: string) {
  return s.flags[k]
}

export function setFlag(d: GameState, k: string, v: string | number | boolean = true) {
  d.flags[k] = v
}

export function addPressure(d: GameState, n: number, reason?: string) {
  const before = d.pressure
  const after = Math.max(0, Math.min(6, before + n))
  if (after === before) return
  d.pressure = after
  if (after > before) {
    log(d, 'event', `回声压力 ${before} → ${after}${reason ? `（${reason}）` : ''}`)
    for (let p = before + 1; p <= after; p++) {
      if (PRESSURE_EVENTS[p]) echo(d, PRESSURE_EVENTS[p])
      onPressureThreshold(d, p)
    }
  } else {
    log(d, 'event', `回声压力 ${before} → ${after}${reason ? `（${reason}）` : ''}`)
  }
}

function onPressureThreshold(d: GameState, p: number) {
  if (p === 2) {
    const n = d.npcs.joan.met ? '乔安' : d.npcs.luduo.met ? '陆铎' : null
    if (n) narr(d, `${n}忽然停下，侧耳倾听——像是听见了某个亲人在叫自己的名字。过了好几息，才回过神来。`)
  }
  if (p === 3 && !d.safety.softMemory) {
    const candidates = d.log.filter((e) => (e.kind === 'npc' || e.kind === 'narr') && !e.forgotten).slice(-6, -1)
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    if (target) target.forgotten = true
  }
  if (p === 5) {
    setFlag(d, 'coreOpen')
    if (d.npcs.luduo.met && d.npcs.luduo.where !== '核心') {
      d.npcs.luduo.where = '核心'
      setFlag(d, 'luduoAtCore')
      narr(d, '你们隐约听见陆铎的向导在远处大喊——公会的人正冒险冲向核心。')
    }
  }
  if (p === 6) {
    setFlag(d, 'finale')
  }
}

export function getChar(d: GameState, id?: string): Character | undefined {
  return d.party.find((c) => c.id === id)
}

export function addStress(d: GameState, charId: string | undefined, n = 1) {
  const c = getChar(d, charId)
  if (!c) return
  for (let i = 0; i < n; i++) {
    if (c.stress >= 3) {
      d.queue.push({ type: 'overflow', charId: c.id })
      return
    }
    c.stress += 1
    log(d, 'event', `${c.name} 承压 ${c.stress}/3`)
  }
}

export function healStress(d: GameState, charId: string, n = 1) {
  const c = getChar(d, charId)
  if (!c || c.stress === 0) return
  c.stress = Math.max(0, c.stress - n)
}

export function gainAdv(d: GameState, charId: string | undefined, why: string) {
  const c = getChar(d, charId)
  if (!c || c.advantage >= 2) return
  c.advantage += 1
  log(d, 'event', `${c.name} 获得 1 点优势（${why}）`)
}

export function loseItem(d: GameState, charId: string | undefined) {
  const c = getChar(d, charId) ?? d.party[0]
  const pool = c.items.filter((i) => !i.startsWith('静音晶体') && i !== '晶核')
  if (pool.length === 0) {
    addStress(d, c.id)
    return
  }
  const item = pool[Math.floor(Math.random() * pool.length)]
  c.items = c.items.filter((i) => i !== item)
  log(d, 'event', `${c.name} 失去了「${item}」`)
}

export function giveItem(d: GameState, charId: string | undefined, item: string) {
  const c = getChar(d, charId) ?? d.party[0]
  c.items.push(item)
  log(d, 'event', `${c.name} 获得「${item}」`)
}

export function meet(d: GameState, id: NpcId, patch: Partial<GameState['npcs'][NpcId]> = {}) {
  d.npcs[id] = { ...d.npcs[id], met: true, ...patch }
}

export function startCrisis(d: GameState, name: string, desc: string, need = 3) {
  const adj = d.party.length >= 5 ? 1 : 0
  d.crisis = { name, desc, progress: 0, need: need + adj }
  log(d, 'event', `危机：${name}`)
}

export function costLabel(c: CostId): string {
  switch (c) {
    case 'stress': return '行动者承压 +1'
    case 'pressure': return '回声压力 +1'
    case 'item': return '失去一件小装备'
    case 'beast': return '吸引一只回声仿兽'
    case 'helper': return '协助者承压 +1'
  }
}

export function applyCost(d: GameState, cost: CostId, actorId: string, helperId?: string) {
  switch (cost) {
    case 'stress': addStress(d, actorId); break
    case 'pressure': addPressure(d, 1, '代价'); break
    case 'item': loseItem(d, actorId); break
    case 'beast':
      if (!d.crisis) {
        echo(d, '头顶的通风道里传来一阵翅膀拍打声——有什么东西学着你们的声音，正在靠近。')
        startCrisis(d, '回声仿兽', '由蝙蝠、矿尘和回声凝成的兽影，只会重复听过的声音。它想靠近声音源，并不想杀死你们。')
      } else {
        addPressure(d, 1, '仿兽躁动')
      }
      break
    case 'helper': addStress(d, helperId ?? actorId); break
  }
}
