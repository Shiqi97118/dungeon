import type { UnlockRecord } from '../profile'
import { CATALOG, V1_ACHIEVEMENTS } from './catalog'
import { HIDDEN_ICONS } from './hiddenIcons'
import type { AchievementCard, AchievementDef, CatalogView, CategoryProgress } from './types'

function card(def: AchievementDef, unlock: UnlockRecord | undefined): AchievementCard {
  const base = {
    id: def.id,
    category: def.category,
    categoryName: def.categoryName,
    visibility: def.visibility,
    status: unlock ? 'unlocked' : V1_ACHIEVEMENTS.includes(def.id) ? 'locked' : 'later',
    unlock: unlock ? { runId: unlock.runId, unlockedAt: unlock.unlockedAt, notified: unlock.notified } : null,
  } as const
  if (unlock || def.visibility === 'public') {
    return {
      ...base,
      name: def.name,
      description: def.description,
      hint: null,
      flavor: def.flavor,
      rarity: def.rarity,
      iconSvg: unlock ? (HIDDEN_ICONS[def.id] ?? null) : null,
    }
  }
  return {
    ...base,
    name: null,
    description: null,
    hint: def.visibility === 'hint' && def.hint ? def.hint : null,
    flavor: null,
    rarity: null,
    iconSvg: null,
  }
}

/**
 * The gallery for one profile, built on the server so that a locked hint or secret achievement
 * never leaves it with its name, text or icon (02 §2, §6; acceptance: 秘密成就不泄露).
 */
export function catalogView(unlocks: readonly UnlockRecord[]): CatalogView {
  const byId = new Map(unlocks.map((u) => [u.achievementId, u]))
  const cards = CATALOG.map((def) => card(def, byId.get(def.id)))
  const categories = new Map<string, { -readonly [K in keyof CategoryProgress]: CategoryProgress[K] }>()
  for (const c of cards) {
    const cat = categories.get(c.category) ?? { id: c.category, name: c.categoryName, total: 0, unlocked: 0 }
    cat.total += 1
    if (c.unlock) cat.unlocked += 1
    categories.set(c.category, cat)
  }
  const unlocked = cards.filter((c) => c.unlock)
  return {
    cards,
    unlocked: unlocked.length,
    total: cards.length,
    v1Unlocked: unlocked.filter((c) => V1_ACHIEVEMENTS.includes(c.id)).length,
    v1Total: V1_ACHIEVEMENTS.length,
    categories: [...categories.values()],
  }
}
