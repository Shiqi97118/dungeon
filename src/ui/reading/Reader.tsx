import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { readerView, turnPage, type Screen } from './pages'

const PART_LABEL = { closing: '收尾', transition: '过渡', arrival: '进入' } as const

const artUrl = (id: string) => `${import.meta.env.BASE_URL}art/story/${id}.jpg`

/** 09 §6: the screen's own illustration, else the current place's scene image, else none. */
function Art({ ids }: { ids: readonly string[] }) {
  const [failed, setFailed] = useState<readonly string[]>([])
  const id = ids.find((x) => !failed.includes(x))
  if (!id) return null
  return (
    <figure className="rd-art">
      <img src={artUrl(id)} alt="" onError={() => setFailed((f) => [...f, id])} />
    </figure>
  )
}

const isControl = (el: EventTarget) => el instanceof HTMLElement && ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(el.tagName)

/**
 * Pages through one batch of narration (09 §3.3a). Nothing advances on its own: only 继续,
 * Enter, Space or → turns the page; ← goes back within the batch. `end` (e.g. the next
 * choices) appears once the last screen is reached. Each player's client keeps its own page.
 */
export default function Reader({ screens, fallbackImage, end }: { screens: readonly Screen[]; fallbackImage?: string; end?: ReactNode }) {
  const [batch, setBatch] = useState(screens)
  const [page, setPage] = useState(0)
  if (batch !== screens) {
    setBatch(screens)
    setPage(0)
  }
  const view = readerView(screens, page)
  const endRef = useRef<HTMLDivElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const continueRef = useRef<HTMLButtonElement>(null)
  const turned = useRef(false)

  // 继续 is disabled on the last screen and the end slot leaves when paging back; keep keyboard focus inside the reader.
  useEffect(() => {
    if (!turned.current) return
    if (view.atEnd) (endRef.current ?? screenRef.current)?.focus()
    else if (!sectionRef.current?.contains(document.activeElement)) continueRef.current?.focus()
  }, [view.atEnd, view.page])

  const go = (delta: 1 | -1) => {
    turned.current = true
    setPage(turnPage(screens, view.page, delta))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key === 'ArrowLeft' && view.canBack) go(-1)
    else if (e.key === 'ArrowRight' && view.canContinue) go(1)
    else if ((e.key === 'Enter' || e.key === ' ') && !isControl(e.target) && view.canContinue) go(1)
    else return
    e.preventDefault()
  }

  const sc = view.screen
  const images = [...(sc?.images ?? [])].reverse()
  if (fallbackImage) images.push(fallbackImage)

  return (
    <section className="rd-reader" ref={sectionRef} aria-label="叙述" onKeyDown={onKeyDown}>
      <Art key={view.page} ids={images} />
      <div className="rd-screen" ref={screenRef} aria-live="polite" aria-atomic="true" tabIndex={-1}>
        {sc?.paragraphs.map((p, i) => {
          const starts = p.part && sc.paragraphs[i - 1]?.part !== p.part
          return (
            <div key={`${view.page}-${i}`}>
              {starts && <div className="rd-part">{PART_LABEL[p.part!]}</div>}
              {p.speaker ? (
                <p className="rd-para line"><span className="rd-speaker">{p.speaker}</span>{p.text}</p>
              ) : (
                <p className={'rd-para' + (p.source === 'ai' ? ' ai' : ' written')}>{p.text}</p>
              )}
            </div>
          )
        })}
      </div>
      <nav className="rd-nav" aria-label="翻页">
        <button className="btn ghost small" onClick={() => go(-1)} disabled={!view.canBack} aria-keyshortcuts="ArrowLeft">上一屏</button>
        <span className="rd-count dim small">第 {view.total ? view.page + 1 : 0} / {view.total} 屏</span>
        <button className="btn primary" ref={continueRef} onClick={() => go(1)} disabled={!view.canContinue} aria-keyshortcuts="Enter Space ArrowRight">
          {view.canContinue ? '继续' : '已读完'}
        </button>
      </nav>
      {view.atEnd && end && (
        <div className="rd-end" ref={endRef} tabIndex={-1}>
          {end}
        </div>
      )}
    </section>
  )
}
