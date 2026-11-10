import { useState } from 'react'
import type { Character, Stat } from '../game/types'
import { STAT_ORDER, STAT_NAMES } from '../game/types'
import { SPECIALTIES } from '../game/data/characters'
import {
  JOBS,
  ANCESTRIES,
  isDraftValid,
  randomDraft,
  draftToCharacter,
  randomPlayableCharacter,
} from '../game/characterDraft'
import type { CharacterDraft } from '../game/characterDraft'

export default function CharacterBuilder({ onAdd }: { onAdd: (c: Character) => void }) {
  const [name, setName] = useState('')
  const [job, setJob] = useState(JOBS[0])
  const [ancestry, setAncestry] = useState(ANCESTRIES[0])
  const [values, setValues] = useState<Record<Stat, number>>({ str: 2, dex: 1, ins: 0, soc: -1 })
  const [skills, setSkills] = useState<string[]>([])

  // 表单 → 草稿，供校验与落库共用；随机结果同样落在这些 state 里，可继续微调。
  const draft = (): CharacterDraft => ({ name, job, ancestry, stats: { ...values }, specialties: [...skills] })
  const valid = isDraftValid(draft())

  // 一键随机 / 再次随机：生成完整合法车卡并填入现有表单（不只随机姓名）。
  const roll = () => {
    const d = randomDraft()
    setName(d.name)
    setJob(d.job)
    setAncestry(d.ancestry)
    setValues({ ...d.stats })
    setSkills([...d.specialties])
  }

  // 不愿定制的玩家可跳过表单，直接加入一名完整随机角色。
  const quickAdd = () => onAdd(randomPlayableCharacter())

  const save = () => {
    onAdd(draftToCharacter(draft()))
    setName('')
  }

  return <details className="character-builder"><summary>自己车卡 · 职业、种族、属性与专长</summary>
    <p>采用本作轻量规则：将 +2、+1、0、−1 各分配一次，选择两项专长。职业与种族用于角色扮演，不额外提供数值或法术。</p>
    <div className="row">
      <button className="btn" onClick={roll}>一键随机（填入表单）</button>
      <button className="btn" onClick={roll}>再次随机</button>
      <button className="btn primary" onClick={quickAdd}>随机生成并直接加入</button>
    </div>
    <small>随机结果会填入下方表单，可继续微调后保存；「直接加入」会跳过表单，立即添加一名完整合法随机角色。</small>
    <label>姓名 <input className="input" maxLength={24} value={name} onChange={e => setName(e.target.value)} /></label>
    <label>职业 <select className="input" value={job} onChange={e => setJob(e.target.value)}>{JOBS.map(x => <option key={x}>{x}</option>)}</select></label>
    <label>种族 <select className="input" value={ancestry} onChange={e => setAncestry(e.target.value)}>{ANCESTRIES.map(x => <option key={x}>{x}</option>)}</select></label>
    <div className="stat-row">{STAT_ORDER.map(k => <label key={k}>{STAT_NAMES[k]}<select className="input" value={values[k]} onChange={e => setValues({ ...values, [k]: Number(e.target.value) })}>{[2,1,0,-1].map(x => <option key={x} value={x}>{x > 0 ? '+' : ''}{x}</option>)}</select></label>)}</div>
    <div className="chips">{SPECIALTIES.map(s => <label key={s.name} title={s.desc}><input type="checkbox" checked={skills.includes(s.name)} disabled={skills.length === 2 && !skills.includes(s.name)} onChange={e => setSkills(e.target.checked ? [...skills,s.name] : skills.filter(x => x !== s.name))} />{s.name}：{s.desc}</label>)}</div>
    <button className="btn primary" disabled={!valid} onClick={save}>保存角色并加入队伍</button>
    {!valid && <small>请填写姓名，分配不重复的四个属性值，并选择两项专长。</small>}
  </details>
}
