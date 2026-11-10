import type { Character, Stat } from './types.js'
import { STAT_ORDER } from './types.js'
import { SPECIALTIES, randomCharacter } from './data/characters.js'

/**
 * 随机车卡（character draft）的单一数据来源与生成逻辑。
 *
 * 设计边界（对齐 docs/workbuddy/协作规范.md 与已批准的轻量规则）：
 * - 职业/种族只作为角色背景写入 title，不提供任何数值或法术加成，
 *   与现有 CharacterBuilder 的行为一致，不新增「未经实现的职业加成」。
 * - 姓名、装备、动机、钩子、纪念物、符印等沿用现有 randomCharacter()
 *   合法生成器（含 ITEMS 装备表与 RANDOM_NAMES 姓名池），不重复枚举。
 * - 本模块只新增「随机挑选职业/种族 + 组合出可填表草稿」的能力，
 *   不改动引擎、存档与联机协议。Setup.tsx 的旧随机组队入口不受影响。
 */

/** 12 职业、8 种族常量；UI 与测试共用，避免在界面里重复枚举。 */
export const JOBS: readonly string[] = [
  '战士', '游侠', '游荡者', '吟游诗人', '学者', '医者',
  '工匠', '守卫', '信使', '德鲁伊', '圣武士', '奇械师',
]

export const ANCESTRIES: readonly string[] = [
  '人类', '精灵', '矮人', '半身人', '侏儒', '兽人', '提夫林', '歌利亚',
]

/** 四属性标准数组：+2、+1、0、−1 各分配一次。 */
export const STAT_BUDGET: readonly number[] = [2, 1, 0, -1]

/** 专长白名单，直接由现有 SPECIALTIES 派生，避免另抄一份清单。 */
export const SPECIALTY_NAMES: readonly string[] = SPECIALTIES.map((s) => s.name)

/** 车卡表单可编辑字段；随机结果先落到这里，再由玩家微调。 */
export interface CharacterDraft {
  name: string
  job: string
  ancestry: string
  stats: Record<Stat, number>
  specialties: string[]
}

function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(Math.random() * xs.length)]
}

function shuffled<T>(xs: readonly T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 校验一份草稿是否满足全部硬性规则：
 * 姓名非空、职业/种族合法、属性恰为 +2/+1/0/−1 各一次、
 * 专长恰好两项、互异且都在白名单内。
 */
export function isDraftValid(d: CharacterDraft): boolean {
  const vals = STAT_ORDER.map((k) => d.stats[k]).slice().sort((a, b) => a - b)
  const budget = STAT_BUDGET.slice().sort((a, b) => a - b)
  const statsOk =
    vals.length === budget.length &&
    vals.every((v, i) => Number.isFinite(v) && v === budget[i])
  const specsOk =
    d.specialties.length === 2 &&
    d.specialties[0] !== d.specialties[1] &&
    d.specialties.every((s) => SPECIALTY_NAMES.includes(s))
  return (
    d.name.trim().length > 0 &&
    JOBS.includes(d.job) &&
    ANCESTRIES.includes(d.ancestry) &&
    statsOk &&
    specsOk
  )
}

/**
 * 生成一份完整、合法的随机车卡草稿（姓名/职业/种族/属性/专长）。
 * 姓名取用现有 randomCharacter 的姓名池并支持 takenNames 去重；
 * 属性与专长在本模块内按同一套规则重新随机，保证不变量可测。
 */
export function randomDraft(takenNames: string[] = []): CharacterDraft {
  const base = randomCharacter(takenNames)
  const vals = shuffled(STAT_BUDGET)
  const stats = {} as Record<Stat, number>
  STAT_ORDER.forEach((k, i) => {
    stats[k] = vals[i]
  })
  return {
    name: base.name,
    job: pick(JOBS),
    ancestry: pick(ANCESTRIES),
    stats,
    specialties: shuffled(SPECIALTY_NAMES).slice(0, 2),
  }
}

/**
 * 把（可能已被玩家微调的）草稿落成可加入队伍的完整 Character。
 * 装备、id、动机、钩子、纪念物、符印、reason 等沿用现有 randomCharacter
 * 合法生成器；title 保持现有「种族 · 职业」写法，不含任何数值加成。
 */
export function draftToCharacter(d: CharacterDraft, takenNames: string[] = []): Character {
  const base = randomCharacter(takenNames)
  return {
    ...base,
    name: d.name.trim() || base.name,
    title: `${d.ancestry} · ${d.job}`,
    stats: { ...d.stats },
    specialties: [...d.specialties],
  }
}

/** 一步生成可直接加入队伍的随机角色，供「直接随机加入」按钮使用。 */
export function randomPlayableCharacter(takenNames: string[] = []): Character {
  return draftToCharacter(randomDraft(takenNames), takenNames)
}
