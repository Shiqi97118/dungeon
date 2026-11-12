import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CATALOG } from '../../iselan/achievements/catalog'
import { HIDDEN_ICONS } from '../../iselan/achievements/hiddenIcons'
import { catalogView } from '../../iselan/achievements/view'
import type { UnlockRecord } from '../../iselan/profile'
import { AchievementGallery } from './AchievementGallery'
import { EndingProgress } from './EndingProgress'
import { BUNDLED_ICONS, LOCKED_ICON, iconSrc } from './icons'
import { MAX_AUTO_TOASTS, pendingToasts, withNotified } from './toastQueue'

const unlock = (achievementId: string, unlockedAt = 1, runId = 'r1', notified = false): UnlockRecord => ({ achievementId, runId, eventId: `${runId}:1`, unlockedAt, notified })
const hidden = CATALOG.filter((a) => a.visibility !== 'public')
const leaks = (html: string, except: readonly string[] = []) =>
  hidden.filter((a) => !except.includes(a.id)).flatMap((a) => [a.name, a.description, a.flavor].filter((s) => html.includes(s)))

describe('解锁提示（02 §5、§7）', () => {
  it('只提示尚未提示过的解锁，稀有度高的在前，最多连续 3 个，其余折叠', () => {
    const view = catalogView([unlock('ST01', 1), unlock('RE01', 2), unlock('ST03', 3), unlock('SB01', 4), unlock('LG07', 5), unlock('ST02', 6, 'r0', true)])
    const batch = pendingToasts(view)
    expect(batch.shown.map((c) => c.id)).toEqual(['ST03', 'LG07', 'ST01'])
    expect(batch.shown).toHaveLength(MAX_AUTO_TOASTS)
    expect(batch.folded).toBe(2)
    expect([...batch.ids].sort()).toEqual(['LG07', 'RE01', 'SB01', 'ST01', 'ST03'])
  })

  it('标记为已提示后不再弹出；服务端已提示的视图重新载入也不弹出', () => {
    const view = catalogView([unlock('ST01'), unlock('RE01')])
    const after = withNotified(view, pendingToasts(view).ids)
    expect(pendingToasts(after).ids).toEqual([])
    const reloaded = catalogView([unlock('ST01', 1, 'r1', true), unlock('RE01', 1, 'r1', true)])
    expect(pendingToasts(reloaded).ids).toEqual([])
  })

  it('同一组件里已交给 onNotified 的不再重复提示', () => {
    const view = catalogView([unlock('ST01')])
    expect(pendingToasts(view, new Set(['ST01'])).ids).toEqual([])
  })
})

describe('图标', () => {
  it('客户端只打包公开成就的图标与统一占位图', () => {
    expect(Object.keys(BUNDLED_ICONS).sort()).toEqual([...CATALOG.filter((a) => a.visibility === 'public').map((a) => a.id), 'LOCKED'].sort())
  })

  it('未解锁的秘密成就用占位图；解锁后用服务端给的图标', () => {
    expect(iconSrc(catalogView([]).cards.find((c) => c.id === 'LG07')!)).toBe(LOCKED_ICON)
    const src = iconSrc(catalogView([unlock('LG07')]).cards.find((c) => c.id === 'LG07')!)
    expect(decodeURIComponent(src)).toContain(HIDDEN_ICONS.LG07)
    expect(iconSrc(catalogView([]).cards.find((c) => c.id === 'ST05')!)).toBe(BUNDLED_ICONS.ST05)
  })

  it('界面代码不引用完整目录（否则秘密文字会进入客户端包）', () => {
    const sources = import.meta.glob<string>(['./*.ts', './*.tsx', '!./*.test.tsx', '../../net/profile.ts'], { query: '?raw', import: 'default', eager: true })
    for (const [path, text] of Object.entries(sources)) {
      const imports = [...text.matchAll(/from '([^']+)'/g)].map((m) => m[1])
      expect(imports.filter((p) => p.includes('achievements') && !p.endsWith('achievements/types')), path).toEqual([])
      expect(imports.filter((p) => p.endsWith('.json')), path).toEqual([])
    }
  })
})

describe('图鉴与结局页', () => {
  it('图鉴：其余 40 项显示“后续版本开放”，秘密成就显示 ???，不带名称与说明', () => {
    const html = renderToStaticMarkup(<AchievementGallery view={catalogView([unlock('ST01')])} />)
    expect(leaks(html)).toEqual([])
    expect(html.match(/<span class="ach-status">后续版本开放<\/span>/g)).toHaveLength(40)
    expect(html.match(/<span class="ach-status">未解锁<\/span>/g)).toHaveLength(9)
    expect(html).toContain('???')
    expect(html).toContain('第六声之后')
    expect(html).toContain('已解锁 <b>1</b> / 50')
    expect(html).toContain('首版成就 <b>1</b> / 10')
  })

  it('图鉴：解锁 LG07 后显示它的名称，其余秘密仍隐藏', () => {
    const html = renderToStaticMarkup(<AchievementGallery view={catalogView([unlock('LG07')])} />)
    expect(html).toContain('真相无价')
    expect(leaks(html, ['LG07'])).toEqual([])
  })

  it('结局页：区分本次新获得、本局达成、首版进度与永久进度', () => {
    const view = catalogView([unlock('ST01', 1, 'old'), unlock('ST05', 2, 'r2'), unlock('ST11', 3, 'r2')])
    const html = renderToStaticMarkup(<EndingProgress view={view} runId="r2" earned={['ST01', 'ST05', 'ST11']} />)
    expect(html).toContain('<dt>本次新获得</dt><dd>2 项</dd>')
    expect(html).toContain('<dt>本局达成</dt><dd>3 项</dd>')
    expect(html).toContain('<dt>首版成就</dt><dd>3 / 10</dd>')
    expect(html).toContain('<dt>永久总进度</dt><dd>3 / 50</dd>')
    expect(html).toContain('此前已获得，本局再次达成')
    expect(html).toContain('隐藏与传奇：已获得 0 / 10')
    expect(leaks(html)).toEqual([])
  })
})
