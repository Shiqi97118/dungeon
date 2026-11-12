import { useEffect, useRef, type Dispatch, type ReactNode } from 'react'
import type { InteractionAction, InteractionResult, Session, SessionMsg } from '../../iselan/interaction'

/**
 * The part every template shares: progress while open, submit / skip / retry, the status line and
 * the collapsible result. Focus follows the phase so keyboard and screen-reader users never lose it.
 */
export default function Settlement({ s, dispatch, progress, submit, completed, onClose }: {
  s: Session
  dispatch: Dispatch<SessionMsg>
  /** Shown while the result is closed: what the player has done so far. */
  progress: ReactNode
  submit: { readonly label: string; readonly action: InteractionAction; readonly ready: boolean }
  completed: (result: InteractionResult) => ReactNode
  onClose: () => void
}) {
  const status = useRef<HTMLParagraphElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  const resultHead = useRef<HTMLHeadingElement>(null)
  const locked = s.phase !== 'open'

  useEffect(() => {
    if (s.phase === 'submitting') status.current?.focus()
    else if (s.phase === 'stalled') retry.current?.focus()
    else if (s.phase === 'settled' && s.resultOpen) resultHead.current?.focus()
  }, [s.phase, s.resultOpen])

  const result = s.result
  return (
    <>
      {result && s.resultOpen ? (
        <div className="ix-result">
          <h3 ref={resultHead} tabIndex={-1}>{result.outcome === 'completed' ? '记下了' : '跳过互动'}</h3>
          {result.outcome === 'completed' ? completed(result) : <p>按普通检定结算：{result.check!.skill}，难度 {result.check!.difficulty}。跳过不改变成功率。</p>}
          <div className="ix-actions">
            <button className="btn" onClick={() => dispatch({ type: 'showResult', open: false })}>收起结果</button>
            <button className="btn primary" onClick={onClose}>继续</button>
          </div>
        </div>
      ) : (
        <>
          {progress}
          {result ? (
            <div className="ix-actions">
              <button className="btn" onClick={() => dispatch({ type: 'showResult', open: true })}>查看结果</button>
            </div>
          ) : (
            <div className="ix-actions">
              <button className="btn primary" onClick={() => dispatch({ type: 'submit', action: submit.action })} disabled={locked || !submit.ready}>
                {submit.label}
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
    </>
  )
}
