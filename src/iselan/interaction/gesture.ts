import type { FactionId, InteractionId } from '../data/vocab.generated'
import type { SkipCheck } from './evidence'

/** A seat at the table. Whether its guest came is game state (`12` 晚宴宾客数), not part of the definition. */
export interface Guest {
  readonly id: string
  readonly name: string
  readonly faction: FactionId
  /** How the seat looks before the party turns to it. */
  readonly look: string
}

export interface Gesture {
  readonly id: string
  readonly label: string
  readonly hint: string
}

/**
 * `dialogue-gesture`: one gesture per guest who came. Gestures change only how the scene plays
 * (`03` expressiveOnly): no relation, attitude or fact follows from them, so a clumsy pick costs
 * nothing (`03`：不因错过点击而自动损失友情).
 */
export interface GestureDef {
  readonly template: Extract<InteractionId, 'dialogue-gesture'>
  readonly textId: string
  readonly title: string
  readonly publicPrompt: string
  readonly guests: readonly Guest[]
  readonly gestures: readonly Gesture[]
  /** `${guestId}:${gestureId}` → how that guest takes it. Manner only: never a new fact. */
  readonly reactions: Readonly<Record<string, string>>
  readonly emptySeat: string
  readonly skipCheck: SkipCheck
}

export const pickToken = (guestId: string, gestureId: string) => `${guestId}:${gestureId}`

/** The gesture chosen for `guestId` in `picks`, if any. */
export function pickOf(picks: readonly string[], guestId: string): string | null {
  const t = picks.find((p) => p.startsWith(`${guestId}:`))
  return t ? t.slice(guestId.length + 1) : null
}

export function missingGuests(present: readonly string[], picks: readonly string[]): string[] {
  return present.filter((g) => pickOf(picks, g) === null)
}

/** GH-SCN-09: the three named seats; the silver-leaf seat stays empty in v1 and is not a guest. */
export const BANQUET: GestureDef = {
  template: 'dialogue-gesture',
  textId: 'GH-SCN-09',
  title: '铜塔的晚宴',
  publicPrompt: '酒杯举起来了，没有人先开口。你们要怎样对待在座的每一位？',
  guests: [
    { id: 'envoy', name: '王室使者', faction: 'kalvis_crown', look: '坐得笔直，手套一直没有摘。' },
    { id: 'professor', name: '学院教授', faction: 'star_academy', look: '在餐巾上写着什么，写完又折起来。' },
    { id: 'grayrobe', name: '灰袍人', faction: 'bellkeepers', look: '兜帽压得很低，杯里的酒一口没动。' },
  ],
  gestures: [
    { id: 'toast', label: '举杯致意', hint: '照规矩来，先表明善意。' },
    { id: 'silence', label: '静听不语', hint: '让对方先开口。' },
    { id: 'token', label: '递上名片', hint: '把你们的名字留给对方。' },
    { id: 'interject', label: '接过话头', hint: '在柯德里克停顿时把话题引向对方。' },
  ],
  reactions: {
    'envoy:toast': '使者回了一个分毫不差的礼，像是在宫里练过上千次。',
    'envoy:silence': '使者等了一会儿，见你们不说话，嘴角动了动，像是满意，又像是失望。',
    'envoy:token': '使者接过名片，没有看，直接收进了袖口。',
    'envoy:interject': '使者顺着你们的话说了两句，每一句都很得体，每一句都没有说任何事。',
    'professor:toast': '教授愣了一下才举杯，杯沿碰到了餐巾上的字。',
    'professor:silence': '教授抬头看了你们一眼，又低头继续写，笔尖慢了下来。',
    'professor:token': '教授把名片翻过来看了看背面，好像那里本该写着别的东西。',
    'professor:interject': '教授笑了一声：“柯德里克先生的未来，总是很具体。”',
    'grayrobe:toast': '灰袍人没有举杯，只是把手放在杯口上，停了一停。',
    'grayrobe:silence': '你们不说话，灰袍人也不说话。烛火在两边之间晃了很久。',
    'grayrobe:token': '灰袍人把名片推了回来，用指尖在上面点了一下，像是记住了。',
    'grayrobe:interject': '灰袍人只回了一个字：“嗯。”兜帽下的影子朝你们这边偏了偏。',
  },
  emptySeat: '名牌还在，座位是空的。',
  skipCheck: { skill: '交涉', difficulty: 12, reason: '不讲究分寸，凭场面上的经验与各方周旋' },
}
