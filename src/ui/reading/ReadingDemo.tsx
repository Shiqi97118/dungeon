import { useMemo, useState } from 'react'
import WorldPanels from '../world/WorldPanels'
import { demoBatches } from './demo'
import Reader from './Reader'

/** Dev-only page for `?demo=reading` (UI-01 screenshots); not reachable from the game. */
export default function ReadingDemo() {
  const batches = useMemo(() => demoBatches(), [])
  const [i, setI] = useState(0)
  const b = batches[i]
  const last = i === batches.length - 1
  return (
    <div className="rd-demo">
      <header className="topbar">
        <div className="brand">回声井<small>阅读演示</small></div>
        <span className="dim small">{b.title}</span>
      </header>
      <main className="rd-layout">
        <Reader
          screens={b.screens}
          fallbackImage="GH-01"
          end={
            <button className="btn" onClick={() => setI(last ? 0 : i + 1)}>
              {last ? '从头再看' : '下一段：换场景'}
            </button>
          }
        />
        <WorldPanels s={b.s} />
      </main>
    </div>
  )
}
