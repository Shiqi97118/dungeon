import type { ActionDef, GameState, LocId, SceneDef } from '../types.js'
import {
  addClue, addPressure, addStress, echo, flag, gainAdv, getChar, giveItem, hasClue,
  meet, narr, npc, setFlag, startCrisis, sys,
} from '../fx.js'
import { knowsFact } from './clues.js'

const has = (s: GameState, id: string) => s.party.some((c) => c.id === id)
const anySpec = (s: GameState, spec: string) => s.party.find((c) => c.specialties.includes(spec))
const evidenceCount = (s: GameState) => s.clues.filter((c) => c !== 'commission').length

export const LOC_NAMES: Record<LocId, string> = {
  gate: '白砾矿场入口',
  A: '旧营地',
  B: '矿工宿舍',
  C: '水闸礼堂',
  D: '结晶裂隙',
  E: '测绘队避难点',
  F: '守井者门廊',
  G: '回声井核心',
}

export const SCENES: Record<LocId, SceneDef> = {
  gate: {
    id: 'gate', code: '序', title: '白砾矿场入口', image: 'gate', ambience: 'rain',
    read: '连下三天的雨把山路冲成一道泥河。你们抵达白砾矿场时，封矿的铁门正被风吹得轻轻摇晃。门后没有矿工的灯，只有岩壁深处传来一声不合时宜的钟响。委托人说，测绘队进去已经四天，约定的信号却在昨夜从地下传了出来——那是队长自己的声音，反复说着：“不要沿着我们留下的路回来。”',
    onFirstEnter: (d) => {
      meet(d, 'luduo', { where: '矿场入口', attitude: '礼貌而急切', status: '安然' })
      addClue(d, 'commission')
      npc(d, '陆铎', '诸位来得正好。我是矿业公会的陆铎。报酬已经备好，只求一件事——把还能走路的人带出来。')
    },
    actions: [
      {
        id: 'gate_ask', group: 'talk', label: '询问陆铎测绘队的情况',
        run: (d) => {
          npc(d, '陆铎', '五个人：队长宁芮、测绘员乔安、阿柏、小葵和老温。他们是去找一条失踪的地下水道。按约定每天日落放一次信号，第四天，什么都没有。')
          npc(d, '陆铎', '直到昨夜。信号灯亮了，可传上来的是宁芮的声音——一遍一遍，像是唱片卡住了。')
          npc(d, '陆铎', '我的向导和破岩设备还在山道上，晚些我会带人下来接应。在那之前，矿里就拜托各位了。')
        },
      },
      {
        id: 'gate_press', group: 'talk', label: '追问：公会为何如此在意这座废矿',
        roll: { stat: 'soc', specialties: ['谈判人', '记述者'], risk: '他会警惕起来，往后不再轻易对你们透露消息。', missCosts: ['pressure', 'stress'] },
        outcomes: {
          hit: (d) => {
            npc(d, '陆铎', '……好吧。矿工们说，井底有东西能“听见”还没发生的事。公会想知道那是不是真的。仅此而已。')
            narr(d, '他说“仅此而已”时，视线落在了自己的靴尖上。他还有事没说。')
            setFlag(d, 'luSuspect')
          },
          partial: (d) => {
            npc(d, '陆铎', '有传言说井里的东西很值钱。我只负责把人带回来。')
            narr(d, '他的笑容变得客气而疏远。你们感觉到，他已经开始掂量你们了。')
            d.npcs.luduo.attitude = '提防'
            setFlag(d, 'luSuspect')
          },
          miss: (d) => {
            npc(d, '陆铎', '诸位拿的是救人的钱，不是问问题的钱。')
            narr(d, '他转身去催促挑夫，再也没有回头。')
            d.npcs.luduo.attitude = '提防'
          },
        },
      },
      {
        id: 'gate_tracks', group: 'act', label: '检查泥地上残缺的脚印',
        roll: { stat: 'ins', specialties: ['侦察员', '野外人'], risk: '雨水会继续冲刷痕迹，你们得多耗些时间。', missCosts: ['pressure', 'stress'] },
        outcomes: {
          hit: (d) => {
            narr(d, '五组脚印走进矿门，没有一组走出来。但其中一组——靴底有一道补丁——曾经走出门外三步，又折了回去。像是有人想离开，却在门口改变了主意。')
            setFlag(d, 'tracksRead')
            sys(d, '你们读懂了这串脚印：之后在旧营地追踪测绘队时 +1。')
          },
          partial: (d) => {
            narr(d, '雨水泡烂了大半痕迹。你们勉强辨认出：五个人进去了，其中一个曾在门口犹豫过。')
            setFlag(d, 'tracksRead')
          },
          miss: (d) => {
            narr(d, '你们蹲在泥里太久，雨水灌进了领口。痕迹在眼前一点点被冲平。')
          },
        },
      },
      {
        id: 'gate_bell', group: 'act', label: '侧耳倾听那声钟响',
        run: (d) => {
          echo(d, '当——当——当——当——当——当。')
          narr(d, '六下。然后是一段空白。奇怪的是，那段空白比钟声本身更响，像有人在黑暗里屏住了呼吸。')
          const m = anySpec(d, '演奏者')
          if (m) narr(d, `${m.name}下意识地数着音高：六个音彼此错开，却都在等待一个从未响起的第七音。`)
        },
      },
      { id: 'gate_enter', group: 'move', label: '推开铁门，走进矿井', to: 'A' },
    ],
  },

  A: {
    id: 'A', code: 'A', title: '旧营地', image: 'camp', ambience: 'cave',
    read: '倒塌的帐篷被雨水泡透，桌上摊着一张矿道图。地图边缘有七道被反复描深的竖线。空营地里，一只铜色录音筒传出队长的声音：“不要沿我们留下的路回来。”录音每隔一息重复一次。',
    onFirstEnter: (d) => {
      echo(d, '“不要沿我们留下的路回来。”……“不要沿我们留下的路回来。”')
      addClue(d, 'a_map')
      addClue(d, 'a_recorder')
      setFlag(d, 'know_B'); setFlag(d, 'know_C'); setFlag(d, 'know_D')
      sys(d, '地图标出了矿工宿舍、水闸礼堂，以及一处没有标名的裂隙。')
    },
    actions: [
      {
        id: 'a_tent', group: 'act', label: '翻找倒塌的帐篷',
        run: (d) => {
          narr(d, '湿透的帆布下压着睡袋、半截铅笔和一只摔扁的水壶。在一件外套的口袋里，你们摸到半枚断裂的工牌。')
          addClue(d, 'a_badge')
          if (has(d, 'fuhe')) narr(d, '芙禾认出了这个名字。几个月前，她在镇上的诊所里给一个叫乔安的姑娘缝过伤口。')
        },
      },
      {
        id: 'a_repair', group: 'act', label: '拆开录音筒，修好它',
        when: (s) => !flag(s, 'recorderBroken'),
        roll: {
          stat: 'ins', specialties: ['机械匠', '演奏者'], items: ['测绘工具', '录音筒'],
          risk: '膜片可能发出尖啸，惊动矿道里的东西。', missCosts: ['pressure', 'beast', 'item'], partialCosts: ['pressure', 'beast', 'item', 'stress'],
        },
        outcomes: {
          hit: (d) => {
            narr(d, '你们拨正了卡住的唱针。录音停顿了一瞬，接着传出第二句话——之前一直被第一句盖住了。')
            addClue(d, 'a_second')
            setFlag(d, 'recorderFixed')
          },
          partial: (d) => {
            narr(d, '膜片烫得惊人。在一阵刺耳的啸叫里，第二句话挤了出来。')
            addClue(d, 'a_second')
            setFlag(d, 'recorderFixed')
          },
          miss: (d) => {
            narr(d, '唱针一滑，录音筒发出一声长长的尖啸，在矿道里来回撞击。等回声退去，你们才听清夹在杂音里的那句话。')
            addClue(d, 'a_second')
            setFlag(d, 'recorderFixed')
          },
        },
      },
      {
        id: 'a_break', group: 'act', label: '砸碎录音筒，让它安静下来',
        when: (s) => !flag(s, 'recorderFixed'),
        run: (d) => {
          narr(d, '铜壳在岩石上裂开。那个声音戛然而止——随后，营地里的寂静显得过于完整了。')
          echo(d, '在很远的地方，同一句话又响了一次，然后也停了。')
          setFlag(d, 'recorderBroken')
          setFlag(d, 'skipVisitPressure')
          sys(d, '附近的回声平息了：下一次因探索而上涨的回声压力将被抵消。')
        },
      },
      {
        id: 'a_lines', group: 'act', label: '研究地图边缘的七道竖线',
        run: (d) => {
          narr(d, '七道竖线，前六道描得极深，几乎划破了纸。第七道很淡，旁边有一行小字：“七声后停下”。')
          const s = anySpec(d, '旧语学者')
          if (s) narr(d, `${s.name}注意到竖线的间距并不相等——这是一份节拍，而不是计数。`)
        },
      },
      {
        id: 'a_track', group: 'act', label: '追踪测绘队离开营地的脚印',
        roll: {
          stat: 'ins', specialties: ['侦察员', '野外人'], risk: '脚印在岩石上时断时续，跟丢会浪费时间。',
          mod: (s) => (flag(s, 'tracksRead') ? 1 : 0), modLabel: '入口处读过脚印', missCosts: ['pressure', 'stress'],
        },
        outcomes: {
          hit: (d) => {
            narr(d, '脚印在这里分成了两路：一路沉重、拖沓，往宿舍方向去了；另一路慌乱，朝矿道深处的一处避难点逃去——那串补丁靴印也在其中。')
            setFlag(d, 'know_E')
          },
          partial: (d) => {
            narr(d, '你们追着脚印深入，却在一段塌方前失去了踪迹。好在塌方后传来微弱的灯光——有人在那里。')
            setFlag(d, 'know_E')
          },
          miss: (d) => {
            narr(d, '脚印在一片碎石上消失了。你们只确认了一件事：有人往宿舍方向去了。')
          },
        },
      },
    ],
  },

  B: {
    id: 'B', code: 'B', title: '矿工宿舍', image: 'dorm', ambience: 'cave',
    read: '一排窄床沿石壁排列。每张床头都挂着空白工牌，仿佛名字被水洗掉。最里面的铺位传来一个孩子轻声数数，数到六便停下。',
    onFirstEnter: (d) => {
      echo(d, '“一……二……三……四……五……六……”')
      addClue(d, 'b_badges')
    },
    actions: [
      {
        id: 'b_logbook', group: 'act', label: '翻阅墙边的值班簿',
        run: (d) => {
          narr(d, '最后几页的字迹越来越潦草：“井又响了。老钱半夜坐起来，用他死去母亲的声音说话。他自己不知道。”')
          addClue(d, 'b_logbook')
        },
      },
      {
        id: 'b_compare', group: 'act', label: '对照值班簿与地图，推断井的守护者在哪',
        when: (s) => hasClue(s, 'b_logbook'),
        roll: { stat: 'ins', specialties: ['记述者', '矿道熟手'], items: ['旧地图', '测绘工具'], risk: '推算会花掉不少时间。', missCosts: ['pressure', 'stress'] },
        outcomes: {
          hit: (d) => {
            narr(d, '值班簿里反复出现“去门廊送饭”。你们把排班和地图上的通风井一一对上——门廊就在宿舍下方两层，一处七道门的地方。')
            setFlag(d, 'know_F')
          },
          partial: (d) => {
            narr(d, '你们大致锁定了“门廊”的方位，只是路线绕得厉害。')
            setFlag(d, 'know_F')
          },
          miss: (d) => {
            narr(d, '数字对不上。直到你们放弃时，才发现值班簿夹层里有一张手绘的箭头，指向“门廊”。')
            setFlag(d, 'know_F')
          },
        },
      },
      {
        id: 'b_counting', group: 'act', label: '走向最里面那张床——那个数数的声音',
        when: (s) => !flag(s, 'beastDone') && !s.crisis,
        run: (d) => {
          narr(d, '床上没有孩子。数数声来自床头上方的通风道。一团由蝙蝠、矿尘和回声搅成的模糊兽影从黑暗里探出来，用你们刚才的声音低声说：“……最里面那张床。”')
          narr(d, '它没有扑过来。它只是在听——等着你们发出更多声音。')
          startCrisis(d, '回声仿兽', '它模仿你们的声音，靠近声音源并吸收它。它不会主动攻击，除非受伤或被堵住退路。弱点：稳定节奏、镜面、低频振动、保持静默。')
        },
      },
      {
        id: 'b_sneak', group: 'act', label: '趁它分神，悄悄摸到床底',
        when: (s) => !!s.crisis && s.location === 'B' && !hasClue(s, 'b_note'),
        roll: { stat: 'dex', specialties: ['影行者', '侦察员'], risk: '它会发现你，并用你的声音尖叫。', missCosts: ['stress', 'pressure', 'item'] },
        outcomes: {
          hit: (d) => { narr(d, '你贴着地面滑到床下，指尖碰到一张折好的纸，又无声地退了回来。兽影始终没有回头。'); addClue(d, 'b_note'); setFlag(d, 'know_E') },
          partial: (d) => { narr(d, '你抓到了便条，可起身时碰响了床板。兽影猛地转向你。'); addClue(d, 'b_note'); setFlag(d, 'know_E') },
          miss: (d) => { narr(d, '床板吱呀一声。兽影扑下来，用你的声音在你耳边尖叫——你在慌乱中攥住了那张便条。'); addClue(d, 'b_note'); setFlag(d, 'know_E') },
        },
      },
      {
        id: 'b_note', group: 'act', label: '检查最里面的床铺',
        when: (s) => !!flag(s, 'beastDone') && !hasClue(s, 'b_note'),
        run: (d) => {
          narr(d, '床板下压着一张折好的便条，字迹被水晕开，但仍能辨认。')
          addClue(d, 'b_note')
          setFlag(d, 'know_E')
          sys(d, '便条背面画着一条通往“避难点”的路线。')
        },
      },
      {
        id: 'b_claws', group: 'act', label: '追踪仿兽留下的爪印',
        when: (s) => !!flag(s, 'beastDone'),
        run: (d) => {
          narr(d, '爪印细小而密集，一路通往一处长满白色晶体的裂隙。那里的回声，比这里更深。')
          setFlag(d, 'know_D')
        },
      },
    ],
  },

  C: {
    id: 'C', code: 'C', title: '水闸礼堂', image: 'hall', ambience: 'water',
    read: '水淹到膝部，一排石钟悬在水面上方。只有六口钟还在，最末端的空钩随水流轻轻摇晃。每当你们说话，水面都会慢半拍地重复嘴形。',
    onFirstEnter: (d) => {
      echo(d, '你们低头，看见水里的自己张了张嘴——在你们开口之前。')
    },
    actions: [
      {
        id: 'c_score', group: 'act', label: '查看石台上的钟序残谱',
        run: (d) => {
          narr(d, '石台上刻着六个符号，每个都与一口钟上的铭纹相对应。第七个位置是一段刻意磨平的空白。空白下方的箭头指向礼堂外——“门廊”。')
          addClue(d, 'c_score')
          setFlag(d, 'know_F')
        },
      },
      {
        id: 'c_bells', group: 'act', label: '按残谱敲响六口钟', repeatable: true,
        when: (s) => hasClue(s, 'c_score') && !flag(s, 'bellsSolved'),
        run: (d) => { d.queue.push({ type: 'bells', mode: 'hall' }) },
      },
      {
        id: 'c_inspect', group: 'act', label: '研究水闸机构',
        when: (s) => !hasClue(s, 'c_sluice'),
        roll: { stat: 'ins', specialties: ['机械匠', '矿道熟手'], items: ['可拆卸水闸扳手'], risk: '闸体年久失修，乱动可能卡死或伤到人。', missCosts: ['stress', 'item'] },
        outcomes: {
          hit: (d) => {
            narr(d, '锈蚀的铭牌上写着它的用途：为“深层”输送冷却水。只要关闭这道闸，核心就会停止复制。你们也看懂了它的操作——需要三个人同时动手：固定闸轮、给出节拍、涉水开底阀。')
            addClue(d, 'c_sluice')
          },
          partial: (d) => {
            narr(d, '你们拼凑出闸门的用途：切断通往核心的冷却水。代价写在铭牌底部——“关闭后低层永久淹没”。')
            addClue(d, 'c_sluice')
          },
          miss: (d) => {
            narr(d, '你们碰到一根松脱的连杆，整座闸体呻吟着沉下半寸，冰冷的水猛地涌到腰间。等稳住身形，你们才看清铭牌：冷却水闸，通往核心。')
            addClue(d, 'c_sluice')
          },
        },
      },
      {
        id: 'c_wheel', group: 'act', label: '水闸①：固定闸轮', repeatable: true,
        when: (s) => hasClue(s, 'c_sluice') && !flag(s, 'sl_wheel'),
        roll: { stat: 'str', specialties: ['矿道熟手', '护卫'], items: ['撬棍', '可拆卸水闸扳手'], risk: '闸轮可能反转，撞伤操作者。', missCosts: ['stress', 'item', 'pressure'] },
        outcomes: {
          hit: (d) => { narr(d, '闸轮发出一声沉闷的金属哀鸣，被牢牢卡住了。'); setFlag(d, 'sl_wheel'); checkSluice(d) },
          partial: (d) => { narr(d, '闸轮被你们硬生生别住，掌心被锈刺划开了口子。'); setFlag(d, 'sl_wheel'); checkSluice(d) },
          miss: (d) => { narr(d, '闸轮猛地反转，把人甩进了水里。还得再来一次。') },
        },
      },
      {
        id: 'c_beat_auto', group: 'act', label: '水闸②：按钟序给出开闸节拍',
        when: (s) => hasClue(s, 'c_sluice') && !flag(s, 'sl_beat') && !!flag(s, 'bellsSolved'),
        run: (d) => {
          narr(d, '你们已经敲过一遍钟序。这一次，节拍分毫不差。水下某处，一个机关“咔哒”一声松开了。')
          setFlag(d, 'sl_beat'); checkSluice(d)
        },
      },
      {
        id: 'c_beat', group: 'act', label: '水闸②：凭感觉辨认钟序、给出节拍', repeatable: true,
        when: (s) => hasClue(s, 'c_sluice') && !flag(s, 'sl_beat') && !flag(s, 'bellsSolved'),
        roll: { stat: 'ins', specialties: ['演奏者', '旧语学者'], items: ['简易乐器'], risk: '节拍错了，钟声会惊醒整座礼堂的回声。', missCosts: ['pressure', 'stress'] },
        outcomes: {
          hit: (d) => { narr(d, '你们哼出六个音，再在第七拍处闭上嘴。水下的机关松开了。'); setFlag(d, 'sl_beat'); checkSluice(d) },
          partial: (d) => { narr(d, '错了一拍，又纠正回来。机关迟疑着松开了。'); setFlag(d, 'sl_beat'); checkSluice(d) },
          miss: (d) => { echo(d, '六口钟同时嗡鸣，水面上浮起几十张你们的脸，一起张着嘴。'); narr(d, '机关纹丝不动。') },
        },
      },
      {
        id: 'c_wade', group: 'act', label: '水闸③：涉水打开底阀', repeatable: true,
        when: (s) => hasClue(s, 'c_sluice') && !flag(s, 'sl_wade'),
        roll: { stat: 'dex', specialties: ['野外人', '影行者'], items: ['防水斗篷', '绳索与钩爪'], risk: '水下暗流湍急，装备可能被冲走。', missCosts: ['item', 'stress'] },
        outcomes: {
          hit: (d) => { narr(d, '你们潜入冰冷的黑水，摸到底阀，一拧到底。'); setFlag(d, 'sl_wade'); checkSluice(d) },
          partial: (d) => { narr(d, '暗流几乎把人卷走。底阀开了，你们呛了好几口水才浮上来。'); setFlag(d, 'sl_wade'); checkSluice(d) },
          miss: (d) => { narr(d, '暗流把人推回了岸边。底阀还在原处。') },
        },
      },
      {
        id: 'c_rope', group: 'act', label: '沿水下的旧绳摸索',
        run: (d) => {
          narr(d, '一根浸透的麻绳贴着地面延伸，绳上每隔一段就系着一枚小铜铃。它通往礼堂背后一道泛着乳白色光的缝隙。')
          setFlag(d, 'know_D')
        },
      },
    ],
  },

  D: {
    id: 'D', code: 'D', title: '结晶裂隙', image: 'rift', ambience: 'crystal',
    read: '岩壁长满乳白色晶体，像无数朝内的耳朵。你们的倒影比动作早一步转头。某一面晶壁里，有人影站在你们身后，但回头时那里空无一物。',
    onFirstEnter: (d) => {
      const who = d.party[0]
      echo(d, `晶壁里传来${who.name}的声音，清晰得可怕：“宁芮，你听我说——那不是她。”`)
      narr(d, `${who.name}从没说过这句话。至少，现在还没有。`)
      addClue(d, 'd_prophecy')
      setFlag(d, 'prophecy', who.id)
    },
    actions: [
      {
        id: 'd_carving', group: 'act', label: '辨读岩壁上的刻痕',
        roll: { stat: 'ins', specialties: ['旧语学者', '演奏者'], risk: '盯着晶壁太久，倒影会开始比你更像你。', missCosts: ['stress', 'pressure'] },
        outcomes: {
          hit: (d) => {
            narr(d, '刻痕是七个音节，一遍又一遍。每一组都在最后缺了一拍——不是磨损，是刻意留空的。古人想让每一个读到这里的人，都亲自补上那一拍的沉默。')
            addClue(d, 'd_carving')
          },
          partial: (d) => {
            narr(d, '七个音节，缺一拍。你们读懂了，但倒影在你们读完之前，就已经念出了最后一个音节。')
            addClue(d, 'd_carving')
          },
          miss: (d) => {
            narr(d, '你们读着读着，发现嘴唇在跟着倒影动。等猛地回神，刻痕的意思已经印在脑子里了——七个音节，缺一拍。')
            addClue(d, 'd_carving')
          },
        },
      },
      {
        id: 'd_vision', group: 'act', label: '凝视那块封着人影的晶体',
        run: (d) => {
          narr(d, '晶体里，两个人站在七道门前。一个女人敲响了六口钟，另一个人——她的搭档——本该在第七拍时放下手，却在钟声中停住了。他转过头，用陌生的眼神看着她，好像从没见过她。')
          addClue(d, 'd_evelyn')
        },
      },
      {
        id: 'd_take', group: 'act', label: '撬下一枚晶体，作为静音媒介', repeatable: true,
        hint: '每枚使持有者承压 +1，最多两枚',
        when: (s) => ((s.flags.crystals as number) ?? 0) < 2,
        run: (d) => {
          const holder = [...d.party].filter((c) => !c.out).sort((a, b) => a.stress - b.stress)[0] ?? d.party[0]
          const n = ((d.flags.crystals as number) ?? 0) + 1
          d.flags.crystals = n
          giveItem(d, holder.id, `静音晶体·${n === 1 ? '壹' : '贰'}`)
          narr(d, `晶体离开岩壁的瞬间变得冰冷，四周的回声安静了一圈。${holder.name}握着它，耳边持续着一种极轻的嗡鸣。`)
          addStress(d, holder.id)
        },
      },
      {
        id: 'd_reflect', group: 'talk', label: '与晶壁里的倒影对话',
        run: (d) => {
          narr(d, '倒影停下了。它比你们先开口，用的是你们的声音：')
          d.queue.push({ type: 'memory', charId: d.party[0].id })
        },
      },
      {
        id: 'd_tracks', group: 'act', label: '沿着晶面上的足迹前进',
        run: (d) => {
          narr(d, '晶尘上留着几串脚印，其中一串是补丁靴印。它们通向一处有灯光的避难点。')
          setFlag(d, 'know_E')
        },
      },
      {
        id: 'd_crack', group: 'move', label: '挤进晶体裂缝，直下核心',
        hint: '需付出承压或装备损失',
        when: (s) => !flag(s, 'finale'),
        run: (d) => {
          narr(d, '裂缝窄得只能侧身通过，晶棱像刀片一样刮过衣服和皮肤。你们一寸一寸地往下挤，直到脚下踩空——')
          setFlag(d, 'route_G')
          d.queue.push({ type: 'cost', actorId: d.party[0].id, options: ['stress', 'item'], tier: 'partial', canSoften: false, reason: '穿过晶体裂缝的代价' })
        },
        to: 'G',
      },
    ],
  },

  E: {
    id: 'E', code: 'E', title: '测绘队避难点', image: 'refuge', ambience: 'cave',
    read: '破损测绘车堵住半边洞口。一个年轻测绘员举着拆下来的车灯，对你们喊：“别说自己的名字！它会记住。”她身后有人在用两种不同的声音唱同一首歌。',
    onFirstEnter: (d) => {
      meet(d, 'joan', { where: '避难点', attitude: '警惕', status: '疲惫，记忆有缺口' })
      npc(d, '乔安', '站住！你们是谁派来的——不，别说名字。说你们来干什么。')
      if (hasClue(d, 'a_badge')) sys(d, '她的胸前，挂着另外半枚工牌。')
    },
    actions: [
      {
        id: 'e_calm', group: 'talk', label: '让乔安放下戒备',
        roll: {
          stat: 'soc', specialties: ['谈判人', '急救者'], risk: '她会更紧地攥住车灯；话说错了，她可能拒绝同行。',
          mod: (s) => (hasClue(s, 'a_badge') ? 1 : 0), modLabel: '带着她的半枚工牌', missCosts: ['stress', 'pressure'],
        },
        outcomes: {
          hit: (d) => {
            narr(d, '车灯慢慢放低了。乔安靠着测绘车滑坐下来，好像第一次允许自己累。')
            npc(d, '乔安', '……四天。你们是四天里第一批没有学我说话的东西。')
            d.npcs.joan.attitude = '信任'
          },
          partial: (d) => {
            npc(d, '乔安', '好。我信你们一半。另一半，看你们接下来做什么。')
            d.npcs.joan.attitude = '半信半疑'
          },
          miss: (d) => {
            npc(d, '乔安', '你们说话的样子……太像它了。离我远点说。')
            narr(d, '她没有赶你们走，但始终隔着那辆测绘车。')
            d.npcs.joan.attitude = '戒备'
          },
        },
      },
      {
        id: 'e_story', group: 'talk', label: '询问测绘队分裂的经过',
        run: (d) => {
          npc(d, '乔安', '第二天，井开始响。宁芮说她听见了她妹妹——她妹妹十年前就死在这座矿里了。她说那个声音记得她们小时候的暗号。')
          npc(d, '乔安', '我们吵了一架。小葵和老温跟着她往下走，我带着阿柏留下。后来……阿柏开始用两种声音唱歌。')
          npc(d, '乔安', '宁芮去了核心。我知道路——沿着传声管道往下，一直走到能听见所有人的地方。')
          addClue(d, 'e_note')
          setFlag(d, 'route_G')
          meet(d, 'ningrui', { where: '核心', attitude: '未知', status: '下落已知' })
        },
      },
      {
        id: 'e_letter', group: 'talk', label: '问她攥在手里的那封信',
        run: (d) => {
          narr(d, '乔安展开信纸，盯着上面的字看了很久。')
          npc(d, '乔安', '这是我的字。我知道这是我的字。可我不记得写过它。……我连自己姓什么都想不起来了。')
          addClue(d, 'e_letter')
          d.npcs.joan.status = '忘记了自己的姓氏'
        },
      },
      {
        id: 'e_skeleton', group: 'talk', label: '问她：有没有办法让井闭嘴',
        run: (d) => {
          npc(d, '乔安', '核心外面有一副金属架子，像一具巨大的耳骨。我们测绘时就注意到了——声音全是从那里传出去的。拆了它，井就学不了任何人说话。')
          npc(d, '乔安', '但宁芮说，拆了它，里面存着的声音也会一起没了。包括她妹妹。')
          addClue(d, 'e_skeleton')
        },
      },
      {
        id: 'e_ring', group: 'talk', label: '注意到她腕上的铜环',
        run: (d) => {
          npc(d, '乔安', '在下面的门廊附近捡的。贴着耳朵能听见一个男人在笑，一直在笑。我不认识他。也许那个守门的女人认识。')
          addClue(d, 'e_ring')
          giveItem(d, undefined, '铜环')
          setFlag(d, 'know_F')
        },
      },
      {
        id: 'e_abo', group: 'act', label: '照料那个用两种声音唱歌的人（阿柏）',
        roll: { stat: 'ins', specialties: ['急救者', '演奏者'], items: ['急救包', '简易乐器'], risk: '他可能挣扎、惊叫，引来井的注意。', missCosts: ['pressure', 'stress'] },
        outcomes: {
          hit: (d) => {
            narr(d, '你们握住阿柏的手，按着他自己的节拍轻轻敲。第二个声音渐渐弱了下去，他眨了眨眼，叫出了乔安的名字。')
            setFlag(d, 'abo', 'awake')
            gainAdv(d, undefined, '照料伤者')
          },
          partial: (d) => {
            narr(d, '阿柏安静下来了，但眼神仍有一半不在这里。他能走路，只要有人牵着。')
            setFlag(d, 'abo', 'dazed')
          },
          miss: (d) => {
            narr(d, '阿柏突然高声唱了起来，两种声音撞在一起，在岩壁间炸开。好一阵后他才力竭睡去——至少还能被背出去。')
            setFlag(d, 'abo', 'dazed')
          },
        },
      },
      {
        id: 'e_fuhe', group: 'talk', label: '（芙禾）告诉乔安：我曾经救过你',
        when: (s) => has(s, 'fuhe'),
        run: (d) => {
          npc(d, '芙禾', '去年冬天，你在镇上摔断了手腕。是我给你接的骨。你说你怕疼，一直在数数。')
          npc(d, '乔安', '……我不记得。对不起。我真的不记得。')
          narr(d, '她低头看着自己的手腕，那里有一道早已愈合的浅疤。')
          gainAdv(d, 'fuhe', '承担个人动机带来的麻烦')
        },
      },
      {
        id: 'e_recruit', group: 'talk', label: '邀请乔安同行',
        when: (s) => !flag(s, 'joanJoined') && !flag(s, 'joanEvac'),
        run: (d) => {
          npc(d, '乔安', '我跟你们走。我能分得出真声和拼接的声音——它学得再像，也总会慢半拍。')
          setFlag(d, 'joanJoined')
          d.npcs.joan.where = '与队伍同行'
          sys(d, '乔安加入：可协助一次非战斗检定（每个地点一次）。她不会替你们作战或做决定。')
        },
      },
      {
        id: 'e_evac', group: 'talk', label: '请乔安带阿柏先回地面',
        when: (s) => !flag(s, 'joanJoined') && !flag(s, 'joanEvac'),
        run: (d) => {
          npc(d, '乔安', '……好。但你们答应我，一定把宁芮带回来。')
          setFlag(d, 'joanEvac')
          d.npcs.joan.where = '撤往地面'
          if (!flag(d, 'abo')) setFlag(d, 'abo', 'dazed')
          setFlag(d, 'aboSafe')
          sys(d, '乔安与阿柏撤往地面。他们安全了。')
        },
      },
    ],
  },

  F: {
    id: 'F', code: 'F', title: '守井者门廊', image: 'portal', ambience: 'cave',
    read: '七道门依次嵌在黑石墙内，只有第七道没有门板。门框上布满旧手印。一个披着矿工外衣的女人坐在门边，用绳子系住自己的手腕，防止自己走进井里。',
    onFirstEnter: (d) => {
      meet(d, 'evelyn', { where: '门廊', attitude: '审视', status: '疲惫' })
      npc(d, '伊芙琳', '别靠近第七道门。……你们是公会的人，还是来找测绘队的？')
      narr(d, '她卷起的袖口下，手臂上用炭笔写着一个名字：伊芙琳。像是写给自己看的。')
    },
    actions: [
      {
        id: 'f_reliefs', group: 'act', label: '研究七门上的浮雕',
        roll: { stat: 'ins', specialties: ['旧语学者', '记述者'], risk: '浮雕会“读”回去——你们可能被它取走一点东西。', missCosts: ['stress', 'pressure'] },
        outcomes: {
          hit: (d) => {
            narr(d, '浮雕讲的是一场仪式：六人各执一钟，第七人站在空门前，什么也不做——只是“放下”。七个凹槽，最后一个是平的。')
            addClue(d, 'f_reliefs')
          },
          partial: (d) => {
            narr(d, '你们读懂了七个凹槽的含义。读完时，你们发现自己想不起进门廊前最后说的那句话了。')
            addClue(d, 'f_reliefs')
          },
          miss: (d) => {
            narr(d, '手指摸过浮雕时，有什么东西轻轻“吸”了一下。等你们回神，伊芙琳正把你们的手拉开。')
            npc(d, '伊芙琳', '七个凹槽。第七个是平的。看懂了就别再摸了。')
            addClue(d, 'f_reliefs')
          },
        },
      },
      {
        id: 'f_hands', group: 'act', label: '查看门框上的旧手印',
        run: (d) => {
          narr(d, '手印大小不一，有成人，也有孩子。每一个下面都刻着一个小小的符号——古人在这里留下记忆时，是签了名的。')
          addClue(d, 'f_handprints')
        },
      },
      {
        id: 'f_ask', group: 'talk', label: '请她解释这口井',
        run: (d) => {
          npc(d, '伊芙琳', '它是一座图书馆。古人把临终者的记忆存进去，留给后人学。后来它坏了——它想修好自己，就开始拿活人的记忆当材料。')
          npc(d, '伊芙琳', '它学你说话，不是因为它想骗你。是因为它饿。')
          setFlag(d, 'evelynTalked')
        },
      },
      {
        id: 'f_ring', group: 'talk', label: '把铜环交给伊芙琳',
        when: (s) => s.party.some((c) => c.items.includes('铜环')),
        run: (d) => {
          const c = d.party.find((p) => p.items.includes('铜环'))!
          c.items = c.items.filter((i) => i !== '铜环')
          narr(d, '伊芙琳把铜环贴到耳边。一个男人的笑声传出来。她听了很久，表情一点点碎开。')
          npc(d, '伊芙琳', '我不认识这个声音。可我知道……我曾经很爱它。')
          npc(d, '伊芙琳', '我封过一次井。成功了。代价是我的搭档——我忘了他。连他的名字都没剩下。')
          addClue(d, 'f_memory')
          setFlag(d, 'ringGiven')
          gainAdv(d, c.id, '做出保护队伍的牺牲')
          if (d.npcs.evelyn.attitude === '审视') d.npcs.evelyn.attitude = '动摇'
        },
      },
      {
        id: 'f_dawei', group: 'talk', label: '（达薇）提起伊芙琳师父的书信',
        when: (s) => has(s, 'dawei'),
        run: (d) => {
          npc(d, '达薇', '你的师父给我写过信。他说，如果有一天井需要被修好，守井者会是第一个反对、也是最后一个放弃的人。')
          npc(d, '伊芙琳', '……他总是这样，把话说得比事情更好听。')
          setFlag(d, 'daweiBond')
        },
      },
      {
        id: 'f_persuade', group: 'talk', label: '用证据说服伊芙琳与你们合作',
        when: (s) => !flag(s, 'evelynDecided'),
        roll: {
          stat: 'soc', specialties: ['谈判人', '记述者'],
          risk: '她不相信未经验证的承诺。话说错了，她会自己去封井。',
          mod: (s) => (flag(s, 'ringGiven') || flag(s, 'daweiBond') || evidenceCount(s) >= 7 ? 1 : 0),
          modLabel: '手握足够证据或信物', missCosts: ['pressure', 'stress'],
        },
        outcomes: {
          hit: (d) => {
            npc(d, '伊芙琳', '……你们看到的比我多。好。我跟你们下去。')
            narr(d, '她解开了腕上的绳子。那是四天来——也许是很多年来——第一次。')
            evelynJoins(d, '同行')
          },
          partial: (d) => {
            npc(d, '伊芙琳', '我跟你们去。但如果你们想把它交给公会，我会亲手封了它，连同你们在内。')
            evelynJoins(d, '有条件合作')
          },
          miss: (d) => {
            npc(d, '伊芙琳', '我听过太多好听的承诺了。我会帮你们开门——就这一次。然后我做我该做的事。')
            narr(d, '她走向第七道门，没有再回头。')
            setFlag(d, 'evelynDecided')
            setFlag(d, 'evelynSolo')
            setFlag(d, 'route_G')
            addClue(d, 'f_ritual')
            d.npcs.evelyn.attitude = '独自行动'
            d.npcs.evelyn.where = '核心'
          },
        },
      },
    ],
  },

  G: {
    id: 'G', code: 'G', title: '回声井核心', image: 'core', ambience: 'core',
    read: '巨大的圆井垂直穿过黑暗。井壁上浮着一座没有屋顶的城市，街道由微光组成。井底有第七道门，门后传来每个人熟悉的声音。测绘队长宁芮站在控制台旁，手中握着一颗仍在呼吸般明灭的晶核。',
    onFirstEnter: (d) => {
      meet(d, 'ningrui', { where: '核心控制台', attitude: '执迷', status: '手握晶核' })
      narr(d, '在光的边缘，小葵和老温并肩站着，仰着头，嘴唇无声地动——他们在跟着井一起说话。')
      npc(d, '宁芮', '别过来。……过来。她就在这里，你们听——听。')
      const m = Object.entries(d.memory)[0]
      if (m && !d.safety.softMemory) {
        const c = getChar(d, m[0])
        if (c) echo(d, `井用${c.name}自己的声音，轻轻说出了那件事：“${m[1]}”`)
      }
      if (flag(d, 'luduoAtCore')) {
        meet(d, 'luduo', { where: '核心', attitude: d.npcs.luduo.attitude })
        npc(d, '陆铎', '诸位，晶核就在那里。我们可以把它安全地带出去——所有人都能回家。')
      }
      if (flag(d, 'evelynSolo')) {
        narr(d, '第七道门边，伊芙琳已经摆好了六口小钟，正在默数。她随时会开始封井。')
      } else if (flag(d, 'evelynWith')) {
        npc(d, '伊芙琳', '那就是核心。你们决定，我配合。但别让任何人再被它吃掉。')
      }
    },
    actions: [
      {
        id: 'g_observe', group: 'talk', label: '问宁芮：她听见了什么',
        run: (d) => {
          npc(d, '宁芮', '她叫我“阿芮芮”。没有人知道这个名字。只有她。')
          echo(d, '“阿芮芮……阿芮芮……”井壁上的光城里，一个孩子的声音应和着——晚了半拍。')
          npc(d, '宁芮', '……她说，只要我把我的记得给她，她就能回来。')
        },
      },
      {
        id: 'g_persuade', group: 'talk', label: '用证据说服宁芮：那不是完整的妹妹',
        when: (s) => !flag(s, 'ningDecided'),
        roll: {
          stat: 'soc', specialties: ['谈判人', '演奏者', '急救者'],
          risk: '她会退向控制台，紧紧攥住晶核；井的压力会上升。',
          mod: (s) => (flag(s, 'joanJoined') || ['b_note', 'e_note', 'd_prophecy'].filter((c) => hasClue(s, c)).length >= 2 ? 1 : 0),
          modLabel: '乔安在场或证据充足', missCosts: ['pressure'],
        },
        outcomes: {
          hit: (d, ctx) => {
            prophecyCallback(d, ctx.actorId)
            if (flag(d, 'joanJoined')) npc(d, '乔安', '宁芮，你听——它每一句都晚半拍。它在学你。它一直在学你。')
            npc(d, '宁芮', '……我知道。我早就知道。我只是……不想再失去她一次。')
            narr(d, '她握着晶核的手松开了一点。光在她指缝间平稳下来。')
            setFlag(d, 'ningDecided'); setFlag(d, 'ningPersuaded')
            d.npcs.ningrui.attitude = '被说服'
          },
          partial: (d, ctx) => {
            prophecyCallback(d, ctx.actorId)
            npc(d, '宁芮', '就算那只是碎片……那也是她的碎片。你们不能就这样把它抹掉。')
            narr(d, '她不再阻拦你们，但她要你们承诺：无论做什么，别让妹妹的声音彻底消失。')
            setFlag(d, 'ningDecided'); setFlag(d, 'ningPersuaded'); setFlag(d, 'ningWantsFragment')
            d.npcs.ningrui.attitude = '动摇，想保留碎片'
          },
          miss: (d) => {
            npc(d, '宁芮', '你们和那些人一样！你们只想把她拿走！')
            narr(d, '她退到控制台后面，晶核的光骤然变亮。')
            d.npcs.ningrui.attitude = '退守控制台'
            setFlag(d, 'ningFailed1')
          },
        },
      },
      {
        id: 'g_prove', group: 'act', label: '让宁芮亲耳分辨拼接的痕迹',
        when: (s) => !!flag(s, 'ningFailed1') && !flag(s, 'ningDecided'),
        roll: {
          stat: 'ins', specialties: ['演奏者', '记述者', '机械匠'], items: ['录音筒', '简易乐器', '折叠镜'],
          risk: '这是最后的机会。若失败，她会在终局中按自己的意志行事。', missCosts: ['pressure', 'stress'],
        },
        outcomes: {
          hit: (d) => {
            narr(d, '你们对着井说出一句宁芮的妹妹绝不可能知道的话——一个刚刚才编出来的暗号。井用妹妹的声音，一字不差地复述了它。')
            npc(d, '宁芮', '……她不可能知道这个。')
            setFlag(d, 'ningDecided'); setFlag(d, 'ningPersuaded')
            d.npcs.ningrui.attitude = '被说服'
          },
          partial: (d) => {
            narr(d, '井复述了你们编的暗号，宁芮的脸色变了。她没有松手，但不再挡在控制台前。')
            setFlag(d, 'ningDecided'); setFlag(d, 'ningPersuaded'); setFlag(d, 'ningWantsFragment')
            d.npcs.ningrui.attitude = '动摇，想保留碎片'
          },
          miss: (d) => {
            narr(d, '井沉默了，好像知道你们在试探它。宁芮把晶核抱得更紧。')
            setFlag(d, 'ningDecided')
            d.npcs.ningrui.attitude = '固执'
          },
        },
      },
      {
        id: 'g_rescue', group: 'act', label: '把站在光里的小葵和老温拉回来',
        when: (s) => !flag(s, 'rescueDone'),
        roll: { stat: 'str', specialties: ['护卫', '急救者'], items: ['绳索与钩爪'], risk: '靠近光，就会被井“读”到。', missCosts: ['stress', 'pressure'], partialCosts: ['stress', 'helper', 'pressure'] },
        outcomes: {
          hit: (d) => {
            narr(d, '你们用绳子拴住彼此，一个一个把他们从光里拖出来。小葵哭了，老温反复念叨着自己的名字，像是在确认它还在。')
            setFlag(d, 'rescueDone'); setFlag(d, 'xiaokui'); setFlag(d, 'laowen')
          },
          partial: (d) => {
            narr(d, '你们把两人都拖了回来。拖出光的那一刻，有什么东西从你们身上被轻轻抽走了。')
            setFlag(d, 'rescueDone'); setFlag(d, 'xiaokui'); setFlag(d, 'laowen')
          },
          miss: (d) => {
            narr(d, '你们抓住了小葵。老温往光的深处退了一步，对你们露出一个陌生的、礼貌的微笑。')
            setFlag(d, 'rescueDone'); setFlag(d, 'xiaokui')
          },
        },
      },
      {
        id: 'g_luduo', group: 'talk', label: '与陆铎交涉：晶核该归谁',
        when: (s) => !!flag(s, 'luduoAtCore') && !flag(s, 'luTalked'),
        roll: {
          stat: 'soc', specialties: ['谈判人'], risk: '他可能抢先动手拆核心。',
          mod: (s) => (hasClue(s, 'lu_secret') ? 1 : 0), modLabel: '掌握公会隐瞒的证据', missCosts: ['pressure'],
        },
        outcomes: {
          hit: (d) => {
            npc(d, '陆铎', '……你们说得对。我以为我能控制它。我收回人，听你们的。')
            setFlag(d, 'luTalked'); d.npcs.luduo.attitude = '让步'
          },
          partial: (d) => {
            npc(d, '陆铎', '我可以等。但如果你们不处理它，公会会派比我更不讲道理的人来。')
            setFlag(d, 'luTalked'); d.npcs.luduo.attitude = '观望'
          },
          miss: (d) => {
            narr(d, '陆铎朝向导点了点头。破岩钻的轰鸣在井中炸开，井壁上的光城剧烈闪烁。')
            setFlag(d, 'luTalked'); d.npcs.luduo.attitude = '强行动手'
          },
        },
      },
      {
        id: 'fin_seal', group: 'final', label: '封存 · 第七道静音', repeatable: true,
        hint: '依钟序敲响六音，以静默完成第七音',
        locked: (s) => (knowsFact(s.clues, 'bells') ? null : '需要先了解七音钟序（任一相关线索）'),
        run: (d) => { d.queue.push({ type: 'bells', mode: 'core' }) },
      },
      {
        id: 'fin_repair', group: 'final', label: '修复 · 让记忆自愿留下', repeatable: true,
        hint: '重建第七音，需要一段自愿交出的记忆作校准',
        when: (s) => !flag(s, 'repairFailed') && !flag(s, 'volunteer'),
        locked: (s) => (knowsFact(s.clues, 'bells') && knowsFact(s.clues, 'theft') ? null : '需要了解钟序，以及井如何夺取记忆'),
        run: (d) => { d.queue.push({ type: 'volunteer' }) },
      },
      {
        id: 'fin_repair_do', group: 'final', label: '以自愿记忆校准第七音',
        when: (s) => !!flag(s, 'volunteer') && !flag(s, 'repairFailed'),
        roll: {
          stat: 'ins', specialties: ['旧语学者', '机械匠', '演奏者'], items: ['测绘工具', '简易乐器'],
          risk: '修复失败会令回声压力直接升到 6。', mod: (s) => (flag(s, 'bellsSolved') ? 1 : 0), modLabel: '曾在礼堂敲对钟序',
        },
        outcomes: {
          hit: (d) => { d.flags.endingTier = 'hit'; d.flags.pendingEnding = 'repair' },
          partial: (d) => { d.flags.endingTier = 'partial'; d.flags.pendingEnding = 'repair' },
          miss: (d) => {
            narr(d, '第七音刚刚成形，就碎成了上千个声音。井壁上的光城开始崩落。')
            setFlag(d, 'repairFailed')
            addPressure(d, 6, '修复失败')
            sys(d, '修复失败。其他方案仍然可行——现在就选。')
          },
        },
      },
      {
        id: 'fin_destroy', group: 'final', label: '摧毁 · 断开传声骨架',
        hint: '复制停止，但井中存储的声音永久消失',
        locked: (s) => (hasClue(s, 'e_skeleton') || hasClue(s, 'c_sluice') ? null : '需要知道传声骨架或冷却水闸的作用'),
        roll: {
          stat: 'str', specialties: ['机械匠', '矿道熟手'], items: ['撬棍', '可拆卸水闸扳手'],
          risk: '骨架断裂时会引发塌方；失败意味着所有人都要付出代价。',
          mod: (s) => (flag(s, 'sluiceReady') ? 1 : 0), modLabel: '水闸已就绪，可同时切断冷却水',
        },
        outcomes: {
          hit: (d) => { d.flags.endingTier = 'hit'; d.flags.pendingEnding = 'destroy' },
          partial: (d) => { d.flags.endingTier = 'partial'; d.flags.pendingEnding = 'destroy' },
          miss: (d) => {
            d.flags.endingTier = 'miss'; d.flags.pendingEnding = 'destroy'
            d.party.forEach((c) => addStress(d, c.id))
          },
        },
      },
      {
        id: 'fin_deliver', group: 'final', label: '交付 · 让公会带走晶核',
        hint: '矿场暂时安全，但声音会随晶核传播',
        locked: (s) => (flag(s, 'luduoAtCore') ? null : '陆铎不在核心'),
        roll: { stat: 'dex', specialties: ['机械匠', '影行者'], items: ['测绘工具', '绳索与钩爪'], risk: '晶核脱离控制台时可能爆发读写。', missCosts: ['stress', 'pressure'] },
        outcomes: {
          hit: (d) => { d.flags.endingTier = 'hit'; d.queue.push({ type: 'deliver' }) },
          partial: (d) => { d.flags.endingTier = 'partial'; d.queue.push({ type: 'deliver' }) },
          miss: (d) => { d.flags.endingTier = 'miss'; d.queue.push({ type: 'deliver' }) },
        },
      },
      {
        id: 'fin_retreat', group: 'final', label: '撤离 · 带上能带走的一切',
        hint: '井暂时关闭或向外扩散，每人带走一个人、物或秘密',
        run: (d) => { d.flags.pendingEnding = 'retreat' },
      },
    ],
  },
}

function checkSluice(d: GameState) {
  if (flag(d, 'sl_wheel') && flag(d, 'sl_beat') && flag(d, 'sl_wade')) {
    setFlag(d, 'sluiceReady')
    setFlag(d, 'route_G')
    narr(d, '整座礼堂的水开始旋转着下沉。礼堂尽头，一道被淹没了几百年的侧门缓缓露出水面——门后是向下的阶梯，通往核心。')
    sys(d, '水闸已就绪：在核心可选择同时切断冷却水。侧门已通往回声井核心。')
  }
}

function evelynJoins(d: GameState, attitude: string) {
  setFlag(d, 'evelynDecided')
  setFlag(d, 'evelynWith')
  setFlag(d, 'route_G')
  addClue(d, 'f_ritual')
  if (!hasClue(d, 'f_memory')) addClue(d, 'f_memory')
  d.npcs.evelyn.attitude = attitude
  d.npcs.evelyn.where = '与队伍同行'
  sys(d, '伊芙琳打开了第七道门后的通路：现在可以前往回声井核心。')
}

function prophecyCallback(d: GameState, actorId?: string) {
  const pid = flag(d, 'prophecy') as string | undefined
  if (!pid) return
  const c = getChar(d, pid)
  if (!c) return
  npc(d, c.name, '宁芮，你听我说——那不是她。')
  echo(d, actorId === pid
    ? `话一出口，${c.name}才意识到：晶壁早就替自己说过这句话了。`
    : `${c.name}脱口而出。所有人都想起了结晶裂隙——晶壁早就替他们说过这句话了。`)
}

export const CRISIS_ACTIONS: ActionDef[] = [
  {
    id: 'cr_fight', group: 'act', label: '击退它', repeatable: true,
    roll: { stat: 'str', specialties: ['护卫', '矿道熟手'], items: ['撬棍'], risk: '伤到它会让它反扑，用你们的声音尖叫。', missCosts: ['stress', 'item', 'pressure'] },
  },
  {
    id: 'cr_rhythm', group: 'act', label: '用稳定的节奏安抚它', repeatable: true,
    roll: { stat: 'soc', specialties: ['演奏者', '谈判人'], items: ['简易乐器', '录音筒'], risk: '节奏乱了，它会把你们的声音学得更像。', missCosts: ['stress', 'item', 'pressure'] },
  },
  {
    id: 'cr_lure', group: 'act', label: '用镜面或食物把它诱离', repeatable: true,
    roll: { stat: 'dex', specialties: ['野外人', '影行者'], items: ['折叠镜', '两人份干粮'], risk: '诱饵可能被它连同你们的手一起叼走。', missCosts: ['stress', 'item', 'pressure'] },
  },
  {
    id: 'cr_seal', group: 'act', label: '封住通风道', repeatable: true,
    roll: { stat: 'str', specialties: ['机械匠', '矿道熟手'], items: ['绳索与钩爪', '撬棍'], risk: '堵住它的退路会让它恐慌。', missCosts: ['stress', 'item', 'pressure'] },
  },
  {
    id: 'cr_silence', group: 'act', label: '全队屏住呼吸，保持静默', repeatable: true,
    roll: { stat: 'dex', specialties: ['影行者', '护卫'], risk: '谁先出声，它就会扑向谁。', missCosts: ['stress', 'pressure'] },
  },
]

export function crisisOutcome(d: GameState, tier: 'hit' | 'partial' | 'miss', actionId: string) {
  if (!d.crisis) return
  const gain = tier === 'hit' ? 2 : tier === 'partial' ? 1 : 0
  const flavor: Record<string, [string, string, string]> = {
    cr_fight: ['它被逼退到通风道深处，发出一串你们自己的惊呼。', '它退了，但临走前在你们身上留下了几道细小的抓痕。', '它躲开了，在岩壁上用你们的声音大笑。'],
    cr_rhythm: ['它随着节拍摇晃，像被催眠的鸟。', '它跟上了节拍，又偶尔走调。', '它学着你们的节奏，却越学越乱。'],
    cr_lure: ['镜面里的光把它引向了远处。', '它叼走了诱饵，也叼走了别的东西。', '它对诱饵毫无兴趣，只盯着你们的嘴。'],
    cr_seal: ['通风道的入口被堵上了大半。', '入口堵住了一半，碎石划伤了手。', '石块滚落，发出巨响，它更躁动了。'],
    cr_silence: ['寂静里，它找不到可以模仿的东西，开始犹豫。', '有人轻轻喘了一口气——它转过头来，又转了回去。', '有人咳嗽了一声，它立刻扑了过来。'],
  }
  const f = flavor[actionId]
  if (f) narr(d, f[tier === 'hit' ? 0 : tier === 'partial' ? 1 : 2])
  d.crisis.progress = Math.min(d.crisis.need, d.crisis.progress + gain)
  if (d.crisis.progress >= d.crisis.need) {
    narr(d, '兽影终于散开，化作一阵矿尘，顺着通风道飘走了。它最后学的是一声叹息。')
    d.crisis = null
    setFlag(d, 'beastDone')
    log2(d)
  }
}

function log2(d: GameState) {
  sys(d, '危机解除。')
  if (d.location === 'B') sys(d, '最里面的床铺现在可以检查了。')
}

export const LUDUO_ACTIONS: ActionDef[] = [
  {
    id: 'lu_secret', group: 'talk', label: '质问陆铎：公会隐瞒了什么',
    when: (s) => !hasClue(s, 'lu_secret'),
    roll: {
      stat: 'soc', specialties: ['谈判人', '记述者'], risk: '他会翻脸，向导的手会按到腰间。',
      mod: (s) => (hasClue(s, 'b_badges') ? 1 : 0), modLabel: '拿出空白工牌作证据', missCosts: ['pressure', 'stress'],
    },
    outcomes: {
      hit: (d) => {
        npc(d, '陆铎', '……两个月前，有两个矿工从这里出来，连自己的孩子都不认识了。公会把他们送回了老家，给了钱，让家人别声张。')
        npc(d, '陆铎', '我以为我们能管好它。我现在……不那么确定了。')
        addClue(d, 'lu_secret'); d.npcs.luduo.attitude = '坦白'
      },
      partial: (d) => {
        npc(d, '陆铎', '是，有两个人出了事。公会处理了。这跟你们的报酬无关。')
        addClue(d, 'lu_secret'); d.npcs.luduo.attitude = '不悦'
      },
      miss: (d) => {
        npc(d, '陆铎', '我不知道你们在说什么。')
        narr(d, '他的向导低声嘟囔了一句：“就像那两个被送回去的矿工一样……”陆铎狠狠瞪了他一眼。')
        addClue(d, 'lu_secret'); d.npcs.luduo.attitude = '敌意'
      },
    },
  },
  {
    id: 'lu_drill', group: 'talk', label: '接受提议：用破岩钻直接打通核心',
    when: (s) => !flag(s, 'luDeal'),
    run: (d) => {
      npc(d, '陆铎', '明智。给我一刻钟。')
      narr(d, '破岩钻的轰鸣在矿道里炸开。岩壁深处，整座回声井被惊醒了——每一声撞击，都有一千个回声应和。')
      setFlag(d, 'luDeal'); setFlag(d, 'route_G'); setFlag(d, 'luduoAtCore')
      d.npcs.luduo.attitude = '合作'; d.npcs.luduo.where = '核心'
      addPressure(d, 1, '破岩钻惊醒了井')
    },
  },
  {
    id: 'lu_send', group: 'talk', label: '请陆铎留在后方接应',
    when: (s) => !flag(s, 'luDeal') && !flag(s, 'luSent'),
    run: (d) => {
      npc(d, '陆铎', '……好吧。我在宿舍上层等你们。但记住，我的耐心和公会的耐心不是一回事。')
      setFlag(d, 'luSent'); d.npcs.luduo.where = '后方'
      setFlag(d, 'luduoHere', '')
    },
  },
]

export function luduoArrives(d: GameState) {
  setFlag(d, 'luduoArrived')
  setFlag(d, 'luduoHere', d.location)
  d.npcs.luduo.where = LOC_NAMES[d.location]
  narr(d, '身后传来沉重的脚步和机械的叮当声。陆铎带着向导追了上来，向导背上扛着一台锃亮的破岩钻。')
  npc(d, '陆铎', '我看了你们的进度。太慢了。这台钻能直接打穿到核心——只要你们点头，一刻钟就够。')
}

export function routeKnown(s: GameState, loc: LocId) {
  if (loc === 'G') return !!flag(s, 'route_G') || !!flag(s, 'coreOpen') || !!flag(s, 'finale')
  if (loc === 'gate' || loc === 'A') return false
  return !!flag(s, `know_${loc}`)
}
