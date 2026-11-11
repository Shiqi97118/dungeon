#!/usr/bin/env node
// Checks and compiles docs/story/text/*.md against docs/story/data/vocab.v1.json.
// Grammar: docs/story/12-开工规格.md section 3.
//
//   node docs/story/tools/check-texts.mjs              check; exit 1 if a strict file has errors
//   node docs/story/tools/check-texts.mjs --all        treat every file as strict
//   node docs/story/tools/check-texts.mjs --json out.json   also write the compiled entries
//   node docs/story/tools/check-texts.mjs --verbose    list every problem in non-strict files too
//
// Read-only unless --json is given. No dependencies beyond Node itself.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const STORY = join(dirname(fileURLToPath(import.meta.url)), '..')
const TEXT_DIR = join(STORY, 'text')
const vocab = JSON.parse(readFileSync(join(STORY, 'data/vocab.v1.json'), 'utf8'))

// Files the 灰港 vertical slice reads. Others are reported but do not fail the run
// until they are migrated (task CNT-02 in 13-代码代理任务书.md).
const STRICT_FILES = ['00-通用与过渡.md', '01-灰港.md', '09-结局开篇.md']

const args = process.argv.slice(2)
const allStrict = args.includes('--all')
const verbose = args.includes('--verbose')
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null

const PLACEHOLDERS = new Set(['角色', '同伴', '队伍', '纪念物', '钟心数', '到访之声', '钟心去向', '收束之地'])
const OPS = ['≠', '≥', '≤', '=', '>', '<']
const OP_ID = { '=': 'eq', '≠': 'ne', '≥': 'ge', '≤': 'le', '>': 'gt', '<': 'lt' }
const ENTRY_FIELDS = new Set(['触发', '图', '共用', '禁止', '需知', '后置', '交互', '说明', '兜底', '行需知'])

// ---------- vocabulary lookups ----------

function index(list, extra = () => []) {
  const m = new Map()
  for (const x of list) for (const n of [x.name, ...(x.aliases ?? []), ...extra(x)]) m.set(n, x)
  return m
}
const regions = index(vocab.regions)
const npcs = index([...vocab.npcs, ...vocab.pcs])
const factions = index(vocab.factions)
const darkLines = index(vocab.darkLines)
const objects = index(vocab.objects)
const facts = index(vocab.facts)
const arcs = index(vocab.arcs)
const directions = new Map(vocab.directions.map((d) => [d.id, d]))
const tags = new Map(Object.entries(vocab.tags).flatMap(([group, list]) => list.map((t) => [t, group])))
const places = new Map()
for (const r of vocab.regions) for (const n of [r.name, ...r.aliases]) places.set(n, r.id)
for (const p of vocab.places) {
  const r = vocab.regions.find((x) => x.id === p.region)
  for (const rn of [r.name, ...r.aliases]) for (const pn of [p.name, ...p.aliases]) places.set(`${rn}·${pn}`, p.id)
}
const illustrations = new Set(
  [...readFileSync(join(STORY, '10-插图计划.md'), 'utf8').matchAll(/^\|\s*([A-Z][A-Z0-9 /-]*[A-Z0-9])\s*\|/gm)].flatMap((m) => m[1].split('/').map((x) => x.trim())),
)

function int(v) {
  const s = v.trim().replace('−', '-').replace(/^\+/, '')
  return /^-?\d+$/.test(s) ? Number(s) : null
}

function placeId(v) {
  return places.get(v.trim()) ?? null
}

function typedValue(type, raw) {
  const v = raw.trim()
  switch (type) {
    case 'int': return int(v)
    case 'place': return placeId(v)
    case 'arc': return arcs.get(v)?.id ?? null
    case 'beat': return vocab.beats[v] ?? null
    case 'outcome': return vocab.outcomes[v] ?? null
    case 'openingHook': return vocab.openingHooks[v] ?? null
    case 'direction': return directions.has(v) ? v : null
    case 'doorOutcome': return vocab.doorOutcomes[v] ?? null
    case 'textId': return /^[A-Z]+-[A-Z0-9-]+$/.test(v) ? v : null
    case 'route': {
      const ends = v.split('↔').map((x) => regions.get(x.trim())?.id)
      return ends.length === 2 && ends.every(Boolean) ? ends.sort().join('|') : null
    }
    default: return null
  }
}

// ---------- condition grammar ----------

class Problem extends Error {}

function splitTop(s, seps) {
  const out = []
  let depth = 0, cur = ''
  for (const ch of s) {
    if ('（(“【'.includes(ch)) depth++
    if ('）)”】'.includes(ch)) depth--
    if (depth === 0 && seps.includes(ch)) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

function findOp(s) {
  let best = null
  for (const op of OPS) {
    const i = s.indexOf(op)
    if (i > 0 && (best === null || i < best.i)) best = { i, op }
  }
  return best
}

// One atom: a tag, a fact, a suffix form, or key OP value.
function parseAtom(raw, ctx) {
  const s = raw.trim()
  if (/[（(]/.test(s)) throw new Problem(`条件里有括号注释，请移到“说明”：${s}`)
  if (tags.has(s)) return { tag: s }
  if (facts.has(s)) return { fact: facts.get(s).id, op: 'eq', value: true }
  for (const [suffix, state] of [['不在场', 'absent'], ['在场', 'present'], ['在队', 'in_party'], ['已见过', 'met']]) {
    const who = s.slice(0, -suffix.length)
    if (!s.endsWith(suffix)) continue
    if (npcs.has(who)) return { npc: npcs.get(who).id, presence: state }
    if (factions.has(who) && suffix !== '已见过') return { faction: factions.get(who).id, presence: state }
  }
  const found = findOp(s)
  if (!found) throw new Problem(`无法识别的条件：${s}`)
  const key = s.slice(0, found.i).trim()
  const value = s.slice(found.i + found.op.length).trim()
  const op = OP_ID[found.op]
  const isEq = op === 'eq' || op === 'ne'
  const need = (v, what) => { if (v === null || v === undefined) throw new Problem(`${key} 的取值不认识（${what}）：${value}`); return v }

  if (vocab.variables[key]) {
    const def = vocab.variables[key]
    const v = def.type === 'enum' ? def.values[value] ?? null : typedValue(def.type, value)
    need(v, def.type)
    if (def.type === 'int' && (v < def.min || v > def.max)) throw new Problem(`${key} 超出范围 ${def.min}–${def.max}：${value}`)
    if (def.type !== 'int' && !isEq) throw new Problem(`${key} 只能用 = 或 ≠：${s}`)
    return { var: def.id, op, value: v }
  }
  if (key === '事实') return { fact: need(facts.get(value)?.id, '事实'), op, value: true }
  if (darkLines.has(key)) { if (!isEq) throw new Problem(`暗线只能用 = 或 ≠：${s}`); return { darkLine: darkLines.get(key).id, op, value: need(vocab.darkLineStates[value], '暗线状态') } }
  if (factions.has(key)) { if (!isEq) throw new Problem(`势力状态只能用 = 或 ≠：${s}`); return { faction: factions.get(key).id, op, value: need(vocab.factionStates[value], '势力状态') } }
  if (objects.has(key)) { const o = objects.get(key); if (!isEq) throw new Problem(`${key} 只能用 = 或 ≠：${s}`); return { object: o.id, op, value: need(o.states[value], `${key} 的状态`) } }
  if (npcs.has(key)) { if (!isEq) throw new Problem(`人物状态只能用 = 或 ≠：${s}`); return { npc: npcs.get(key).id, op, state: need(vocab.npcStates[value], '人物状态') } }
  if (key === '态度') { if (!ctx.speaker) throw new Problem(`“态度”只能用在人物台词里；其他地方写“某某态度”：${s}`); return { attitude: ctx.speaker, op, value: need(int(value), '整数') } }
  if (key === '某人物态度') return { attitude: '*', op, value: need(int(value), '整数') }
  if (key === '某势力关系') return { relation: '*', op, value: need(int(value), '整数') }
  if (key.endsWith('态度') && npcs.has(key.slice(0, -2))) return { attitude: npcs.get(key.slice(0, -2)).id, op, value: need(int(value), '整数') }
  if (key.endsWith('关系') && factions.has(key.slice(0, -2))) return { relation: factions.get(key.slice(0, -2)).id, op, value: need(int(value), '整数') }
  if (key.endsWith('所在') && npcs.has(key.slice(0, -2))) { if (!isEq) throw new Problem(`所在只能用 = 或 ≠：${s}`); return { npc: npcs.get(key.slice(0, -2)).id, whereOp: op, place: need(placeId(value), '地点') } }
  throw new Problem(`不认识的条件键：${key}`)
}

function parseCond(raw, ctx) {
  const alts = raw.split(/\s+或\s+/)
  if (alts.length === 1 && /[^\s]或[^\s]/.test(raw) && !facts.has(raw.trim())) {
    try { return parseAtom(raw, ctx) } catch { throw new Problem(`“或”两侧要留空格：${raw}`) }
  }
  const parsed = alts.map((a) => parseAtom(a, ctx))
  return parsed.length === 1 ? parsed[0] : { any: parsed }
}

function parseList(raw, ctx) {
  return splitTop(raw, '，').map((x) => parseCond(x, ctx))
}

function parseSoft(raw, ctx) {
  return splitTop(raw, '，').map((x) => {
    const m = x.match(/^(.*?)\s*\+(\d+)$/)
    if (!m) throw new Problem(`软条件要带权重（如 夜+2）：${x}`)
    return { when: parseCond(m[1], ctx), weight: Number(m[2]) }
  })
}

function parseTrigger(raw, ctx) {
  const out = { requires: [], soft: [] }
  for (const seg of splitTop(raw, '；')) {
    const m = seg.match(/^(必|软|禁止|需知|后置)：(.*)$/)
    if (!m) throw new Problem(`条件段要以 必：/软：开头：${seg}`)
    if (m[1] === '必') out.requires.push(...parseList(m[2], ctx))
    else if (m[1] === '软') out.soft.push(...parseSoft(m[2], ctx))
    else if (m[1] === '禁止') out.forbids = parseList(m[2], ctx)
    else if (m[1] === '需知') out.knows = parseList(m[2], ctx)
    else out.effects = parseEffects(m[2], ctx)
  }
  return out
}

// 后置: what this text records. "before" items must already be settled by the action;
// "after" items (knowledge) are written once the text is shown. See 09 §2.1.
function parseEffects(raw, ctx) {
  return splitTop(raw, '；，').map((x) => {
    let m = x.match(/^(.+?)印象\s*\+\s*“(.+)”$/)
    if (m && npcs.has(m[1])) return { phase: 'after', impression: npcs.get(m[1]).id, text: m[2] }
    m = x.match(/^(.+?)已接触$/)
    if (m && factions.has(m[1])) return { phase: 'after', contact: factions.get(m[1]).id }
    m = x.match(/^(.+?)证据=(.+)$/)
    if (m && darkLines.has(m[1])) {
      const dl = darkLines.get(m[1]), ev = dl.evidence[m[2].trim()]
      if (!ev) throw new Problem(`${m[1]} 没有这条证据（见词表 darkLines.evidence）：${m[2]}`)
      return { phase: 'after', evidence: ev, darkLine: dl.id }
    }
    m = x.match(/^(.+?)对(.+?)态度=(.+)$/)
    if (m && npcs.has(m[1]) && npcs.has(m[2])) return { phase: 'before', npc: npcs.get(m[1]).id, towards: npcs.get(m[2]).id, value: int(m[3]) }
    m = x.match(/^([^=≠≥≤<>]+?)\s*([+−-]\d+)$/)
    if (m) {
      const key = m[1].trim(), delta = int(m[2])
      if (directions.has(key)) return { phase: 'before', direction: key, delta }
      if (key.endsWith('关系') && factions.has(key.slice(0, -2))) return { phase: 'before', relation: factions.get(key.slice(0, -2)).id, delta }
      if (key.endsWith('态度') && npcs.has(key.slice(0, -2))) return { phase: 'before', attitude: npcs.get(key.slice(0, -2)).id, delta }
      if (key === '空名者饥饿') return { phase: 'before', var: 'hunger', delta }
      throw new Problem(`不认识的数值变化：${x}`)
    }
    const atom = parseAtom(x, ctx)
    if (atom.op && atom.op !== 'eq') throw new Problem(`后置只能写“=”：${x}`)
    const knowledge = atom.darkLine || atom.var === 'beat' || (atom.fact && vocab.facts.find((f) => f.id === atom.fact).kind === 'knowledge')
    return { phase: knowledge ? 'after' : 'before', ...atom }
  })
}

// ---------- file parsing ----------

const ID_RE = /^#### ((GEN|GH|KV|WP|SL|QZ|EM|SS|NC)-(ENV|SCN|BEAT|DLG|BRG|TRV|RST|CLK)-(\S+)|ED-(\d+B?))(?:\s+(.*))?$/
const DLG_LINE = /^- ([^（：【]+?)(【关键句】)?(?:（(.*?)）)?：(.*)$/

function parseFile(name) {
  const lines = readFileSync(join(TEXT_DIR, name), 'utf8').split('\n')
  const entries = [], problems = []
  let cur = null
  const report = (line, msg) => problems.push({ file: name, line, id: cur?.id ?? '—', msg })
  const attempt = (line, fn) => { try { return fn() } catch (e) { if (e instanceof Problem) report(line, e.message); else throw e } }

  lines.forEach((text, i) => {
    const ln = i + 1
    if (text.startsWith('#### ')) {
      const m = text.match(ID_RE)
      if (!m) { cur = null; report(ln, `条目标题格式不对：${text}`); return }
      const kind = m[3] ?? 'END'
      cur = { id: m[1], kind, title: m[6] ?? '', file: name, line: ln, body: [], images: [] }
      if (kind === 'DLG') {
        const who = m[4].replace(/“.*$/, '')
        const speaker = npcs.get(m[4]) ?? npcs.get(who)
        if (!speaker) report(ln, `台词条目的说话人不在词表里：${m[4]}`)
        cur.speaker = speaker?.id
        cur.lines = []
      }
      entries.push(cur)
      return
    }
    if (/^#{1,3} /.test(text)) { cur = null; return }
    if (!cur) {
      if (/^\| (GEN|GH|KV|WP|SL|QZ|EM|SS|NC|ED)-/.test(text)) report(ln, '接口表还没并入条目头部（12 第 3.5 节）')
      return
    }
    if (text.startsWith('>')) { cur.body.push(text.replace(/^>\s?/, '')); return }
    if (!text.startsWith('- ')) return
    const field = text.match(/^- ([^：（【]+)：(.*)$/)
    if (field && ENTRY_FIELDS.has(field[1])) {
      const [, key, value] = field
      const ctx = { speaker: cur.speaker }
      if (key === '触发') { cur.hasTrigger = true; attempt(ln, () => Object.assign(cur, parseTrigger(value, ctx))) }
      else if (key === '禁止') attempt(ln, () => { cur.forbids = parseList(value, ctx) })
      else if (key === '需知') attempt(ln, () => { cur.knows = parseList(value, ctx) })
      else if (key === '后置') attempt(ln, () => { cur.effects = parseEffects(value, ctx) })
      else if (key === '图') cur.images = value.trim() === '无' ? [] : value.split(/[、，/]/).map((x) => x.trim()).filter(Boolean)
      else if (key === '交互') {
        const v = value.trim()
        if (v !== '无' && !vocab.interactions.includes(v)) report(ln, `交互模板不认识：${v}`)
        cur.interaction = v === '无' ? null : v
      } else if (key === '共用') cur.shared = value.trim()
      else if (key === '说明') cur.note = value.trim()
      else if (key === '兜底') cur.fallback = value.trim() === '是'
      else if (key === '行需知') attempt(ln, () => {
        const m = value.match(/^(\d+)=(.+)$/)
        if (!m) throw new Problem(`行需知写成“行号=条件”：${value}`)
        ;(cur.lineKnows ??= {})[m[1]] = parseList(m[2], ctx)
      })
      return
    }
    if (cur.kind === 'DLG') {
      const m = text.match(DLG_LINE)
      if (!m) { report(ln, `台词行格式不对：${text.slice(0, 40)}`); return }
      const [, label, key, cond, words] = m
      const line = { label: label.trim(), key: !!key, text: words, requires: [], soft: [] }
      const ctx = { speaker: cur.speaker }
      if (!vocab.dialogueLabels.includes(line.label)) attempt(ln, () => { line.requires.push(parseAtom(line.label, ctx)) })
      if (cond) attempt(ln, () => Object.assign(line, parseTrigger(cond, ctx)))
      const n = cur.lines.filter((l) => l.label === line.label).length
      line.id = `${cur.id}/${line.label}${n ? `-${n + 1}` : ''}`
      cur.lines.push(line)
      return
    }
    report(ln, `未知字段：${text.slice(0, 30)}`)
  })

  for (const e of entries) {
    if (e.kind !== 'DLG' && e.body.length === 0) problems.push({ file: name, line: e.line, id: e.id, msg: '没有正文' })
    if (e.kind !== 'DLG' && !e.hasTrigger) problems.push({ file: name, line: e.line, id: e.id, msg: '缺少“触发”' })
    for (const img of e.images) if (!illustrations.has(img)) problems.push({ file: name, line: e.line, id: e.id, msg: `插图编号不在 10-插图计划.md：${img}` })
    const all = [e.title, ...e.body, ...(e.lines ?? []).map((l) => l.text)].join('\n')
    for (const [, ph] of all.matchAll(/\{([^}]+)\}/g)) if (!PLACEHOLDERS.has(ph)) problems.push({ file: name, line: e.line, id: e.id, msg: `未定义的占位符：{${ph}}` })
  }
  return { entries, problems }
}

// ---------- run ----------

const files = readdirSync(TEXT_DIR).filter((f) => f.endsWith('.md')).sort()
const all = [], seen = new Map()
let failed = false
console.log('文本库检查（规格：docs/story/12-开工规格.md 第 3 节）\n')
for (const f of files) {
  const { entries, problems } = parseFile(f)
  for (const e of entries) {
    if (seen.has(e.id)) problems.push({ file: f, line: e.line, id: e.id, msg: `编号重复（另见 ${seen.get(e.id)}）` })
    seen.set(e.id, `${f}:${e.line}`)
  }
  const strict = allStrict || STRICT_FILES.includes(f)
  const lineCount = entries.reduce((n, e) => n + (e.lines?.length ?? 1), 0)
  console.log(`${problems.length ? (strict ? '✗' : '·') : '✓'} ${f}  条目 ${entries.length}，可展示段 ${lineCount}，问题 ${problems.length}${strict ? '（严格）' : '（待迁移，仅报告）'}`)
  if (problems.length && (strict || verbose)) for (const p of problems) console.log(`    ${p.file}:${p.line} ${p.id}  ${p.msg}`)
  if (strict && problems.length) failed = true
  all.push(...entries)
}
// Events and the achievement catalog must agree with the vocabulary (12 §4).
const events = JSON.parse(readFileSync(join(STORY, 'data/events.v1.json'), 'utf8'))
const eventTypes = new Map(events.events.map((e) => [e.type, e]))
const idSets = {
  region: new Set(vocab.regions.map((x) => x.id)),
  npc: new Set(vocab.npcs.map((x) => x.id)),
  arc: new Set(vocab.arcs.map((x) => x.id)),
  direction: new Set(vocab.directions.map((x) => x.id)),
  truth: new Set([...vocab.darkLines.map((x) => x.truthId), ...vocab.truthLayers.map((x) => x.id)]),
  bellCity: new Set(vocab.bellCities.map((x) => x.id)),
}
const eventProblems = []
if (eventTypes.size !== events.events.length) eventProblems.push('events.v1.json 里有重复的事件类型')
const catalogPath = join(STORY, '../product/narrative-v1/data/achievements.v1.json')
let catalogChecked = false
try {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')).achievements
  catalogChecked = true
  const walk = (a, r) => {
    if (r.rules) return r.rules.forEach((x) => walk(a, x))
    const def = eventTypes.get(r.type)
    if (!def) return eventProblems.push(`${a.id} 用到未定义的事件 ${r.type}`)
    for (const [k, v] of Object.entries(r.where ?? {})) {
      if (!(k in def.payload)) eventProblems.push(`${a.id} 的条件字段 ${r.type}.${k} 不在事件词表里`)
      const kind = events.fieldTypes[k]
      if (kind && idSets[kind] && !idSets[kind].has(v)) eventProblems.push(`${a.id} 的 ${k}=${v} 不在编号词表里`)
    }
    if (r.distinctBy && r.distinctBy !== 'subjectId' && !(r.distinctBy in def.payload)) eventProblems.push(`${a.id} 的去重字段 ${r.distinctBy} 不在 ${r.type} 里`)
  }
  for (const a of catalog) walk(a, a.rule)
} catch (e) {
  if (e.code !== 'ENOENT') throw e
}
console.log(`\n事件词表：${eventTypes.size} 种事件。${catalogChecked ? `成就目录对照：${eventProblems.length ? `${eventProblems.length} 处不一致` : '一致'}。` : '本分支没有成就目录（docs/product/narrative-v1），跳过对照。'}`)
for (const p of eventProblems) console.log(`    ${p}`)
if (eventProblems.length) failed = true

const total = all.reduce((n, e) => n + (e.lines?.length ?? 1), 0)
console.log(`\n合计：条目 ${all.length}，可展示段 ${total}。${failed ? '严格文件有问题，退出码 1。' : '严格文件全部通过。'}`)
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ version: 1, vocab: 'vocab.v1.json', entries: all }, null, 1) + '\n')
  console.log(`已写出 ${jsonOut}`)
}
process.exit(failed ? 1 : 0)
