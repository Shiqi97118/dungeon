import { useEffect, useState } from 'react'
import { STAT_NAMES, STAT_ORDER } from '../game/types'
import type { RoomView, ServerInfo } from '../net/api'
import { isOnline } from '../net/useRoom'
import { sound } from '../audio/sound'
import Atmosphere from './Atmosphere'
import ChatDock from './Chat'
import { Sigil, fmt } from './bits'

export function OnlineEntry({ info, initialCode, busy, error, onCreate, onJoin, onBack }: {
  info: ServerInfo | null | undefined
  initialCode: string
  busy: boolean
  error: string | null
  onCreate: (name: string) => void
  onJoin: (code: string, name: string) => void
  onBack: () => void
}) {
  const [name, setName] = useState(() => localStorage.getItem('echo-well-nick') ?? '')
  const [code, setCode] = useState(initialCode)
  useEffect(() => {
    if (!name && info?.me.name) setName(info.me.name.slice(0, 12))
  }, [info])
  const remember = () => localStorage.setItem('echo-well-nick', name.trim())
  const ready = info?.online
  const cleanCode = code.trim().toUpperCase()

  return (
    <div className="setup-screen">
      <div className="title-bg dim" style={{ backgroundImage: 'url(art/camp.jpg)' }} />
      <Atmosphere mode="rain" />
      <div className="setup-wrap narrow">
        <div className="panel setup-panel fade-in online-panel">
          <div className="modal-kicker">联机跑团</div>
          <h2>和朋友一起下井</h2>
          <p className="lead">一人开房选好队伍，把<b>房间码</b>或链接发给朋友；每个人认领一名角色。按<b>先攻顺序</b>轮流行动——灵巧越高、状态越好，越先出手。</p>
          {info === undefined && <div className="notice">正在连接联机服务……</div>}
          {info !== undefined && !ready && (
            <div className="notice warn">
              <div className="notice-title">联机服务不可用</div>
              联机需要应用部署在带数据库的服务器上（例如按 README 部署到 Cloudflare）。当前页面是纯静态版本，可以先玩单人模式。
            </div>
          )}
          <div className="field">
            <div className="field-label">你的昵称</div>
            <input className="input" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} placeholder="朋友们会看到这个名字" />
          </div>
          <div className="online-split">
            <div className="online-card">
              <h3>开一个房间</h3>
              <p className="dim">你来选队伍、当房主。没人认领的角色由 AI 同伴扮演。</p>
              <button className="btn primary big" disabled={!ready || busy || !name.trim()} onClick={() => { remember(); sound.bell(293.66, 0.2); onCreate(name.trim()) }}>创建房间</button>
            </div>
            <div className="online-card">
              <h3>加入朋友的房间</h3>
              <input className="input code-input" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="6 位房间码" />
              <button className="btn big" disabled={!ready || busy || !name.trim() || cleanCode.length !== 6} onClick={() => { remember(); sound.bell(329.63, 0.2); onJoin(cleanCode, name.trim()) }}>加入</button>
            </div>
          </div>
          {error && <div className="error">{error}</div>}
          <div className="row end">
            <button className="btn ghost" onClick={onBack}>返回</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Lobby({ room, meId, presence, skew, busy, error, onClaim, onRelease, onStart, onLeave, onChat }: {
  room: RoomView
  meId: string
  presence: Record<string, number>
  skew: number
  busy: boolean
  error: string | null
  onClaim: (charId: string) => void
  onRelease: (charId: string) => void
  onStart: () => void
  onLeave: () => void
  onChat: (text: string) => Promise<void>
}) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const isHost = room.hostId === meId
  const link = `${location.origin}${location.pathname}?room=${room.code}`
  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? room.code : link)
      setCopied(what)
      setTimeout(() => setCopied(null), 1600)
    } catch { /* clipboard blocked */ }
  }
  const host = room.players.find((p) => p.id === room.hostId)
  const unclaimed = room.state.party.filter((c) => !room.players.some((p) => p.seats.includes(c.id)))

  return (
    <div className="setup-screen">
      <div className="title-bg dim" style={{ backgroundImage: 'url(art/gate.jpg)' }} />
      <Atmosphere mode="rain" />
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
          <p className="lead">把房间码发给朋友。每人点击一张角色卡认领<b>一名</b>角色（再点另一张就是换人）。{unclaimed.length > 0 && <>没人认领的 <b>{unclaimed.map((c) => c.name).join('、')}</b> 将由 AI 同伴扮演；有人掉线时，AI 也会暂时接手。</>}</p>

          <div className="lobby-players">
            {room.players.map((p) => (
              <span key={p.id} className={`lobby-player ${isOnline(presence, p.id, skew) ? 'on' : ''} ${p.id === meId ? 'me' : ''}`}>
                <i />{p.name}{p.id === room.hostId && <small>房主</small>}{p.id === meId && <small>你</small>}
              </span>
            ))}
          </div>

          <div className="pregen-grid seats">
            {room.state.party.map((c) => {
              const owner = room.players.find((p) => p.seats.includes(c.id))
              const mine = owner?.id === meId
              return (
                <button
                  key={c.id}
                  className={`pregen seat ${mine ? 'sel' : ''} ${owner && !mine ? 'taken' : ''}`}
                  style={{ ['--hue' as string]: c.hue }}
                  disabled={busy || (!!owner && !mine)}
                  onClick={() => { sound.click(); if (mine) onRelease(c.id); else onClaim(c.id) }}
                >
                  <div className="pregen-head">
                    <Sigil c={c} size={46} />
                    <div>
                      <div className="pregen-name">{c.name}</div>
                      <div className="pregen-title">{c.title}</div>
                    </div>
                  </div>
                  <div className="stat-row">
                    {STAT_ORDER.map((s) => (
                      <div key={s} className={`stat v${c.stats[s]} ${s === 'dex' ? 'hl' : ''}`}><span>{STAT_NAMES[s]}</span><b>{fmt(c.stats[s])}</b></div>
                    ))}
                  </div>
                  <div className="chips">
                    {c.specialties.map((s) => <span key={s} className="chip spec">{s}</span>)}
                    {c.items.map((s) => <span key={s} className="chip item">{s}</span>)}
                  </div>
                  <div className="pregen-motive">“{c.reason}”</div>
                  <div className={`seat-owner ${owner ? 'has' : ''}`}>{owner ? (mine ? '你扮演这名角色 · 点击放弃' : `${owner.name} 已认领`) : 'AI 同伴 · 点击认领'}</div>
                </button>
              )
            })}
          </div>

          <div className="rules-card">
            <div className="rules-title">回合制规则</div>
            <div className="rules-grid">
              <div><b>先攻 = 灵巧×2 + 1d6</b><br />每轮重新掷。中毒 -2、失温 -2、迷失 -3；刚刚大成功的人获得「专注」+2。</div>
              <div><b>一回合一件事</b><br />调查、交谈、移动、休息或自由行动，结算完就轮到下一位。</div>
              <div><b>昏迷与离场</b><br />昏迷的人跳过回合，可以由同伴「唤醒」；暂时退出的人到下一个地点才回来。</div>
            </div>
          </div>

          {error && <div className="error">{error}</div>}
          <div className="row end">
            <button className="btn ghost" onClick={onLeave}>离开房间</button>
            {isHost
              ? <button className="btn primary big" disabled={busy} onClick={() => { sound.bell(220, 0.3); onStart() }}>开始冒险</button>
              : <span className="dim">等待房主 {host?.name} 开始……</span>}
          </div>
        </div>
      </div>
      <ChatDock chat={room.chat} meId={meId} onSend={onChat} />
    </div>
  )
}
