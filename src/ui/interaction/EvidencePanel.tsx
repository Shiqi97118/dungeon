import { useEffect, useRef, useState, type Dispatch, type ReactNode } from 'react'
import { missingKeys, type EvidenceDef, type Hotspot, type Session, type SessionMsg } from '../../iselan/interaction'

const SMUDGED = ['', '', '']

/** The `evidence` template body: the ledger page, a text-only alternative, findings and settlement. */
export default function EvidencePanel({ def, s, dispatch, knownName, onClose }: {
  def: EvidenceDef
  s: Session
  dispatch: Dispatch<SessionMsg>
  /** Slot for the last row; `GH-BEAT-04` 说明 has the AI swap it when the line condition fails. */
  knownName: string
  onClose: () => void
}) {
  const [textMode, setTextMode] = useState(false)
  const [hint, setHint] = useState('')
  const status = useRef<HTMLParagraphElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  const resultHead = useRef<HTMLHeadingElement>(null)
  const locked = s.phase !== 'open'
  const missing = missingKeys(def, s.inspected)
  const spot = (id: string) => def.hotspots.find((h) => h.id === id)!

  useEffect(() => {
    if (s.phase === 'submitting') status.current?.focus()
    else if (s.phase === 'stalled') retry.current?.focus()
    else if (s.phase === 'settled' && s.resultOpen) resultHead.current?.focus()
  }, [s.phase, s.resultOpen])

  const inspect = (h: Hotspot, viaText: boolean) => {
    if (locked) return
    if (h.needsZoom && !s.zoomed && !viaText) {
      setHint('字太小，看不清。先放大。')
      return
    }
    setHint('')
    dispatch({ type: 'inspect', hotspotId: h.id })
  }
  const seen = (id: string) => s.inspected.includes(id)
  const cell = (id: string, children: ReactNode, className = '') => (
    <button
      className={`ix-spot ${className}${seen(id) ? ' seen' : ''}`}
      onClick={() => inspect(spot(id), false)}
      disabled={locked}
      aria-pressed={seen(id)}
      aria-label={spot(id).label}
    >
      {children}
    </button>
  )

  const result = s.result
  return (
    <div className="ix-body">
      <p className="ix-prompt">{def.publicPrompt}</p>
      <div className="ix-grid">
        <section className="ix-stage" aria-label="账本">
          <div className="ix-tools">
            <button className="btn small" onClick={() => dispatch({ type: 'zoom', on: !s.zoomed })} disabled={locked || textMode} aria-pressed={s.zoomed}>
              {s.zoomed ? '缩小' : '放大'}
            </button>
            <button className="btn small ghost" onClick={() => setTextMode(!textMode)} disabled={locked} aria-pressed={textMode}>
              {textMode ? '回到账本' : '改用文字检视'}
            </button>
          </div>
          {textMode ? (
            <ul className="ix-textlist">
              {def.hotspots.map((h) => (
                <li key={h.id}>
                  <button className={`ix-spot ix-line${seen(h.id) ? ' seen' : ''}`} onClick={() => inspect(h, true)} disabled={locked} aria-pressed={seen(h.id)}>
                    {h.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="ix-scroll">
              <div className={`ix-ledger${s.zoomed ? ' zoomed' : ''}`}>
                {cell('columns', <><span>日期</span><span>姓名</span><span>住址</span><span>收取量</span></>, 'ix-headrow')}
                {SMUDGED.map((_, i) => (
                  <div className="ix-smudge" key={i} aria-hidden="true">
                    <span>· · ·</span><span>· · · ·</span><span>· · · ·</span>
                  </div>
                ))}
                {cell('unit', <><span>段</span><span>段</span><span>段</span></>, 'ix-unit')}
                {cell('lastRow', <><span>最近</span><span>{knownName}</span><span>· · ·</span></>, 'ix-lastrow')}
                {cell('seven', '七段', 'ix-seven')}
                {cell('margin', '本月市场预言准确率：九成。', 'ix-margin')}
              </div>
            </div>
          )}
          <p className="ix-hint small" aria-live="polite">{hint}</p>
        </section>

        <section className="ix-side" aria-label="发现">
          {result && s.resultOpen ? (
            <div className="ix-result">
              <h3 ref={resultHead} tabIndex={-1}>{result.outcome === 'completed' ? '记下了' : '跳过互动'}</h3>
              {result.outcome === 'completed' ? (
                <ul className="ix-found">
                  {result.inspected.filter((id) => spot(id).key).map((id) => <li key={id}>{spot(id).detail}</li>)}
                </ul>
              ) : (
                <p>按普通检定结算：{result.check!.skill}，难度 {result.check!.difficulty}。跳过不改变成功率。</p>
              )}
              <div className="ix-actions">
                <button className="btn" onClick={() => dispatch({ type: 'showResult', open: false })}>收起结果</button>
                <button className="btn primary" onClick={onClose}>继续</button>
              </div>
            </div>
          ) : (
            <>
              <p className="small dim">关键之处 {def.hotspots.filter((h) => h.key).length - missing.length}/{def.hotspots.filter((h) => h.key).length}</p>
              <ul className="ix-found">
                {s.inspected.map((id) => <li key={id}>{spot(id).detail}</li>)}
              </ul>
              {result ? (
                <div className="ix-actions">
                  <button className="btn" onClick={() => dispatch({ type: 'showResult', open: true })}>查看结果</button>
                </div>
              ) : (
                <div className="ix-actions">
                  <button className="btn primary" onClick={() => dispatch({ type: 'submit', action: textMode ? 'alternative' : 'complete' })} disabled={locked || missing.length > 0}>
                    记下发现
                  </button>
                  <button className="btn ghost" onClick={() => dispatch({ type: 'submit', action: 'skip' })} disabled={locked}>
                    跳过，按普通检定
                  </button>
                  {s.phase === 'stalled' && (
                    <button className="btn" ref={retry} onClick={() => dispatch({ type: 'retry' })}>
                      重试
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          <p className="ix-status small" ref={status} tabIndex={-1} role="status" data-request={s.request?.requestId}>
            {s.phase === 'submitting' ? `正在结算${s.attempts > 1 ? `（第 ${s.attempts} 次尝试，同一请求）` : ''}……` : (s.error ?? '')}
          </p>
        </section>
      </div>
    </div>
  )
}
