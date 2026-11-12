import { useEffect, useRef, useState } from 'react'
import type { AchievementCard, CatalogView } from '../../iselan/achievements/types'
import { iconSrc } from './icons'
import { RARITY_LABEL } from './toastQueue'
import './achievement.css'

type StatusFilter = 'all' | 'got' | 'missing'

const STATUS_FILTERS: [StatusFilter, string][] = [['all', '全部'], ['got', '已获得'], ['missing', '未获得']]

export const cardName = (c: AchievementCard) => c.name ?? '???'

export function statusLabel(c: AchievementCard) {
  if (c.status === 'unlocked') return '已解锁'
  if (c.status === 'later') return '后续版本开放'
  return '未解锁'
}

const date = (t: number) => new Date(t).toLocaleDateString('zh-CN')

export function AchievementIcon({ card, size }: { card: AchievementCard; size: number }) {
  return <img className={`ach-icon ${card.unlock ? '' : 'locked'}`} src={iconSrc(card)} width={size} height={size} alt="" />
}

/** 02 §6 图鉴: one screen, filters on the side (on top on phones), the grid scrolls inside. */
export function AchievementGallery({ view, onClose }: { view: CatalogView; onClose?: () => void }) {
  const [category, setCategory] = useState<string>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [open, setOpen] = useState<AchievementCard | null>(null)
  const opener = useRef<HTMLButtonElement | null>(null)

  const cards = view.cards.filter(
    (c) => (category === 'all' || c.category === category) && (status === 'all' || (status === 'got') === (c.status === 'unlocked')),
  )
  const percent = Math.round((view.unlocked / view.total) * 100)

  return (
    <section className="ach-gallery" aria-labelledby="ach-gallery-title">
      <header className="ach-head">
        <h2 id="ach-gallery-title">成就图鉴</h2>
        <p className="ach-stats">
          <span>已解锁 <b>{view.unlocked}</b> / {view.total}（{percent}%）</span>
          <span>首版成就 <b>{view.v1Unlocked}</b> / {view.v1Total}</span>
        </p>
        {onClose && <button className="btn small ghost" onClick={onClose}>关闭</button>}
      </header>
      <div className="ach-body">
        <nav className="ach-filters" aria-label="成就筛选">
          <div role="group" aria-label="分类">
            <button className={`ach-tab ${category === 'all' ? 'on' : ''}`} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>全部</button>
            {view.categories.map((c) => (
              <button key={c.id} className={`ach-tab ${category === c.id ? 'on' : ''}`} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
                {c.name}<small>{c.unlocked}/{c.total}</small>
              </button>
            ))}
          </div>
          <div role="group" aria-label="解锁状态">
            {STATUS_FILTERS.map(([id, label]) => (
              <button key={id} className={`ach-tab ${status === id ? 'on' : ''}`} aria-pressed={status === id} onClick={() => setStatus(id)}>{label}</button>
            ))}
          </div>
        </nav>
        <ul className="ach-grid">
          {cards.map((c) => (
            <li key={c.id}>
              <button
                className={`ach-card s-${c.status} cat-${c.category}`}
                onClick={(e) => { opener.current = e.currentTarget; setOpen(c) }}
                aria-label={`${cardName(c)}，${statusLabel(c)}`}
              >
                <AchievementIcon card={c} size={48} />
                <span className="ach-name">{cardName(c)}</span>
                <span className="ach-meta">
                  {c.rarity && <span className={`ach-rarity r-${c.rarity}`}>{RARITY_LABEL[c.rarity]}</span>}
                  <span className="ach-status">{statusLabel(c)}</span>
                </span>
              </button>
            </li>
          ))}
          {!cards.length && <li className="ach-empty">这里还没有成就。</li>}
        </ul>
      </div>
      {open && <AchievementDetail card={open} onClose={() => { setOpen(null); opener.current?.focus() }} />}
    </section>
  )
}

/** 02 §7 detail dialog: closes on the button, Esc or the backdrop, and focus returns to the card. */
export function AchievementDetail({ card, onClose }: { card: AchievementCard; onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const text = card.description ?? card.hint ?? (card.visibility === 'secret' ? '这是一项秘密成就，达成之前不会透露任何内容。' : null)
  return (
    <div className="modal-backdrop ach-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal ach-detail" role="dialog" aria-modal="true" aria-labelledby="ach-detail-title">
        <div className="ach-detail-top">
          <AchievementIcon card={card} size={96} />
          <div>
            <div className="modal-kicker">{card.categoryName}{card.rarity ? ` · ${RARITY_LABEL[card.rarity]}` : ''}</div>
            <h3 id="ach-detail-title">{cardName(card)}</h3>
            <p className="ach-status">{statusLabel(card)}{card.unlock ? ` · ${date(card.unlock.unlockedAt)}` : ''}</p>
          </div>
        </div>
        {text && <p>{card.hint && !card.description ? `提示：${text}` : text}</p>}
        {card.flavor && card.unlock && <p className="ach-flavor">{card.flavor}</p>}
        <div className="ach-detail-actions">
          <button ref={closeBtn} className="btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
