import type { Character, Stat } from '../types'

export const SPECIALTIES: { name: string; desc: string }[] = [
  { name: '矿道熟手', desc: '辨认矿井结构与危险支撑' },
  { name: '急救者', desc: '处理伤势、安抚惊慌者' },
  { name: '旧语学者', desc: '读写古代符号与仪式刻痕' },
  { name: '侦察员', desc: '追踪、观察、发现伏击' },
  { name: '机械匠', desc: '修理设备、拆解机关' },
  { name: '谈判人', desc: '听出诉求、提出互利条件' },
  { name: '野外人', desc: '导航、觅食、辨识自然材料' },
  { name: '演奏者', desc: '节奏、声音、记忆和情绪表达' },
  { name: '影行者', desc: '潜行、藏匿、无声移动' },
  { name: '护卫', desc: '保护同伴、控制危险距离' },
  { name: '记述者', desc: '整理线索、发现叙述矛盾' },
]

export const ITEMS = [
  '绳索与钩爪', '可靠灯具', '急救包', '撬棍', '测绘工具', '旧地图', '折叠镜', '录音筒',
  '简易乐器', '信号弹', '工会通行证', '防水斗篷', '两人份干粮', '可拆卸水闸扳手',
]

export const BACKGROUNDS = ['矿场工匠', '城镇医者', '流浪向导', '学院研究员', '退役护卫', '地方信使']
export const MOTIVES = [
  '证明自己没有抛下旧伙伴', '找回家族遗物', '还清一笔人情债',
  '调查一段不合常理的记忆', '保护委托人雇来的某个人', '需要钱离开故乡',
]
export const CONFLICTS = [
  '想被信任却习惯隐瞒', '崇尚秩序但不服从权威', '勇敢行动却害怕被遗忘',
  '看重承诺却曾违约', '追求真相却不愿听答案', '擅长独处但希望有人留下',
]
export const MEMENTOS = [
  '一封未寄出的信', '缺了一齿的铜钥匙', '亲友留下的布片',
  '一枚无主工牌', '写有陌生名字的石片', '失灵但仍上弦的怀表',
]
export const RELATIONS = [
  '我曾把命交给 ____，但没告诉其他人原因。',
  '____ 知道我在寻找什么，我希望对方别说出来。',
  '我欠 ____ 一个解释；我一直在拖延。',
  '____ 和我来自相同的地方，但记得的版本不同。',
  '我不完全信任 ____，但此刻只相信对方。',
  '我曾经救过 ____；如今角色互换了。',
]

const RANDOM_NAMES = ['沈砾', '温缇', '柯桑', '黎川', '苏曜', '荀溪', '岑白', '陶鸣', '纪霜', '阮澈', '顾棠', '许砚']
const SIGILS = ['岩', '药', '钟', '径', '声', '卷', '烛', '铃', '石', '羽', '灯', '弦']

function stats(str: number, dex: number, ins: number, soc: number): Record<Stat, number> {
  return { str, dex, ins, soc }
}

type Preset = Omit<Character, 'stress' | 'advantage' | 'statuses' | 'out' | 'spentItems' | 'reason'> & { reason?: string }

export const PREGENS: Preset[] = [
  {
    id: 'helan', name: '赫岚', title: '前矿工', sigil: '岩', hue: 28,
    stats: stats(2, 0, 1, -1), specialties: ['矿道熟手', '护卫'], items: ['绳索与钩爪', '撬棍'],
    motive: '证明旧事故不是自己造成的', hook: '曾在一次塌方中丢下同伴', memento: '一枚无主工牌',
  },
  {
    id: 'fuhe', name: '芙禾', title: '巡回医者', sigil: '药', hue: 150,
    stats: stats(0, 1, 2, -1), specialties: ['急救者', '记述者'], items: ['急救包', '旧地图'],
    motive: '找到一位失踪病患', hook: '曾救过乔安，但她不记得芙禾', memento: '一封未寄出的信',
  },
  {
    id: 'qilan', name: '祁岚', title: '钟匠学徒', sigil: '钟', hue: 200,
    stats: stats(-1, 1, 2, 0), specialties: ['机械匠', '演奏者'], items: ['测绘工具', '简易乐器'],
    motive: '听懂一段从童年起反复出现的旋律', hook: '相信伊芙琳说的部分真相', memento: '失灵但仍上弦的怀表',
  },
  {
    id: 'luocen', name: '洛岑', title: '边境向导', sigil: '径', hue: 90,
    stats: stats(1, 2, 0, -1), specialties: ['野外人', '侦察员'], items: ['可靠灯具', '防水斗篷'],
    motive: '拿钱带家人离开矿区', hook: '受陆铎雇佣过，但不想再次替公会冒险', memento: '缺了一齿的铜钥匙',
  },
  {
    id: 'meijia', name: '梅迦', title: '流动说书人', sigil: '声', hue: 320,
    stats: stats(-1, 1, 0, 2), specialties: ['谈判人', '演奏者'], items: ['录音筒', '折叠镜'],
    motive: '寻找一段被自己遗忘的故事', hook: '曾把某位同伴的秘密写进故事，尚未承认', memento: '写有陌生名字的石片',
  },
  {
    id: 'dawei', name: '达薇', title: '遗迹学者', sigil: '卷', hue: 260,
    stats: stats(0, -1, 2, 1), specialties: ['旧语学者', '记述者'], items: ['旧地图', '测绘工具'],
    motive: '让古代记忆库不落入公会手中', hook: '和伊芙琳的师父有过书信往来', memento: '亲友留下的布片',
  },
]

export function makeCharacter(p: Preset): Character {
  return {
    ...p,
    reason: p.reason ?? p.motive,
    items: [...p.items],
    specialties: [...p.specialties],
    spentItems: [],
    stress: 0,
    advantage: 1,
    statuses: [],
    out: false,
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function randomCharacter(takenNames: string[]): Character {
  const name = pick(RANDOM_NAMES.filter((n) => !takenNames.includes(n))) ?? '无名'
  const vals = shuffle([2, 1, 0, -1])
  const specs = shuffle(SPECIALTIES.map((s) => s.name)).slice(0, 2)
  const items = shuffle(ITEMS).slice(0, 2)
  const bg = pick(BACKGROUNDS)
  const motive = pick(MOTIVES)
  return makeCharacter({
    id: 'r' + Math.random().toString(36).slice(2, 8),
    name,
    title: bg,
    sigil: pick(SIGILS),
    hue: Math.floor(Math.random() * 360),
    stats: stats(vals[0], vals[1], vals[2], vals[3]),
    specialties: specs,
    items,
    motive,
    hook: pick(CONFLICTS),
    memento: pick(MEMENTOS),
  })
}
