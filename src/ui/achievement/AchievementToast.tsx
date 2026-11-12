import { useEffect, useRef, useState } from 'react'
import type { CatalogView } from '../../iselan/achievements/types'
import { AchievementIcon, cardName } from './AchievementGallery'
import { RARITY_LABEL, TOAST_MS, pendingToasts, type ToastBatch } from './toastQueue'
import './achievement.css'

/**
 * 02 §7 unlock toast. Shows the server's not-yet-notified unlocks and marks them notified as soon
 * as they are on screen, so a reload, reconnect or retried upload does not show them again.
 * While `paused` (QTE, dice, reading page) unlocks wait in the queue. Never takes focus.
 */
export function AchievementToast({ view, paused = false, onNotified, onOpen }: {
  view: CatalogView | null
  paused?: boolean
  onNotified: (ids: readonly string[]) => void
  onOpen?: (achievementId: string) => void
}) {
  const handed = useRef(new Set<string>())
  const [batch, setBatch] = useState<ToastBatch | null>(null)
  const [hold, setHold] = useState(false)

  useEffect(() => {
    if (paused || batch) return
    const next = pendingToasts(view, handed.current)
    if (!next.ids.length) return
    for (const id of next.ids) handed.current.add(id)
    setBatch(next)
    onNotified(next.ids)
  }, [view, paused, batch, onNotified])

  useEffect(() => {
    if (!batch || hold) return
    const t = setTimeout(() => setBatch(null), TOAST_MS)
    return () => clearTimeout(t)
  }, [batch, hold])

  return (
    <div className="ach-toasts" aria-live="polite" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
      {batch?.shown.map((c) => (
        <div key={c.id} className={`ach-toast cat-${c.category}`}>
          <button className="ach-toast-main" onClick={() => onOpen?.(c.id)}>
            <AchievementIcon card={c} size={48} />
            <span>
              <span className="ach-toast-kicker">成就解锁</span>
              <b>{cardName(c)}</b>
              <small>{c.categoryName}{c.rarity ? ` · ${RARITY_LABEL[c.rarity]}` : ''}</small>
            </span>
          </button>
          <button className="ach-toast-close" aria-label="关闭提示" onClick={() => setBatch((b) => (b && b.shown.length > 1 ? { ...b, shown: b.shown.filter((x) => x.id !== c.id) } : null))}>×</button>
        </div>
      ))}
      {batch && batch.folded > 0 && <div className="ach-toast ach-toast-more">另有 {batch.folded} 项已解锁，可在成就图鉴查看</div>}
    </div>
  )
}
