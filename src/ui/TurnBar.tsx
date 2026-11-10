import type { GameState } from '../game/types'
import { canAct } from '../game/conds'
import { CondChips, Sigil } from './bits'

export default function TurnBar({ state, ownerOf, isMine }: {
  state: GameState
  ownerOf?: (charId: string) => string | undefined
  isMine: (charId: string) => boolean
}) {
  const t = state.turns
  if (!t) return null
  const inOrder = new Set(t.order.map((e) => e.id))
  const benched = state.party.filter((c) => !inOrder.has(c.id) || !canAct(c))
  return (
    <div className="turnbar">
      <div className="turn-round"><small>第</small><b>{t.round}</b><small>轮</small></div>
      <div className="turn-order">
        {t.order.map((e, i) => {
          const c = state.party.find((p) => p.id === e.id)
          if (!c || !canAct(c)) return null
          const active = t.activeId === c.id
          const done = i < t.idx
          return (
            <div
              key={c.id}
              className={`turn-chip ${active ? 'active' : ''} ${done ? 'done' : ''} ${isMine(c.id) ? 'mine' : ''}`}
              style={{ ['--hue' as string]: c.hue }}
              title={`先攻 ${e.total}：${e.notes.join('，')}`}
            >
              <Sigil c={c} size={26} />
              <div className="turn-chip-text">
                <b>{c.name}</b>
                <small>{ownerOf?.(c.id) ?? `先攻 ${e.total}`}</small>
              </div>
              <span className="turn-init">{e.total}</span>
              <CondChips c={c} compact />
            </div>
          )
        })}
        {benched.map((c) => (
          <div key={c.id} className="turn-chip benched" style={{ ['--hue' as string]: c.hue }} title={c.out ? '暂时不在场' : '昏迷：跳过回合'}>
            <Sigil c={c} size={26} />
            <div className="turn-chip-text"><b>{c.name}</b><small>{c.out ? '不在场' : '昏迷'}</small></div>
            <CondChips c={c} compact />
          </div>
        ))}
      </div>
    </div>
  )
}
