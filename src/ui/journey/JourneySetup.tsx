import { useState } from 'react'
import type { OpeningHookId } from '../../iselan/data'
import { PREGENS, SKILL_OF_STAT, STAT_ORDER, type Pregen } from '../../iselan/play'
import { sound } from '../../audio/sound'
import { HOOKS } from './view'

const sign = (n: number) => (n > 0 ? `+${n}` : String(n))

/** v1 solo: one pre-made character and the hook that brings them into the Seven Lamps. */
export default function JourneySetup({ onStart, onBack }: { onStart: (p: Pregen, hook: OpeningHookId) => void; onBack: () => void }) {
  const [pc, setPc] = useState<string>(PREGENS[0].id)
  const [hook, setHook] = useState<OpeningHookId>('memento')
  const chosen = PREGENS.find((p) => p.id === pc)!
  return (
    <main className="setup-screen character-setup">
      <div className="setup-wrap">
        <div className="panel setup-panel">
          <h2>选择角色</h2>
          <div className="jy-cards" role="radiogroup" aria-label="角色">
            {PREGENS.map((p) => (
              <label key={p.id} className={'jy-card' + (pc === p.id ? ' on' : '')}>
                <input type="radio" name="character" checked={pc === p.id} onChange={() => { sound.click(); setPc(p.id) }} />
                <b>{p.name}</b><small>{p.title}</small>
              </label>
            ))}
          </div>
          <details className="jy-detail">
            <summary>查看角色资料</summary>
            <p><b>{chosen.name}</b> · {chosen.title}</p>
            <p className="small">{chosen.motive}</p>
            <p className="small">{chosen.hook}</p>
            <p className="small dim">随身带着：{chosen.memento}</p>
            <p className="small">{STAT_ORDER.map((k) => `${SKILL_OF_STAT[k]} ${sign(chosen.stats[k])}`).join('　')}</p>
          </details>

          <label className="opening-hook">
            开场引子
            <select className="input" value={hook} onChange={(event) => {
              const selected = HOOKS.find((option) => option.id === event.currentTarget.value)
              if (selected) setHook(selected.id)
            }}>
              {HOOKS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <p className="dim small">{HOOKS.find((option) => option.id === hook)?.text}</p>

          <div className="row end">
            <button className="btn ghost" onClick={onBack}>返回</button>
            <button className="btn primary" onClick={() => { sound.bell(220, 0.3); onStart(chosen, hook) }}>推开酒馆的门</button>
          </div>
        </div>
      </div>
    </main>
  )
}
