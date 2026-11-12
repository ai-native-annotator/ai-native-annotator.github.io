"""Write data/skillparse/MANIFEST.json: {path under /sp in the browser's Python: the file that holds it}.

    python3 scripts/build_manifest.py

Run after adding, moving or deleting a file under data/skillparse/ (test/repository-integrity.test.mjs
fails when the manifest is not what this writes). Everything is at its own path, with one rule for
skills: a procedure is skills/<lang>/ laid over skills/shared/, so a file every procedure uses is
kept once under shared/ and a procedure that needs its own puts one at the same path in its folder.
"""
import json
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "skillparse")
LOADED = ["bridge", "docs", "engine", "umr", "skills"]      # resources/ is fetched when a tool needs it
SHARED = "skills/shared/"
NOT_A_PROCEDURE = ("shared", "tools")
VENDOR = ["vendor/penman-1.3.1-py3-none-any.whl"]


def walk(folder):
    return sorted(os.path.relpath(os.path.join(base, n), OUT).replace(os.sep, "/")
                  for base, dirs, names in os.walk(os.path.join(OUT, folder))
                  for n in names if not n.endswith(".pyc") and "__pycache__" not in base)


def manifest():
    files = {}
    own = [p for folder in LOADED for p in walk(folder)]
    shared = [p for p in own if p.startswith(SHARED)]
    files.update({p: p for p in own if not p.startswith(SHARED)})
    for lang in sorted(os.listdir(os.path.join(OUT, "skills"))):
        if lang in NOT_A_PROCEDURE or not os.path.isdir(os.path.join(OUT, "skills", lang)):
            continue
        for p in shared:
            files.setdefault("skills/%s/%s" % (lang, p[len(SHARED):]), p)
    return {"files": dict(sorted(files.items())), "vendor": VENDOR}


if __name__ == "__main__":
    m = manifest()
    with open(os.path.join(OUT, "MANIFEST.json"), "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=0)
        f.write("\n")
    print("wrote", len(m["files"]), "paths to MANIFEST.json")
