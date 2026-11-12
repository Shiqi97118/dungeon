import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sound } from '../../audio/sound'
import { CONFIG } from '../../iselan/config'
import type { DirectionId, OutcomeId, PlaceId } from '../../iselan/data'
import { recordedResult, type InteractionRequest } from '../../iselan/interaction'
import {
  act, ARC_OUTCOMES, canWrapUp, chooseEnding, INTERACTIONS, interact, move, outcomeLabel, outcomeOpen, resolveArc, rewind, roll,
  saveTable, SKILL_OF_STAT, snapshotOf, wrapUp, type Table,
} from '../../iselan/play'
import type { ModelCall } from '../../iselan/ai'
import EvidencePanel from '../interaction/EvidencePanel'
import GesturePanel from '../interaction/GesturePanel'
import Modal from '../interaction/Modal'
import { useInteraction } from '../interaction/useInteraction'
import Reader from '../reading/Reader'
import WorldPanels from '../world/WorldPanels'
import { directionName, GRAYPORT, pagesOf, statusLine } from './view'

export const JOURNEY_KEY = 'iselan-save'

const msg = (e: unknown) => String((e as Error)?.message ?? e)
const sign = (n: number) => (n > 0 ? `+${n}` : String(n))

function InteractionHost({ table, textId, instanceId, onSettled, onClose }: {
  table: Table
  textId: string
  instanceId: string
  onSettled: (t: Table) => void
  onClose: () => void
}) {
  const def = INTERACTIONS[textId]
  const tableRef = useRef(table)
  tableRef.current = table
  const settle = useCallback(async (req: InteractionRequest) => {
    const r = interact(tableRef.current, req)
    onSettled(r.table)
    return r.result
  }, [onSettled])
  const [s, dispatch] = useInteraction(instanceId, recordedResult(table.events, def, instanceId), settle)
  return (
    <Modal title={def.title} onClose={onClose} canClose={s.phase !== 'submitting'}>
      {def.template === 'evidence' ? (
        <EvidencePanel def={def} s={s} dispatch={dispatch} knownName="卢多的母亲" onClose={onClose} />
      ) : (
        <GesturePanel def={def} present={def.guests.map((g) => g.id)} s={s} dispatch={dispatch} onClose={onClose} />
      )}
    </Modal>
  )
}

/** The solo Grayport run on the new engine: reader, the next choices, and the world beside it. */
export default function Journey({ initial, model, aiLabel, onQuit }: { initial: Table; model: ModelCall | null; aiLabel: string; onQuit: () => void }) {
  const [table, setTable] = useState(initial)
  const [mark, setMark] = useState(() => initial.checkpoints.at(-1)?.screens ?? 0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [ix, setIx] = useState<{ textId: string; instanceId: string; from: number } | null>(null)
  const [showRewind, setShowRewind] = useState(false)
  const s = snapshotOf(table)

  useEffect(() => {
    try { localStorage.setItem(JOURNEY_KEY, saveTable(table)) } catch { setErr('本机存档失败：浏览器存储已满或被禁用') }
  }, [table])

  const batch = useMemo(() => pagesOf(table.screens.slice(mark)), [table.screens, mark])

  const run = async (op: (t: Table) => Table | Promise<Table>) => {
    if (busy) return
    setBusy(true)
    setErr(null)
    try {
      const before = table.screens.length
      const next = await op(table)
      setMark(next.screens.length >= before ? before : 0)
      setTable(next)
      setText('')
    } catch (e) {
      setErr(msg(e))
    } finally {
      setBusy(false)
    }
  }

  const onSettled = useCallback((t: Table) => setTable(t), [])
  const p = table.pending
  const me = table.party[table.turn]
  const ended = !!s.ending

  const freeAction = !p && !ended && (
    <div className="jy-act">
      {table.suggestions.length > 0 && (
        <div className="jy-suggest" aria-label="建议">
          {table.suggestions.map((x) => (
            <button key={x} className="btn ghost small" disabled={busy} onClick={() => setText(x)}>{x}</button>
          ))}
        </div>
      )}
      <form
        className="jy-input"
        onSubmit={(e) => {
          e.preventDefault()
          const said = text.trim()
          if (said) { sound.click(); void run((t) => act(t, said, model)) }
        }}
      >
        <label className="sr-only" htmlFor="jy-text">{me?.name}想做什么</label>
        <input id="jy-text" value={text} maxLength={200} placeholder={`${me?.name ?? '你'}想做什么？`} onChange={(e) => setText(e.target.value)} disabled={busy} />
        <button className="btn primary" disabled={busy || !text.trim()}>{busy ? '主持人正在想……' : '行动'}</button>
      </form>
      <div className="jy-places" aria-label="前往">
        {GRAYPORT.filter((x) => x.id !== s.location?.placeId).map((x) => (
          <button key={x.id} className="btn small" disabled={busy} onClick={() => void run((t) => move(t, x.id as PlaceId))}>去{x.name}</button>
        ))}
      </div>
      {outcomeOpen(s) && (
        <div className="jy-decide">
          <p className="small">潮井之下：你们决定——</p>
          {ARC_OUTCOMES.map((o: OutcomeId) => (
            <button key={o} className="btn small" disabled={busy} onClick={() => void run((t) => resolveArc(t, [o]))}>{outcomeLabel(o)}</button>
          ))}
        </div>
      )}
      <div className="jy-wrap small dim">
        有效选择 {s.seats[me.seatId]?.choices ?? 0} / {CONFIG.minChoicesPerSeat}
        {canWrapUp(table) && <button className="btn small" disabled={busy} onClick={() => void run((t) => wrapUp(t))}>收束故事</button>}
      </div>
    </div>
  )

  const end = (
    <>
      {freeAction}
      {p?.kind === 'check' && (() => {
        const m = table.party.find((x) => x.seatId === p.seatId)!
        return (
          <div className="jy-check">
            <p>{m.name} · {SKILL_OF_STAT[p.stat]}检定，难度 {p.request.difficulty}<span className="dim small">（{p.request.reason}）</span></p>
            <p className="small dim">掷 2d6 {sign(m.stats[p.stat])}</p>
            <button className="btn primary" disabled={busy} onClick={() => { sound.dice(); void run((t) => roll(t, model)) }}>掷骰</button>
          </div>
        )
      })()}
      {p?.kind === 'interaction' && (
        <div className="jy-check">
          <p>{INTERACTIONS[p.textId].title}</p>
          <button className="btn primary" data-autofocus onClick={() => setIx({ textId: p.textId, instanceId: p.instanceId, from: table.screens.length })}>{p.textId === 'GH-SCN-09' ? '入席' : '检视'}</button>
        </div>
      )}
      {p?.kind === 'ending' && (
        <div className="jy-check">
          <p>故事走到了这里。最后，它会被记成——</p>
          {p.candidates.map((d: DirectionId) => (
            <button key={d} className="btn primary" disabled={busy} onClick={() => void run((t) => chooseEnding(t, d))}>{directionName(d)}</button>
          ))}
        </div>
      )}
      {ended && s.ending && (
        <div className="jy-check">
          <p>结局：{directionName(s.ending.directionId)}{s.ending.variant === 'settle' ? '（落地）' : s.ending.variant === 'wander' ? '（远行）' : ''}</p>
          <p className="small dim">完整的结局页还在做；可以回退到之前的任一决定重新选择。</p>
          <button className="btn" onClick={onQuit}>回到标题</button>
        </div>
      )}
    </>
  )

  return (
    <div className="jy-screen">
      <header className="topbar">
        <div className="brand">伊瑟兰<small>灰港</small></div>
        <span className="dim small" aria-live="polite">{statusLine(s)}</span>
        <div className="row">
          <span className="dim small jy-ai">{aiLabel}</span>
          <button className="btn ghost small" onClick={() => setShowRewind(true)} disabled={busy || !table.checkpoints.length}>回退</button>
          <button className="btn ghost small" onClick={onQuit}>标题</button>
        </div>
      </header>
      {err && <div className="jy-error" role="alert">{err}<button className="link" onClick={() => setErr(null)}>知道了</button></div>}
      <main className="rd-layout">
        <Reader screens={batch} fallbackImage="GH-01" end={end} />
        <WorldPanels s={s} />
      </main>
      {ix && <InteractionHost table={table} textId={ix.textId} instanceId={ix.instanceId} onSettled={onSettled} onClose={() => { if (table.screens.length > ix.from) setMark(ix.from); setIx(null) }} />}
      {showRewind && (
        <Modal title="回到之前的决定" onClose={() => setShowRewind(false)}>
          <p className="small dim">回到某个决定之前，之后发生的事都会撤销。已经解锁的成就会保留。</p>
          <ol className="jy-rewind">
            {[...table.checkpoints].reverse().map((c) => (
              <li key={c.id}>
                <button className="btn ghost small" onClick={() => { setShowRewind(false); setMark(c.screens); setTable(rewind(table, c.id)) }}>
                  第 {c.round} 轮 · {c.label}
                </button>
              </li>
            ))}
          </ol>
        </Modal>
      )}
    </div>
  )
}
