import { useEffect, useMemo, useState } from 'react'
import type { CatalogView } from '../../iselan/achievements/types'
import { axesOf, chronicleOf, directionName, snapshotOf, tableSaveFile, type Table } from '../../iselan/play'
import { profileApi } from '../../net/profile'
import { AchievementGallery } from '../achievement/AchievementGallery'
import { EndingProgress } from '../achievement/EndingProgress'

type Upload =
  | { readonly state: 'sending' }
  | { readonly state: 'done'; readonly view: CatalogView; readonly earned: readonly string[]; readonly unverified: string | null }
  | { readonly state: 'failed'; readonly message: string }

/** 06 §6 and 02 §8: the three axes, the chronicle, and what this run earned. */
export default function EndingSummary({ table, onReread, onRewind, onQuit }: { table: Table; onReread: () => void; onRewind: () => void; onQuit: () => void }) {
  const s = snapshotOf(table)
  const axes = useMemo(() => axesOf(s, table.party), [s, table.party])
  const chronicle = useMemo(() => chronicleOf(table.events), [table.events])
  const [upload, setUpload] = useState<Upload>({ state: 'sending' })
  const [gallery, setGallery] = useState(false)
  const ending = s.ending!

  const send = () => {
    setUpload({ state: 'sending' })
    profileApi.uploadRun(tableSaveFile(table)).then(
      (r) => setUpload({ state: 'done', view: r.achievements, earned: r.earned, unverified: r.verified ? null : r.reason }),
      (e: Error) => setUpload({ state: 'failed', message: e.message }),
    )
  }
  // Again after a rewind and a new ending: the server replaces this run's record, unlocks stay once per profile.
  useEffect(send, [table.events])

  return (
    <section className="jy-ending" aria-labelledby="jy-ending-title">
      <h2 id="jy-ending-title">{directionName(ending.directionId)}{ending.variant === 'settle' ? '·落地' : ending.variant === 'wander' ? '·远行' : ''}</h2>
      <div className="jy-axes">
        <article>
          <h3>世界</h3>
          <p>{axes.world ? [directionName(axes.world.primary), axes.world.secondary && directionName(axes.world.secondary)].filter(Boolean).join(' · ') : '未决'}</p>
          {!axes.world && <p className="small dim">你们在世界的故事结束之前落了笔。其他地区将在后续版本开放。</p>}
        </article>
        <article>
          <h3>事业</h3>
          <p>名声：{axes.renown}</p>
          {axes.projects.length ? <ul>{axes.projects.map((p) => <li key={p.id}>{p.text}</li>)}</ul> : <p className="small dim">这一路没有留下事业。</p>}
        </article>
        <article>
          <h3>角色</h3>
          <ul>{axes.characters.map((c) => <li key={c.actorId}><b>{c.name}</b>　{c.text}</li>)}</ul>
        </article>
      </div>
      <details className="jy-chronicle">
        <summary>编年史（{chronicle.length} 条）</summary>
        <ol>{chronicle.map((c) => <li key={c.id} className={c.kind}><span className="dim small">第 {c.round} 轮</span> {c.text}</li>)}</ol>
      </details>
      {upload.state === 'sending' && <p className="small dim" role="status">正在把这一局记进档案……</p>}
      {upload.state === 'failed' && (
        <p className="small jy-warn" role="status">档案暂时连不上，成就还没有记录（{upload.message}）。<button className="link" onClick={send}>重试</button></p>
      )}
      {upload.state === 'done' && (
        <>
          {upload.unverified && <p className="small jy-warn">这一局没有通过校验，成就不会解锁：{upload.unverified}</p>}
          <EndingProgress view={upload.view} runId={table.runId} earned={upload.earned} onOpenGallery={() => setGallery(true)} />
        </>
      )}
      <div className="jy-ending-actions">
        <button className="btn ghost" onClick={onReread}>重读结局</button>
        <button className="btn ghost" onClick={onRewind}>回到之前的决定</button>
        <button className="btn primary" onClick={onQuit}>回到标题</button>
      </div>
      {gallery && upload.state === 'done' && (
        <div className="jy-gallery" role="dialog" aria-modal="true" aria-label="成就图鉴">
          <AchievementGallery view={upload.view} onClose={() => setGallery(false)} />
        </div>
      )}
    </section>
  )
}
