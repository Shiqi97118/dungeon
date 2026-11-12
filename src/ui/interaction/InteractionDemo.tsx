import { useCallback, useRef, useState } from 'react'
import type { AnyEvent } from '../../iselan/events'
import { BANQUET, LEDGER, interactionInstanceId, settleInteraction, type InteractionRequest } from '../../iselan/interaction'
import EvidencePanel from './EvidencePanel'
import GesturePanel from './GesturePanel'
import Modal from './Modal'
import { useInteraction } from './useInteraction'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const ALL_GUESTS = BANQUET.guests.map((g) => g.id)

/** Dev-only page for `?demo=evidence` and `?demo=gesture` (QTE-01 checks); settles against an in-memory ledger. */
export default function InteractionDemo({ template }: { template: 'evidence' | 'gesture' }) {
  const def = template === 'evidence' ? LEDGER : BANQUET
  const events = useRef<readonly AnyEvent[]>([])
  const [log, setLog] = useState<string[]>([])
  const [slow, setSlow] = useState(false)
  const [twice, setTwice] = useState(false)
  const [open, setOpen] = useState(false)
  const [absent, setAbsent] = useState(false)
  const present = absent ? ALL_GUESTS.filter((g) => g !== 'professor') : ALL_GUESTS
  const flags = useRef({ slow, twice, present })
  flags.current = { slow, twice, present }

  const settle = useCallback(async (req: InteractionRequest) => {
    const { slow, twice, present } = flags.current
    setLog((l) => [...l, `发出 ${req.requestId} · ${req.action} · [${req.params.inspected.join(',')}]`])
    await wait(slow ? 3500 : 600)
    const r = settleInteraction(events.current, def, req, { runId: 'demo', committedAt: new Date().toISOString() }, { present })
    events.current = r.events
    if (twice) {
      const again = settleInteraction(events.current, def, req, { runId: 'demo', committedAt: new Date().toISOString() }, { present })
      setLog((l) => [...l, `重复回调 ${req.requestId}：duplicate=${again.result.duplicate}`])
    }
    setLog((l) => [...l, `回执 ${req.requestId} · ${r.result.outcome}${r.result.duplicate ? '（已记过）' : ''}`])
    return r.result
  }, [def])

  const [s, dispatch] = useInteraction(interactionInstanceId(def.textId), null, settle, 1500)
  const count = events.current.filter((e) => e.type === 'interaction_completed').length

  return (
    <div className="rd-demo ix-demo">
      <header className="topbar">
        <div className="brand">回声井<small>互动演示</small></div>
        <span className="dim small">{def.textId} · {def.template}</span>
      </header>
      <main className="ix-demo-main">
        <p>{template === 'evidence' ? '账本的每一页都整整齐齐……' : '柯德里克举起酒杯：“今晚，我们只谈未来。”'}</p>
        <button className="btn primary" onClick={() => setOpen(true)} data-testid="trigger">
          {template === 'evidence' ? '检视账本' : '入席'}
        </button>
        <fieldset className="ix-demo-flags">
          <legend className="small dim">演示开关</legend>
          <label><input type="checkbox" checked={slow} onChange={(e) => setSlow(e.target.checked)} /> 回执迟到（超过 1.5 秒超时）</label>
          <label><input type="checkbox" checked={twice} onChange={(e) => setTwice(e.target.checked)} /> 回调两次</label>
          {template === 'gesture' && (
            <label><input type="checkbox" checked={absent} onChange={(e) => setAbsent(e.target.checked)} disabled={s.phase !== 'open' || open} /> 学院教授缺席</label>
          )}
        </fieldset>
        <p className="small" data-testid="state">阶段：{s.phase} · 账本中 interaction_completed：<b data-testid="count">{count}</b></p>
        <ol className="small dim" data-testid="log">{log.map((l, i) => <li key={i}>{l}</li>)}</ol>
      </main>
      {open && (
        <Modal title={def.title} onClose={() => setOpen(false)} canClose={s.phase !== 'submitting'}>
          {def.template === 'evidence' ? (
            <EvidencePanel def={def} s={s} dispatch={dispatch} knownName="卢多的母亲" onClose={() => setOpen(false)} />
          ) : (
            <GesturePanel def={def} present={present} s={s} dispatch={dispatch} onClose={() => setOpen(false)} />
          )}
        </Modal>
      )}
    </div>
  )
}
