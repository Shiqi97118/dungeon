import { useEffect, useRef } from 'react'
import type { GameState, LogEntry } from '../game/types'
import { CLUES } from '../game/data/clues'
import { TIER_LABEL } from '../game/engine'
import { Die } from './bits'

export default function Log({ state, thinking }: { state: GameState; thinking?: boolean }) {
  const end = useRef<HTMLDivElement>(null)
  const seen = useRef<number>(-1)
  const lastId = state.log[state.log.length - 1]?.id ?? 0
  const firstNew = seen.current < 0 ? lastId : seen.current

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    const t = setTimeout(() => { seen.current = lastId }, 50)
    return () => clearTimeout(t)
  }, [lastId, thinking])

  let stagger = 0
  return (
    <div className="log" role="log" aria-live="polite">
      {state.log.map((e) => {
        const isNew = e.id > firstNew
        const delay = isNew ? stagger++ * 220 : 0
        return <Entry key={e.id} e={e} isNew={isNew} delay={delay} />
      })}
      {thinking && (
        <div className="entry ai thinking"><span className="dots"><i /><i /><i /></span> 主持人正在倾听井底的回声……</div>
      )}
      <div ref={end} />
    </div>
  )
}

function Entry({ e, isNew, delay }: { e: LogEntry; isNew: boolean; delay: number }) {
  const style = isNew ? { animationDelay: `${delay}ms` } : undefined
  const cls = `entry ${e.kind} ${isNew ? 'new' : ''} ${e.forgotten ? 'forgotten' : ''}`
  const forgotTitle = e.forgotten ? '这段记忆被井取走了' : undefined

  if (e.kind === 'sys' && e.text.startsWith('§')) {
    const [, code, title] = e.text.split('§')
    return (
      <div className={`scene-break ${isNew ? 'new' : ''}`} style={style}>
        <span className="scene-code">{code}</span>
        <span className="scene-title">{title}</span>
      </div>
    )
  }
  if (e.kind === 'clue') {
    const c = CLUES[e.text]
    if (!c) return null
    return (
      <div className={cls} style={style}>
        <div className="clue-card">
          <div className="clue-tag">线索</div>
          <div className="clue-title">{c.title}</div>
          <div className="clue-text">{c.text}</div>
          {c.handout && <div className="clue-handout">{c.handout}</div>}
        </div>
      </div>
    )
  }
  if (e.kind === 'roll' && e.dice) {
    return (
      <div className={`${cls} t-${e.tier}`} style={style}>
        <Die value={e.dice[0]} size={26} />
        <Die value={e.dice[1]} size={26} />
        <span className="roll-text">{e.text}</span>
        <span className="roll-total">{e.total}</span>
        <span className="roll-tier">{e.tier && TIER_LABEL[e.tier]}</span>
      </div>
    )
  }
  if (e.kind === 'npc' || (e.kind === 'ai' && e.speaker)) {
    return (
      <div className={cls} style={style} title={forgotTitle}>
        <span className="speaker">{e.speaker}</span>
        <span className="line">「{e.text}」</span>
      </div>
    )
  }
  if (e.kind === 'player') {
    return (
      <div className={cls} style={style}>
        <span className="arrow">›</span>
        {e.speaker && <span className="who">{e.speaker}</span>}
        <span>{e.text}</span>
      </div>
    )
  }
  if (e.kind === 'echo') {
    return (
      <div className={cls} style={style}>
        <span className="echo-text" data-text={e.text}>{e.text}</span>
      </div>
    )
  }
  return <div className={cls} style={style} title={forgotTitle}>{e.text}</div>
}
