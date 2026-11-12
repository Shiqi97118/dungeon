import type { Dispatch } from 'react'
import { missingGuests, pickOf, type GestureDef, type Session, type SessionMsg } from '../../iselan/interaction'
import Settlement from './Settlement'

/** The `dialogue-gesture` template body: one card per seat, a gesture for each guest who came. */
export default function GesturePanel({ def, present, s, dispatch, onClose }: {
  def: GestureDef
  /** Guests who came (`12` 晚宴宾客数); the other seats show as empty. */
  present: readonly string[]
  s: Session
  dispatch: Dispatch<SessionMsg>
  onClose: () => void
}) {
  const locked = s.phase !== 'open'
  const missing = missingGuests(present, s.inspected)
  const name = (id: string) => def.guests.find((g) => g.id === id)!.name
  const reaction = (token: string) => def.reactions[token]
  const lines = (tokens: readonly string[]) => (
    <ul className="ix-found">
      {tokens.map((t) => (
        <li key={t}><b>{name(t.split(':')[0])}</b>：{reaction(t)}</li>
      ))}
    </ul>
  )

  return (
    <div className="ix-body">
      <p className="ix-prompt">{def.publicPrompt}</p>
      <div className="ix-grid">
        <section className="ix-stage" aria-label="席位">
          <ul className="ix-seats">
            {def.guests.map((g) => {
              const here = present.includes(g.id)
              const picked = pickOf(s.inspected, g.id)
              return (
                <li key={g.id} className={`ix-seat${here ? '' : ' empty'}`}>
                  <h3 className="ix-seat-name">{g.name}</h3>
                  {here ? (
                    <>
                      <p className="small dim">{g.look}</p>
                      <div className="ix-gestures" role="group" aria-label={`对${g.name}`}>
                        {def.gestures.map((x) => (
                          <button
                            key={x.id}
                            className={`ix-spot ix-gesture${picked === x.id ? ' seen' : ''}`}
                            onClick={() => dispatch({ type: 'choose', guestId: g.id, gestureId: x.id })}
                            disabled={locked}
                            aria-pressed={picked === x.id}
                            title={x.hint}
                          >
                            {x.label}
                          </button>
                        ))}
                      </div>
                      <p className="ix-reaction small" aria-live="polite">{picked ? reaction(`${g.id}:${picked}`) : ''}</p>
                    </>
                  ) : (
                    <p className="small dim">{def.emptySeat}</p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="ix-side" aria-label="席间">
          <Settlement
            s={s}
            dispatch={dispatch}
            onClose={onClose}
            submit={{ label: '结束周旋', action: 'complete', ready: missing.length === 0 }}
            progress={
              <>
                <p className="small dim">照应到 {present.length - missing.length}/{present.length} 位</p>
                {lines(present.map((g) => pickOf(s.inspected, g)).flatMap((p, i) => (p ? [`${present[i]}:${p}`] : [])))}
              </>
            }
            completed={(result) => (result.inspected.length ? lines(result.inspected) : <p>你们与在座各位周旋过了。</p>)}
          />
        </section>
      </div>
    </div>
  )
}
