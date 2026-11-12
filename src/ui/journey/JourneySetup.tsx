import { useState } from 'react'
import { PREGENS, type Pregen } from '../../iselan/play'
import { sound } from '../../audio/sound'

export default function JourneySetup({ onStart, onBack }: { onStart: (p: Pregen) => void; onBack: () => void }) {
  const [chosen, setChosen] = useState(PREGENS[0])

  return (
    <main className="setup-screen character-setup">
      <div className="setup-wrap">
        <div className="panel setup-panel">
          <h2>选择角色</h2>
          <div className="jy-cards" role="radiogroup" aria-label="角色">
            {PREGENS.map((p) => (
              <label key={p.id} className={'jy-card' + (chosen.id === p.id ? ' on' : '')}>
                <input type="radio" name="character" checked={chosen.id === p.id} onChange={() => { sound.click(); setChosen(p) }} />
                <b>{p.name}</b>
                <small>{p.title}</small>
              </label>
            ))}
          </div>
          <div className="row end">
            <button className="btn ghost" onClick={onBack}>返回</button>
            <button className="btn primary" onClick={() => { sound.bell(220, 0.3); onStart(chosen) }}>进入七灯酒馆</button>
          </div>
        </div>
      </div>
    </main>
  )
}
