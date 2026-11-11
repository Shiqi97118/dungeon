import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../iselan/config'
import { draft } from '../../iselan/events'
import { TestRun } from '../../iselan/rules/testRun'
import { placeholderValues, sceneChange, screenProblems, selectFor } from '../../iselan/texts'
import { demoBatches } from './demo'
import { blockFromPick, paginate, readerView, sceneBlocks, turnPage, type Block, type Screen } from './pages'

const para = (n: number, mark = '甲') => mark.repeat(n)
const ai = (...paragraphs: string[]): Block => ({ paragraphs, source: 'ai' })
const text = (id: string, ...paragraphs: string[]): Block => ({ paragraphs, source: id })
const chars = (sc: Screen) => [...sc.paragraphs.map((p) => p.text).join('')].length
const meetsMinimum = (sc: Screen) => sc.paragraphs.length >= 2 && chars(sc) >= CONFIG.screenMinChars

describe('每屏至少两段、不少于 180 字（09 §3.3a）', () => {
  it('一段 AI 结果加一段预写文本合成一屏，不各占一屏', () => {
    const screens = paginate([ai(para(120)), text('GH-ENV-01', para(80, '乙'))])
    expect(screens).toHaveLength(1)
    expect(screens[0].paragraphs.map((p) => p.source)).toEqual(['ai', 'GH-ENV-01'])
    expect(screens[0].problems).toEqual([])
  })

  it('短段落向后合并，直到够两段与 180 字才翻页', () => {
    const screens = paginate([ai(para(40)), text('A', para(40)), text('B', para(40)), text('C', para(100)), text('D', para(100), para(100))])
    expect(screens).toHaveLength(2)
    expect(screens[0].paragraphs.map((p) => p.source)).toEqual(['ai', 'A', 'B', 'C'])
    expect(screens.every(meetsMinimum)).toBe(true)
  })

  it('末尾不足一屏的内容并回上一屏，不会出现孤零零的一句话', () => {
    const screens = paginate([ai(para(100), para(100)), text('GEN-BRG-01', '你们来到了码头。')])
    expect(screens).toHaveLength(1)
    expect(screens[0].paragraphs.at(-1)?.text).toBe('你们来到了码头。')
  })

  it('一段预写文本不被拆到两屏', () => {
    const screens = paginate([ai(para(150), para(150)), text('GH-BEAT-01', para(60), para(60), para(60))])
    expect(screens).toHaveLength(2)
    expect(screens[1].paragraphs.map((p) => p.source)).toEqual(['GH-BEAT-01', 'GH-BEAT-01', 'GH-BEAT-01'])
  })

  it('整批都不够一屏时照样展示，但把问题交给主持人补写', () => {
    const screens = paginate([ai('只有一句话。')])
    expect(screens).toHaveLength(1)
    expect(screens[0].problems).toEqual(screenProblems(['只有一句话。']))
    expect(screens[0].problems).toHaveLength(2)
  })

  it('空段落不算一段', () => {
    const screens = paginate([ai(para(100), '  '), text('X', '', para(30))])
    expect(screens[0].paragraphs).toHaveLength(2)
    expect(screens[0].problems).toEqual([`每屏不少于 ${CONFIG.screenMinChars} 字，现在 130 字`])
  })
})

describe('换场景三段式最多分两屏（09 §3.3a，12 A11）', () => {
  const scene = (closing: number, transition: number[], arrival: number[]): Block[] => [
    { paragraphs: [para(closing)], source: 'ai', part: 'closing' },
    { paragraphs: transition.map((n) => para(n, '乙')), source: 'GEN-BRG-01', part: 'transition' },
    { paragraphs: arrival.map((n) => para(n, '丙')), source: 'GH-ENV-01', part: 'arrival' },
  ]
  const spans = (screens: Screen[]) => screens.filter((sc) => sc.paragraphs.some((p) => p.part)).length

  it('收尾与过渡各自够一屏时也不拆开，进入另起一屏', () => {
    const screens = paginate(scene(200, [100, 100], [100, 100]))
    expect(spans(screens)).toBe(2)
    expect(screens[0].paragraphs.map((p) => p.part)).toEqual(['closing', 'transition', 'transition'])
    expect(screens[1].paragraphs.map((p) => p.part)).toEqual(['arrival', 'arrival'])
  })

  it('进入只有一段时并回上一屏，三段同屏', () => {
    const screens = paginate(scene(80, [60, 80], [90]))
    expect(screens).toHaveLength(1)
    expect(screens[0].paragraphs.map((p) => p.part)).toEqual(['closing', 'transition', 'transition', 'arrival'])
  })

  it('换场景前已有内容且已够一屏时，收尾另起一屏；不够时并入同一屏', () => {
    const before = paginate([ai(para(100), para(100)), ...scene(80, [60, 80], [90]), ai(para(100))])
    expect(before).toHaveLength(3)
    expect(spans(before)).toBe(2)
    expect(before[0].paragraphs.every((p) => !p.part)).toBe(true)
    const short = paginate([ai(para(50)), ...scene(80, [60, 80], [90]), ai(para(100))])
    expect(short).toHaveLength(2)
    expect(short[0].paragraphs.map((p) => p.part ?? 'ai')).toEqual(['ai', 'closing', 'transition', 'transition'])
  })

  it('一千种长度组合：三段式从不超过两屏，除末屏整批不足外每屏达标', () => {
    let seed = 7
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), 20 + (seed % n))
    for (let i = 0; i < 1000; i++) {
      const blocks = [ai(para(rnd(200))), ...scene(rnd(200), [rnd(150), rnd(150)].slice(0, 1 + (i % 2)), [rnd(200)].concat(i % 3 ? [] : [rnd(100)])), ai(para(rnd(150)))]
      const screens = paginate(blocks)
      expect(spans(screens)).toBeLessThanOrEqual(2)
      expect(screens.every(meetsMinimum) || (screens.length === 1 && screens[0].problems.length > 0)).toBe(true)
    }
  })

  it('真实灰港数据：收尾 → 过渡（BRG）→ 进入（ENV/SCN）按顺序出现', () => {
    const run = new TestRun()
    run.commit([
      draft('region_visited', { regionId: 'gray_harbor', isOutsideStart: false, visitIndex: 1 }),
      draft('location_changed', { regionId: 'gray_harbor', placeId: 'gray_harbor.docks' }),
    ])
    const change = sceneChange(run.s, { closing: ['雨停了一会儿，码头上的人声低了下去。'], travel: false, arrival: { tags: ['雨', '场景结束'] } })
    expect(change.problems).toEqual([])
    const { blocks, missing } = sceneBlocks(change, placeholderValues(run.s, { 角色: '赫兰' }))
    expect(missing).toEqual([])
    const screens = paginate(blocks)
    expect(spans(screens)).toBeLessThanOrEqual(2)
    const parts = screens.flatMap((sc) => sc.paragraphs.map((p) => p.part))
    expect(parts.indexOf('transition')).toBeGreaterThan(parts.lastIndexOf('closing'))
    expect(parts.indexOf('arrival')).toBeGreaterThan(parts.lastIndexOf('transition'))
    expect(screens.flatMap((sc) => sc.paragraphs.map((p) => p.source))).toContain(change.transition!.unit.id)
  })
})

describe('不自动翻页，只由玩家操作', () => {
  const screens = paginate([ai(para(100), para(100)), text('A', para(100), para(100)), text('B', para(100), para(100))])

  it('页码只随“继续 / 返回”变化，到头停住', () => {
    expect(screens).toHaveLength(3)
    let page = 0
    expect(readerView(screens, page)).toMatchObject({ page: 0, canBack: false, canContinue: true, atEnd: false })
    page = turnPage(screens, page, 1)
    page = turnPage(screens, page, 1)
    expect(readerView(screens, page)).toMatchObject({ page: 2, canBack: true, canContinue: false, atEnd: true })
    expect(turnPage(screens, page, 1)).toBe(2)
    page = turnPage(screens, page, -1)
    expect(readerView(screens, page).page).toBe(1)
    expect(turnPage(screens, 0, -1)).toBe(0)
  })

  it('空批次不报错', () => {
    expect(readerView([], 0)).toMatchObject({ screen: null, total: 0, canContinue: false, atEnd: true })
  })

  it('阅读组件不使用任何计时器', () => {
    const sources = import.meta.glob<string>(['./*.{ts,tsx}', '!./*.test.ts', '../world/*.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })
    expect(Object.keys(sources)).toContain('./Reader.tsx')
    for (const src of Object.values(sources)) expect(src).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/)
  })
})

describe('预写文本进入阅读', () => {
  it('占位符被填上，台词带说话人，配图随文本', () => {
    const run = new TestRun()
    run.commit([
      draft('region_visited', { regionId: 'gray_harbor', isOutsideStart: false, visitIndex: 1 }),
      draft('location_changed', { regionId: 'gray_harbor', placeId: 'gray_harbor.seven_lamps' }),
    ])
    const pick = selectFor(run.s, 'firstMeet', { ids: ['GH-DLG-罗莎'], ctx: { present: ['rosa'] } }).pick!
    const { block, missing } = blockFromPick(pick, placeholderValues(run.s, { 角色: '赫兰' }))
    expect(missing).toEqual([])
    expect(block.speaker).toMatch(/罗莎/)
    expect(block.images).toEqual(pick.images)
    expect(block.paragraphs.join('')).not.toMatch(/[{}]/)
  })

  it('演示数据每屏都达标，第二批是三段式换场景', () => {
    const [first, second] = demoBatches()
    for (const sc of [...first.screens, ...second.screens]) expect(sc.problems).toEqual([])
    expect(second.screens.flatMap((sc) => sc.paragraphs.map((p) => p.part)).filter(Boolean)).toEqual(
      expect.arrayContaining(['closing', 'transition', 'arrival']),
    )
  })
})
