"""Compare the files in this folder with SHA256SUMS.txt.

Run from the repository root or from this folder:
    python docs/product/narrative-v1/tools/check_received.py [--strict]

Reports files that match, files whose content differs, files that are still
missing, and manifest entries that share identical content. With --strict the
exit code is 1 while anything is missing or mismatched.
"""

import hashlib
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "SHA256SUMS.txt"
# Files that are never listed in the manifest (the manifest itself, the validation
# report generated after it, and the helpers added on this branch).
LOCAL_ONLY = {"README.md", "SHA256SUMS.txt", "VALIDATION.txt", "tools/check_received.py"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 16), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    strict = "--strict" in sys.argv[1:]
    expected = {}
    for line in MANIFEST.read_text(encoding="utf-8").splitlines():
        if line.strip():
            digest, name = line.split(maxsplit=1)
            expected[name.strip()] = digest

    ok, mismatched, missing = [], [], []
    for name, digest in sorted(expected.items()):
        path = ROOT / name
        if not path.is_file():
            missing.append(name)
        elif sha256(path) == digest:
            ok.append(name)
        else:
            mismatched.append(name)

    present = {p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*") if p.is_file()}
    extra = sorted(present - set(expected) - LOCAL_ONLY)

    shared = defaultdict(list)
    for name, digest in expected.items():
        shared[digest].append(name)
    duplicates = [sorted(names) for names in shared.values() if len(names) > 1]

    print(f"manifest: {len(expected)}  ok: {len(ok)}  mismatched: {len(mismatched)}  missing: {len(missing)}")
    for name in mismatched:
        print(f"MISMATCH {name}")
    for name in missing:
        print(f"MISSING  {name}")
    for name in extra:
        print(f"EXTRA    {name}")
    for names in duplicates:
        print(f"SAME-CONTENT {' = '.join(names)}")

    if strict and (missing or mismatched):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
