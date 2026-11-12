import { useCallback, useEffect, useMemo, useState } from 'react'
import { sound } from '../../audio/sound'
import { InteractionRejected } from '../../iselan/interaction'
import { CONFIG } from '../../iselan/config'
import { PREGENS, SKILL_OF_STAT, STAT_ORDER, snapshotOf, unpackTable, type Table } from '../../iselan/play'
import { ApiError, api, type RoomView, type Seat } from '../../net/api'
import { profileApi } from '../../net/profile'
import { isOnline, type RoomConn } from '../../net/useRoom'
import ChatDock from '../Chat'
import { JourneyTable, type Send, type TableSeat } from './Journey'
import type { RunRecordView } from './EndingSummary'
import { HOOKS } from './view'

const sign = (n: number) => (n > 0 ? `+${n}` : String(n))
/** Matches the server's limit in server/rooms.ts. */
const MAX_SEATS = 4

/** Before the story: share the code, each player picks a character, the host picks the hook and starts. */
export function RoomLobby({ room, seat, conn, busy, error, op, onLeave }: {
  room: RoomView
  seat: Seat
  conn: RoomConn
  busy: boolean
  error: string | null
  op: (fn: () => Promise<unknown>) => void
  onLeave: () => void
}) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const isHost = room.hostId === seat.pid
  const me = room.players.find((p) => p.id === seat.pid)
  const link = `${location.origin}${location.pathname}?room=${room.code}`
  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? room.code : link)
      setCopied(what)
      setTimeout(() => setCopied(null), 1600)
    } catch { /* clipboard blocked */ }
  }
  const host = room.players.find((p) => p.id === room.hostId)
  const picked = room.players.filter((p) => p.pick).length

  return (
    <div className="setup-screen">
      <div className="setup-wrap">
        <div className="panel setup-panel wide fade-in">
          <div className="lobby-head">
            <div>
              <div className="modal-kicker">房间</div>
              <div className="room-code" onClick={() => copy('code')} title="点击复制">{room.code.split('').map((ch, i) => <span key={i}>{ch}</span>)}</div>
            </div>
            <div className="lobby-share">
              <button className="btn" onClick={() => copy('code')}>{copied === 'code' ? '已复制房间码' : '复制房间码'}</button>
              <button className="btn" onClick={() => copy('link')}>{copied === 'link' ? '已复制邀请链接' : '复制邀请链接'}</button>
            </div>
          </div>
          <p className="lead">把房间码发给朋友。每人选<b>一名</b>角色，一桌最多四人；没选角色的人旁观。大家按座次轮流行动，掉线的人由在座的其他人代为行动。</p>

          <div className="lobby-players">
            {room.players.map((p) => (
              <span key={p.id} className={`lobby-player ${isOnline(conn.presence, p.id, conn.skew) ? 'on' : ''} ${p.id === seat.pid ? 'me' : ''}`}>
                <i />{p.name}{p.id === room.hostId && <small>房主</small>}{p.id === seat.pid && <small>你</small>}
                {p.pick && <small>{PREGENS.find((g) => g.id === p.pick)?.name}</small>}
              </span>
            ))}
          </div>

          <h3>选你的角色</h3>
          <div className="jy-cards" role="radiogroup" aria-label="角色">
            {PREGENS.map((g) => {
              const owner = room.players.find((p) => p.pick === g.id)
              const mine = owner?.id === seat.pid
              return (
                <button
                  key={g.id}
                  role="radio"
                  aria-checked={mine}
                  className={'jy-card' + (mine ? ' on' : '') + (owner && !mine ? ' taken' : '')}
                  disabled={busy || (!!owner && !mine)}
                  onClick={() => { sound.click(); op(() => api.pick(seat, mine ? null : g.id)) }}
                >
                  <b>{g.name}</b><small>{g.title}</small>
                  <span className="dim small">{g.motive}</span>
                  <span className="small">{STAT_ORDER.map((k) => `${SKILL_OF_STAT[k]} ${sign(g.stats[k])}`).join(' ')}</span>
                  <span className="small dim">{owner ? (mine ? '你扮演这名角色 · 点击放弃' : `${owner.name} 已选`) : '点击选择'}</span>
                </button>
              )
            })}
          </div>

          <h3>是什么把你们带到这里</h3>
          <div className="jy-cards" role="radiogroup" aria-label="开场">
            {HOOKS.map((h) => (
              <button
                key={h.id}
                role="radio"
                aria-checked={room.hook === h.id}
                className={'jy-card' + (room.hook === h.id ? ' on' : '')}
                disabled={busy || !isHost}
                onClick={() => { sound.click(); op(() => api.hook(seat, h.id)) }}
              >
                <b>{h.label}</b>
                <span className="dim small">{h.text}</span>
              </button>
            ))}
          </div>

          {error && <div className="error">{error}</div>}
          <div className="row end">
            <button className="btn ghost" onClick={onLeave}>离开房间</button>
            {isHost
              ? <button className="btn primary big" disabled={busy || !picked} onClick={() => { sound.bell(220, 0.3); op(() => api.start(seat)) }}>推开酒馆的门</button>
              : <span className="dim">{me?.pick ? `等待房主 ${host?.name} 开始……` : '选一名角色，或者留下来旁观'}</span>}
          </div>
        </div>
      </div>
      <ChatDock chat={room.chat} meId={seat.pid} onSend={async (t) => { await api.chat(seat, t); conn.refresh() }} />
    </div>
  )
}

/** R1a: a watcher brings a free pre-made character into the running story. */
function JoinPanel({ table, onPick, onClose }: { table: Table; onPick: (id: string) => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const free = PREGENS.filter((g) => !table.party.some((m) => m.actorId === g.id))
  const pick = async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      await onPick(id)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-kicker">加入这一局</div>
        <h3>带一名角色走进故事</h3>
        <p className="dim small">新加入的角色从在座者里最少的选择数算起，要亲手做满 {CONFIG.minOwnChoicesAfterJoin} 件事，大家才能一起收束故事。之前的回退点会清空。</p>
        <div className="jy-cards">
          {free.map((g) => (
            <button key={g.id} className="jy-card" disabled={busy} onClick={() => { sound.click(); void pick(g.id) }}>
              <b>{g.name}</b><small>{g.title}</small>
              <span className="dim small">{g.motive}</span>
              <span className="small">{STAT_ORDER.map((k) => `${SKILL_OF_STAT[k]} ${sign(g.stats[k])}`).join(' ')}</span>
            </button>
          ))}
        </div>
        {error && <div className="error">{error}</div>}
        <div className="row end"><button className="btn ghost" onClick={onClose}>继续旁观</button></div>
      </div>
    </div>
  )
}

/** The shared table: everyone reads the same story; each acts for their own seat. */
export function RoomJourney({ room, seat, conn, onLeave, onQuit }: {
  room: RoomView
  seat: Seat
  conn: RoomConn
  onLeave: () => void
  onQuit: () => void
}) {
  const [table, setTable] = useState<Table | null | 'bad'>(null)
  const [joining, setJoining] = useState(false)
  useEffect(() => {
    let live = true
    if (room.table) unpackTable(room.table).then((r) => { if (live) setTable(r.status === 'ok' ? r.table : 'bad') }, () => live && setTable('bad'))
    return () => { live = false }
  }, [room.table])
  const me = room.players.find((p) => p.id === seat.pid)
  const ownerOf = useCallback((seatId: string) => room.players.find((p) => p.seat === seatId), [room.players])

  const tableSeat = useMemo<TableSeat>(() => ({
    mine: me?.seat ?? null,
    canPlay: (seatId) => {
      if (!me?.seat) return false
      const owner = ownerOf(seatId)
      return !owner || owner.id === seat.pid || !isOnline(conn.presence, owner.id, conn.skew)
    },
    playerOf: (seatId) => ownerOf(seatId)?.name,
  }), [me?.seat, ownerOf, seat.pid, conn.presence, conn.skew])

  const at = table && table !== 'bad' ? table.events.length : undefined
  const send = useCallback<Send>(async (op, seatId) => {
    try {
      // An interaction step is idempotent by its request id, so its retries must not be dropped as stale.
      const r = await api.play(seat, seatId, op, op.t === 'interact' ? undefined : at)
      return r.result
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) throw new InteractionRejected(e.message)
      throw e
    } finally {
      conn.refresh()
    }
  }, [seat, conn.refresh, at])

  const earned = room.judged[seat.pid]
  const record = useCallback(async (): Promise<RunRecordView> => {
    if (!me?.seat) throw new Error('旁观者不记录成就')
    const view = await profileApi.achievements()
    return { view, earned: earned ?? [], unverified: earned ? null : '房间没有连上档案服务，这一局的成就没有记录' }
  }, [me?.seat, earned])

  if (!table) return <div className="setup-screen"><div className="setup-wrap narrow"><div className="panel setup-panel"><h2>正在入座……</h2></div></div></div>
  if (table === 'bad') {
    return (
      <div className="setup-screen"><div className="setup-wrap narrow"><div className="panel setup-panel">
        <h2>这个房间的进度读不出来</h2>
        <div className="row end"><button className="btn primary" onClick={onLeave}>离开房间</button></div>
      </div></div></div>
    )
  }

  const seated = table.party.filter((m) => snapshotOf(table).seats[m.seatId]?.controller !== 'empty').length
  const canJoin = !me?.seat && !snapshotOf(table).ending && seated < MAX_SEATS && table.pending?.kind !== 'rewind'
  const side = (
    <>
      <span className="dim small">房间 {room.code}{me?.seat ? '' : ' · 旁观'}</span>
      {canJoin && <button className="btn small" onClick={() => setJoining(true)}>加入这一局</button>}
      <button className="btn ghost small" onClick={onLeave}>离开房间</button>
    </>
  )
  return (
    <>
      <JourneyTable
        table={table}
        send={send}
        seat={tableSeat}
        aiLabel={room.aiOn ? 'AI 主持人 · 在线' : '离线主持'}
        hasAi={room.aiOn}
        record={record}
        notice={conn.error && !conn.fatal ? `连接不稳定：${conn.error}` : null}
        side={side}
        onQuit={onQuit}
      />
      <ChatDock chat={room.chat} meId={seat.pid} onSend={async (t) => { await api.chat(seat, t); conn.refresh() }} />
      {joining && <JoinPanel table={table} onPick={async (id) => { await api.pick(seat, id); conn.refresh() }} onClose={() => setJoining(false)} />}
    </>
  )
}
