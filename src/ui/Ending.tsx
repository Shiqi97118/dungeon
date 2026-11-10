import { useEffect, useState } from 'react'
import type { GameState } from '../game/types'
import type { GameAction } from '../game/engine'
import { buildArchive } from '../game/endings'
import { sound } from '../audio/sound'
import Atmosphere from './Atmosphere'
import { Sigil } from './bits'

interface Props {
  state: GameState
  dispatch: (a: GameAction) => void
  onRestart: () => void
  onTitle: () => void
}

const ENDING_ART: Record<string, { img: string; cls: string }> = {
  seal: { img: 'core', cls: 'e-seal' },
  repair: { img: 'core', cls: 'e-repair' },
  destroy: { img: 'core', cls: 'e-destroy' },
  deliver: { img: 'core', cls: 'e-deliver' },
  retreat: { img: 'gate', cls: 'e-retreat' },
  custom: { img: 'core', cls: 'e-custom' },
}

export default function Ending({ state, dispatch, onRestart, onTitle }: Props) {
  const e = state.ending!
  const art = ENDING_ART[e.id]
  const [shown, setShown] = useState(0)
  const [take, setTake] = useState<Record<string, string>>(e.takeaways)
  const [done, setDone] = useState(Object.keys(e.takeaways).length > 0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    sound.setAmbience(e.id === 'retreat' ? 'rain' : 'core', 1)
    const seq = e.id === 'seal' ? [220, 261.63, 293.66, 329.63, 392, 440] : e.id === 'destroy' ? [110, 98, 82.4] : [329.63, 392, 440, 523.25]
    seq.forEach((f, i) => setTimeout(() => sound.bell(f, 0.22), 400 + i * 520))
  }, [e.id])

  useEffect(() => {
    if (shown >= e.paragraphs.length) return
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 1400 : 2100)
    return () => clearTimeout(t)
  }, [shown, e.paragraphs.length])

  const suggestions = (id: string) => {
    const c = state.party.find((p) => p.id === id)!
    return [...c.items.slice(0, 3), c.memento, '一个没有答案的疑问', '一段不再完整的记忆']
  }

  const archive = buildArchive({ ...state, ending: { ...e, takeaways: take } })

  const download = () => {
    const blob = new Blob([archive], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '回声井-章节存档.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`ending-screen ${art.cls}`}>
      <div className="ending-bg" style={{ backgroundImage: `url(art/${art.img}.jpg)` }} />
      <Atmosphere mode={e.id === 'retreat' ? 'rain' : 'core'} />
      <div className="ending-wrap">
        <div className="ending-kicker">章节终 · 回声井·第七道门</div>
        <h1 className="ending-title" data-echo={e.title}>{e.title}</h1>
        <div className="ending-text">
          {e.paragraphs.slice(0, shown).map((p, i) => <p key={i} className="fade-in">{p}</p>)}
          {shown < e.paragraphs.length && <button className="link skip" onClick={() => setShown(e.paragraphs.length)}>跳过</button>}
        </div>

        {shown >= e.paragraphs.length && !done && (
          <div className="panel takeaway fade-in">
            <h3>每个人都带走了一些东西</h3>
            <p className="dim">物品、记忆、关系，或一个疑问。用一句话描述。</p>
            {state.party.map((c) => (
              <div key={c.id} className="takeaway-row" style={{ ['--hue' as string]: c.hue }}>
                <Sigil c={c} size={34} />
                <div className="takeaway-fields">
                  <b>{c.name}</b>
                  <input className="input" value={take[c.id] ?? ''} placeholder="带走了……" onChange={(ev) => setTake({ ...take, [c.id]: ev.target.value })} maxLength={60} />
                  <div className="chips">
                    {suggestions(c.id).map((s) => <button key={s} className="chip spec clickable" onClick={() => setTake({ ...take, [c.id]: s })}>{s}</button>)}
                  </div>
                </div>
              </div>
            ))}
            <div className="row end">
              <button className="btn primary" onClick={() => { dispatch({ type: 'takeaways', takeaways: take }); setDone(true); sound.chime() }}>写入章节存档</button>
            </div>
          </div>
        )}

        {done && (
          <div className="panel archive-panel fade-in">
            <div className="takeaway-list">
              {state.party.map((c) => take[c.id] && (
                <div key={c.id} className="takeaway-line"><Sigil c={c} size={26} /> <b>{c.name}</b> 带走了 <em>{take[c.id]}</em></div>
              ))}
            </div>
            <details open>
              <summary>章节存档（可作为下一章的输入）</summary>
              <pre className="archive">{archive}</pre>
            </details>
            <div className="row end wrap">
              <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(archive); setCopied(true) } catch { /* clipboard unavailable */ } }}>{copied ? '已复制' : '复制存档'}</button>
              <button className="btn" onClick={download}>下载 .md</button>
              <button className="btn ghost" onClick={onTitle}>回到标题</button>
              <button className="btn primary" onClick={onRestart}>再开一局</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
