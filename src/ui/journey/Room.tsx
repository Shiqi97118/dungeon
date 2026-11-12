import { useCallback, useEffect, useMemo, useState } from 'react'
import { sound } from '../../audio/sound'
import { InteractionRejected } from '../../iselan/interaction'
import { PREGENS, unpackTable, type Table } from '../../iselan/play'
import { ApiError, api, type RoomView, type Seat } from '../../net/api'
import { profileApi } from '../../net/profile'
import { isOnline, type RoomConn } from '../../net/useRoom'
import ChatDock from '../Chat'
import { JourneyTable, type Send, type TableSeat } from './Journey'
import type { RunRecordView } from './EndingSummary'

/** Before the story: share the code, each player picks a character, and the host starts. */
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
          <p className="lead">每人选一名角色，一桌最多四人。未选角色的玩家可以旁观。</p>

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
                  {owner && <span className="small dim">{mine ? '已选 · 点击取消' : `${owner.name} 已选`}</span>}
                </button>
              )
            })}
          </div>

          {error && <div className="error">{error}</div>}
          <div className="row end">
            <button className="btn ghost" onClick={onLeave}>离开房间</button>
            {isHost
              ? <button className="btn primary big" disabled={busy || !picked} onClick={() => { sound.bell(220, 0.3); op(() => api.start(seat)) }}>进入七灯酒馆</button>
              : <span className="dim">{me?.pick ? `等待房主 ${host?.name} 开始……` : '选一名角色，或者留下来旁观'}</span>}
          </div>
        </div>
      </div>
      <ChatDock chat={room.chat} meId={seat.pid} onSend={async (t) => { await api.chat(seat, t); conn.refresh() }} />
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

  const send = useCallback<Send>(async (op, seatId) => {
    try {
      const r = await api.play(seat, seatId, op)
      return r.result
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) throw new InteractionRejected(e.message)
      throw e
    } finally {
      conn.refresh()
    }
  }, [seat, conn.refresh])

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

  const side = (
    <>
      <span className="dim small">房间 {room.code}{me?.seat ? '' : ' · 旁观'}</span>
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
    </>
  )
}
