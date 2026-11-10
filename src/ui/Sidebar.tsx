import { useState } from 'react'
import type { GameState, LocId } from '../game/types'
import { STAT_NAMES, STAT_ORDER } from '../game/types'
import { CLUES, FACTS, factProgress } from '../game/data/clues'
import { LOC_NAMES, routeKnown } from '../game/data/scenes'
import { PRESSURE_EVENTS } from '../game/fx'
import { Boxes, Sigil, fmt } from './bits'

type Tab = 'party' | 'clues' | 'truth' | 'npcs' | 'map'

export default function Sidebar({ state, onMove, canMove }: { state: GameState; onMove: (loc: LocId) => void; canMove: (loc: LocId) => boolean }) {
  const [tab, setTab] = useState<Tab>('party')
  return (
    <aside className="sidebar">
      <PressureClock p={state.pressure} />
      <div className="tabs">
        {([['party', '队伍'], ['clues', `线索 ${state.clues.length}`], ['truth', '真相'], ['npcs', '人物'], ['map', '地图']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="tab-body">
        {tab === 'party' && <Party state={state} />}
        {tab === 'clues' && <Clues state={state} />}
        {tab === 'truth' && <Truth state={state} />}
        {tab === 'npcs' && <Npcs state={state} />}
        {tab === 'map' && <MapView state={state} onMove={onMove} canMove={canMove} />}
      </div>
    </aside>
  )
}

export function PressureClock({ p }: { p: number }) {
  const segs = 6
  const r = 44
  const cx = 56, cy = 56
  const arcs = Array.from({ length: segs }, (_, i) => {
    const a0 = (-90 + i * 60 + 3) * (Math.PI / 180)
    const a1 = (-90 + (i + 1) * 60 - 3) * (Math.PI / 180)
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    return { d: `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`, on: i < p }
  })
  return (
    <div className={`pressure p${p}`}>
      <svg width="112" height="112" viewBox="0 0 112 112" className="pressure-ring">
        <circle cx={cx} cy={cy} r={30} className="well-core" />
        {arcs.map((a, i) => <path key={i} d={a.d} className={`seg ${a.on ? 'on' : ''}`} style={{ ['--i' as string]: i }} />)}
        <text x={cx} y={cy + 9} textAnchor="middle" className="pressure-num">{p}</text>
      </svg>
      <div className="pressure-info">
        <div className="pressure-label">回声压力</div>
        <div className="pressure-desc">{PRESSURE_EVENTS[Math.max(1, p)]}</div>
      </div>
    </div>
  )
}

function Party({ state }: { state: GameState }) {
  return (
    <div className="party">
      {state.party.map((c) => (
        <div key={c.id} className={`pc ${c.out ? 'out' : ''}`} style={{ ['--hue' as string]: c.hue }}>
          <div className="pc-head">
            <Sigil c={c} size={36} />
            <div className="pc-name">
              <b>{c.name}</b> <small>{c.title}</small>
              {c.out && <span className="badge">暂时退出</span>}
            </div>
            <div className="pc-meters">
              <div title="承压"><small>承压</small><Boxes n={c.stress} max={3} kind="stress" /></div>
              <div title="优势点"><small>优势</small><Boxes n={c.advantage} max={2} kind="adv" /></div>
            </div>
          </div>
          <div className="stat-row compact">
            {STAT_ORDER.map((s) => <div key={s} className={`stat v${c.stats[s]}`}><span>{STAT_NAMES[s]}</span><b>{fmt(c.stats[s])}</b></div>)}
          </div>
          <div className="chips">
            {c.specialties.map((s) => <span key={s} className="chip spec">{s}</span>)}
            {c.items.map((s) => <span key={s} className={`chip item ${c.spentItems.includes(s) ? 'spent' : ''} ${s.startsWith('静音') || s === '铜环' ? 'key' : ''}`}>{s}</span>)}
            {c.statuses.map((s) => <span key={s} className="chip status">{s}</span>)}
          </div>
          <div className="pc-reason">“{c.reason}”</div>
          {c.relation && <div className="pc-reason rel">{c.relation}</div>}
        </div>
      ))}
      {state.flags.joanJoined && (
        <div className="pc companion">
          <div className="pc-head"><div className="sigil" style={{ ['--hue' as string]: 40 }}>乔</div><div className="pc-name"><b>乔安</b> <small>同行者 · 可协助一次非战斗检定/地点</small></div></div>
        </div>
      )}
    </div>
  )
}

function Clues({ state }: { state: GameState }) {
  const [open, setOpen] = useState<string | null>(null)
  if (state.clues.length === 0) return <div className="empty">还没有发现线索。</div>
  return (
    <div className="clue-list">
      {[...state.clues].reverse().map((id) => {
        const c = CLUES[id]
        return (
          <button key={id} className={`clue-item ${open === id ? 'open' : ''}`} onClick={() => setOpen(open === id ? null : id)}>
            <div className="clue-item-title">{c.title}{c.fact && <span className="dot" title={FACTS.find((f) => f.id === c.fact)?.title} />}</div>
            {open === id && (
              <>
                <div className="clue-text">{c.text}</div>
                {c.handout && <div className="clue-handout">{c.handout}</div>}
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}

function Truth({ state }: { state: GameState }) {
  return (
    <div className="truths">
      <p className="hint">你们需要了解足够多，才能在井底做出选择。每条真相都有多条线索可以印证。</p>
      {FACTS.map((f) => {
        const pr = factProgress(state.clues, f.id)
        const known = pr.found > 0
        return (
          <div key={f.id} className={`truth ${known ? 'known' : ''}`}>
            <div className="truth-title">{known ? f.title : '？？？'}</div>
            <div className="truth-dots">{Array.from({ length: pr.total }, (_, i) => <i key={i} className={i < pr.found ? 'on' : ''} />)}</div>
            {known && <div className="truth-text">{f.truth}</div>}
          </div>
        )
      })}
    </div>
  )
}

const NPC_INFO: Record<string, { name: string; role: string; sigil: string; hue: number }> = {
  ningrui: { name: '宁芮', role: '测绘队长', sigil: '芮', hue: 190 },
  joan: { name: '乔安', role: '幸存测绘员', sigil: '乔', hue: 40 },
  evelyn: { name: '伊芙琳', role: '守井者', sigil: '伊', hue: 270 },
  luduo: { name: '陆铎', role: '公会代理人', sigil: '铎', hue: 10 },
}

function Npcs({ state }: { state: GameState }) {
  return (
    <div className="npcs">
      {Object.entries(state.npcs).map(([k, v]) => {
        const info = NPC_INFO[k]
        return (
          <div key={k} className={`npc-card ${v.met ? 'met' : ''}`}>
            <div className="sigil" style={{ ['--hue' as string]: info.hue }}>{v.met ? info.sigil : '？'}</div>
            <div>
              <div className="npc-name">{v.met ? info.name : '未知'} <small>{v.met ? info.role : ''}</small></div>
              <div className="npc-meta">{v.met ? `${v.attitude} · ${v.where}` : v.where}</div>
              {v.met && v.status && <div className="npc-meta dim">{v.status}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const POS: Record<LocId, [number, number]> = {
  gate: [50, 6], A: [50, 22], B: [17, 40], C: [50, 44], D: [83, 40], E: [24, 66], F: [76, 66], G: [50, 90],
}
const EDGES: [LocId, LocId][] = [['gate', 'A'], ['A', 'B'], ['A', 'C'], ['A', 'D'], ['B', 'E'], ['B', 'F'], ['C', 'F'], ['C', 'D'], ['D', 'E'], ['D', 'G'], ['E', 'G'], ['F', 'G'], ['C', 'G']]

function MapView({ state, onMove, canMove }: { state: GameState; onMove: (l: LocId) => void; canMove: (l: LocId) => boolean }) {
  const status = (l: LocId) => (l === state.location ? 'here' : state.visited.includes(l) ? 'visited' : routeKnown(state, l) ? 'known' : 'unknown')
  return (
    <div className="map">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="map-lines">
        {EDGES.map(([a, b]) => {
          const vis = status(a) !== 'unknown' && status(b) !== 'unknown'
          return <line key={a + b} x1={POS[a][0]} y1={POS[a][1]} x2={POS[b][0]} y2={POS[b][1]} className={vis ? 'vis' : ''} />
        })}
      </svg>
      {(Object.keys(POS) as LocId[]).map((l) => {
        const st = status(l)
        const movable = canMove(l)
        return (
          <button
            key={l}
            className={`map-node ${st} ${movable ? 'movable' : ''}`}
            style={{ left: `${POS[l][0]}%`, top: `${POS[l][1]}%` }}
            disabled={!movable}
            onClick={() => onMove(l)}
            title={movable ? `前往${LOC_NAMES[l]}` : undefined}
          >
            <span className="map-dot">{l === 'gate' ? '序' : l}</span>
            <span className="map-label">{st === 'unknown' ? '？' : LOC_NAMES[l]}</span>
          </button>
        )
      })}
    </div>
  )
}
