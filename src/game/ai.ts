import type { GameState, Stat, Tier } from './types.js'
import { STAT_NAMES } from './types.js'
import { CLUES, FACTS, knowsFact } from './data/clues.js'
import { LOC_NAMES, SCENES, routeKnown } from './data/scenes.js'
import { availableActions, type AiEffects } from './engine.js'
import { CONDS, condsOf } from './conds.js'

export interface AiConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
}

const KEY = 'echo-well-ai'

export const AI_PRESETS = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
]

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...defaultConfig(), ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return defaultConfig()
}

function defaultConfig(): AiConfig {
  return { enabled: false, baseUrl: AI_PRESETS[0].baseUrl, apiKey: '', model: AI_PRESETS[0].model }
}

export function saveAiConfig(c: AiConfig) {
  localStorage.setItem(KEY, JSON.stringify(c))
}

export function aiReady(c: AiConfig) {
  return c.enabled && !!c.apiKey && !!c.baseUrl && !!c.model
}

const SYSTEM = `你是《回声井：第七道门》的 AI 主持人。你负责描述、扮演 NPC、裁定规则；玩家负责角色的意图、台词和决定。

【固定主持规则】
1. 不替玩家行动，不宣布角色内心感受或决定；可以描述外部感官、可观察反应和风险。
2. 有风险且失败有意义时才要求掷骰；无风险的常规行动直接成功，不掷骰。
3. 关键线索不被掷骰锁死；失败改变的是代价、时间或风险。允许玩家提出未列出的解法。
4. NPC 只知道其档案和亲历内容，不全知，不突然改变动机。NPC 不抢走玩家解决问题的机会。
5. 不用失败强加角色死亡、永久创伤、性暴力、酷刑。越界内容立即淡出。
6. 叙事简洁而有感官细节（2–5 句中文）。结尾留一个开放问题，不要列出“正确选项”。
7. 规则：2d6+属性(+专长1)(+情境±1)，总加值 -2~+3。10+ 成功；7–9 成功但有代价；6- 局势复杂化但故事继续。

【主持人秘闻（不可直接告诉玩家，只能通过线索与 NPC 逐步揭示）】
回声井是古代“记忆库”的损坏核心。旧文明将临终者的记忆存入井内，维护者用七音钟序控制读写；第七音是静音（锁）。第七音失衡后，装置把活人的记忆当作修复材料。井中声音是数据与拼接，不等于完整灵魂，但玩家可以选择相信其意义。井不恶意说谎、不全知。
NPC：宁芮（测绘队长，相信晶核里有妹妹，说话前先听一秒、会重复对方最后一个词）；乔安（幸存测绘员，警惕嘴硬，忘了自己的姓氏）；伊芙琳（守井者，曾封井一次，因此忘了搭档；只讲亲历的事）；陆铎（公会代理人，礼貌务实，隐瞒了两名矿工失忆被送回地面的事；证据显示失控时愿意撤退）。
回声仿兽：蝙蝠、矿尘与回声凝成，只会重复听过的声音，不以杀人为目标。弱点：稳定节奏、镜面、低频振动、静默。

【输出协议】只输出一个 JSON 对象，不要输出任何其他文字：
{
  "narration": "主持人叙述。NPC 台词用「」括起来并写明是谁说的。",
  "roll": null 或 {"actorId": "角色id", "stat": "str|dex|ins|soc", "risk": "失败可能带来的后果（一句话）"},
  "effects": {
    "pressure": 0,            // -1、0 或 1，回声压力变化
    "stress": [],             // [{"charId":"...","delta":1}]
    "advantage": [],          // [{"charId":"...","delta":1}] 仅在帮助他人/承担动机麻烦/保护队伍时
    "clues": [],              // 只能使用【可发放线索】列表里的 id
    "loseItem": [],           // 角色 id 列表，各失去一件小物
    "npc": [],                // [{"id":"ningrui|joan|evelyn|luduo","attitude":"…","where":"…"}]
    "flags": [],              // 只能使用【可设置标记】里的值
    "conds": [],              // [{"charId":"...","id":"poison|stun|tinnitus|tremble|lost|mute|bleed|chill|focus","remove":false}] 不利/有利状态
    "moveTo": null            // 只能是【可前往地点】里的代码
  }
}
如果需要掷骰：narration 只描述行动的准备和局势，roll 填写，effects 留空。
如果不需要掷骰或者已经给出掷骰结果：roll 为 null，narration 叙述结果，effects 写入状态变化。
7–9 的代价和 6- 的复杂化必须体现在 effects 里（承压、压力、失去物品、不利状态或局势变化之一）。
状态含义：poison 中毒（瘴气、毒雾）、stun 昏迷（被撞晕，跳过回合）、tinnitus 耳鸣、tremble 颤抖、lost 迷失方向、mute 短暂失声、bleed 割伤、chill 失温（落水）、focus 专注（漂亮的成功）。只在叙事合理时施加，昏迷要慎用。
这是回合制跑团：只裁定【当前行动者】的行动，不要让其他角色替他行动。`

function contextFor(s: GameState): string {
  const scene = SCENES[s.location]
  const party = s.party.map((c) =>
    `- ${c.name}（id:${c.id}，${c.title}）强韧${c.stats.str} 灵巧${c.stats.dex} 洞察${c.stats.ins} 交涉${c.stats.soc}｜专长：${c.specialties.join('、')}｜物品：${c.items.join('、')}｜承压${c.stress}/3 优势${c.advantage}${c.out ? '｜暂时退出' : ''}${condsOf(c).length ? `｜状态：${condsOf(c).map((x) => CONDS[x.id].name).join('、')}` : ''}｜动机：${c.motive}`,
  ).join('\n')
  const npcs = Object.entries(s.npcs).map(([k, v]) => `- ${k}：${v.met ? `已接触，${v.attitude}，位于${v.where}，${v.status}` : '未接触'}`).join('\n')
  const found = s.clues.map((c) => `${c}（${CLUES[c]?.title}）`).join('、') || '无'
  const free = Object.values(CLUES).filter((c) => !s.clues.includes(c.id)).map((c) => `${c.id}：${c.title}——${c.text}`).join('\n')
  const facts = FACTS.map((f) => `${f.title}：${knowsFact(s.clues, f.id) ? '玩家已有线索' : '玩家尚未知晓'}`).join('；')
  const acts = availableActions(s).map((a) => a.label).join('；')
  const moves = (['B', 'C', 'D', 'E', 'F', 'G'] as const).filter((l) => l !== s.location && routeKnown(s, l)).map((l) => `${l}=${LOC_NAMES[l]}`).join('，') || '无'
  const recent = s.log.slice(-18).filter((e) => !e.forgotten).map((e) => {
    if (e.kind === 'clue') return `[线索] ${CLUES[e.text]?.title}`
    if (e.kind === 'roll') return `[掷骰] ${e.text} = ${e.total}`
    if (e.kind === 'read') return `[场景朗读] ${e.text.slice(0, 80)}…`
    return `[${e.speaker ?? e.kind}] ${e.text}`
  }).join('\n')
  return `【当前地点】${scene.code}｜${scene.title}：${scene.read}
${s.turns ? `【回合】第 ${s.turns.round} 轮，当前行动者：${s.party.find((c) => c.id === s.turns?.activeId)?.name ?? '无'}\n` : ''}【回声压力】${s.pressure}/6（4+ 时失败带来额外环境代价；6 进入终局）
【当前危机】${s.crisis ? `${s.crisis.name} ${s.crisis.progress}/${s.crisis.need}` : '无'}
【队伍】
${party}
【NPC】
${npcs}
【真相进度】${facts}
【已获线索】${found}
【可发放线索】（与当前地点或玩家行动合理相关时才发放）
${free}
【可设置标记】know_B know_C know_D know_E know_F route_G beastDone ningPersuaded joanJoined evelynWith xiaokui laowen
【可前往地点】${moves}
【本地点的预设行动参考】${acts}
【最近的记录】
${recent}`
}

export interface AiTurn {
  narration: string
  roll?: { actorId: string; stat: Stat; risk: string } | null
  effects?: AiEffects
}

async function chat(cfg: AiConfig, messages: { role: string; content: string }[], json = true): Promise<string> {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const body: Record<string, unknown> = { model: cfg.model, messages, temperature: 0.85, max_tokens: 900 }
  if (json) body.response_format = { type: 'json_object' }
  if (/api\.x\.ai/.test(url)) {
    // Grok models reason before answering; reasoning tokens count against max_tokens and default effort is too slow for a turn.
    delete body.max_tokens
    body.reasoning_effort = 'low'
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40000),
  })
  if (!res.ok) {
    const t = await res.text()
    if (json && res.status === 400 && /response_format|json/i.test(t)) return chat(cfg, messages, false)
    throw new Error(`AI 接口返回 ${res.status}：${t.slice(0, 160)}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] } | null
  return data?.choices?.[0]?.message?.content ?? ''
}

function parseTurn(raw: string): AiTurn {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return { narration: raw.trim() }
  try {
    const j = JSON.parse(m[0])
    const roll = j.roll && ['str', 'dex', 'ins', 'soc'].includes(j.roll.stat) ? j.roll : null
    return { narration: String(j.narration ?? ''), roll, effects: j.effects ?? {} }
  } catch {
    return { narration: raw.replace(/[{}"]/g, '').trim() }
  }
}

export async function aiPropose(cfg: AiConfig, s: GameState, text: string, actorName?: string): Promise<AiTurn> {
  const content = `${contextFor(s)}\n\n【玩家行动】${actorName ? `${actorName}：` : ''}${text}\n\n判断此行动是否需要掷骰，并按协议输出 JSON。`
  const raw = await chat(cfg, [{ role: 'system', content: SYSTEM }, { role: 'user', content }])
  return parseTurn(raw)
}

export async function aiResolve(
  cfg: AiConfig, s: GameState, text: string,
  r: { actorName: string; stat: Stat; dice: [number, number]; total: number; tier: Tier; risk: string },
): Promise<AiTurn> {
  const tierText = r.tier === 'hit' ? '10+ 完全成功' : r.tier === 'partial' ? '7–9 成功但有代价' : '6- 局势复杂化'
  const content = `${contextFor(s)}\n\n【玩家行动】${text}\n【掷骰结果】${r.actorName} 进行${STAT_NAMES[r.stat]}检定：${r.dice[0]}+${r.dice[1]}+加值 = ${r.total}（${tierText}）。事先说明的风险：${r.risk}\n\n叙述结果并写入 effects。roll 必须为 null。`
  const raw = await chat(cfg, [{ role: 'system', content: SYSTEM }, { role: 'user', content }])
  const t = parseTurn(raw)
  t.roll = null
  return t
}

export async function aiEnding(cfg: AiConfig, s: GameState, plan: string, tier: Tier): Promise<string[]> {
  const content = `${contextFor(s)}\n\n【玩家的终局方案】${plan}\n【执行检定】${tier === 'hit' ? '完全成功' : tier === 'partial' ? '成功但有代价' : '局势复杂化（方案仍部分实现，但代价沉重；不是团灭）'}\n\n请为这一章写出结局：4–6 段中文，每段 1–3 句。描写回声井的最终状态、宁芮/乔安/伊芙琳/陆铎的去向、矿场与公会的后果，以及清晰的代价。输出 JSON：{"paragraphs": ["…", "…"]}`
  const raw = await chat(cfg, [{ role: 'system', content: SYSTEM.split('【输出协议】')[0] }, { role: 'user', content }])
  const m = raw.match(/\{[\s\S]*\}/)
  try {
    const j = JSON.parse(m?.[0] ?? '{}')
    if (Array.isArray(j.paragraphs)) return j.paragraphs.map(String)
  } catch { /* fall through */ }
  return raw.split(/\n+/).filter(Boolean)
}

export async function aiTest(cfg: AiConfig): Promise<string> {
  const raw = await chat(cfg, [{ role: 'user', content: '用一句不超过二十字的中文描述一口会说话的古井。只输出 JSON：{"line":"…"}' }])
  const m = raw.match(/\{[\s\S]*\}/)
  try { return JSON.parse(m?.[0] ?? '{}').line ?? raw } catch { return raw }
}
