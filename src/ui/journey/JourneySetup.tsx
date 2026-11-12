import { useState } from 'react'
import type { OpeningHookId } from '../../iselan/data'
import { PREGENS, type Pregen } from '../../iselan/play'
import { sound } from '../../audio/sound'
import { STAT_NAMES, STAT_ORDER } from '../../game/types'
import { HOOKS } from './view'

const sign = (n: number) => (n > 0 ? `+${n}` : String(n))

/** v1 solo: one pre-made character and the hook that brings them into the Seven Lamps. */
export default function JourneySetup({ onStart, onBack }: { onStart: (p: Pregen, hook: OpeningHookId) => void; onBack: () => void }) {
  const [pc, setPc] = useState<string>(PREGENS[0].id)
  const [hook, setHook] = useState<OpeningHookId>('memento')
  const chosen = PREGENS.find((p) => p.id === pc)!
  return (
    <div className="setup-screen">
      <div className="setup-wrap">
        <div className="panel setup-panel">
          <h2>启程：灰港</h2>
          <p className="lead">雨下了一整天。你推开七灯酒馆的门，来到这座靠讨价还价活下去的港城。</p>

          <h3>你是谁</h3>
          <div className="jy-cards" role="radiogroup" aria-label="角色">
            {PREGENS.map((p) => (
              <button
                key={p.id}
                role="radio"
                aria-checked={pc === p.id}
                className={'jy-card' + (pc === p.id ? ' on' : '')}
                onClick={() => { sound.click(); setPc(p.id) }}
              >
                <b>{p.name}</b><small>{p.title}</small>
                <span className="dim small">{p.motive}</span>
              </button>
            ))}
          </div>
          <div className="jy-detail">
            <p><b>{chosen.name}</b> · {chosen.title}</p>
            <p className="small">{chosen.hook}</p>
            <p className="small dim">随身带着：{chosen.memento}</p>
            <p className="small">{STAT_ORDER.map((k) => `${STAT_NAMES[k]} ${sign(chosen.stats[k])}`).join('　')}</p>
          </div>

          <h3>是什么把你带到这里</h3>
          <div className="jy-cards" role="radiogroup" aria-label="开场">
            {HOOKS.map((h) => (
              <button
                key={h.id}
                role="radio"
                aria-checked={hook === h.id}
                className={'jy-card' + (hook === h.id ? ' on' : '')}
                onClick={() => { sound.click(); setHook(h.id) }}
              >
                <b>{h.label}</b>
                <span className="dim small">{h.text}</span>
              </button>
            ))}
          </div>

          <div className="row end">
            <button className="btn ghost" onClick={onBack}>返回</button>
            <button className="btn primary" onClick={() => { sound.bell(220, 0.3); onStart(chosen, hook) }}>推开酒馆的门</button>
          </div>
        </div>
      </div>
    </div>
  )
}
