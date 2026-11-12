import { STAT_ORDER, type Stat } from './check'
import type { Pregen } from './pregens'

export const JOBS = ['战士', '游侠', '游荡者', '吟游诗人', '学者', '医者', '工匠', '守卫', '信使', '德鲁伊', '圣武士', '奇械师'] as const
export const ANCESTRIES = ['人类', '精灵', '矮人', '半身人', '侏儒', '兽人', '提夫林', '歌利亚'] as const
export const STAT_BUDGET = [2, 1, 0, -1] as const
export const SPECIALTIES = {
  矿道熟手: 'ins', 急救者: 'soc', 旧语学者: 'ins', 侦察员: 'ins', 机械匠: 'dex',
  谈判人: 'soc', 野外人: 'str', 演奏者: 'soc', 影行者: 'dex', 护卫: 'str', 记述者: 'ins',
} as const satisfies Record<string, Stat>
export type Specialty = keyof typeof SPECIALTIES
export const SPECIALTY_NAMES = Object.keys(SPECIALTIES) as Specialty[]

const NAMES = ['沈砾', '温缇', '柯桑', '黎川', '苏曜', '荀溪', '岑白', '陶鸣', '纪霜', '阮澈', '顾棠', '许砚']
export const MOTIVES = ['寻找一位在灰港失踪的人', '找回家族遗物', '还清一笔人情债', '调查一段不合常理的记忆', '为家人赚足离开矿区的钱', '弄清商会为何在收购旧物'] as const
export const MEMENTOS = ['一封未寄出的信', '缺了一齿的铜钥匙', '亲友留下的布片', '一枚无主工牌', '写有陌生名字的石片', '失灵但仍上弦的怀表'] as const

export interface CharacterDraft {
  name: string
  job: typeof JOBS[number]
  ancestry: typeof ANCESTRIES[number]
  stats: Record<Stat, number>
  specialties: Specialty[]
  motive: typeof MOTIVES[number]
  memento: typeof MEMENTOS[number]
}

const oneOf = <T extends string>(values: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && values.some((x) => x === v)
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Both browser and server accept the same point budget and allowlists. */
export function parseCharacterDraft(value: unknown): CharacterDraft | null {
  if (!object(value)) return null
  const { name, job, ancestry, stats, specialties, motive, memento } = value
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 24 || /\p{C}/u.test(name)) return null
  if (!oneOf(JOBS, job) || !oneOf(ANCESTRIES, ancestry) || !oneOf(MOTIVES, motive) || !oneOf(MEMENTOS, memento)) return null
  if (!object(stats) || !STAT_BUDGET.every((n) => STAT_ORDER.some((key) => stats[key] === n))) return null
  if (!Array.isArray(specialties) || specialties.length !== 2 || specialties[0] === specialties[1] ||
      !specialties.every((s) => oneOf(SPECIALTY_NAMES, s))) return null
  return {
    name: name.trim(), job, ancestry, motive, memento, specialties: [...specialties] as Specialty[],
    stats: { str: Number(stats.str), dex: Number(stats.dex), ins: Number(stats.ins), soc: Number(stats.soc) },
  }
}

const pick = <T>(values: readonly T[], rng: () => number): T => values[Math.floor(rng() * values.length)]
function shuffle<T>(values: readonly T[], rng: () => number): T[] {
  const out = [...values]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function randomCharacterDraft(taken: readonly string[] = [], rng: () => number = Math.random): CharacterDraft {
  const available = NAMES.filter((name) => !taken.includes(name))
  let name = available.length ? pick(available, rng) : '无名'
  for (let n = 2; taken.includes(name); n++) name = `无名·${n}`
  const [str, dex, ins, soc] = shuffle(STAT_BUDGET, rng)
  return {
    name, job: pick(JOBS, rng), ancestry: pick(ANCESTRIES, rng), stats: { str, dex, ins, soc },
    specialties: shuffle(SPECIALTY_NAMES, rng).slice(0, 2), motive: pick(MOTIVES, rng), memento: pick(MEMENTOS, rng),
  }
}

export const customCharacter = (draft: CharacterDraft, id: string): Pregen => ({
  id, name: draft.name, title: `${draft.ancestry} · ${draft.job}`, stats: draft.stats,
  motive: draft.motive, memento: draft.memento, hook: '', draft,
})

export const specialtyBonus = (draft: CharacterDraft | undefined, stat: Stat) =>
  draft?.specialties.some((s) => SPECIALTIES[s] === stat) ? 1 : 0
