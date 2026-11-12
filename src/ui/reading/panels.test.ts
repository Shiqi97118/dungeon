import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TEXTS } from '../../iselan/data'
import { draft } from '../../iselan/events'
import { createProject, foundProject } from '../../iselan/rules'
import { textShownDraft } from '../../iselan/rules/clock'
import { TestRun } from '../../iselan/rules/testRun'
import { heartRows, projectRows, visitedRegions, worldEvents } from '../world/view'
import WorldPanels from '../world/WorldPanels'
import { paginate } from './pages'
import Reader from './Reader'

const ARABIC_DIGIT = /[0-9０-９]/
const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ')

function grayport() {
  const run = new TestRun()
  run.commit([
    draft('region_visited', { regionId: 'gray_harbor', isOutsideStart: false, visitIndex: 1 }),
    draft('location_changed', { regionId: 'gray_harbor', placeId: 'gray_harbor.docks' }),
    draft('location_changed', { regionId: 'gray_harbor', placeId: 'gray_harbor.seven_lamps' }),
  ])
  return run
}

describe('局势以世界事件呈现，不显示时钟数字（13 UI-01）', () => {
  it('看过的时钟事件按最近排序，标题与正文来自文本库', () => {
    const run = grayport()
    run.rounds(12)
    const { events } = worldEvents(run.s)
    expect(events.length).toBeGreaterThan(0)
    expect(events.every((e) => e.id.startsWith('GEN-CLK-'))).toBe(true)
    const rounds = events.map((e) => run.s.texts[e.id].lastRound)
    expect([...rounds].sort((a, b) => b - a)).toEqual(rounds)
    expect(events[0].title).toBe(TEXTS.find((t) => t.id === events[0].id)!.title)
  })

  it('非时钟文本不进局势', () => {
    const run = grayport()
    run.commit([textShownDraft(run.s, 'GH-ENV-01')])
    expect(worldEvents(run.s).events).toEqual([])
  })

  it('时钟走到任何一格、包括全面危机，面板上都没有阿拉伯数字', () => {
    const run = grayport()
    const clk = TEXTS.filter((t) => t.kind === 'CLK')
    run.commit(clk.map((t) => textShownDraft(run.s, t.id)))
    for (const to of [1, 5, 9, 12]) {
      run.setClock(to)
      if (to === 12) run.commit([draft('world_crisis_started', {})])
      const html = visibleText(renderToStaticMarkup(createElement(WorldPanels, { s: run.s })))
      expect(run.s.clock.value).toBe(to)
      expect(html).not.toMatch(ARABIC_DIGIT)
      expect(html).not.toMatch(/时钟/)
    }
    const html = renderToStaticMarkup(createElement(WorldPanels, { s: run.s }))
    expect(html).toContain('全面危机')
    for (const t of clk) expect(html).toContain(t.title)
  })
})

describe('钟心、已到访地区、事业', () => {
  it('钟心只写账本里知道的去向，其余为下落未明', () => {
    const run = grayport()
    run.commit([
      draft('bell_heart_moved', { bellHeartId: 'crown_bell', holder: 'party', holderId: 'helan' }),
      draft('bell_heart_moved', { bellHeartId: 'mist_bell', holder: 'faction', holderId: 'copper_guild' }),
      draft('bell_heart_moved', { bellHeartId: 'ember_bell', holder: 'destroyed', holderId: '' }),
    ])
    const rows = Object.fromEntries(heartRows(run.s).map((r) => [r.cityId, r]))
    expect(rows.crown_bell).toMatchObject({ city: '冠钟城', status: '在你们手中', held: true })
    expect(rows.mist_bell.status).toBe('在铜脉商会手中')
    expect(rows.ember_bell.status).toBe('已毁')
    expect(rows.rock_bell.status).toBe('下落未明')
    expect(renderToStaticMarkup(createElement(WorldPanels, { s: run.s }))).toContain('你们持有一枚钟心')
  })

  it('已到访地区列出到过的地点并标出此地', () => {
    const rows = visitedRegions(grayport().s)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: '灰港', stage: '平静', here: true })
    expect(rows[0].places).toEqual([{ name: '码头', here: false }, { name: '七灯酒馆', here: true }])
  })

  it('事业显示阶段与下一步还缺什么', () => {
    const run = grayport()
    expect(projectRows(run.s)).toEqual([])
    run.commit(createProject(run.s, 'aid', 'sanctuary', 'gray_harbor')!)
    expect(projectRows(run.s)[0]).toMatchObject({ name: '互助站', region: '灰港', stageLabel: '构想' })
    run.commit([draft('npc_attitude_changed', { npcId: 'rosa', towardsId: 'party', delta: 1, value: 1 })])
    const founded = foundProject(run.s, 'aid', true, 'rosa')
    if (!('drafts' in founded)) throw new Error(founded.refused)
    run.commit(founded.drafts)
    expect(projectRows(run.s)[0]).toMatchObject({ stageLabel: '创办', next: '再投入三轮行动即可运转' })
    run.commit([draft('player_project_risk', { projectId: 'aid', risk: 'tax', weathered: true })])
    expect(projectRows(run.s)[0].risks).toEqual(['征税·挺过'])
  })
})

describe('阅读组件', () => {
  it('首屏只显示第一屏的内容和“继续”，不预先展示后面几屏', () => {
    const screens = paginate([
      { paragraphs: ['甲'.repeat(100), '乙'.repeat(100)], source: 'ai' },
      { paragraphs: ['第二屏的第一段'.repeat(10), '丙'.repeat(120)], source: 'GH-ENV-01' },
    ])
    expect(screens).toHaveLength(2)
    const html = renderToStaticMarkup(createElement(Reader, { screens }))
    expect(html).toContain('继续')
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('第二屏的第一段')
    expect(html).toContain('第 1 / 2 屏')
  })
})
