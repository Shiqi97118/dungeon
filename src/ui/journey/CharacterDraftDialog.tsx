import { useState, type ReactNode } from 'react'
import {
  ANCESTRIES, JOBS, MEMENTOS, MOTIVES, SKILL_OF_STAT, SPECIALTIES, SPECIALTY_NAMES, STAT_BUDGET, STAT_ORDER,
  parseCharacterDraft, randomCharacterDraft, type CharacterDraft, type Stat,
} from '../../iselan/play'
import Modal from '../interaction/Modal'

export default function CharacterDraftDialog({ initial, taken, onConfirm, onClose, action = '使用这张角色卡' }: {
  initial?: CharacterDraft
  taken: readonly string[]
  onConfirm: (draft: CharacterDraft) => void | Promise<void>
  onClose: () => void
  action?: string
}) {
  const [draft, setDraft] = useState(() => initial ?? randomCharacterDraft(taken))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const card = parseCharacterDraft(draft)
  const duplicate = !!card && taken.includes(card.name)
  const update = <K extends keyof CharacterDraft>(key: K, value: CharacterDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
  }
  const assign = (stat: Stat, value: number) => setDraft((d) => {
    const swapped = STAT_ORDER.find((k) => d.stats[k] === value)!
    return { ...d, stats: { ...d.stats, [swapped]: d.stats[stat], [stat]: value } }
  })
  const submit = async () => {
    if (!card || duplicate || busy) return
    setBusy(true)
    setError('')
    try { await onConfirm(card); onClose() }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  const field = (label: string, children: ReactNode) => <label className="draft-field">{label}{children}</label>
  return (
    <Modal title="自定义车卡" className="character-draft" onClose={onClose} canClose={!busy}>
      <form onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <fieldset disabled={busy}>
          {field('角色姓名', <input className="input" data-autofocus maxLength={24} value={draft.name} onChange={(e) => update('name', e.target.value)} />)}
          <div className="draft-grid">
            {field('职业', <select className="input" value={draft.job} onChange={(e) => update('job', e.target.value as CharacterDraft['job'])}>{JOBS.map((x) => <option key={x}>{x}</option>)}</select>)}
            {field('种族', <select className="input" value={draft.ancestry} onChange={(e) => update('ancestry', e.target.value as CharacterDraft['ancestry'])}>{ANCESTRIES.map((x) => <option key={x}>{x}</option>)}</select>)}
          </div>
          <p className="small dim">职业和种族描述角色出身。属性和专长决定检定加值。</p>
          <p className="small dim">四项属性各用一次 +2、+1、0、−1。改动时会自动交换点数。</p>
          <div className="draft-grid">
            {STAT_ORDER.map((stat) => <label key={stat} className="draft-field">{SKILL_OF_STAT[stat]}
              <select className="input" value={draft.stats[stat]} onChange={(e) => assign(stat, Number(e.target.value))}>
                {STAT_BUDGET.map((n) => <option key={n} value={n}>{n > 0 ? `+${n}` : n}</option>)}
              </select>
            </label>)}
          </div>
          <p className="small dim">选两项专长。对应检定 +1，同属性专长不叠加。</p>
          <div className="draft-grid">
            {[0, 1].map((i) => <label key={i} className="draft-field">专长 {i + 1}
              <select className="input" value={draft.specialties[i]} onChange={(e) => {
                const value = SPECIALTY_NAMES.find((x) => x === e.currentTarget.value)
                if (value) update('specialties', draft.specialties.map((x, index) => index === i ? value : x))
              }}>
                {SPECIALTY_NAMES.map((x) => <option key={x} value={x} disabled={x === draft.specialties[1 - i]}>{x} · {SKILL_OF_STAT[SPECIALTIES[x]]}</option>)}
              </select>
            </label>)}
          </div>
          {field('来灰港的动机', <select className="input" value={draft.motive} onChange={(e) => update('motive', e.target.value as CharacterDraft['motive'])}>{MOTIVES.map((x) => <option key={x}>{x}</option>)}</select>)}
          {field('随身纪念物', <select className="input" value={draft.memento} onChange={(e) => update('memento', e.target.value as CharacterDraft['memento'])}>{MEMENTOS.map((x) => <option key={x}>{x}</option>)}</select>)}
        </fieldset>
        {(error || duplicate) && <p className="error" role="alert">{error || '这张桌上已经有同名角色。'}</p>}
        <div className="row end draft-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => setDraft(randomCharacterDraft([...taken, draft.name]))}>重新随机</button>
          <button className="btn primary" disabled={!card || duplicate || busy}>{busy ? '正在保存…' : action}</button>
        </div>
      </form>
    </Modal>
  )
}
