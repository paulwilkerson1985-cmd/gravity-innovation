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
