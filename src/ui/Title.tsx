import Atmosphere from './Atmosphere'
import { sound } from '../audio/sound'

interface Props {
  hasSave: boolean
  onNew: () => void
  onResume: () => void
  onSettings: () => void
  muted: boolean
  onMute: () => void
  aiLabel: string
  onOnline: () => void
  roomCode?: string
  onRejoin: () => void
}

export default function Title({ hasSave, onNew, onResume, onSettings, muted, onMute, aiLabel, onOnline, roomCode, onRejoin }: Props) {
  const ring = () => {
    sound.init()
    sound.bell(220, 0.3)
  }
  return (
    <div className="title-screen">
      <div className="title-bg" style={{ backgroundImage: 'url(art/story/GH-01.jpg)' }} />
      <div className="title-vignette" />
      <Atmosphere mode="rain" />
      <div className="title-content">
        <div className="title-kicker">一场原创的文字跑团 · AI 主持</div>
        <h1 className="title-main" onClick={ring} data-echo="伊瑟兰">伊瑟兰</h1>
        <div className="title-sub">灰 港</div>
        <p className="title-tag">
          第六声之后，全大陆都在等第七声。
          <br />
          <em>今夜的灰港下着暴雨。七灯酒馆里，七盏灯只亮了六盏。</em>
        </p>
        <div className="title-buttons">
          <button className="btn primary big" onClick={() => { sound.init(); sound.bell(293.66, 0.25); onNew() }}>单人冒险</button>
          <button className="btn big online" onClick={() => { sound.init(); sound.bell(329.63, 0.25); onOnline() }}>与朋友联机</button>
          {roomCode && <button className="btn big" onClick={() => { sound.init(); onRejoin() }}>回到房间 {roomCode}</button>}
          {hasSave && <button className="btn big" onClick={() => { sound.init(); onResume() }}>继续单人进度</button>}
        </div>
        <div className="title-meta">
          <button className="link" onClick={onSettings}>{aiLabel}</button>
          <span>·</span>
          <button className="link" onClick={onMute}>声音：{muted ? '关' : '开'}</button>
        </div>
        <div className="title-foot">2d6 轻量规则 · 1–4 名角色 · 单人或联机 · 可回退 · 世界随你倾斜</div>
      </div>
    </div>
  )
}
