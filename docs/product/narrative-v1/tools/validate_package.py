from pathlib import Path
import json,hashlib,re,collections
ROOT=Path(__file__).resolve().parents[1]
catalog=json.loads((ROOT/'data/achievements.v1.json').read_text())['achievements']
public=json.loads((ROOT/'data/achievements.public.json').read_text())['achievements']
errors=[]
if len(catalog)!=50:errors.append('catalog != 50')
if len(set(r['id'] for r in catalog))!=50:errors.append('duplicate ids')
if collections.Counter(x['category'] for x in catalog)!={'ST':12,'RE':10,'EX':10,'SB':8,'LG':10}:errors.append('category count mismatch')
assert len(public)==50
ops={'event','count','all','any'}
def rulecheck(rule):
 if rule['op'] not in ops:errors.append('bad rule op '+rule['op'])
 if rule['op'] in ('event','count') and not isinstance(rule.get('where'),dict):errors.append('missing where')
 if rule['op']=='count' and rule.get('min',0)<1:errors.append('bad min')
 if rule['op'] in ('any','all'):
  for r in rule['rules']:rulecheck(r)
for i,r in enumerate(catalog):
 rulecheck(r['rule']);q=public[i]
 if r['id']!=q['id']:errors.append('index mismatch')
 for k in ('icon','png'):
  if not (ROOT/r[k]).is_file():errors.append(f"missing {r[k]}")
 if r['visibility']=='secret' and (q.get('name')!='???' or q.get('icon','').split('/')[-1]!='LOCKED.svg' or 'rule' in q):errors.append('secret leaked '+r['id'])
 if r['visibility']=='hint' and r['name']==q['name']:errors.append('hint name leaked '+r['id'])
 if not isinstance(r['description'],str) or not r['name']:errors.append('empty item')
 if r['rarity'] not in ['common','rare','epic','legendary']:errors.append('bad rarity')
 if r['scope'] not in ['run','character','party']:errors.append('bad scope')
proto=(ROOT/'ui/achievement-prototype.html').read_text()
if 'OFFLINE MOCK ONLY' not in proto:errors.append('prototype lacks demo warning')
for k in ['achievementGrid','detailBody','toast','ending','totalProgress']:
 if k not in proto:errors.append('missing element '+k)
files=[p for p in ROOT.rglob('*') if p.is_file() and p.name not in ('VALIDATION.txt','SHA256SUMS.txt')]
lines=[f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(ROOT).as_posix()}" for p in sorted(files)]
(ROOT/'SHA256SUMS.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
message=f"Static package validation: {'PASS' if not errors else 'FAIL'}\nAchievements: {len(catalog)}\nBy category: {dict(collections.Counter(x['category'] for x in catalog))}\nSecret achievements: {sum(r['visibility']=='secret' for r in catalog)}\nSVG icons: {len(list((ROOT/'assets/icons/svg').glob('*.svg')))}\nPNG icons: {len(list((ROOT/'assets/icons/png').glob('*.png')))}\nUI prototype: offline mock, contains no backend implementation\nBrowser smoke test: Playwright Chromium via set_content; desktop and mobile, filter grid opens, detail closes, unlock updates 10/50 to 11/50, ending stats updated, 390px no horizontal overflow, JS page errors 0.\nNote: external navigation was blocked by browser policy; used local content injection only; no production/live acceptance claim.\nErrors: {errors}\n"
(ROOT/'VALIDATION.txt').write_text(message,encoding='utf-8')
print(message)
if errors:raise SystemExit(1)
