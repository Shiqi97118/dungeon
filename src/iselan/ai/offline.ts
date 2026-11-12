import type { IntentTag } from '../data'
import type { Snapshot } from '../events'
import { situationOf, type TurnInput } from './context'
import type { Reply } from './reply'

/** Keywords for guessing the intent of a free action when no AI is available. */
const KEYWORDS: readonly (readonly [IntentTag, RegExp])[] = [
  ['战斗', /打|攻击|砍|刺|拔剑|开枪|格斗|战/],
  ['潜行', /潜|偷偷|溜|躲|藏|跟踪|尾随/],
  ['交谈', /问|说|聊|谈|告诉|打听|劝|求/],
  ['交易', /买|卖|换|付|钱|价|交易|讨价/],
  ['欺骗', /骗|撒谎|假装|冒充|伪造/],
  ['帮助', /帮|救|扶|照顾|治疗|包扎/],
  ['调查', /查|看|找|搜|检查|观察|翻|读|研究/],
  ['仪式', /祈|祷|仪式|钟|唱|召名|安名/],
  ['休息', /睡|休息|歇|扎营|吃|喝/],
  ['记录', /记|写|画|抄|登记/],
  ['离开', /离开|走|出发|告辞|回去/],
]

export function guessIntents(text: string): IntentTag[] {
  const hits = KEYWORDS.filter(([, re]) => re.test(text)).map(([tag]) => tag)
  return hits.length ? hits.slice(0, 2) : ['其他']
}

const RESULT: Readonly<Record<IntentTag, string>> = {
  调查: '你仔细看过每一处可疑的地方，有些细节对得上，有些却说不通——足够让人记下来，留待以后再想。',
  交谈: '对方听完你的话，沉默了一会儿才开口。回答不算坦白，但语气里透出的东西，比字面上的意思多。',
  潜行: '你压低脚步，贴着阴影前进。没有人回头，可你也说不准，是不是真的没人看见。',
  战斗: '冲突来得又快又乱。等尘埃落定，谁占了上风还不好说，但这里的人都会记住刚才那一幕。',
  交易: '一番讨价还价之后，双方各退一步。东西换了手，账也记下了，至于谁占了便宜，要过些日子才见分晓。',
  欺骗: '你的说辞听上去天衣无缝，对方点了点头。只是那一瞬间的犹豫，让你不敢确定他真的信了。',
  帮助: '你伸出手，对方愣了一下才接住。这份人情不大，却会在某个时候被想起来。',
  仪式: '你按记忆里的样子完成了每一个步骤。周围安静得出奇，好像有什么东西在远处听着。',
  休息: '你们找了个能遮风的地方，轮流合眼。疲惫退去一些，心里的事却一件也没少。',
  记录: '你把所见所闻一条条记下。字迹潦草，但这些纸页也许比记忆更可靠。',
  离开: '你们收拾好东西，离开了这里。身后的声音渐渐远了，前面的路还看不清。',
  其他: '你照自己的想法做了。事情有了一点变化，虽然还说不清是好是坏。',
}

const SUGGESTIONS: readonly string[] = ['回头去找刚才提到的人，把话问清楚', '去一个还没去过的地方看看', '做一件谁也想不到的事']

/** 12 §8.3 step 1: the offline host's reply. No proposals: the rules alone settle the action. */
export function offlineReply(s: Snapshot, input: TurnInput): Reply {
  const intents = guessIntents(input.text)
  return {
    narration: `${input.actorName}：${RESULT[intents[0]]}（${situationOf(s)}。）`,
    intents,
    emotion: null,
    suggestions: SUGGESTIONS,
    proposals: [],
  }
}
