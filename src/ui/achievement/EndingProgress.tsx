import type { AchievementCard, CatalogView } from '../../iselan/achievements/types'
import { RARITY_ORDER } from '../../iselan/achievements/types'
import { AchievementIcon, cardName } from './AchievementGallery'
import { RARITY_LABEL } from './toastQueue'
import './achievement.css'

const byRarity = (a: AchievementCard, b: AchievementCard) => RARITY_ORDER.indexOf(a.rarity ?? 'common') - RARITY_ORDER.indexOf(b.rarity ?? 'common')

function Row({ card }: { card: AchievementCard }) {
  return (
    <li className="ach-row">
      <AchievementIcon card={card} size={64} />
      <span><b>{cardName(card)}</b><small>{card.categoryName}{card.rarity ? ` · ${RARITY_LABEL[card.rarity]}` : ''}</small></span>
    </li>
  )
}

/**
 * 02 §8 ending summary. The permanent collection (C / 50) and this run's count (B, never “B/50”)
 * are kept apart; `earned` is what the upload reported for this run.
 */
export function EndingProgress({ view, runId, earned = [], onOpenGallery }: {
  view: CatalogView
  runId: string
  earned?: readonly string[]
  onOpenGallery?: () => void
}) {
  const fresh = view.cards.filter((c) => c.unlock?.runId === runId).sort(byRarity)
  const again = view.cards.filter((c) => earned.includes(c.id) && c.unlock && c.unlock.runId !== runId).sort(byRarity)
  const thisRun = new Set([...earned, ...fresh.map((c) => c.id)]).size

  return (
    <section className="ach-ending" aria-labelledby="ach-ending-title">
      <h3 id="ach-ending-title">本局成就</h3>
      <dl className="ach-ending-stats">
        <div><dt>本次新获得</dt><dd>{fresh.length} 项</dd></div>
        <div><dt>本局达成</dt><dd>{thisRun} 项</dd></div>
        <div><dt>首版成就</dt><dd>{view.v1Unlocked} / {view.v1Total}</dd></div>
        <div><dt>永久总进度</dt><dd>{view.unlocked} / {view.total}</dd></div>
      </dl>
      <progress className="ach-progress" max={view.v1Total} value={view.v1Unlocked} aria-label={`首版成就 ${view.v1Unlocked} / ${view.v1Total}`} />
      {fresh.length > 0 && <ul className="ach-rows">{fresh.map((c) => <Row key={c.id} card={c} />)}</ul>}
      {again.length > 0 && (
        <>
          <h4>此前已获得，本局再次达成</h4>
          <ul className="ach-rows minor">{again.map((c) => <Row key={c.id} card={c} />)}</ul>
        </>
      )}
      <ul className="ach-cats">
        {view.categories.map((c) => <li key={c.id}>{c.name}：已获得 {c.unlocked} / {c.total}</li>)}
      </ul>
      {onOpenGallery && <button className="btn" onClick={onOpenGallery}>查看完整图鉴</button>}
    </section>
  )
}
