// Shapes shared by the server and the client. The client imports only this file: the catalog
// itself (names and descriptions of secret achievements) stays on the server.

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type AchievementVisibility = 'public' | 'hint' | 'secret'

type Where = Readonly<Record<string, string | number | boolean>>

/** The rule ops the catalog uses (02 §4); v1 judges only `event`. */
export type AchievementRule =
  | { readonly op: 'event'; readonly type: string; readonly where: Where }
  | { readonly op: 'count'; readonly type: string; readonly where: Where; readonly min: number; readonly distinctBy: string }

/** One entry of docs/product/narrative-v1/data/achievements.v1.json. */
export interface AchievementDef {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly flavor: string
  readonly category: string
  readonly categoryName: string
  readonly rarity: Rarity
  readonly visibility: AchievementVisibility
  readonly hint: string
  readonly scope: string
  readonly iconKey: string
  readonly rule: AchievementRule
}

/**
 * - `unlocked`: earned by this profile;
 * - `locked`: judged in v1 (12 §6.1) but not earned yet;
 * - `later`: not judged until a later version (后续版本开放).
 */
export type CardStatus = 'unlocked' | 'locked' | 'later'

/**
 * One gallery entry as the server sends it. A locked hint or secret achievement carries no name,
 * description, flavor, rarity or icon (02 §2, §6); a hint one carries only its hint.
 */
export interface AchievementCard {
  readonly id: string
  readonly category: string
  readonly categoryName: string
  readonly visibility: AchievementVisibility
  readonly status: CardStatus
  readonly name: string | null
  readonly description: string | null
  readonly hint: string | null
  readonly flavor: string | null
  readonly rarity: Rarity | null
  /** Unlocked hint / secret achievements only: their icons are not in the client bundle. */
  readonly iconSvg: string | null
  readonly unlock: { readonly runId: string; readonly unlockedAt: number; readonly notified: boolean } | null
}

export interface CategoryProgress {
  readonly id: string
  readonly name: string
  readonly total: number
  readonly unlocked: number
}

export interface CatalogView {
  readonly cards: readonly AchievementCard[]
  /** Permanent collection: unlocked / all 50, hidden ones included in the count (02 §6). */
  readonly unlocked: number
  readonly total: number
  /** The achievements this version can unlock (12 §6.1). */
  readonly v1Unlocked: number
  readonly v1Total: number
  readonly categories: readonly CategoryProgress[]
}

export const RARITY_ORDER: readonly Rarity[] = ['legendary', 'epic', 'rare', 'common']
