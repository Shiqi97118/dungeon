import type { Stat } from './check'
import type { Member } from './table'

/** 05 §10 pre-made characters: ids kept from the earlier chapter, names and hooks for the new world. */
export interface Pregen {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly motive: string
  readonly hook: string
  readonly memento: string
  readonly stats: Readonly<Record<Stat, number>>
}

const stats = (str: number, dex: number, ins: number, soc: number) => ({ str, dex, ins, soc })

export const PREGENS: readonly Pregen[] = [
  { id: 'helan', name: '哈兰', title: '前矿工', motive: '证明旧事故不是自己造成的', hook: '曾在塌方中丢下同伴内德，内德如今用亡者的声音说话', memento: '一枚无主工牌', stats: stats(2, 0, 1, -1) },
  { id: 'fuhe', name: '芙蕾雅', title: '巡回医者', motive: '找到一位失踪病患', hook: '曾救过乔安，但乔安不记得她；王宫医者玛琳是她的老师', memento: '一封未寄出的信', stats: stats(0, 1, 2, -1) },
  { id: 'qilan', name: '基兰', title: '钟匠学徒', motive: '听懂一段从童年起反复出现的旋律', hook: '师父是栖钟城钟匠伊娃；那段旋律是第七声的片段', memento: '失灵但仍上弦的怀表', stats: stats(-1, 1, 2, 0) },
  { id: 'luocen', name: '洛森', title: '边境向导', motive: '拿钱带家人离开矿区', hook: '受卢多雇佣过，不想再替商会冒险', memento: '缺了一齿的铜钥匙', stats: stats(1, 2, 0, -1) },
  { id: 'meijia', name: '梅格', title: '流动说书人', motive: '寻找一段被自己遗忘的故事', hook: '五年前被马库斯抹去过记忆，原本的名字在阿佳莎的名单上', memento: '写有陌生名字的石片', stats: stats(-1, 1, 0, 2) },
  { id: 'dawei', name: '达维娜', title: '遗迹学者', motive: '让古代记忆库不落入商会手中', hook: '与赛勒斯有过书信往来；曾是奥兰多院长的学生', memento: '亲友留下的布片', stats: stats(0, -1, 2, 1) },
]

export const soloMember = (p: Pregen): Member => ({ seatId: 's1', actorId: p.id, name: p.name, stats: p.stats, memento: p.memento, controller: 'human' })
