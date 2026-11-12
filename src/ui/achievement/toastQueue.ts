import { RARITY_ORDER, type AchievementCard, type CatalogView, type Rarity } from '../../iselan/achievements/types'

/** 02 §5: at most 3 toasts in a row; the rest fold into “另有 N 项已解锁”. */
export const MAX_AUTO_TOASTS = 3
export const TOAST_MS = 5000

export const RARITY_LABEL: Record<Rarity, string> = { common: '普通', rare: '稀有', epic: '史诗', legendary: '传奇' }

const rank = (c: AchievementCard) => RARITY_ORDER.indexOf(c.rarity ?? 'common')

export interface ToastBatch {
  readonly shown: readonly AchievementCard[]
  readonly folded: number
  /** Everything in the batch, shown or folded; all of it is marked notified at once. */
  readonly ids: readonly string[]
}

/**
 * Unlocks the server has not marked notified yet, highest rarity first, then by unlock time.
 * Once they are marked notified (02 §4, 12 §12 A8) a reload or a retried upload brings none back.
 */
export function pendingToasts(view: CatalogView | null, skip: ReadonlySet<string> = new Set()): ToastBatch {
  const pending = (view?.cards ?? [])
    .filter((c) => c.unlock && !c.unlock.notified && !skip.has(c.id))
    .sort((a, b) => rank(a) - rank(b) || a.unlock!.unlockedAt - b.unlock!.unlockedAt)
  return { shown: pending.slice(0, MAX_AUTO_TOASTS), folded: Math.max(0, pending.length - MAX_AUTO_TOASTS), ids: pending.map((c) => c.id) }
}

/** The view after `ids` were marked notified, so the client agrees with the server without refetching. */
export function withNotified(view: CatalogView, ids: readonly string[]): CatalogView {
  return { ...view, cards: view.cards.map((c) => (c.unlock && ids.includes(c.id) ? { ...c, unlock: { ...c.unlock, notified: true } } : c)) }
}
