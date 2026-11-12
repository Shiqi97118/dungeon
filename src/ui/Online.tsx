import { useEffect, useState } from 'react'
import type { ServerInfo } from '../net/api'
import { sound } from '../audio/sound'
import Atmosphere from './Atmosphere'

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
      <div className="title-bg dim" style={{ backgroundImage: 'url(art/story/GH-01.jpg)' }} />
      <Atmosphere mode="rain" />
      <div className="setup-wrap narrow">
        <div className="panel setup-panel fade-in online-panel">
          <div className="modal-kicker">联机跑团</div>
          <h2>和朋友一起去灰港</h2>
          <p className="lead">一人开房，把<b>房间码</b>或链接发给朋友；每人选一名角色，按座次轮流行动。大家读的是同一段故事，回退要在座的人都同意。</p>
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
              <p className="dim">你当房主，决定什么时候出发。</p>
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
