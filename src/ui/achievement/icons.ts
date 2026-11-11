import type { AchievementCard } from '../../iselan/achievements/types'

const DIR = '../../../docs/product/narrative-v1/assets/icons/svg/'

// Only public icons are bundled: hint and secret icons carry their name and come from the server once unlocked.
const FILES = import.meta.glob<string>(['../../../docs/product/narrative-v1/assets/icons/svg/*.svg', '!**/LG*.svg', '!**/EX08.svg'], {
  query: '?url',
  import: 'default',
  eager: true,
})

export const BUNDLED_ICONS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [path.slice(DIR.length, -'.svg'.length), url]),
)

export const LOCKED_ICON = BUNDLED_ICONS.LOCKED

export function iconSrc(card: AchievementCard): string {
  if (card.iconSvg) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(card.iconSvg)}`
  return (card.name !== null && BUNDLED_ICONS[card.id]) || LOCKED_ICON
}
