export type FactId = 'echo' | 'bells' | 'theft' | 'paths'

export const FACTS: { id: FactId; title: string; truth: string }[] = [
  { id: 'echo', title: '井会复制声音和记忆', truth: '回声井会复制并储存人的声音与片段记忆，甚至提前播放尚未说出口的话。' },
  { id: 'bells', title: '装置靠七音钟序列控制', truth: '古代维护者用七音钟序控制读写。第七音不是发声，而是静音——它是锁。' },
  { id: 'theft', title: '井正在夺取活人的记忆', truth: '核心受损后，把活人的记忆当成修复材料。被它“读走”的东西不会回来。' },
  { id: 'paths', title: '终局有多个可行方案', truth: '核心可以被封存、修复、摧毁或带走。每条路都有代价。' },
]

export interface ClueDef {
  id: string
  fact?: FactId
  title: string
  text: string
  handout?: string
}

export const CLUES: Record<string, ClueDef> = {
  commission: {
    id: 'commission', title: '委托纸条',
    text: '公会代理人陆铎的委托。',
    handout: '白砾矿场测绘队失联。请找到队长宁芮与其余队员，带回所有仍能自行行动的人。不得擅自拆除封矿装置。报酬于镇上交付。——矿业公会代理人陆铎',
  },
  a_map: {
    id: 'a_map', title: '旧地图',
    text: '营地桌上的矿道图。边缘有七道被反复描深的竖线。',
    handout: '白砾矿场入口；旧营地；矿工宿舍；水闸礼堂；裂隙（旧地图没有标记）；“七声后停下”；一条被水渍遮住的、通往核心的虚线。',
  },
  a_recorder: {
    id: 'a_recorder', fact: 'echo', title: '仍在发热的录音筒',
    text: '录音筒不是录制品——里面的膜片还在发热，像是有什么东西正在“说话”。',
    handout: '“不要沿着我们留下的路回来。”',
  },
  a_badge: {
    id: 'a_badge', title: '半枚工牌',
    text: '帐篷里找到半枚工牌，上面写着“乔安”。她可能还活着。',
  },
  a_second: {
    id: 'a_second', fact: 'bells', title: '录音筒的第二句话',
    text: '修好录音筒后，听见了被掩盖的第二句话。',
    handout: '“第七音不是门。第七音是锁。”',
  },
  b_logbook: {
    id: 'b_logbook', fact: 'echo', title: '宿舍值班簿',
    text: '值班簿记载：井响起之后，失踪的矿工会“说出亡者的声音”。',
  },
  b_badges: {
    id: 'b_badges', fact: 'theft', title: '空白工牌',
    text: '每张床头的工牌都被“洗”成空白，不是褪色，而是名字本身被取走了。',
  },
  b_note: {
    id: 'b_note', title: '宁芮的便条',
    text: '床底压着宁芮写给乔安的便条。',
    handout: '“我听见她了。她记得我们的暗号。”——宁芮',
  },
  c_score: {
    id: 'c_score', fact: 'bells', title: '七音残谱',
    text: '礼堂石台上刻着钟序残谱：六个音符，之后是一段空白。',
    handout: '六个音符后留有一段空白。旁注：“静音须由听者作出，不可强迫。”',
  },
  c_sluice: {
    id: 'c_sluice', fact: 'paths', title: '冷却水闸',
    text: '水闸能切断核心的冷却水，令核心停止复制——代价是永久淹没低层通路。',
  },
  d_prophecy: {
    id: 'd_prophecy', fact: 'echo', title: '晶壁的预言',
    text: '晶体提前回放了一句你们还没说出口的话。',
  },
  d_carving: {
    id: 'd_carving', fact: 'bells', title: '缺一拍的刻痕',
    text: '裂隙岩壁上反复刻着七个音节，每一组都在最后缺了一拍。',
  },
  d_evelyn: {
    id: 'd_evelyn', title: '晶中的记忆',
    text: '一块晶体里封着真实的记忆：一个女人和她的搭档试图封井，搭档却在钟声中停住，忘了自己为何站在那里。',
  },
  e_letter: {
    id: 'e_letter', fact: 'theft', title: '乔安认不出的信',
    text: '乔安口袋里有一封她亲笔写的信，她却认不出那是自己的字。信上写着：“别相信熟悉的声音。”',
  },
  e_note: {
    id: 'e_note', fact: 'echo', title: '测绘队便条',
    text: '乔安记下的、关于宁芮与“妹妹”的观察。',
    handout: '宁芮说她听见妹妹叫她小时候的名字。那件事只有她们两个人知道。可声音每次都晚半拍重复她刚刚说过的话。我不知道这能证明什么。我只知道我们要离开。——乔安',
  },
  e_skeleton: {
    id: 'e_skeleton', fact: 'paths', title: '传声骨架',
    text: '核心外围有一副金属“传声骨架”。拆掉它，井就再也无法复制声音——但储存的声音也会一起消失。',
  },
  e_ring: {
    id: 'e_ring', fact: 'theft', title: '铜环',
    text: '乔安捡到一枚铜环，里面封着某人伙伴的一段记忆。也许守井者会认得它。',
  },
  f_reliefs: {
    id: 'f_reliefs', fact: 'bells', title: '七门浮雕',
    text: '门廊浮雕上有七个凹槽，依次对应七口钟——第七槽是平的，什么也不敲。',
  },
  f_ritual: {
    id: 'f_ritual', fact: 'paths', title: '封存仪式',
    text: '伊芙琳讲解了封存的步骤：依钟序敲响六音，再由听者主动“放下”，让第七音以静默完成。',
  },
  f_handprints: {
    id: 'f_handprints', title: '旧手印',
    text: '门框上的手印说明：古代人曾自愿把记忆留在这里。可现在被吞噬的人，从来没有同意过。',
  },
  f_memory: {
    id: 'f_memory', fact: 'theft', title: '伊芙琳的空缺',
    text: '伊芙琳承认：她曾成功封过一次井，代价是彻底忘记了自己的搭档。',
  },
  lu_secret: {
    id: 'lu_secret', fact: 'theft', title: '公会的隐瞒',
    text: '陆铎承认，公会早已有两名矿工因失忆被悄悄送回地面。',
  },
}

export function factProgress(clues: string[], fact: FactId) {
  const all = Object.values(CLUES).filter((c) => c.fact === fact)
  const found = all.filter((c) => clues.includes(c.id))
  return { found: found.length, total: all.length }
}

export function knowsFact(clues: string[], fact: FactId) {
  return factProgress(clues, fact).found > 0
}
