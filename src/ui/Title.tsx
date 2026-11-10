import Atmosphere from './Atmosphere'
import { sound } from '../audio/sound'

interface Props {
  hasSave: boolean
  onNew: () => void
  onResume: () => void
  onSettings: () => void
  muted: boolean
  onMute: () => void
  aiOn: boolean
}

export default function Title({ hasSave, onNew, onResume, onSettings, muted, onMute, aiOn }: Props) {
  const ring = () => {
    sound.init()
    sound.bell(220, 0.3)
  }
  return (
    <div className="title-screen">
      <div className="title-bg" style={{ backgroundImage: 'url(art/gate.jpg)' }} />
      <div className="title-vignette" />
      <Atmosphere mode="rain" />
      <div className="title-content">
        <div className="title-kicker">一场原创的地下城跑团 · AI 主持</div>
        <h1 className="title-main" onClick={ring} data-echo="回声井">回声井</h1>
        <div className="title-sub">第 七 道 门</div>
        <p className="title-tag">
          测绘队进入白砾矿场已经四天。昨夜，矿井深处传来队长自己的声音：
          <br />
          <em>“不要沿着我们留下的路回来。”</em>
        </p>
        <div className="title-buttons">
          <button className="btn primary big" onClick={() => { sound.init(); sound.bell(293.66, 0.25); onNew() }}>开始新的冒险</button>
          {hasSave && <button className="btn big" onClick={() => { sound.init(); onResume() }}>继续上次的进度</button>}
        </div>
        <div className="title-meta">
          <button className="link" onClick={onSettings}>AI 主持人：{aiOn ? '已启用' : '未启用（可选）'}</button>
          <span>·</span>
          <button className="link" onClick={onMute}>声音：{muted ? '关' : '开'}</button>
        </div>
        <div className="title-foot">2d6 轻量规则 · 1–4 名角色 · 约 60–120 分钟 · 多结局</div>
      </div>
    </div>
  )
}
