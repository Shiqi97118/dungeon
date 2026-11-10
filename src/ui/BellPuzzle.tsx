import { useEffect, useRef, useState } from 'react'
import { BELL_FREQS, sound } from '../audio/sound'

const NAMES = ['宫', '商', '角', '徵', '羽', '变']
const SEQUENCE = [2, 0, 3, 1, 4, 5]
const LAYOUT = [1, 4, 0, 5, 2, 3]
const SILENCE_MS = 3200

interface Props {
  mode: 'hall' | 'core'
  hasScore: boolean
  onDone: (success: boolean, mistakes: number) => void
}

export default function BellPuzzle({ mode, hasScore, onDone }: Props) {
  const [step, setStep] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [ringing, setRinging] = useState<number | null>(null)
  const [phase, setPhase] = useState<'play' | 'silence' | 'won' | 'broken'>('play')
  const [silence, setSilence] = useState(0)
  const [msg, setMsg] = useState<string>(mode === 'hall' ? '按残谱的顺序敲响六口钟。' : '井底的六口小钟悬在控制台四周。按钟序敲响它们。')
  const timer = useRef<number | null>(null)

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  const hit = (bell: number) => {
    if (phase === 'silence') return breakSilence()
    if (phase !== 'play') return
    sound.bell(BELL_FREQS[bell], 0.4)
    setRinging(bell)
    setTimeout(() => setRinging(null), 500)
    if (bell === SEQUENCE[step]) {
      const next = step + 1
      setStep(next)
      if (next === 6) {
        setPhase('silence')
        setMsg('六音已毕。第七拍……')
        const start = Date.now()
        timer.current = window.setInterval(() => {
          const t = Date.now() - start
          setSilence(Math.min(1, t / SILENCE_MS))
          if (t >= SILENCE_MS) {
            if (timer.current) clearInterval(timer.current)
            setPhase('won')
            setMsg('第七音降临了——它是声音的缺席。')
          }
        }, 50)
      }
    } else {
      setTimeout(() => sound.bell(BELL_FREQS[bell] * 1.06, 0.25), 60)
      setMistakes((m) => m + 1)
      setStep(0)
      setMsg('钟声错开了，回声乱成一团。从头再来。')
    }
  }

  const breakSilence = () => {
    if (timer.current) clearInterval(timer.current)
    sound.thump()
    setMistakes((m) => m + 1)
    setPhase('play')
    setStep(0)
    setSilence(0)
    setMsg('你们在第七拍发出了声音。井把它吞了下去。第七音不是声音——从头再来。')
  }

  return (
    <div className="modal-backdrop">
      <div className={`modal bell-modal ${phase}`}>
        <div className="modal-kicker">{mode === 'hall' ? '水闸礼堂 · 六口石钟' : '回声井核心 · 第七道静音'}</div>
        <h3>七音钟序</h3>
        <div className="score">
          <div className="score-label">{hasScore ? '七音残谱' : '凭刻痕与浮雕重建的钟序'}</div>
          <div className="score-notes">
            {SEQUENCE.map((b, i) => (
              <span key={i} className={`note ${i < step ? 'done' : ''} ${i === step && phase === 'play' ? 'cur' : ''}`}>{NAMES[b]}</span>
            ))}
            <span className={`note rest ${phase === 'silence' ? 'cur' : ''} ${phase === 'won' ? 'done' : ''}`}>　</span>
          </div>
          <div className="score-foot">旁注：“静音须由听者作出，不可强迫。”</div>
        </div>

        <div className="bells">
          {LAYOUT.map((b) => (
            <button key={b} className={`bell ${ringing === b ? 'ring' : ''}`} onClick={() => hit(b)} aria-label={`敲响${NAMES[b]}钟`}>
              <span className="rope" />
              <span className="bell-body"><span className="bell-glyph">{NAMES[b]}</span></span>
            </button>
          ))}
          <button className="bell empty" onClick={() => (phase === 'silence' ? breakSilence() : setMsg('第七个钩子上什么也没有。'))} aria-label="第七个空钩">
            <span className="rope" />
            <span className="hook">∫</span>
          </button>
        </div>

        <div className="bell-msg">{msg}</div>
        {phase === 'silence' && (
          <div className="silence-bar"><i style={{ width: `${silence * 100}%` }} /></div>
        )}
        <div className="bell-meta">失误 {mistakes}</div>

        <div className="row end">
          {phase !== 'won' && <button className="btn ghost" onClick={() => onDone(false, mistakes)}>放弃（回声压力 +1）</button>}
          {phase === 'won' && <button className="btn primary big" onClick={() => onDone(true, mistakes)}>{mode === 'hall' ? '继续' : '完成封存'}</button>}
        </div>
      </div>
    </div>
  )
}
