export type Stat = 'str' | 'dex' | 'ins' | 'soc'

export const STAT_NAMES: Record<Stat, string> = {
  str: '强韧',
  dex: '灵巧',
  ins: '洞察',
  soc: '交涉',
}

export const STAT_ORDER: Stat[] = ['str', 'dex', 'ins', 'soc']

export type LocId = 'gate' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

export type NpcId = 'ningrui' | 'joan' | 'evelyn' | 'luduo'

export interface Character {
  id: string
  name: string
  title: string
  stats: Record<Stat, number>
  specialties: string[]
  items: string[]
  spentItems: string[]
  motive: string
  hook: string
  memento: string
  reason: string
  relation?: string
  stress: number
  advantage: number
  statuses: string[]
  out: boolean
  sigil: string
  hue: number
  helpedAt?: string
}

export type LogKind = 'read' | 'narr' | 'npc' | 'roll' | 'sys' | 'echo' | 'clue' | 'player' | 'event' | 'ai'

export interface LogEntry {
  id: number
  kind: LogKind
  text: string
  speaker?: string
  dice?: [number, number]
  total?: number
  tier?: Tier
  forgotten?: boolean
}

export type Tier = 'hit' | 'partial' | 'miss'

export type CostId = 'stress' | 'pressure' | 'item' | 'beast' | 'helper'

export interface Crisis {
  name: string
  progress: number
  need: number
  desc: string
}

export type Pending =
  | { type: 'cost'; actorId: string; options: CostId[]; tier: Tier; canSoften: boolean; reason: string }
  | { type: 'overflow'; charId: string }
  | { type: 'memory'; charId: string }
  | { type: 'bells'; mode: 'hall' | 'core' }
  | { type: 'volunteer' }
  | { type: 'deliver' }
  | { type: 'farewell' }

export interface NpcState {
  met: boolean
  where: string
  attitude: string
  status: string
}

export type EndingId = 'seal' | 'repair' | 'destroy' | 'deliver' | 'retreat' | 'custom'

export interface GameState {
  version: number
  phase: 'play' | 'ending'
  party: Character[]
  location: LocId
  pressure: number
  visited: LocId[]
  newVisitCount: number
  clues: string[]
  flags: Record<string, string | number | boolean>
  used: string[]
  npcs: Record<NpcId, NpcState>
  log: LogEntry[]
  queue: Pending[]
  crisis: Crisis | null
  memory: Record<string, string>
  safety: { softMemory: boolean; softTrapped: boolean }
  ending: { id: EndingId; title: string; paragraphs: string[]; takeaways: Record<string, string>; customPlan?: string } | null
  turn: number
  seq: number
  lastToast?: { id: number; text: string }
}

export interface RollSpec {
  stat: Stat
  specialties: string[]
  items?: string[]
  risk: string
  mod?: (s: GameState) => number
  modLabel?: string
  missCosts?: CostId[]
  partialCosts?: CostId[]
  allowHelp?: boolean
}

export interface ActionCtx {
  tier?: Tier
  actor?: Character
  actorId?: string
  helperId?: string
}

export type Fx = (d: GameState, ctx: ActionCtx) => void

export type ActionGroup = 'act' | 'talk' | 'move' | 'final'

export interface ActionDef {
  id: string
  label: string
  hint?: string
  group: ActionGroup
  when?: (s: GameState) => boolean
  repeatable?: boolean
  roll?: RollSpec
  run?: Fx
  outcomes?: { hit: Fx; partial: Fx; miss: Fx }
  locked?: (s: GameState) => string | null
  to?: LocId
}

export interface SceneDef {
  id: LocId
  code: string
  title: string
  image: string
  ambience: 'rain' | 'cave' | 'water' | 'crystal' | 'core'
  read: string
  onFirstEnter?: Fx
  actions: ActionDef[]
}
