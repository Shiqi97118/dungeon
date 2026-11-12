import { sound } from '../audio/sound'

interface Props {
  hasSave: boolean
  onNew: () => void
  onResume: () => void
  onSettings: () => void
  muted: boolean
  onMute: () => void
  onOnline: () => void
  roomCode?: string
  onRejoin: () => void
}

export default function Title({ hasSave, onNew, onResume, onSettings, muted, onMute, onOnline, roomCode, onRejoin }: Props) {
  return (
    <main className="title-screen">
      <div className="title-content">
        <hgroup lang="en">
          <h1 className="title-main">Iselan</h1>
          <p className="title-sub">Grayport</p>
        </hgroup>
        <nav className="title-buttons" aria-label="游戏菜单">
          {hasSave && <button className="btn big" onClick={() => { sound.init(); onResume() }}>继续单人进度</button>}
          <button className="btn primary big" onClick={() => { sound.init(); sound.bell(293.66, 0.25); onNew() }}>单人冒险</button>
          <button className="btn big" onClick={() => { sound.init(); sound.bell(329.63, 0.25); onOnline() }}>与朋友联机</button>
          {roomCode && <button className="btn big" onClick={() => { sound.init(); onRejoin() }}>回到房间 {roomCode}</button>}
        </nav>
        <div className="title-meta">
          <button className="link" onClick={onSettings}>AI 设置</button>
          <button className="link" onClick={onMute}>声音：{muted ? '关' : '开'}</button>
        </div>
      </div>
    </main>
  )
}
