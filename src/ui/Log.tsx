import { useEffect, useRef, useState } from 'react'
import type { GameState, LogEntry } from '../game/types'
import { CLUES } from '../game/data/clues'
import { TIER_LABEL } from '../game/engine'
import { Die } from './bits'

export default function Log({ state, thinking }: { state: GameState; thinking?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const seen = useRef(state.log.at(-1)?.id ?? 0)
  const anchor = useRef<number | null>(null)
  const [unread, setUnread] = useState(false)
  const [fontSize, setFontSize] = useState(18)
  const [reading, setReading] = useState(false)
  const lastId = state.log.at(-1)?.id ?? 0
  const firstNew = seen.current
  const speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window
  const speak = () => {
    if (!speechAvailable) return
    window.speechSynthesis.cancel()
    const text = state.log.filter(e => ['read', 'narr', 'npc', 'ai'].includes(e.kind) && !e.forgotten).slice(-6).map(e => e.text).join('。')
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    window.speechSynthesis.speak(utterance)
  }
  const showUnread = () => {
    const el = root.current
    const entry = el?.querySelector<HTMLElement>('[data-entry-id="' + anchor.current + '"]')
    if (el && entry) el.scrollTop += entry.getBoundingClientRect().top - el.getBoundingClientRect().top - 12
    anchor.current = null
    setUnread(false)
  }
  useEffect(() => () => { if (speechAvailable) window.speechSynthesis.cancel() }, [speechAvailable])
  useEffect(() => {
    const first = state.log.find(e => e.id > seen.current)
    if (first && anchor.current === null) { anchor.current = first.id; setUnread(true) }
    seen.current = lastId
  }, [lastId, state.log])

  let stagger = 0
  return (
    <>
    <div className="reading-controls">
      <label>字号 <input aria-label="阅读字号" type="range" min="16" max="26" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} /></label>
      <button onClick={() => setReading(!reading)}>{reading ? '恢复布局' : '专注阅读'}</button>
      {speechAvailable && <><button onClick={speak}>朗读最近叙事</button><button onClick={() => window.speechSynthesis.cancel()}>停止朗读</button></>}
      {unread && <button onClick={showUnread}>从未读处继续 ↓</button>}
    </div>
    <div ref={root} className={'log' + (reading ? ' reading-expanded' : '')} role="log" aria-live="polite" style={{ fontSize }}>
      {state.log.map((e) => {
        const isNew = e.id > firstNew
        const delay = isNew ? stagger++ * 220 : 0
        return <div key={e.id} data-entry-id={e.id}><Entry e={e} isNew={isNew} delay={delay} /></div>
      })}
      {thinking && (
        <div className="entry ai thinking"><span className="dots"><i /><i /><i /></span> 主持人正在倾听井底的回声……</div>
      )}

    </div>
  </>
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
  if (e.kind === 'turn') {
    return (
      <div className={`turn-break ${e.speaker ? 'who' : 'round'} ${isNew ? 'new' : ''}`} style={style}>
        <span>{e.text}</span>
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
