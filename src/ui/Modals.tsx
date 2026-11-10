import { useState } from 'react'
import type { CostId, GameState, Pending } from '../game/types'
import type { GameAction } from '../game/engine'
import { costLabel, getChar } from '../game/fx'
import { buildArchive, buildSummary } from '../game/endings'
import { sound } from '../audio/sound'
import { Sigil } from './bits'

type D = (a: GameAction) => void

export function PendingModal({ state, p, dispatch }: { state: GameState; p: Pending; dispatch: D }) {
  if (p.type === 'cost') return <CostModal state={state} p={p} dispatch={dispatch} />
  if (p.type === 'overflow') return <OverflowModal state={state} charId={p.charId} dispatch={dispatch} />
  if (p.type === 'memory') return <MemoryModal state={state} dispatch={dispatch} />
  if (p.type === 'volunteer') return <VolunteerModal state={state} dispatch={dispatch} />
  if (p.type === 'deliver') return <DeliverModal dispatch={dispatch} />
  return null
}

function CostModal({ state, p, dispatch }: { state: GameState; p: Extract<Pending, { type: 'cost' }>; dispatch: D }) {
  const actor = getChar(state, p.actorId)
  const pick = (c: CostId | 'soften') => { sound.click(); dispatch({ type: 'cost', choice: c }) }
  return (
    <div className="modal-backdrop">
      <div className={`modal cost-modal t-${p.tier}`}>
        <div className="modal-kicker">{p.tier === 'partial' ? '7–9 · 成功，但……' : '6- · 局势变复杂'}</div>
        <h3>{p.reason}</h3>
        <p className="dim">选择你们要付出的代价。{actor ? `（行动者：${actor.name}）` : ''}</p>
        <div className="cost-options">
          {p.options.map((c) => (
            <button key={c} className={`cost-opt c-${c}`} onClick={() => pick(c)}>
              <span className="cost-icon">{COST_ICON[c]}</span>
              <span>{costLabel(c)}</span>
            </button>
          ))}
        </div>
        {p.canSoften && (actor?.advantage ?? 0) > 0 && (
          <button className="btn soften" onClick={() => pick('soften')}>◆ 花费 1 点优势：把代价降为轻微（{actor?.name} 剩余 {actor?.advantage}）</button>
        )}
      </div>
    </div>
  )
}

const COST_ICON: Record<CostId, string> = { stress: '□', pressure: '◎', item: '⌧', beast: '≋', helper: '□' }

function OverflowModal({ state, charId, dispatch }: { state: GameState; charId: string; dispatch: D }) {
  const c = getChar(state, charId)
  if (!c) return null
  const opts: [Parameters<typeof dispatch>[0] & { type: 'overflow' }, string, string][] = [
    [{ type: 'overflow', option: 'out' }, '短暂退出危险场面', '在离开这个地点前不能行动'],
    [{ type: 'overflow', option: 'item' }, '失去一件非关键物品', '慌乱中丢下了什么'],
    [{ type: 'overflow', option: 'apart' }, '与队伍分开片刻', '在下一个地点重新会合'],
    [{ type: 'overflow', option: 'status' }, '接受一个短期状态', '颤抖、耳鸣、迷失……'],
  ]
  return (
    <div className="modal-backdrop">
      <div className="modal overflow-modal" style={{ ['--hue' as string]: c.hue }}>
        <div className="modal-kicker">承压已满</div>
        <h3><Sigil c={c} size={32} /> {c.name}撑不住了</h3>
        <p className="dim">这不会让角色死亡或留下永久创伤。由你选择后果：</p>
        <div className="cost-options">
          {opts.map(([a, t, s]) => (
            <button key={t} className="cost-opt" onClick={() => dispatch(a)}>
              <span><b>{t}</b><small>{s}</small></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function MemoryModal({ state, dispatch }: { state: GameState; dispatch: D }) {
  const [who, setWho] = useState(state.party[0].id)
  const [text, setText] = useState('')
  const c = getChar(state, who)!
  const q = state.safety.softMemory ? '你最珍惜的一个小瞬间是什么？' : '你最不愿被忘记的事，是什么？'
  const sug = [`${c.memento}的来历`, '第一次有人叫我的名字时的语气', '家里灶台边那首没唱完的歌', '那个答应过要回去的人']
  return (
    <div className="modal-backdrop">
      <div className="modal memory-modal">
        <div className="modal-kicker">结晶裂隙 · 倒影</div>
        <h3 className="echo-text" data-text={q}>{q}</h3>
        <p className="dim">倒影用你们的声音发问。它会给出前往门廊的路——但你的回答会被它记住。</p>
        <div className="actor-row">
          {state.party.map((p) => (
            <button key={p.id} className={`actor ${who === p.id ? 'on' : ''}`} style={{ ['--hue' as string]: p.hue }} onClick={() => setWho(p.id)}>
              <Sigil c={p} size={28} /><div><b>{p.name}</b></div>
            </button>
          ))}
        </div>
        <textarea className="input" rows={3} placeholder="写下一句话……" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} />
        <div className="chips">
          {sug.map((s) => <button key={s} className="chip spec clickable" onClick={() => setText(s)}>{s}</button>)}
        </div>
        <div className="row end">
          <button className="btn primary" disabled={!text.trim()} onClick={() => { sound.whisper(0.5); dispatch({ type: 'memory', charId: who, text: text.trim() }) }}>回答它</button>
        </div>
      </div>
    </div>
  )
}

function VolunteerModal({ state, dispatch }: { state: GameState; dispatch: D }) {
  const opts: { id: string; name: string; default: string; hue: number; sigil: string }[] = state.party.map((c) => ({
    id: c.id, name: c.name, default: state.memory[c.id] ?? '', hue: c.hue, sigil: c.sigil,
  }))
  if (state.flags.ningPersuaded) opts.push({ id: 'ningrui', name: '宁芮', default: '妹妹叫我“阿芮芮”的那个午后', hue: 190, sigil: '芮' })
  if (state.flags.evelynWith) opts.push({ id: 'evelyn', name: '伊芙琳', default: '与搭档最后一次并肩敲钟时，他哼的那段调子', hue: 270, sigil: '伊' })
  const [who, setWho] = useState(opts[0].id)
  const sel = opts.find((o) => o.id === who)!
  const [text, setText] = useState(sel.default)
  return (
    <div className="modal-backdrop">
      <div className="modal memory-modal">
        <div className="modal-kicker">修复 · 校准第七音</div>
        <h3>谁愿意交出一段记忆？</h3>
        <p className="dim">井需要一段<strong>自愿</strong>留下的记忆来学会“只接受自愿”。这段记忆会离开交出者，成为井的一部分。</p>
        <div className="actor-row">
          {opts.map((o) => (
            <button key={o.id} className={`actor ${who === o.id ? 'on' : ''}`} style={{ ['--hue' as string]: o.hue }} onClick={() => { setWho(o.id); setText(o.default) }}>
              <Sigil c={{ sigil: o.sigil, hue: o.hue, name: o.name }} size={28} /><div><b>{o.name}</b></div>
            </button>
          ))}
        </div>
        <textarea className="input" rows={3} placeholder="交出的是哪一段记忆？" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} />
        <div className="row end">
          <button className="btn ghost" onClick={() => dispatch({ type: 'dismissQueue' })}>再想想</button>
          <button className="btn primary" disabled={!text.trim()} onClick={() => { sound.bell(220, 0.3); dispatch({ type: 'volunteer', who, text: text.trim() }) }}>交出它</button>
        </div>
      </div>
    </div>
  )
}

function DeliverModal({ dispatch }: { dispatch: D }) {
  const opts: ['oversight' | 'split' | 'hide', string, string][] = [
    ['oversight', '要求公开研究与外部监督', '让陆铎签下承诺书'],
    ['split', '把晶核拆分保管', '一半交给公会，一半交给学院'],
    ['hide', '秘密调包，自己藏匿', '交给公会的是一块普通晶体'],
  ]
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-kicker">交付晶核</div>
        <h3>晶核已经脱离控制台。你们提出什么条件？</h3>
        <div className="cost-options">
          {opts.map(([v, t, s]) => (
            <button key={v} className="cost-opt" onClick={() => dispatch({ type: 'deliver', variant: v })}>
              <span><b>{t}</b><small>{s}</small></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CustomFinalModal({ onSubmit, onCancel }: { onSubmit: (plan: string) => void; onCancel: () => void }) {
  const [plan, setPlan] = useState('')
  return (
    <div className="modal-backdrop">
      <div className="modal memory-modal">
        <div className="modal-kicker">终局 · 自创方案</div>
        <h3>你们打算怎么做？</h3>
        <p className="dim">任何合理的方案都可行。主持人会确定它的代价、所需步骤和可能后果，然后进行一次检定。</p>
        <textarea className="input" rows={4} placeholder="例如：用静音晶体包住晶核，让宁芮自己决定是否放手，同时由伊芙琳在第七道门外守住……" value={plan} onChange={(e) => setPlan(e.target.value)} maxLength={300} />
        <div className="row end">
          <button className="btn ghost" onClick={onCancel}>返回</button>
          <button className="btn primary" disabled={plan.trim().length < 4} onClick={() => onSubmit(plan.trim())}>执行方案</button>
        </div>
      </div>
    </div>
  )
}

export function MenuModal({ state, onClose, onQuit }: { state: GameState; onClose: () => void; onQuit: () => void }) {
  const [copied, setCopied] = useState(false)
  const archive = buildArchive(state)
  const copy = async () => {
    try { await navigator.clipboard.writeText(archive); setCopied(true) } catch { setCopied(false) }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal menu-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-kicker">暂停</div>
        <h3>总结</h3>
        <p>{buildSummary(state)}</p>
        <details>
          <summary>主持人存档（可复制给 AI 续团）</summary>
          <pre className="archive">{archive}</pre>
          <button className="btn small" onClick={copy}>{copied ? '已复制' : '复制存档'}</button>
        </details>
        <p className="dim small">进度会自动保存在本浏览器中。你随时可以说“暂停”“略过”“淡化这个内容”——在这里，关掉页面就是暂停。</p>
        <div className="row end">
          <button className="btn ghost" onClick={onQuit}>回到标题</button>
          <button className="btn primary" onClick={onClose}>继续游戏</button>
        </div>
      </div>
    </div>
  )
}
