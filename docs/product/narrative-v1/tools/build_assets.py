#!/usr/bin/env python3
"""Generate 50 deterministic achievement definitions, spoiler-safe manifest, SVG/PNG icon assets and preview.
Design-only production handoff; source event types must be wired to a canonical game event log.
"""
import json, html, math, os, textwrap
from pathlib import Path
from collections import Counter
from io import BytesIO
from PIL import Image,ImageDraw,ImageFont
import cairosvg
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'; SVG=ROOT/'assets/icons/svg'; PNG=ROOT/'assets/icons/png'
for p in [DATA,SVG,PNG]:p.mkdir(parents=True,exist_ok=True)

def e(t,**where):return {'op':'event','type':t,'where':where}
def count(t,n,by=None,**where):
 r={'op':'count','type':t,'min':n,'where':where}
 if by:r['distinctBy']=by
 return r
def a(*rules):return {'op':'all','rules':list(rules)}
def anyof(*rules):return {'op':'any','rules':list(rules)}
CAT={
'ST':('剧情与世界','#C4A16B'),
'RE':('人物与关系','#D59AA5'),
'EX':('探索与发现','#7FB5CC'),
'SB':('沙盒与创造','#8CB89A'),
'LG':('隐藏与传奇','#BC9CEA')}
rows=[]
def add(code,name,desc,flavor,rarity,icon,rule,visibility='public',hint='',scope='run',reward=None):
 prefix=code[:2]
 assert prefix in CAT
 rows.append({'id':code,'name':name,'description':desc,'flavor':flavor,'category':prefix,'categoryName':CAT[prefix][0],
 'rarity':rarity,'visibility':visibility,'hint':hint,'scope':scope,'iconKey':icon,
 'icon':f'assets/icons/svg/{code}.svg','png':f'assets/icons/png/{code}.png',
 'rule':rule,'reward':reward or {'kind':'gallery_badge','value':code},'version':1})
# 12 STORY
add('ST01','第六声之后','开始一段伊瑟兰冒险。','一切故事都从迟到的钟声开始。','common','bell',e('run_started'))
add('ST02','雨夜的邀请','在灰港接下第一条冒险钩子。','雨声中有人敲响了门。','common','letter',e('first_hook_taken',regionId='gray-harbor'))
add('ST03','铜塔的阴影','发现商会私井的可靠证据。','某些秘密只在账本上说真话。','rare','tower',e('truth_verified',truthId='merchant_memory_well'))
add('ST04','被世界注意','正式进入故事第二幕。','名字开始在陌生人的口中流传。','common','eye',e('act_entered',act=2))
add('ST05','潮井之下','完成灰港核心冒险，无论结果。','那口井仍记得你。','common','waves',e('core_arc_resolved',arcId='gray_well'))
add('ST06','丝带上的名字','见证摄政公主的重要人物线结局。','她再次看了看手腕。','rare','ribbon',e('npc_arc_resolved',npcId='aetherlyn'))
add('ST07','稳住一座城','通过行动稳定任一地区危机。','修复比破坏更需要耐心。','rare','shield',e('region_crisis_stabilized'))
add('ST08','被忘掉的街','完成栖钟河谷核心冒险。','有人终于记起了街角的面包香。','rare','door',e('core_arc_resolved',arcId='forgotten_street'))
add('ST09','鼓声与停战信','促成卡尔维斯与烬原的真实和约。','有时一个名字能止住一场战争。','epic','handshake',e('faction_treaty_signed',treatyId='kalvis_ember_peace'))
add('ST10','雾海的龙骨','完成沉默海核心冒险。','船在无声的浪里记得方向。','rare','ship',e('core_arc_resolved',arcId='mist_dragonbone'))
add('ST11','未竟之歌','以未竟之歌的方向收束队伍冒险。','故事没有完成，不代表什么都没有发生。','common','quill',e('ending_committed',directionId='D01'))
add('ST12','共同的记忆泉','见证回响之网被可信地修复。','曾经的伤口学会了说话。','epic','fountain',e('ending_committed',directionId='D14'))
# 10 RELATION
add('RE01','初识的名字','首次与具名 NPC 建立关系。','世界因为一个名字变得近了一点。','common','handshake',e('npc_met'),scope='character')
add('RE02','不愿遗忘的人','帮助一位 NPC 恢复重要名字。','记住别人，本身就是一种救援。','rare','heart',e('npc_name_restored'),scope='character')
add('RE03','值得信任','通过实际事件获得一名重要 NPC 的信任。','信任不会从一次赞美中生长。','common','shield',e('npc_trust_earned'),scope='character')
add('RE04','说到做到','履行一项曾被明确记录的 NPC 承诺。','一项承诺终于走过了时间。','rare','scroll',e('npc_oath_kept'),scope='character')
add('RE05','旧敌，新盟','促成两个原本敌对人物的和解。','多年仇恨也可能有第三条路。','epic','handshake',e('npc_reconciled',priorRelation='hostile'),scope='party')
add('RE06','绝不丢下任何人','一局内救助至少三位不同 NPC。','每一次伸手都有重量。','rare','lifering',count('npc_rescued',3,'subjectId'),scope='party')
add('RE07','改变了一个人','通过可信证据促成重要 NPC 信念转变。','你改变的不是他的态度，而是他的世界。','epic','eye',e('npc_belief_changed'),scope='character')
add('RE08','意外的援手','得到原本敌视你的 NPC 主动帮助。','有时敌人最了解你。','rare','key',e('npc_help_from_former_enemy'),scope='character')
add('RE09','最后的告别','完整兑现一场主动选择的角色告别。','至少这一次，我们记得怎么道别。','common','candle',e('personal_farewell_kept'),scope='character')
add('RE10','修复的纽带','通过行动恢复一段破裂的重要关系。','故事从不是只有初见。','rare','ribbon',e('npc_relationship_repaired'),scope='character')
# 10 EXPLORATION
add('EX01','迈出灰港','首次访问灰港以外的地区。','大陆比一座酒馆大得多。','common','compass',e('region_visited',isOutsideStart=True))
add('EX02','七方旅人','一局内到访七个不同地区。','山川与海风都认识了你的脚步。','epic','map',count('region_visited',7,'regionId'))
add('EX03','岩钟的回声','证实白砾山脉钟城的存在。','山腹里有古老的第二颗心。','common','bell',e('bell_city_verified',cityId='rock_bell'))
add('EX04','档案里的空白','找到一份被故意隐藏的历史档案。','纸页上的空白也有作者。','rare','book',e('historical_record_verified',kind='suppressed'))
add('EX05','四重证据','在一局内确认四种不同世界真相。','怀疑，终于有了证据。','epic','eye',count('truth_verified',4,'truthId'))
add('EX06','没有记录的道路','发现一条此前地图没有记载的真实路线。','地图从不等于世界。','rare','compass',e('route_discovered',previouslyUnknown=True))
add('EX07','记忆的拾荒人','在一局中验证三段不同记忆碎片。','每段碎片都曾属于谁。','rare','gem',count('memory_fragment_verified',3,'fragmentId'))
add('EX08','空名之城','抵达空名之城。','没有名字的路也可以到达。','epic','door',e('region_visited',regionId='nameless-city'),visibility='hint',hint='跟随无名之路，直到地图停止说话。')
add('EX09','修钟者','亲手完成一次机关修复交互。','那些错开的齿轮曾属于一个年代。','common','gear',e('interaction_completed',template='mechanism',outcome='completed'))
add('EX10','不留空白的地图','在一局中发现十二个不同地点。','每个未知都从一扇门开始。','epic','pin',count('place_discovered',12,'placeId'))
# 8 SANDBOX
add('SB01','第一块招牌','建立自己的第一个持续性项目。','它终于不只是你的一个想法。','common','hammer',e('player_project_created'),scope='character')
add('SB02','七灯之外','在灰港成功经营一家酒馆。','有时故事的中心是一张桌子。','rare','mug',e('business_operational',kind='tavern',regionId='gray-harbor'),scope='character')
add('SB03','自食其力','让玩家自创事业实现持续盈利。','赚钱不是目的，自由才是。','rare','coins',e('business_profitable',sustained=True),scope='character')
add('SB04','第一条商路','建立一条安全、可持续的玩家贸易路线。','道路也是一份承诺。','rare','ship',e('trade_route_established',stable=True),scope='party')
add('SB05','为陌生人点灯','创办并运行一处民间救助机构。','无名的人也有可以回去的地方。','epic','heart',e('civic_service_operational',kind='shelter'),scope='party')
add('SB06','不属于任何王冠','创立一个得到世界承认的独立组织。','旗帜上写的应该是自己的名字。','epic','flag',e('player_organization_created',independent=True),scope='party')
add('SB07','另一条道路','以非预设且经过程序验证的方案解决重大冲突。','没有作者写下的那条路，你自己走出来了。','epic','fork',e('custom_resolution_verified',importance='major'),scope='party')
add('SB08','有一个可以回去的地方','建立长期安全的玩家居所或基地。','流浪并不是冒险唯一的名字。','common','home',e('home_established',persistent=True),scope='character')
# 10 LEGEND
add('LG01','万名安息','真正促成空名者合唱的安息。','最后一个名字被轻轻说出。','legendary','sun',e('ending_committed',directionId='D19'),visibility='secret')
add('LG02','第七声的命名者','在满足全部前提时重命名世界。','世界记住了它新的名字。','legendary','crown',e('ending_committed',directionId='D17'),visibility='secret')
add('LG03','皇帝的归来','亲历阿斯特里昂真正复生的结局。','钟声不一定是庆典。','legendary','throne',e('ending_committed',directionId='D12'),visibility='secret')
add('LG04','无冠的守护者','使玩家建立的组织得到正式世界传说认可。','没有王冠，也有人被世界铭记。','epic','shield',e('legend_recognized',legendId='uncrowned_guardian'),visibility='secret')
add('LG05','不敲响的钟','通过非暴力方式平息一次高危世界事件。','最难的胜利有时没有声音。','epic','bell',e('nonviolent_crisis_resolved',severity='high'),visibility='secret')
add('LG06','第八种回答','在世界法则内创造出被正式认可的全新世界级解决方案。','真正的答案从来不止两种。','legendary','star',e('custom_resolution_verified',importance='world'),visibility='secret')
add('LG07','真相无价','揭露商会对拾名人的秘密资助关系。','钱流向哪里，名字就流向哪里。','rare','coins',e('truth_verified',truthId='merchant_funds_namekeepers'),visibility='secret')
add('LG08','让钟保持沉默','通过玩家行动阻止一次即将发生的不可逆钟鸣。','沉默也是世界的语言。','epic','bellmute',e('bell_ring_prevented',irreversible=True),visibility='secret')
add('LG09','七钟的见证者','在同一次冒险中对七枚钟心都形成可验证的归属记录。','世界的每颗心都有自己的去处。','epic','gem',count('bell_heart_disposition_verified',7,'bellHeartId'),visibility='secret')
add('LG10','改写伪史','公开证实并纠正一项持续四百年的重大历史谎言。','那一页，终于重新写过。','epic','book',e('historical_falsehood_corrected',historicalPeriod='broken_bell_night'),visibility='secret')
assert len(rows)==50, len(rows)
counts=Counter(x['category'] for x in rows)
assert counts=={'ST':12,'RE':10,'EX':10,'SB':8,'LG':10},counts
assert len({x['id'] for x in rows})==50
(DATa:=DATA/'achievements.v1.json').write_text(json.dumps({'schemaVersion':1,'dataStatus':'DESIGN_NOT_IMPLEMENTED','sourcePr':5,'achievements':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# Public manifest: do not disclose hidden labels, conditions or icon path to client until server confirms unlock
public=[]
for r in rows:
 p={k:r[k] for k in ('id','category','categoryName','rarity','visibility','scope','version')}
 if r['visibility']=='public':p.update({k:r[k] for k in ('name','description','hint','icon')})
 elif r['visibility']=='hint':p.update({'name':'尚未发现','description':r['hint'],'icon':'assets/icons/svg/LOCKED.svg'})
 else:p.update({'name':'???','description':'探索后揭晓','icon':'assets/icons/svg/LOCKED.svg'})
 public.append(p)
(DATA/'achievements.public.json').write_text(json.dumps({'schemaVersion':1,'spoilerSafe':True,'achievements':public},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# original inline path artwork; no external deps or proprietary assets
paths={
'bell':'<path d="M64 29c-12 0-20 9-20 22v12c0 7-4 11-7 17h54c-3-6-7-10-7-17V51c0-13-8-22-20-22Z"/><path d="M58 87c1 9 11 9 12 0"/><path d="M64 22v7"/>',
'letter':'<rect x="35" y="44" width="58" height="40" rx="4"/><path d="m36 47 28 21 28-21"/><path d="M45 30h38"/>',
'tower':'<path d="M46 88V38l18-11 18 11v50"/><path d="M39 88h50M45 47h38M55 58h18M59 88V71h10v17"/>',
'eye':'<path d="M27 64s15-20 37-20 37 20 37 20-15 20-37 20S27 64 27 64Z"/><circle cx="64" cy="64" r="10"/>',
'waves':'<path d="M31 54q12-11 22 0t22 0 22 0M31 67q12-11 22 0t22 0 22 0M36 80q11-9 21 0t21 0 17 0"/>',
'ribbon':'<path d="M44 33q20-13 40 0v47l-20-9-20 9Z"/><path d="M49 45h30M49 57h30"/>',
'shield':'<path d="M64 27 92 39v24c0 20-13 29-28 38-15-9-28-18-28-38V39Z"/><path d="m49 64 11 11 21-23"/>',
'door':'<path d="M42 94V35q22-16 44 0v59H42Z"/><path d="M52 94V43q12-7 24 0v51"/><circle cx="71" cy="68" r="2"/>',
'handshake':'<path d="m27 55 18-15 14 7 8-7 17 8 17 16-21 23-15-8-12 7-26-21Z"/><path d="m45 64 21 16m-11-24 23 19m-10-22 21 14"/>',
'ship':'<path d="M34 71h60l-10 21H45L34 71ZM64 32v39M64 33l-22 28h22M69 37l21 26H69"/><path d="M30 97q12 9 24 0 12 9 24 0 12 9 24 0"/>',
'quill':'<path d="M90 30Q57 30 46 62c-6 15-6 23-6 23s9-2 22-9C87 60 90 30 90 30Z"/><path d="M36 98Q56 70 75 52"/>',
'fountain':'<path d="M39 76h50M46 89h36M64 33v44m-15-28 15-16 15 16M38 53q10 1 10 14m42-14q-10 1-10 14"/><path d="M48 80q16 8 32 0"/>',
'heart':'<path d="M64 94 32 65C12 43 42 25 64 48c22-23 52-5 32 17L64 94Z"/>',
'scroll':'<path d="M48 32h38q10 0 10 10v45q0 9-9 9H45q-10 0-10-10V45q0-12 13-13Z"/><path d="M45 45h35M45 60h35M45 74h25"/>',
'key':'<circle cx="49" cy="53" r="16"/><path d="M62 64 92 91m-1-1V77m-1 13H77"/>',
'candle':'<path d="M48 58h32v35H48ZM43 93h42M64 53c-10-11 12-13 0-30-4 9-15 13-10 23 2 5 6 7 10 7Z"/>',
'compass':'<circle cx="64" cy="64" r="35"/><path d="m78 50-11 26-18 10 11-26Z"/><circle cx="64" cy="64" r="3"/>',
'map':'<path d="m30 43 22-8 23 8 23-8v51l-23 8-23-8-22 8Z"/><path d="M52 35v51m23-43v51"/>',
'book':'<path d="M64 42q-15-12-33-8v49q18-5 33 8 15-13 33-8V34q-18-4-33 8Z"/><path d="M64 42v49M39 47l17 2M72 49l17-3"/>',
'gem':'<path d="M43 39h42l15 18-36 41-36-41 15-18ZM28 57h72M43 39l12 18 9 41 9-41 12-18"/>',
'gear':'<circle cx="64" cy="64" r="20"/><circle cx="64" cy="64" r="8"/><path d="M64 27v16m0 42v16M27 64h16m42 0h16M38 38l12 12m28 28 12 12m0-52-12 12M50 78 38 90"/>',
'hammer':'<path d="M44 32 85 47l-8 16-41-14Z"/><path d="m66 62-18 36m-10-3 20 9"/>',
'mug':'<path d="M37 45h44v43H43q-6-5-6-12V45ZM81 53h10q11 0 9 12t-19 9"/><path d="M43 35h32"/>',
'coins':'<ellipse cx="64" cy="43" rx="28" ry="11"/><path d="M36 43v32q0 11 28 11t28-11V43M36 57q0 12 28 12t28-12M36 72q0 12 28 12t28-12"/>',
'flag':'<path d="M42 98V28M42 31q20-10 42 3l8 24q-24-9-50 2"/>',
'fork':'<path d="M64 95V57M64 57 41 36m23 21 23-21M36 32l5 4-1 10M92 32l-5 4 1 10"/>',
'home':'<path d="m30 60 34-30 34 30v36H30V60Z"/><path d="M51 96V69h26v27"/>',
'sun':'<circle cx="64" cy="64" r="20"/><path d="M64 28v12m0 48v12M28 64h12m48 0h12M39 39l9 9m32 32 9 9m0-50-9 9M48 80l-9 9"/>',
'crown':'<path d="m30 48 17 14 17-28 17 28 17-14-7 41H37l-7-41Z"/><path d="M38 79h52"/>',
'pin':'<path d="M64 98S40 72 40 53a24 24 0 0 1 48 0c0 19-24 45-24 45Z"/><circle cx="64" cy="53" r="8"/><path d="M30 100h68"/>',
'throne':'<path d="M46 66V38l18-14 18 14v28"/><path d="M36 66h56v12H36ZM36 66V52h10M92 66V52H82M42 78v20M86 78v20"/><circle cx="64" cy="44" r="5"/>',
'bellmute':'<path d="M64 29c-12 0-20 9-20 22v12c0 7-4 11-7 17h54c-3-6-7-10-7-17V51c0-13-8-22-20-22Z"/><path d="M58 87c1 9 11 9 12 0"/><path d="M33 33l62 62"/>',
'lifering':'<circle cx="64" cy="64" r="32"/><circle cx="64" cy="64" r="14"/><path d="M41 41l13 13m20 20 13 13m0-46L74 54M54 74 41 87"/>',
'star':'<path d="m64 27 11 25 27 3-21 18 6 27-23-14-23 14 6-27-21-18 27-3Z"/>'}

def svg_icon(ach):
 accent=CAT[ach['category']][1]; rarity=ach['rarity']
 main=paths[ach['iconKey']]; accent_fill={'common':'#D8BE8A','rare':'#C9CFD2','epic':'#C5A3E3','legendary':'#F2C879'}[rarity]
 deco = '<circle cx="64" cy="9" r="3" fill="'+accent_fill+'"/>' if rarity in ('epic','legendary') else ''
 deco += '<path d="M23 64l-5-6 5-6m82 12 5-6-5-6" fill="none" stroke="'+accent_fill+'" opacity=".8"/>' if rarity=='legendary' else ''
 title=html.escape(ach['name'])
 return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="{title}">
<title>{title}</title><defs><radialGradient id="bg"><stop stop-color="#30374a"/><stop offset="1" stop-color="#111826"/></radialGradient><linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eed1a3"/><stop offset=".5" stop-color="{accent}"/><stop offset="1" stop-color="#6e5837"/></linearGradient></defs>
<circle cx="64" cy="64" r="62" fill="url(#bg)" stroke="#080c13" stroke-width="4"/>
<circle cx="64" cy="64" r="56" fill="none" stroke="url(#rim)" stroke-width="5"/>
<circle cx="64" cy="64" r="49" fill="none" stroke="{accent}" stroke-width="1.2" opacity=".55" stroke-dasharray="3 6"/>
<path d="M64 11l4 6-4 5-4-5Z M64 106l4 6-4 5-4-5Z" fill="{accent}" opacity=".8"/>{deco}
<g transform="translate(64 64) scale(.84) translate(-64 -64)" fill="none" stroke="{accent_fill}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">{main}</g>
</svg>'''
for ach in rows:
 name=ach['id']
 content=svg_icon(ach)
 (SVG/(name+'.svg')).write_text(content,encoding='utf-8')
 cairosvg.svg2png(bytestring=content.encode(),write_to=str(PNG/(name+'.png')),output_width=128,output_height=128)
locked={'name':'未发现','category':'LG','rarity':'common','iconKey':'key'}
locked_svg=svg_icon(locked).replace('aria-label="未发现"','aria-label="未解锁"')
(SVG/'LOCKED.svg').write_text(locked_svg,encoding='utf-8')
cairosvg.svg2png(bytestring=locked_svg.encode(),write_to=str(PNG/'LOCKED.png'),output_width=128,output_height=128)
# icon preview sheet no secret spoiler in preview? this is internal designer sheet, yes includes all full names; do not ship to client frontend
fontpath='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
if not os.path.isfile(fontpath):
 import glob
 cand=glob.glob('/usr/share/fonts/**/*CJK*',recursive=True)
 fontpath=cand[0] if cand else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font=ImageFont.truetype(fontpath,18)
small=ImageFont.truetype(fontpath,14)
W=1160; cellw=220; cellh=168; cols=5; margin=30
out=Image.new('RGB',(W,90+math.ceil(len(rows)/cols)*cellh+30),'#111827');dr=ImageDraw.Draw(out)
dr.text((margin,16),'伊瑟兰｜首版 50 项成就图标（设计资产）',font=ImageFont.truetype(fontpath,27),fill='#F1E4C8')
dr.text((margin,54),'完整源文件：assets/icons/svg + assets/icons/png',font=small,fill='#A8ADBA')
for i,r in enumerate(rows):
 x=margin+(i%cols)*cellw;y=90+(i//cols)*cellh
 im=Image.open(PNG/(r['id']+'.png')).convert('RGBA');im.thumbnail((92,92))
 out.paste(im,(x+56,y+8),im)
 dr.text((x+7,y+103),r['id']+'  '+r['name'],font=font,fill='#FAE9CF')
 dr.text((x+7,y+133),r['categoryName']+' · '+r['rarity'],font=small,fill=CAT[r['category']][1])
out.save(ROOT/'assets/icons/成就图标总览.png',optimize=True)
print('Generated achievements:',len(rows),'svg:',len(list(SVG.glob('*.svg'))),'png:',len(list(PNG.glob('*.png'))))
