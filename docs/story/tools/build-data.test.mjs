import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { generateTexts, generateVocab } from './build-data.mjs'

const TOOLS = dirname(fileURLToPath(import.meta.url))
const STORY = join(TOOLS, '..')
const OUT = join(STORY, '../../src/iselan/data')
const read = (p) => readFileSync(p, 'utf8')
const json = (p) => JSON.parse(read(p))
const vocab = json(join(STORY, 'data/vocab.v1.json'))
const events = json(join(STORY, 'data/events.v1.json'))
const tmp = mkdtempSync(join(tmpdir(), 'iselan-build-data-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const node = (script, args) => spawnSync(process.execPath, [join(TOOLS, script), ...args], { encoding: 'utf8' })

describe('build-data', () => {
  it('generated files match the current story data', () => {
    const compiledPath = join(tmp, 'compiled.json')
    expect(node('check-texts.mjs', ['--json', compiledPath]).status).toBe(0)
    expect(read(join(OUT, 'vocab.generated.ts'))).toBe(generateVocab(vocab, events))
    expect(read(join(OUT, 'texts.generated.ts'))).toBe(generateTexts(json(compiledPath)))
  })

  it('only strict files reach the game data', () => {
    const compiled = json(join(tmp, 'compiled.json'))
    const files = new Set(compiled.entries.filter((e) => e.strict).map((e) => e.file))
    expect([...files].sort()).toEqual(['00-通用与过渡.md', '01-灰港.md', '09-结局开篇.md'])
    expect(generateTexts(compiled)).not.toContain('"strict"')
  })

  it('fails and writes nothing when a strict text is broken', () => {
    const dir = join(tmp, 'text')
    cpSync(join(STORY, 'text'), dir, { recursive: true })
    const file = join(dir, '01-灰港.md')
    writeFileSync(file, read(file).replace('- 触发：必：', '- 触发：必：不存在的条件，'))
    const before = statSync(join(OUT, 'texts.generated.ts')).mtimeMs
    const run = node('build-data.mjs', ['--text-dir', dir])
    expect(run.status).toBe(1)
    expect(run.stdout).toContain('不存在的条件')
    expect(statSync(join(OUT, 'texts.generated.ts')).mtimeMs).toBe(before)
  })

  it('rejects an unknown payload field type', () => {
    const bad = { ...events, events: [...events.events, { type: 'x', group: 'run', payload: { a: 'mystery' } }] }
    expect(() => generateVocab(vocab, bad)).toThrow(/unknown payload field type "mystery"/)
  })
})

describe('vocabulary', () => {
  const categories = ['regions', 'places', 'bellCities', 'arcs', 'npcs', 'pcs', 'factions', 'darkLines', 'directions', 'objects', 'facts']

  it('has unique ids in every category', () => {
    for (const c of categories) {
      const ids = vocab[c].map((x) => x.id)
      expect(new Set(ids).size, c).toBe(ids.length)
    }
  })

  it('does not reuse a name or alias across categories (12 §2)', () => {
    const owner = new Map()
    for (const c of categories.filter((x) => x !== 'places')) {
      for (const x of vocab[c]) {
        for (const n of [x.name, ...(x.aliases ?? [])]) {
          if (owner.has(n) && owner.get(n) !== c) throw new Error(`“${n}” is both ${owner.get(n)} and ${c}`)
          owner.set(n, c)
        }
      }
    }
  })

  it('places point at existing regions; evidence ids are unique within a dark line', () => {
    const regions = new Set(vocab.regions.map((r) => r.id))
    for (const p of vocab.places) expect(regions.has(p.region), p.id).toBe(true)
    for (const d of vocab.darkLines) {
      const evidence = Object.values(d.evidence)
      expect(new Set(evidence).size, d.id).toBe(evidence.length)
    }
  })
})
