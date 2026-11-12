import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { sound } from '../../audio/sound'
import { CONFIG } from '../../iselan/config'
import type { OutcomeId, PlaceId } from '../../iselan/data'
import { recordedResult, type InteractionRequest, type InteractionResult } from '../../iselan/interaction'
import {
  applyOp, ARC_OUTCOMES, canWrapUp, directionName, INTERACTIONS, outcomeLabel, outcomeOpen, rewindNeedsVote, rewindVoters,
  saveTable, seatsFor, SKILL_OF_STAT, snapshotOf, tableSaveFile, type EndingCall, type Models, type Table, type TableOp,
} from '../../iselan/play'
import type { ModelCall } from '../../iselan/ai'
import { profileApi } from '../../net/profile'
import EndingSummary, { type RunRecordView } from './EndingSummary'
import EvidencePanel from '../interaction/EvidencePanel'
import GesturePanel from '../interaction/GesturePanel'
import Modal from '../interaction/Modal'
import { useInteraction } from '../interaction/useInteraction'
import Reader from '../reading/Reader'
import WorldPanels from '../world/WorldPanels'
import { GRAYPORT, pagesOf, statusLine } from './view'

export const JOURNEY_KEY = 'iselan-save'

const msg = (e: unknown) => String((e as Error)?.message ?? e)
const sign = (n: number) => (n > 0 ? `+${n}` : String(n))

/** Sends one op as `seatId`; resolves with the interaction result when the op settled one. */
export type Send = (op: TableOp, seatId: string) => Promise<InteractionResult | null>

function InteractionHost({ table, textId, instanceId, settle, onClose }: {
  table: Table
  textId: string
  instanceId: string
  settle: (req: InteractionRequest) => Promise<InteractionResult>
  onClose: () => void
}) {
  const def = INTERACTIONS[textId]
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

export interface TableSeat {
  /** The seat this viewer plays, or null when watching. */
  readonly mine: string | null
  /** Whether this viewer may act for a seat now (its own, or one whose player is away). */
  readonly canPlay: (seatId: string) => boolean
  /** Who plays a seat, for “waiting for …”. */
  readonly playerOf?: (seatId: string) => string | undefined
}

/**
 * One Grayport run on the new engine: reader, the next choices, and the world beside it. The
 * table comes from outside (the browser's own for solo, the room's for online); every change
 * goes through `send`.
 */
export function JourneyTable({ table, send, seat, aiLabel, hasAi, record, notice, side, onQuit }: {
  table: Table
  send: Send
  seat: TableSeat
  aiLabel: string
  hasAi: boolean
  record: () => Promise<RunRecordView>
  /** Connection or room problems, shown above the reader. */
  notice?: string | null
  /** Extra controls in the top bar, e.g. the room code and chat. */
  side?: ReactNode
  onQuit: () => void
}) {
  const [mark, setMark] = useState(() => table.checkpoints.at(-1)?.screens ?? 0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [ix, setIx] = useState<{ textId: string; instanceId: string } | null>(null)
  const [showRewind, setShowRewind] = useState(false)
  const [summary, setSummary] = useState(() => !!snapshotOf(table).ending)
  const s = snapshotOf(table)
  const seen = useRef(table.screens.length)

  // A new batch starts where the last one ended; a rewind cuts back and adds one note.
  useEffect(() => {
    const before = seen.current
    const now = table.screens.length
    if (now !== before && !ix) setMark(now > before ? before : Math.max(0, now - 1))
    if (now < before) setSummary(false)
    if (!ix) seen.current = now
  }, [table.screens, ix])

  const batch = useMemo(() => pagesOf(table.screens.slice(mark)), [table.screens, mark])

  /** The seat to send `op` as: the viewer's own when any seat may, otherwise the one the op belongs to. */
  const seatFor = (op: TableOp): string | null => {
    const allowed = seatsFor(table, op)
    if (allowed === 'any' || op.t === 'propose' || op.t === 'vote') return seat.mine && (allowed === 'any' || allowed.includes(seat.mine)) ? seat.mine : null
    return allowed.find((x) => seat.canPlay(x)) ?? null
  }
  const can = (op: TableOp) => !busy && !!seatFor(op)

  const run = async (op: TableOp) => {
    const id = seatFor(op)
    if (busy || !id) return
    setBusy(true)
    setErr(null)
    try {
      await send(op, id)
      if (op.t === 'act') setText('')
    } catch (e) {
      setErr(msg(e))
    } finally {
      setBusy(false)
    }
  }

  const settle = useCallback(async (req: InteractionRequest) => {
    const op: TableOp = { t: 'interact', req }
    const r = await send(op, seatFor(op) ?? seat.mine ?? '')
    if (!r) throw new Error('互动没有结果')
    return r
  }, [send, table, seat])

  const p = table.pending
  const me = table.party[table.turn]
  const ended = !!s.ending
  const myTurn = !!me && seat.canPlay(me.seatId)
  const waiting = (seatId: string, what: string) => {
    const m = table.party.find((x) => x.seatId === seatId)
    const who = seat.playerOf?.(seatId)
    return <p className="small dim" role="status">等待{m?.name ?? ''}{who ? `（${who}）` : ''}{what}……</p>
  }

  const freeAction = !p && !ended && (myTurn ? (
    <div className="jy-act">
      {table.party.length > 1 && <p className="small jy-turn">轮到{me.name}了。</p>}
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
          if (said) { sound.click(); void run({ t: 'act', text: said }) }
        }}
      >
        <label className="sr-only" htmlFor="jy-text">{me?.name}想做什么</label>
        <input id="jy-text" value={text} maxLength={200} placeholder={`${me?.name ?? '你'}想做什么？`} onChange={(e) => setText(e.target.value)} disabled={busy} />
        <button className="btn primary" disabled={busy || !text.trim()}>{busy ? '主持人正在想……' : '行动'}</button>
      </form>
      <div className="jy-places" aria-label="前往">
        {GRAYPORT.filter((x) => x.id !== s.location?.placeId).map((x) => (
          <button key={x.id} className="btn small" disabled={busy} onClick={() => void run({ t: 'move', placeId: x.id as PlaceId })}>去{x.name}</button>
        ))}
      </div>
      {outcomeOpen(s) && (
        <div className="jy-decide">
          <p className="small">潮井之下：你们决定——</p>
          {ARC_OUTCOMES.map((o: OutcomeId) => (
            <button key={o} className="btn small" disabled={busy} onClick={() => void run({ t: 'resolve', outcomes: [o] })}>{outcomeLabel(o)}</button>
          ))}
        </div>
      )}
      <div className="jy-wrap small dim">
        有效选择 {s.seats[me.seatId]?.choices ?? 0} / {CONFIG.minChoicesPerSeat}
        {canWrapUp(table) && <button className="btn small" disabled={busy} onClick={() => void run({ t: 'wrap' })}>收束故事</button>}
      </div>
    </div>
  ) : me && waiting(me.seatId, '行动'))

  const end = (
    <>
      {freeAction}
      {p?.kind === 'check' && (() => {
        const m = table.party.find((x) => x.seatId === p.seatId)!
        return (
          <div className="jy-check">
            <p>{m.name} · {SKILL_OF_STAT[p.stat]}检定，难度 {p.request.difficulty}<span className="dim small">（{p.request.reason}）</span></p>
            <p className="small dim">掷 2d6 {sign(m.stats[p.stat])}</p>
            {can({ t: 'roll' })
              ? <button className="btn primary" disabled={busy} onClick={() => { sound.dice(); void run({ t: 'roll' }) }}>掷骰</button>
              : waiting(p.seatId, '掷骰')}
          </div>
        )
      })()}
      {p?.kind === 'interaction' && (
        <div className="jy-check">
          <p>{INTERACTIONS[p.textId].title}</p>
          {seat.canPlay(p.seatId)
            ? <button className="btn primary" data-autofocus onClick={() => setIx({ textId: p.textId, instanceId: p.instanceId })}>{p.textId === 'GH-SCN-09' ? '入席' : '检视'}</button>
            : waiting(p.seatId, '处理这一幕')}
        </div>
      )}
      {p?.kind === 'ending' && (
        <div className="jy-check">
          <p>故事走到了这里。世界可能朝这些方向倾斜：{p.candidates.map(directionName).join('、')}。</p>
          <p className="small dim">{hasAi ? '主持人会读完你们这一路做过的事，写下结局。' : '离线主持会按你们这一路的倾向写下结局。'}</p>
          {can({ t: 'adjudicate' })
            ? <button className="btn primary" disabled={busy} onClick={() => void run({ t: 'adjudicate' })}>{busy ? '主持人正在落笔……' : '写下结局'}</button>
            : <p className="small dim">等待在座的玩家写下结局……</p>}
        </div>
      )}
      {p?.kind === 'rewind' && (() => {
        const cp = table.checkpoints.find((c) => c.id === p.checkpointId)
        const by = table.party.find((m) => m.seatId === p.by)?.name ?? ''
        const voting = !!seat.mine && rewindVoters(table).includes(seat.mine) && !p.agreed.includes(seat.mine)
        return (
          <div className="jy-check">
            <p>回退表决：{by}提议回到第 {cp?.round} 轮</p>
            <p className="small dim">已同意：{p.agreed.map((id) => table.party.find((m) => m.seatId === id)?.name).join('、')}</p>
            {voting ? (
              <div className="row">
                <button className="btn primary" disabled={busy} onClick={() => void run({ t: 'vote', agree: true })}>同意回退</button>
                <button className="btn ghost" disabled={busy} onClick={() => void run({ t: 'vote', agree: false })}>不同意</button>
              </div>
            ) : <p className="small dim">等待其他人表决……</p>}
          </div>
        )
      })()}
      {ended && (
        <div className="jy-check">
          <button className="btn primary" onClick={() => setSummary(true)}>查看结局</button>
        </div>
      )}
    </>
  )

  const voteNeeded = rewindNeedsVote(table)
  const rewindTo = (checkpointId: string) => {
    setShowRewind(false)
    void run(voteNeeded ? { t: 'propose', checkpointId } : { t: 'rewind', checkpointId })
  }

  return (
    <div className="jy-screen">
      <header className="topbar">
        <div className="brand">伊瑟兰<small>灰港</small></div>
        <span className="dim small" aria-live="polite">{statusLine(s)}</span>
        <div className="row">
          <span className="dim small jy-ai">{aiLabel}</span>
          {side}
          <button className="btn ghost small" onClick={() => setShowRewind(true)} disabled={busy || !table.checkpoints.length || !seat.mine || p?.kind === 'rewind'}>回退</button>
          <button className="btn ghost small" onClick={onQuit}>标题</button>
        </div>
      </header>
      {(err || notice) && <div className="jy-error" role="alert">{err ?? notice}{err && <button className="link" onClick={() => setErr(null)}>知道了</button>}</div>}
      {ended && summary ? (
        <main className="jy-ending-main">
          <EndingSummary table={table} record={record} onReread={() => setSummary(false)} onRewind={() => setShowRewind(true)} onQuit={onQuit} />
        </main>
      ) : (
        <main className="rd-layout">
          <Reader screens={batch} fallbackImage="GH-01" end={end} />
          <WorldPanels s={s} />
        </main>
      )}
      {ix && <InteractionHost table={table} textId={ix.textId} instanceId={ix.instanceId} settle={settle} onClose={() => setIx(null)} />}
      {showRewind && (
        <Modal title="回到之前的决定" onClose={() => setShowRewind(false)}>
          <p className="small dim">
            回到某个决定之前，之后发生的事都会撤销。已经解锁的成就会保留。
            {voteNeeded && '联机局要在座的每位玩家都同意才会回退。'}
          </p>
          <ol className="jy-rewind">
            {[...table.checkpoints].reverse().map((c) => (
              <li key={c.id}>
                <button className="btn ghost small" onClick={() => rewindTo(c.id)}>第 {c.round} 轮 · {c.label}</button>
              </li>
            ))}
          </ol>
        </Modal>
      )}
    </div>
  )
}

const SOLO: TableSeat = { mine: 's1', canPlay: () => true }

/** Solo: the table lives in this browser and saves itself after every change. */
export default function Journey({ initial, models, aiLabel, onQuit }: {
  initial: Table
  models: { readonly turn: ModelCall; readonly ending: EndingCall } | null
  aiLabel: string
  onQuit: () => void
}) {
  const [table, setTable] = useState(initial)
  const [notice, setNotice] = useState<string | null>(null)
  const ref = useRef(table)

  useEffect(() => {
    try { localStorage.setItem(JOURNEY_KEY, saveTable(table)); setNotice(null) } catch { setNotice('本机存档失败：浏览器存储已满或被禁用') }
  }, [table])

  const send = useCallback<Send>(async (op, seatId) => {
    const m: Models = models ?? { turn: null, ending: null }
    const r = await applyOp(ref.current, op, seatId, m)
    ref.current = r.table
    setTable(r.table)
    return r.result ?? null
  }, [models])

  const record = useCallback(async (): Promise<RunRecordView> => {
    const r = await profileApi.uploadRun(tableSaveFile(ref.current))
    return { view: r.achievements, earned: r.earned, unverified: r.verified ? null : r.reason }
  }, [])

  return <JourneyTable table={table} send={send} seat={SOLO} aiLabel={aiLabel} hasAi={!!models} record={record} notice={notice} onQuit={onQuit} />
}
