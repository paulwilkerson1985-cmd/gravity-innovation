#!/usr/bin/env python3
"""seal_init.py - create (or refresh) the sealed verifier directory the gate scripts read.

  python3 -I seal_init.py [--sealed DIR] [--ref IMAGE] [--force]

Creates DIR (default <project>/game/tools/verify/sealed, or $ORBKIN_SEALED) with:
  prompts.json    judge prompts (pairwise full/crop/element/ui/blur, motion strips, IP check, critique)
  canary.json     the degradation recipe for the self-check pair
  franchise.txt   names that trip the originality tripwire when a judge reason mentions them
  trust.json      per-family trust table skeleton (every family starts human-gated)
  anchors/        owner-rated pairs go here (owner_kit.py / agree.py)
  README.md       what the directory is and the deny rule to add for generator sessions
  ref.png         only if --ref is given: the thumbnail quality-bar anchor (never shipped, never copied)
Existing files are kept unless --force. Exit 0 ok, 2 bad input.

Why the defaults are stored encoded below: generator sessions grep the skill; the judge's wording must not
become the generator's target vocabulary (judge-calibration.md section 7). This is hygiene, not a security
boundary; the boundary is the Read deny rule on the sealed directory, which the owner adds.
"""
import argparse, base64, json, os, sys, zlib

_BLOB = (
    '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'
    '2KxVz5Kj//X+fwEmfBfb'
)

DEFAULT_TRUST = {
    'version': 1,
    'rule': 'judge_trusted when anchors >= 5 and kappa >= 0.6 and contradictions == 0; else human_gated',
    'families': {f: {'state': 'human_gated', 'anchors': 0, 'kappa': None, 'contradictions': 0, 'updated': None}
                 for f in ('density', 'dof_strength', 'ui_skin', 'grade_strength', 'outline_weight', 'palette',
                           'baseline_vs_current', 'kin_source', 'kin_renderer', 'lighting_mood', 'motion_timing',
                           'environment_element', 'defect')},
}


def defaults():
    d = json.loads(zlib.decompress(base64.b64decode(''.join(_BLOB))).decode())
    return {'prompts': d['prompts'], 'canary': d['canary'], 'franchise': d['franchise']}


README = """# Sealed verifier assets (orbkin-visual-gate)

Only the verifier (the gate scripts) reads this directory. Generator sessions (anything that edits art,
shaders, dressing, UI or motion) must not: add `Read(game/tools/verify/sealed/**)` to the deny list in
`.claude/settings.json` (owner approves that change). Never ship, commit screenshots of, or paste anything
from here into a prompt that writes code. ref.png, if present, is a thumbnail mood anchor only.
Files: prompts.json, canary.json, franchise.txt, trust.json, anchors/<pair>/{a.png,b.png,verdict.json}.
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--sealed'); ap.add_argument('--ref'); ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import judgelib
    d = judgelib.sealed_dir(a.sealed)
    os.makedirs(os.path.join(d, 'anchors'), exist_ok=True)
    de = defaults()
    written = []
    def put(name, text):
        p = os.path.join(d, name)
        if os.path.exists(p) and not a.force:
            return
        with open(p, 'w') as fh:
            fh.write(text)
        written.append(name)
    put('prompts.json', json.dumps(de['prompts'], indent=1))
    put('canary.json', json.dumps(de['canary'], indent=1))
    put('franchise.txt', '# one name per line; judge reasons naming any of these escalate to ip_check\n' + '\n'.join(de['franchise']) + '\n')
    put('trust.json', json.dumps(DEFAULT_TRUST, indent=1))
    put('README.md', README)
    if a.ref:
        if not os.path.isfile(a.ref):
            print(f'error: --ref {a.ref} not found', file=sys.stderr); sys.exit(2)
        from PIL import Image
        im = Image.open(a.ref).convert('RGB')
        s = min(1.0, 640 / max(im.size))     # thumbnail anchor: never native size (judge-calibration 5.5)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        im.save(os.path.join(d, 'ref.png')); written.append('ref.png')
    print(json.dumps({'sealed_dir': d, 'written': written, 'kept': sorted(set(os.listdir(d)) - set(written)),
                      'next': 'owner adds Read(game/tools/verify/sealed/**) to the deny list for generator sessions'}))


if __name__ == '__main__':
    main()
