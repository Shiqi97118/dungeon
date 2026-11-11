#!/usr/bin/env python3
"""Static validation for the Iselan narrative handoff package.

Default run is read-only:
    python tools/validate_package.py

It checks every file against SHA256SUMS.txt (missing, changed or unlisted files
fail), the 50-item achievement catalog, spoiler masking of the public catalog,
icon files and duplicate icon images, and the offline UI prototype markers.
Exit code is 1 when any check fails.

After an intentional change (for example re-running tools/build_assets.py):
    python tools/validate_package.py --update

This runs the same content checks, then rewrites SHA256SUMS.txt and
VALIDATION.txt from the current files. It refuses to write when a content check
fails. Review the resulting diff before committing.

This script does not run a browser; UI behaviour must be checked separately.
"""
from pathlib import Path
import collections
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'SHA256SUMS.txt'
REPORT = ROOT / 'VALIDATION.txt'
# Never listed in the manifest: the manifest and report themselves, and the
# files a host repository adds next to the package.
EXCLUDED = {'SHA256SUMS.txt', 'VALIDATION.txt', 'README.md', 'tools/check_received.py'}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def package_files():
    return sorted(
        p.relative_to(ROOT).as_posix()
        for p in ROOT.rglob('*')
        if p.is_file() and p.relative_to(ROOT).as_posix() not in EXCLUDED
    )


def check_content(errors):
    catalog = json.loads((ROOT / 'data/achievements.v1.json').read_text(encoding='utf-8'))['achievements']
    public = json.loads((ROOT / 'data/achievements.public.json').read_text(encoding='utf-8'))['achievements']
    if len(catalog) != 50:
        errors.append('catalog != 50')
    if len(set(r['id'] for r in catalog)) != 50:
        errors.append('duplicate ids')
    if collections.Counter(x['category'] for x in catalog) != {'ST': 12, 'RE': 10, 'EX': 10, 'SB': 8, 'LG': 10}:
        errors.append('category count mismatch')
    if len(public) != len(catalog):
        errors.append('public catalog length differs from catalog')

    ops = {'event', 'count', 'all', 'any'}

    def rulecheck(rule):
        if rule['op'] not in ops:
            errors.append('bad rule op ' + rule['op'])
        if rule['op'] in ('event', 'count') and not isinstance(rule.get('where'), dict):
            errors.append('missing where')
        if rule['op'] == 'count' and rule.get('min', 0) < 1:
            errors.append('bad min')
        if rule['op'] in ('any', 'all'):
            for r in rule['rules']:
                rulecheck(r)

    for r, q in zip(catalog, public):
        rulecheck(r['rule'])
        if r['id'] != q['id']:
            errors.append('index mismatch ' + r['id'])
        for k in ('icon', 'png'):
            if not (ROOT / r[k]).is_file():
                errors.append(f"missing {r[k]}")
        if r['visibility'] == 'secret' and (q.get('name') != '???' or q.get('icon', '').split('/')[-1] != 'LOCKED.svg' or 'rule' in q):
            errors.append('secret leaked ' + r['id'])
        if r['visibility'] == 'hint' and r['name'] == q['name']:
            errors.append('hint name leaked ' + r['id'])
        if not isinstance(r['description'], str) or not r['name']:
            errors.append('empty item ' + r['id'])
        if r['rarity'] not in ['common', 'rare', 'epic', 'legendary']:
            errors.append('bad rarity ' + r['id'])
        if r['scope'] not in ['run', 'character', 'party']:
            errors.append('bad scope ' + r['id'])

    by_digest = collections.defaultdict(list)
    for r in catalog:
        png = ROOT / r['png']
        if png.is_file():
            by_digest[sha256(png)].append(r['id'])
    for ids in by_digest.values():
        if len(ids) > 1:
            errors.append('identical icon images: ' + ', '.join(ids))

    proto = (ROOT / 'ui/achievement-prototype.html').read_text(encoding='utf-8')
    if 'OFFLINE MOCK ONLY' not in proto:
        errors.append('prototype lacks demo warning')
    for k in ['achievementGrid', 'detailBody', 'toast', 'ending', 'totalProgress']:
        if k not in proto:
            errors.append('missing element ' + k)
    return catalog


def check_manifest(errors):
    if not MANIFEST.is_file():
        errors.append('SHA256SUMS.txt missing')
        return
    expected = {}
    for line in MANIFEST.read_text(encoding='utf-8').splitlines():
        if line.strip():
            digest, name = line.split(maxsplit=1)
            expected[name.strip()] = digest
    present = set(package_files())
    for name, digest in sorted(expected.items()):
        path = ROOT / name
        if not path.is_file():
            errors.append('manifest: missing ' + name)
        elif sha256(path) != digest:
            errors.append('manifest: changed ' + name)
    for name in sorted(present - set(expected)):
        errors.append('manifest: unlisted ' + name)


def summary(catalog, errors, mode):
    return (
        f"Static package validation: {'PASS' if not errors else 'FAIL'}\n"
        f"Mode: {mode}\n"
        f"Achievements: {len(catalog)}\n"
        f"By category: {dict(collections.Counter(x['category'] for x in catalog))}\n"
        f"Secret achievements: {sum(r['visibility'] == 'secret' for r in catalog)}\n"
        f"SVG icons: {len(list((ROOT / 'assets/icons/svg').glob('*.svg')))}\n"
        f"PNG icons: {len(list((ROOT / 'assets/icons/png').glob('*.png')))}\n"
        "UI prototype: offline mock, contains no backend implementation\n"
        "Browser smoke test: not run by this script; check UI behaviour separately.\n"
        f"Errors: {errors}\n"
    )


def main(argv):
    update = '--update' in argv
    errors = []
    catalog = check_content(errors)
    if update:
        if errors:
            print(summary(catalog, errors, 'update (refused)'))
            return 1
        lines = [f"{sha256(ROOT / name)}  {name}" for name in package_files()]
        MANIFEST.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        message = summary(catalog, errors, 'update (manifest rewritten from current files)')
        REPORT.write_text(message, encoding='utf-8')
    else:
        check_manifest(errors)
        message = summary(catalog, errors, 'verify (read-only)')
    print(message)
    return 1 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
