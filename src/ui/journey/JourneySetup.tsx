import { useState } from 'react'
import type { OpeningHookId } from '../../iselan/data'
import { PREGENS, SKILL_OF_STAT, STAT_ORDER, customCharacter, randomCharacterDraft, type CharacterDraft, type Pregen } from '../../iselan/play'
import { sound } from '../../audio/sound'
import { HOOKS } from './view'
import CharacterDraftDialog from './CharacterDraftDialog'

const sign = (n: number) => (n > 0 ? `+${n}` : String(n))

const PREGEN_NAMES = PREGENS.map((p) => p.name)

/** One character and the hook that brings them into the Seven Lamps. */
export default function JourneySetup({ onStart, onBack }: { onStart: (p: Pregen, hook: OpeningHookId) => void; onBack: () => void }) {
  const [pc, setPc] = useState<string>(PREGENS[0].id)
  const [hook, setHook] = useState<OpeningHookId>('memento')
  const [custom, setCustom] = useState<Pregen | null>(null)
  const [editing, setEditing] = useState(false)
  const selectDraft = (draft: CharacterDraft) => {
    const card = customCharacter(draft, custom?.id ?? `custom-${crypto.randomUUID()}`)
    setCustom(card)
    setPc(card.id)
  }
  const chosen = (custom?.id === pc ? custom : PREGENS.find((p) => p.id === pc)) ?? PREGENS[0]
  return (
    <main className="setup-screen character-setup">
      <div className="setup-wrap">
        <div className="panel setup-panel">
          <h2>选择角色</h2>
          <div className="jy-cards" role="radiogroup" aria-label="角色">
            {(custom ? [...PREGENS, custom] : PREGENS).map((p) => (
              <label key={p.id} className={'jy-card' + (pc === p.id ? ' on' : '')}>
                <input type="radio" name="character" checked={pc === p.id} onChange={() => { sound.click(); setPc(p.id) }} />
                <b>{p.name}</b><small>{p.title}</small>
              </label>
            ))}
          </div>
          <div className="row">
            <button className="btn small" onClick={() => setEditing(true)}>{custom ? '编辑自定义角色' : '自定义车卡'}</button>
            <button className="btn small" onClick={() => selectDraft(randomCharacterDraft(custom ? [...PREGEN_NAMES, custom.name] : PREGEN_NAMES))}>随机生成角色</button>
          </div>
          <details className="jy-detail">
            <summary>查看角色资料</summary>
            <p><b>{chosen.name}</b> · {chosen.title}</p>
            <p className="small">{chosen.motive}</p>
            {chosen.hook && <p className="small">{chosen.hook}</p>}
            {chosen.draft && <p className="small">专长：{chosen.draft.specialties.join('、')}</p>}
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
      {editing && <CharacterDraftDialog initial={custom?.draft} taken={PREGEN_NAMES} onConfirm={selectDraft} onClose={() => setEditing(false)} />}
    </main>
  )
}
