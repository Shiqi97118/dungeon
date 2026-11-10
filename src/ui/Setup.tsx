import { useState } from 'react'
import type { Character, GameState } from '../game/types'
import { STAT_NAMES, STAT_ORDER } from '../game/types'
import { PREGENS, RELATIONS, SPECIALTIES, makeCharacter, randomCharacter } from '../game/data/characters'
import { CLUES } from '../game/data/clues'
import { sound } from '../audio/sound'
import Atmosphere from './Atmosphere'
import { Sigil, fmt } from './bits'

interface Props {
  onStart: (party: Character[], safety: GameState['safety']) => void
  onBack: () => void
}

export default function Setup({ onStart, onBack }: Props) {
  const [step, setStep] = useState(0)
  const [safety, setSafety] = useState({ softMemory: false, softTrapped: false })
  const [pool, setPool] = useState<Character[]>(() => PREGENS.map(makeCharacter))
  const [chosen, setChosen] = useState<string[]>([])
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [relations, setRelations] = useState<Record<string, { idx: number; target: string }>>({})

  const party = chosen.map((id) => pool.find((c) => c.id === id)!).filter(Boolean)

  const toggle = (id: string) => {
    sound.click()
    setChosen((cs) => (cs.includes(id) ? cs.filter((x) => x !== id) : cs.length >= 4 ? cs : [...cs, id]))
  }

  const addRandom = () => {
    const c = randomCharacter(pool.map((p) => p.name))
    setPool((p) => [...p, c])
    if (chosen.length < 4) setChosen((cs) => [...cs, c.id])
    sound.bell(392, 0.15)
  }

  const finalize = () => {
    const final = party.map((c) => {
      const rel = relations[c.id]
      const target = rel ? party.find((p) => p.id === rel.target) : undefined
      return {
        ...c,
        reason: reasons[c.id]?.trim() || c.motive,
        relation: rel && target ? RELATIONS[rel.idx].replace('____', target.name) : undefined,
      }
    })
    sound.bell(220, 0.3)
    setTimeout(() => sound.bell(329.63, 0.25), 300)
    onStart(final, safety)
  }

  return (
    <div className="setup-screen">
      <div className="title-bg dim" style={{ backgroundImage: 'url(art/gate.jpg)' }} />
      <Atmosphere mode="rain" />
      <div className="setup-wrap">
        <div className="steps">
          {['边界与安全', '组建队伍', '接受委托'].map((s, i) => (
            <div key={s} className={`step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`}>
              <span>{i + 1}</span>{s}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="panel setup-panel fade-in">
            <h2>开始之前</h2>
            <p className="lead">这是一场地下城探索故事。你们可以调查、交涉、潜行、战斗、自创方案或撤退。失败会带来代价，但<strong>关键线索不会因为一次失败而消失</strong>。</p>
            <div className="notice">
              <div className="notice-title">内容提示</div>
              本故事包含地下空间、失踪、受困、非致命的心理压力与道德抉择。所有角色死亡或永久创伤都需要你明确接受，绝不会由一次掷骰强加。
            </div>
            <label className="toggle">
              <input type="checkbox" checked={safety.softMemory} onChange={(e) => setSafety({ ...safety, softMemory: e.target.checked })} />
              <span>淡化“记忆被改变”的描写（井不会让你“遗忘”刚才的对话，也不会复述你的私密记忆）</span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={safety.softTrapped} onChange={(e) => setSafety({ ...safety, softTrapped: e.target.checked })} />
              <span>淡化“角色被困”的描写</span>
            </label>
            <div className="rules-card">
              <div className="rules-title">规则一页纸</div>
              <div className="rules-grid">
                <div><b>掷 2d6 + 属性</b><br />有合适专长 +1，情境优劣 ±1，总加值 -2 到 +3。</div>
                <div><b className="t-hit">10+</b> 成功<br /><b className="t-partial">7–9</b> 成功但有代价<br /><b className="t-miss">6-</b> 事情变复杂</div>
                <div><b>承压 □□□</b><br />受伤、恐惧、迷失都会填格；满了之后由你选择后果。</div>
                <div><b>优势点 ◆◆</b><br />重掷一颗骰，或把代价降为轻微。帮助同伴可获得。</div>
                <div><b>回声压力 0–6</b><br />拖延、失败、深入会让井越来越“清醒”。到 6 时，终局降临。</div>
                <div><b>自由行动</b><br />想做列表之外的事？直接写下来，主持人会裁定。</div>
              </div>
            </div>
            <div className="row end">
              <button className="btn ghost" onClick={onBack}>返回</button>
              <button className="btn primary" onClick={() => { sound.click(); setStep(1) }}>我准备好了</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="panel setup-panel wide fade-in">
            <h2>组建队伍 <small>选择 1–4 名角色（单人游戏建议 2 名，轮流操控）</small></h2>
            <div className="pregen-grid">
              {pool.map((c) => (
                <button key={c.id} className={`pregen ${chosen.includes(c.id) ? 'sel' : ''}`} onClick={() => toggle(c.id)} style={{ ['--hue' as string]: c.hue }}>
                  <div className="pregen-head">
                    <Sigil c={c} size={46} />
                    <div>
                      <div className="pregen-name">{c.name}</div>
                      <div className="pregen-title">{c.title}</div>
                    </div>
                    {chosen.includes(c.id) && <div className="pregen-check">{chosen.indexOf(c.id) + 1}</div>}
                  </div>
                  <div className="stat-row">
                    {STAT_ORDER.map((s) => (
                      <div key={s} className={`stat v${c.stats[s]}`}><span>{STAT_NAMES[s]}</span><b>{fmt(c.stats[s])}</b></div>
                    ))}
                  </div>
                  <div className="chips">
                    {c.specialties.map((s) => <span key={s} className="chip spec" title={SPECIALTIES.find((x) => x.name === s)?.desc}>{s}</span>)}
                    {c.items.map((s) => <span key={s} className="chip item">{s}</span>)}
                  </div>
                  <div className="pregen-motive">动机：{c.motive}</div>
                  <div className="pregen-hook">钩子：{c.hook}</div>
                </button>
              ))}
              <button className="pregen random" onClick={addRandom}>
                <div className="random-dice">⚄</div>
                <div>按随机表生成一名角色</div>
                <small>职业、动机、矛盾、纪念物各掷一次</small>
              </button>
            </div>
            <div className="row end">
              <button className="btn ghost" onClick={() => setStep(0)}>上一步</button>
              <button className="btn primary" disabled={party.length === 0} onClick={() => { sound.click(); setStep(2) }}>
                {party.length === 0 ? '至少选择一名角色' : `带上这 ${party.length} 人`}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="panel setup-panel wide fade-in">
            <h2>接受委托</h2>
            <div className="commission-layout">
              <div className="handout paper tilt">
                <div className="handout-title">委托</div>
                <p>{CLUES.commission.handout}</p>
                <div className="stamp">矿业公会</div>
              </div>
              <div className="intro-list">
                <p className="lead">每位角色补一句：<b>为什么接受这份委托？</b>以及，和同伴之间有什么还没解决的事？</p>
                {party.map((c) => (
                  <div key={c.id} className="intro-row" style={{ ['--hue' as string]: c.hue }}>
                    <Sigil c={c} size={38} />
                    <div className="intro-fields">
                      <div className="intro-name">{c.name} <small>{c.title} · 纪念物：{c.memento}</small></div>
                      <input
                        className="input"
                        placeholder={c.motive}
                        value={reasons[c.id] ?? ''}
                        onChange={(e) => setReasons({ ...reasons, [c.id]: e.target.value })}
                      />
                      {party.length > 1 && (
                        <div className="rel-row">
                          <select
                            className="input"
                            value={relations[c.id]?.idx ?? -1}
                            onChange={(e) => {
                              const idx = Number(e.target.value)
                              if (idx < 0) { const r = { ...relations }; delete r[c.id]; setRelations(r); return }
                              const target = relations[c.id]?.target ?? party.find((p) => p.id !== c.id)!.id
                              setRelations({ ...relations, [c.id]: { idx, target } })
                            }}
                          >
                            <option value={-1}>（可选）队伍关系……</option>
                            {RELATIONS.map((r, i) => <option key={i} value={i}>{r}</option>)}
                          </select>
                          {relations[c.id] && (
                            <select
                              className="input small"
                              value={relations[c.id].target}
                              onChange={(e) => setRelations({ ...relations, [c.id]: { ...relations[c.id], target: e.target.value } })}
                            >
                              {party.filter((p) => p.id !== c.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="row end">
              <button className="btn ghost" onClick={() => setStep(1)}>上一步</button>
              <button className="btn primary big" onClick={finalize}>出发，前往白砾矿场</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
