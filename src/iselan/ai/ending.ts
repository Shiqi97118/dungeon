import { CONFIG } from '../config'
import type { DirectionId } from '../data'
import { VOCAB } from '../data'
import { estimateTokens } from './tokens'

/**
 * 06 §3 steps 5–7 and §6: one call at the end of a run. The program has already picked the
 * candidates; the AI picks among them, says why with the party's own deeds, and writes the epilogues.
 */

export const ENDING_PREFIX = `你是伊瑟兰的结局裁决者。一局冒险已经收束，程序给出了候选方向和这局里真实发生过的事。你的任务：
1. 从【候选方向】里选一个主方向 primary，可以再选一个副方向 secondary（也必须在候选里，或者为 null）。只有一个候选时直接用它。不得提出候选以外的方向。
2. 写 why：用叙述而不是列表，让玩家看到“是你们做的这些事让世界走到了这里”，至少引用 3 件【编年史】里队伍做过的事（标“世界”的是周围发生的事，不算队伍的作为），并在 evidence 里列出它们的编号（如 "E3"）。
3. 若有副方向，写 weave：一段话，把副方向的核心画面织进主方向。没有副方向时 weave 为空字符串。
4. 写尾声：每名角色一段（characters，回应其动机与纪念物）；每项事业一段（projects）；【人物】里每人一句（npcs）；【势力】里每个一句（factions）；【未竟之事】各一句（unfinished）。
规则：只写存档里发生过的事，不虚构没有发生的行动；已死亡或被抹去的人物不能开口；不按好坏评判，每个方向都有光明和代价；中文，克制，有画面。
只输出 JSON：
{"primary":"D01","secondary":null,"evidence":["E1","E2","E3"],"why":"……","weave":"","characters":[{"seat":"s1","text":"……"}],"projects":[{"id":"……","text":"……"}],"npcs":[{"id":"……","text":"……"}],"factions":[{"id":"……","text":"……"}],"unfinished":["……"]}`

export interface EndingInput {
  readonly candidates: readonly { readonly id: DirectionId; readonly opening: readonly string[] }[]
  readonly chronicle: readonly { readonly id: string; readonly round: number; readonly text: string; readonly kind: 'deed' | 'story' | 'world' }[]
  readonly party: readonly { readonly seatId: string; readonly name: string; readonly about: string; readonly memento?: string }[]
  readonly projects: readonly { readonly id: string; readonly text: string }[]
  readonly npcs: readonly { readonly id: string; readonly name: string; readonly attitude: number; readonly impressions: readonly string[] }[]
  readonly factions: readonly { readonly id: string; readonly name: string; readonly relation: number }[]
  readonly unfinished: readonly string[]
  /** Where the party stopped and how it got there (wrap-up or the door). */
  readonly setting: string
}

export interface EndingReply {
  readonly primary: DirectionId
  readonly secondary: DirectionId | null
  readonly evidence: readonly string[]
  readonly why: string
  readonly weave: string
  readonly characters: Readonly<Record<string, string>>
  readonly projects: Readonly<Record<string, string>>
  readonly npcs: Readonly<Record<string, string>>
  readonly factions: Readonly<Record<string, string>>
  readonly unfinished: readonly string[]
}

const dirName = (id: DirectionId) => VOCAB.directions.find((d) => d.id === id)?.name ?? id
const sign = (n: number) => (n > 0 ? `+${n}` : String(n))

/** The round content, trimmed oldest-first in the chronicle until it fits the ending budget. */
export function endingContent(input: EndingInput): string {
  const head = [
    `【收束】${input.setting}`,
    `【候选方向】${input.candidates.length === 1 ? '（只有一个，直接采用）' : ''}`,
    ...input.candidates.map((c) => `- ${c.id} ${dirName(c.id)}：${c.opening.join('')}`),
    '【队伍】',
    ...input.party.map((m) => `- ${m.seatId} ${m.name}：${m.about}${m.memento ? `；纪念物：${m.memento}` : ''}`),
    '【事业】',
    ...(input.projects.length ? input.projects.map((p) => `- ${p.id}：${p.text}`) : ['- 无']),
    '【人物】',
    ...(input.npcs.length ? input.npcs.map((n) => `- ${n.id} ${n.name}：态度 ${sign(n.attitude)}${n.impressions.length ? `；印象：${n.impressions.join('；')}` : ''}`) : ['- 无']),
    '【势力】',
    ...(input.factions.length ? input.factions.map((f) => `- ${f.id} ${f.name}：关系 ${sign(f.relation)}`) : ['- 无']),
    '【未竟之事】',
    ...(input.unfinished.length ? input.unfinished.map((u) => `- ${u}`) : ['- 无']),
  ]
  const budget = CONFIG.cost.worstCase.ending.inputTokens - estimateTokens(ENDING_PREFIX)
  let chronicle = input.chronicle.map((c) => `- ${c.id} 第 ${c.round} 轮${c.kind === 'world' ? '（世界）' : ''}：${c.text}`)
  const build = () => [...head, '【编年史】', ...chronicle].join('\n')
  while (chronicle.length > 3 && estimateTokens(build()) > budget) chronicle = chronicle.slice(1)
  return build()
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function byKey(v: unknown, key: string, allowed: ReadonlySet<string>, max: number): Record<string, string> {
  const out: Record<string, string> = {}
  if (!Array.isArray(v)) return out
  for (const x of v) {
    const k = x && typeof x === 'object' ? (x as Record<string, unknown>)[key] : undefined
    const text = str((x as Record<string, unknown> | null)?.text, max)
    if (typeof k === 'string' && allowed.has(k) && text) out[k] = text
  }
  return out
}

export type EndingParse = { readonly ok: true; readonly reply: EndingReply; readonly notes: readonly string[] } | { readonly ok: false; readonly problem: string }

/** 12 §8.3 for the ending: a choice outside the candidates is refused; unknown people and parts are dropped. */
export function parseEnding(raw: string, input: EndingInput): EndingParse {
  let j: Record<string, unknown>
  try {
    const body = raw.trim().replace(/^```(?:json)?\s*/, '').replace(/```$/, '')
    j = JSON.parse(body) as Record<string, unknown>
  } catch {
    return { ok: false, problem: '结局回应不是有效的 JSON' }
  }
  if (!j || typeof j !== 'object') return { ok: false, problem: '结局回应不是对象' }
  const ids = new Set<string>(input.candidates.map((c) => c.id))
  const primary = j.primary
  if (typeof primary !== 'string' || !ids.has(primary)) return { ok: false, problem: `主方向 ${String(primary)} 不在候选里` }
  const notes: string[] = []
  const secondary = typeof j.secondary === 'string' && ids.has(j.secondary) && j.secondary !== primary ? (j.secondary as DirectionId) : null
  if (j.secondary && !secondary) notes.push(`副方向 ${String(j.secondary)} 不在候选里，已丢弃`)
  const known = new Set(input.chronicle.map((c) => c.id))
  const evidence = Array.isArray(j.evidence) ? [...new Set(j.evidence.filter((e): e is string => typeof e === 'string' && known.has(e)))] : []
  const need = Math.min(3, input.chronicle.length)
  if (evidence.length < need) notes.push(`理由只引用了 ${evidence.length} 件编年史里的事（要求 ${need} 件）`)
  const why = str(j.why, 800)
  if (!why) return { ok: false, problem: '结局回应缺少理由' }
  const unfinished = Array.isArray(j.unfinished) ? j.unfinished.map((u) => str(u, 120)).filter(Boolean).slice(0, 8) : []
  return {
    ok: true,
    notes,
    reply: {
      primary: primary as DirectionId,
      secondary,
      evidence,
      why,
      weave: secondary ? str(j.weave, 400) : '',
      characters: byKey(j.characters, 'seat', new Set(input.party.map((m) => m.seatId)), 300),
      projects: byKey(j.projects, 'id', new Set(input.projects.map((p) => p.id)), 300),
      npcs: byKey(j.npcs, 'id', new Set(input.npcs.map((n) => n.id)), 120),
      factions: byKey(j.factions, 'id', new Set(input.factions.map((f) => f.id)), 120),
      unfinished,
    },
  }
}
