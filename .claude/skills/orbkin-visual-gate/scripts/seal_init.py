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
