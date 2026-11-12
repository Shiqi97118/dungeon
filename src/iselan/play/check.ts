import type { IntentTag } from '../data'
import type { CheckOutcome } from '../ai/context'
import type { CheckRequest } from '../ai/proposals'

export type Stat = 'str' | 'dex' | 'ins' | 'soc'

export const STAT_OF_SKILL: Readonly<Record<string, Stat>> = { 强韧: 'str', 灵巧: 'dex', 洞察: 'ins', 交涉: 'soc' }
export const SKILL_OF_STAT: Readonly<Record<Stat, string>> = { str: '强韧', dex: '灵巧', ins: '洞察', soc: '交涉' }

const STAT_OF_INTENT: Readonly<Partial<Record<IntentTag, Stat>>> = {
  战斗: 'str', 潜行: 'dex', 交谈: 'soc', 交易: 'soc', 欺骗: 'soc', 帮助: 'soc', 调查: 'ins', 记录: 'ins', 仪式: 'ins',
}

/** The stat a check rolls: the one the AI named, else the one the action's intent suggests. */
export function statFor(req: CheckRequest, intents: readonly IntentTag[]): Stat {
  return STAT_OF_SKILL[req.skill] ?? intents.map((i) => STAT_OF_INTENT[i]).find(Boolean) ?? 'ins'
}

/**
 * Checks keep the 2d6 + stat roll of the earlier chapter. Difficulty 12 is the ordinary 10+ hit,
 * each 3 points either way moves the line by one; a partial is the three below the hit.
 */
export const hitAt = (difficulty: number) => 10 + Math.round((difficulty - 12) / 3)

export function rollCheck(req: CheckRequest, stat: Stat, mod: number, dice: readonly [number, number]): CheckOutcome {
  const total = dice[0] + dice[1] + mod
  const hit = hitAt(req.difficulty)
  const tier = total >= hit ? 'hit' : total >= hit - 3 ? 'partial' : 'miss'
  return { skill: SKILL_OF_STAT[stat], difficulty: req.difficulty, reason: req.reason, dice: [dice[0], dice[1]], total, tier }
}

export const rollDice = (rng: () => number = Math.random): [number, number] => [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)]
