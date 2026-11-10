import type { EndingId, GameState, Tier } from './types.js'
import { CLUES, FACTS, knowsFact } from './data/clues.js'
import { LOC_NAMES } from './data/scenes.js'
import { getChar } from './fx.js'

const f = (s: GameState, k: string) => s.flags[k]

export const ENDING_TITLES: Record<EndingId, string> = {
  seal: '封存：第七道静音',
  repair: '修复：让记忆自愿留下',
  destroy: '摧毁：断开骨架',
  deliver: '交付：公会带走晶核',
  retreat: '撤离：井口之外',
  custom: '另一条路',
}

export const WELL_STATE: Record<EndingId, string> = {
  seal: '封存', repair: '修复', destroy: '摧毁', deliver: '转移', retreat: '失控 / 暂闭', custom: '其他',
}

function survivorsLine(s: GameState): string {
  const saved: string[] = []
  const lost: string[] = []
  if (f(s, 'abo')) saved.push(f(s, 'abo') === 'awake' ? '阿柏' : '阿柏（神志尚未完全恢复）')
  else lost.push('阿柏')
  if (f(s, 'xiaokui')) saved.push('小葵'); else lost.push('小葵')
  if (f(s, 'laowen')) saved.push('老温'); else lost.push('老温')
  if (s.npcs.joan.met) saved.unshift('乔安')
  else lost.unshift('乔安')
  let line = saved.length ? `被带回地面的人：${saved.join('、')}。` : ''
  if (lost.length) line += `仍留在黑暗里的：${lost.join('、')}——他们的名字被写进了下一次委托。`
  return line
}

export function buildEnding(s: GameState, id: EndingId, extra?: { variant?: string; custom?: string[] }): { title: string; paragraphs: string[] } {
  const p: string[] = []
  const tier = (f(s, 'endingTier') as string) ?? 'hit'
  const ning = !!f(s, 'ningPersuaded')
  const evelynWith = !!f(s, 'evelynWith')
  const luAt = !!f(s, 'luduoAtCore')
  const volunteer = f(s, 'volunteer') as string | undefined
  const volName = volunteer === 'ningrui' ? '宁芮' : volunteer === 'evelyn' ? '伊芙琳' : getChar(s, volunteer)?.name
  const volMem = (f(s, 'volunteerMemory') as string) || ''

  switch (id) {
    case 'seal': {
      p.push('六口钟依次响起。每一声都在井壁上点亮一条光的街道，又让它熄灭。到了第七拍，所有人都停了下来——不是因为被要求，而是因为终于明白：这一拍要由听者自己放下。')
      p.push('寂静降临。那不是空无一物的寂静，而是一扇门被轻轻合上的寂静。井中的记忆仍在，只是再也不会回应任何人。')
      if (ning) p.push('宁芮自己选择了放手。她把晶核放回控制台，闭上眼睛。走出矿井时，她已经想不起妹妹叫她的那个小名——但她记得自己是心甘情愿忘记的。')
      else p.push('宁芮没有放手。静音降临时，晶核从她掌心滑落；她茫然地看着自己的手，仿佛刚刚丢失了什么，却说不出那是什么。')
      if (tier !== 'hit') p.push('钟序并不完美。几处回声在封存前逃了出去，至今仍偶尔在矿区上方的山风里响起。')
      p.push('低层通道在你们身后坍塌。' + (evelynWith || f(s, 'evelynSolo') ? '伊芙琳领着你们从旧通风井离开，一路无话。在出口，她把手臂上的名字擦掉了——这一次，她不需要它了。' : '你们摸索着找到旧通风井，爬回了雨后的天空下。'))
      p.push('公会失去了核心，但保住了矿区的开采权。' + (luAt ? '陆铎在报告里写下“装置已失效”，然后在最后一行停顿了很久。' : ''))
      break
    }
    case 'repair': {
      p.push(`${volName ?? '一位同伴'}走到控制台前，把一段记忆交了出去${volMem ? `——“${volMem}”` : ''}。那是校准第七音所需的东西：一段自愿留下的记忆。`)
      p.push('第七音响起了。它不是声音，而是一种许可。井壁上的光城缓缓重排，街道一条条亮起——这一次，它只接受自愿走进来的人。')
      if (tier === 'partial') p.push(`校准的代价比预想的更大。${volName ?? '那位同伴'}交出的，不只是那一段，还有它周围的一圈细节；有些日子，从此只剩下轮廓。`)
      if (ning) p.push(f(s, 'ningWantsFragment') ? '宁芮在井边坐了很久。她妹妹的声音还在，只是不再呼唤她，而是像一本合上的书，安静地等着被翻开。' : '宁芮把晶核放回原位。她说，至少现在，妹妹的碎片是被好好保存着的，而不是被拿来吞噬别人。')
      else p.push('宁芮不愿离开。她坚持守在井边，直到你们答应会再回来。')
      p.push('井保存下了逝者的片段，却无法保证它们完整，更无法保证永恒。' + (luAt ? '回到地面后，公会立刻提交了对“修复后装置”的控制权申请——下一场争夺才刚刚开始。' : '消息传开后，公会的申请书在一周之内送到了镇上。'))
      if (evelynWith) p.push('伊芙琳没有跟你们回去。她说，从今往后，这里需要的不是守井者，而是图书管理员。')
      break
    }
    case 'destroy': {
      p.push('传声骨架断裂的声音，像一万个人同时停止说话。' + (f(s, 'sluiceReady') ? '与此同时，礼堂的冷却水闸轰然落下，深层的光一盏接一盏熄灭。' : ''))
      p.push('复制停止了。井中存储的所有声音——古人的、矿工的、宁芮妹妹的——都永久消失了。低层在你们身后被淹没、塌落。')
      if (tier === 'miss') p.push('骨架崩断时引发了塌方。你们是被乔安的喊声、或者说是被自己的本能拖出来的。每个人都带着伤，带着耳鸣，带着一段再也拼不完整的下坠记忆。')
      else if (tier === 'partial') p.push('碎石擦着你们的后背落下。你们跑得够快，但不够从容。')
      p.push(ning ? '宁芮跪在控制台旁，手里的晶核变成了一块普通的、冰冷的石头。她哭了很久，然后站起来，跟你们一起走了。' : '宁芮死死抱着已经熄灭的晶核，是你们把她背出来的。她一路都没有说话。')
      p.push(evelynWith || f(s, 'evelynSolo') ? '伊芙琳说，这是必要的牺牲。她说这话时没有看任何人。' : '没有人留下来守着这口井了——因为已经没有井需要守了。')
      if (s.npcs.joan.met) p.push('乔安很难过，但她接受了。她说，至少不会再有人忘记自己的姓了。')
      break
    }
    case 'deliver': {
      const v = extra?.variant
      p.push('晶核离开控制台的那一刻，井壁上的光城像被抽走了地基，缓缓沉入黑暗。矿场安静了——暂时地。')
      if (tier === 'miss') p.push('拆卸并不顺利。晶核在脱离时爆发了一次读写，在场的每个人都丢失了几分钟——你们至今不确定，那几分钟里自己说过什么。')
      p.push('陆铎用三层铅布裹住晶核，像抱着一个熟睡的孩子。' + (v === 'oversight' ? '你们要求他签下公开研究、外部监督的承诺书。他签了，字迹工整得近乎虔诚。' : v === 'split' ? '你们坚持把晶核拆分：一半交给公会，一半交给学院保管。陆铎犹豫了很久，最终同意。' : v === 'hide' ? '回程途中，你们用一块普通晶体调了包。真正的晶核，现在藏在只有你们知道的地方。' : ''))
      p.push(ning ? '宁芮跟着晶核走了。她说她要确认，公会不会把妹妹当成一件货物。' : '宁芮一路紧跟着陆铎的向导，眼睛一刻也没离开过那个铅布包裹。')
      p.push('部分失踪者获救了。但井中的声音仍能通过晶核传播——在公会的仓库里，守夜人开始在深夜听见自己母亲的声音。')
      break
    }
    case 'retreat': {
      if (s.pressure >= 6) {
        p.push('井进入了失控读写。你们没有再试图阻止它——你们转身，奔跑，抓住手边能抓住的一切。')
        p.push('身后，所有声音同时响起：矿工的、古人的、你们自己的。光城的街道沿着矿道向外蔓延，一直漫到矿口。三天后，白砾镇上开始有人在梦里说出陌生人的名字。')
      } else {
        p.push('你们决定不在此刻做出替所有人决定的选择。你们带着能带走的人和证据，沿原路撤离。')
        p.push('井在你们身后暂时合上了，像一只重新闭上的眼睛。它还在那里，还在听，还在等。')
      }
      p.push(ning ? '宁芮跟着你们走了出来，一步三回头。' : '宁芮没有跟你们走。最后一眼，她站在控制台旁，和井壁上的光一起轻轻摇晃。')
      p.push('这不是团灭结局。你们每个人都带走了一些东西，也都留下了一些东西。')
      break
    }
    case 'custom': {
      p.push(...(extra?.custom ?? ['你们选择了一条模组之外的路。井回应了它。']))
      break
    }
  }

  p.push(survivorsLine(s))
  return { title: ENDING_TITLES[id], paragraphs: p }
}

export function buildArchive(s: GameState): string {
  const e = s.ending
  const lines: string[] = []
  lines.push('# 章节结算 · 回声井·第七道门', '')
  lines.push(`- 章节：回声井·第七道门`)
  lines.push(`- 结局方案：${e ? e.title : '未结束'}${e?.customPlan ? `（${e.customPlan}）` : ''}`)
  lines.push(`- 回声井状态：${e ? WELL_STATE[e.id] : '运作中'}`)
  lines.push(`- 最终回声压力：${s.pressure}/6`)
  const n = s.npcs
  lines.push(`- 宁芮：${n.ningrui.met ? `${n.ningrui.attitude}（${n.ningrui.where}）` : '未接触'}`)
  lines.push(`- 乔安：${n.joan.met ? `${n.joan.attitude}，${n.joan.where}，${n.joan.status}` : '未接触'}`)
  lines.push(`- 伊芙琳：${n.evelyn.met ? `${n.evelyn.attitude}（${n.evelyn.where}）` : '未接触'}`)
  lines.push(`- 陆铎：${n.luduo.attitude}（${n.luduo.where}）`)
  lines.push(`- 获救者：${[s.npcs.joan.met && '乔安', s.flags.abo && '阿柏', s.flags.xiaokui && '小葵', s.flags.laowen && '老温'].filter(Boolean).join('、') || '无'}`)
  lines.push('', '## 角色')
  for (const c of s.party) {
    lines.push(`- **${c.name}**（${c.title}）｜承压 ${c.stress}/3｜优势 ${c.advantage}｜物品：${c.items.join('、') || '无'}${c.statuses.length ? `｜状态：${c.statuses.join('、')}` : ''}`)
    if (s.memory[c.id]) lines.push(`  - 不愿被忘记的事：${s.memory[c.id]}`)
    if (e?.takeaways[c.id]) lines.push(`  - 带走的东西：${e.takeaways[c.id]}`)
  }
  lines.push('', '## 已确认的真相')
  for (const fact of FACTS) lines.push(`- [${knowsFact(s.clues, fact.id) ? 'x' : ' '}] ${fact.title}`)
  lines.push('', '## 已公开线索')
  for (const id of s.clues) lines.push(`- ${CLUES[id]?.title}：${CLUES[id]?.text}`)
  lines.push('', '## 走过的地点', s.visited.map((v) => LOC_NAMES[v]).join(' → '))
  lines.push('', '## 下一章钩子（可选）')
  const hooks: string[] = []
  if (e?.id === 'deliver') hooks.push('公会仓库里的晶核开始向外“说话”。')
  if (e?.id === 'repair') hooks.push('公会对修复后装置的控制权申请。')
  if (e?.id === 'retreat') hooks.push('白砾镇上有人在梦里说出陌生人的名字。')
  if (!s.flags.laowen) hooks.push('老温仍留在井中的光里。')
  if (s.party.some((c) => c.items.some((i) => i.startsWith('静音晶体')))) hooks.push('被带出矿井的静音晶体。')
  hooks.push('伊芙琳搭档的名字，至今无人知道。')
  for (const h of hooks) lines.push(`- ${h}`)
  return lines.join('\n')
}

export function buildSummary(s: GameState): string {
  const loc = LOC_NAMES[s.location]
  const known = FACTS.filter((x) => knowsFact(s.clues, x.id)).map((x) => x.title)
  const party = s.party.map((c) => `${c.name} 承压${c.stress}/3 优势${c.advantage}`).join('；')
  return `队伍目前在${loc}。已经知道：${known.length ? known.join('；') : '还没有确认任何真相'}。当前目标是找到测绘队并查明回声井的真相。回声压力 ${s.pressure}/6。角色状态：${party}。`
}

export function offlineCustomEnding(s: GameState, plan: string, tier: Tier): string[] {
  const p = [`你们决定：${plan}`]
  if (tier === 'hit') p.push('方案奏效了。井在你们手中第一次安静下来——不是因为被压制，而是因为它终于得到了一个清楚的答案。')
  else if (tier === 'partial') p.push('方案大体奏效，但代价比预想的更沉重：低层通道在你们身后坍塌，有一些回声，再也找不回来了。')
  else p.push('方案只实现了一半。井在失控的边缘被勉强按住，你们带着伤和缺口离开——它迟早还会醒来。')
  p.push(s.flags.ningPersuaded ? '宁芮站在你们身边，看着这一切发生。她没有阻止，只是轻声说了句“谢谢”，不知是对你们，还是对井里的那个声音。' : '宁芮始终没有完全接受你们的决定。离开时，她回头看了很久。')
  if (s.flags.luduoAtCore) p.push('陆铎把这一切写进了报告。公会会如何回应，没人说得准。')
  if (s.flags.evelynWith || s.flags.evelynSolo) p.push('伊芙琳留在了第七道门边。她说，无论结果如何，总得有人记得这里发生过什么。')
  return p
}
