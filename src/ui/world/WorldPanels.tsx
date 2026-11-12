import { useState, type JSX, type KeyboardEvent } from 'react'
import type { Snapshot } from '../../iselan/events'
import { heartRows, heldSummary, PROJECT_STEPS, projectRows, STEP_LABEL, visitedRegions, worldEvents } from './view'

const TABS = [
  ['situation', '局势'],
  ['hearts', '钟心'],
  ['regions', '已到访'],
  ['projects', '事业'],
] as const
type Tab = (typeof TABS)[number][0]

export function Situation({ s }: { s: Snapshot }) {
  const { crisis, events } = worldEvents(s)
  return (
    <>
      {crisis && <div className="rd-crisis">世界已陷入全面危机</div>}
      {events.length ? (
        events.map((e, i) => (
          <article key={e.id} className={'rd-event' + (i === 0 ? ' latest' : '')}>
            <h4>{e.title}</h4>
            {(i === 0 ? e.paragraphs : e.paragraphs.slice(0, 1)).map((p, j) => <p key={j}>{p}</p>)}
          </article>
        ))
      ) : (
        <p className="dim small">远方暂时没有传来消息。</p>
      )}
    </>
  )
}

export function Hearts({ s }: { s: Snapshot }) {
  const rows = heartRows(s)
  return (
    <>
      <p className="dim small">{heldSummary(rows)}</p>
      <ul className="rd-list">
        {rows.map((r) => (
          <li key={r.cityId} className={r.held ? 'held' : ''}>
            <span>{r.city}<small className="dim">{r.region}</small></span>
            <b>{r.status}</b>
          </li>
        ))}
      </ul>
    </>
  )
}

export function Regions({ s }: { s: Snapshot }) {
  const rows = visitedRegions(s)
  return (
    <>
      {rows.length ? (
        <ul className="rd-list">
          {rows.map((r) => (
            <li key={r.id} className={r.here ? 'here' : ''}>
              <span>{r.name}{r.here && <small className="rd-here">此地</small>}</span>
              <b>{r.stage}</b>
              {r.places.length > 0 && (
                <div className="chips">
                  {r.places.map((p) => <span key={p.name} className={'chip' + (p.here ? ' spec' : '')}>{p.name}</span>)}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="dim small">还没有踏上任何地区。</p>
      )}
      <p className="dim small">其他地区将在后续版本开放。</p>
    </>
  )
}

export function Projects({ s }: { s: Snapshot }) {
  const rows = projectRows(s)
  if (!rows.length) return <p className="dim small">你们还没有在任何地方扎下自己的事业。</p>
  return (
    <>
      {rows.map((p) => (
        <article key={p.id} className="rd-project">
          <h4>{p.name}<small className="dim">{p.region}</small></h4>
          {p.stage === 'closed' ? (
            <p className="t-miss small">{p.stageLabel}</p>
          ) : (
            <ol className="rd-steps" aria-label={`阶段：${p.stageLabel}`}>
              {PROJECT_STEPS.map((st) => (
                <li key={st} className={PROJECT_STEPS.indexOf(st) <= PROJECT_STEPS.indexOf(p.stage as (typeof PROJECT_STEPS)[number]) ? 'on' : ''} aria-current={st === p.stage ? 'step' : undefined}>
                  {STEP_LABEL[st]}
                </li>
              ))}
            </ol>
          )}
          {p.next && <p className="dim small">{p.next}</p>}
          {p.sustainedProfit && <p className="small">已达成持续盈利</p>}
          {p.risks.length > 0 && (
            <div className="chips">
              {p.risks.map((r, i) => <span key={i} className="chip item">{r}</span>)}
            </div>
          )}
        </article>
      ))}
    </>
  )
}

const BODY: Record<Tab, (p: { s: Snapshot }) => JSX.Element> = { situation: Situation, hearts: Hearts, regions: Regions, projects: Projects }

/**
 * Read-only world panels. On a phone one tab shows at a time; on a wide screen all four
 * sections stack in the side column and the tab strip is hidden.
 */
export default function WorldPanels({ s }: { s: Snapshot }) {
  const [tab, setTab] = useState<Tab>('situation')
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex(([id]) => id === tab)
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = TABS[(i + d + TABS.length) % TABS.length][0]
    setTab(next)
    document.getElementById(`rd-tab-${next}`)?.focus()
  }
  return (
    <aside className="rd-world" data-tab={tab} aria-label="世界">
      <div className="rd-tabs" role="tablist" aria-label="世界面板" onKeyDown={onKeyDown}>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            id={`rd-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`rd-sec-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className={'rd-tab' + (tab === id ? ' on' : '')}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {TABS.map(([id, label]) => {
        const Body = BODY[id]
        return (
          <section key={id} id={`rd-sec-${id}`} className="rd-sec" data-sec={id} role="tabpanel" aria-labelledby={`rd-tab-${id}`}>
            <h3>{label}</h3>
            <Body s={s} />
          </section>
        )
      })}
    </aside>
  )
}
