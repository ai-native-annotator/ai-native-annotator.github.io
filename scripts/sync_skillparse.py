"""Copy the SkillParseUMR skills this site runs into data/skillparse/fs/, and rebuild its data files.

    python3 scripts/sync_skillparse.py ../skillparseumr ../modular-parsing [jieba-0.42.1 dir] [penman wheel]

The page (skillparse.html) runs these Python files unchanged in the browser (Pyodide). What is copied:

  skillparseumr/src/                 registry.py, the UMR input and output handlers, gold.py, timeml.py
  skillparseumr/skillsets/tools/     propbank.py (the shared PropBank lookup)
  skillparseumr/experiment/rsi-jev2/skills/K4/          the Jev skills (kind: jev), RSI round 4
  skillparseumr/experiment/annoforge/harness/umr-*/HH/H10/   the Haiku harness after 10 RSI rounds
  skillparseumr/experiment/annoforge/af/   umr.py bench.py tml.py resources.py (what a harness step sees)

The RSI code itself is not copied. PropBank (modular-parsing/resources) is 24,521 + 5,618 XML files;
they become two JSON files that the page writes back out as small XML files in the browser, so
propbank.py and the harness tools read them exactly as on disk. jieba is trimmed to what the Jev
skills import (the dictionary, finalseg, posseg) and zipped.
"""
import json
import os
import re
import shutil
import sys
import xml.etree.ElementTree as ET
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
OUT = os.path.join(SITE, "data", "skillparse")
FS = os.path.join(OUT, "fs")

SP_FILES = [
    "src/registry.py", "src/gold.py", "src/timeml.py",
    "src/input_handler/__init__.py", "src/input_handler/umrinputhandler.py",
    "src/output_handler/__init__.py", "src/output_handler/umroutputhandler.py",
    "scripts/compare_ancast.py",
    "skillsets/tools/propbank.py", "skillsets/REGISTRY.md",
    "experiment/annoforge/af/umr.py", "experiment/annoforge/af/bench.py",
    "experiment/annoforge/af/tml.py", "experiment/annoforge/af/resources.py",
]
SP_DIRS = [
    "experiment/rsi-jev2/skills/K4",
    "experiment/annoforge/harness/umr-zh/HH/H10",
    "experiment/annoforge/harness/umr-en/HH/H10",
]
MP_FILES = [
    "resources/Abstract_predicate_and_rolesets.csv", "resources/All_relations.csv",
    "resources/Attribute_Values.csv", "resources/SP_and_Discourse.csv",
    "resources/english-propbank/propbank-amr-frame-arg-descr.txt",
]
PROPBANK = {
    "resources/propbank-zh.json": "resources/chinese-propbank",
    "resources/propbank-en.json": "resources/english-propbank/propbank-amr-frames-xml-2018-01-25",
}
# sample documents: the sentences only (header-only .umr: snt, Index, Words), no gold
DOCS = {"chinese_umr-0021": "newdata/chinese_umr-0021.umr", "english_umr-0003": "olddata/gold/en/english_umr-0003.umr"}
RULE = "#" * 80
JIEBA_KEEP = ("__init__.py", "_compat.py", "dict.txt", "finalseg/", "posseg/")


def copy(src_root, rel, dest_root):
    dst = os.path.join(dest_root, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(os.path.join(src_root, rel), dst)


def propbank_json(folder):
    """{lemma: [[roleset id, name, [[n, descr], ...]], ...]} of one folder of frame files."""
    out = {}
    for f in sorted(os.listdir(folder)):
        if f.endswith(".xml"):
            root = ET.parse(os.path.join(folder, f)).getroot()
            out[f[:-4]] = [[r.get("id", ""), r.get("name", ""), [[x.get("n", ""), x.get("descr", "")]
                                                                 for x in r.iter("role")]]
                           for r in root.iter("roleset")]
    return out


def write_docs(sp):
    os.makedirs(os.path.join(OUT, "docs"), exist_ok=True)
    for name, rel in DOCS.items():
        with open(os.path.join(sp, rel), encoding="utf-8-sig") as f:
            text = f.read()
        blocks = []
        for chunk in text.split(RULE):
            m = re.search(r"#\s*::\s*snt(\d+)", chunk)
            w = re.search(r"^Words:\s*(.*)$", chunk, re.M)
            if not m or not w:
                continue
            words = w.group(1).split()
            blocks.append("\n".join([RULE, "# :: snt%s" % m.group(1),
                                     "Index: " + " ".join(str(k + 1) for k in range(len(words))),
                                     "Words: " + " ".join(words), "", "# sentence level graph:", "",
                                     "# alignment:", "", "# document level annotation:", ""]))
        with open(os.path.join(OUT, "docs", name + ".umr"), "w", encoding="utf-8") as f:
            f.write("\n\n".join(blocks) + "\n")


def main(sp, mp, jieba_dir=None, penman_whl=None):
    if os.path.isdir(FS):
        shutil.rmtree(FS)
    for rel in SP_FILES:
        copy(sp, rel, os.path.join(FS, "skillparseumr"))
    for d in SP_DIRS:
        for base, _, files in os.walk(os.path.join(sp, d)):
            for f in files:
                if not f.endswith((".pyc",)):
                    copy(sp, os.path.relpath(os.path.join(base, f), sp), os.path.join(FS, "skillparseumr"))
    for rel in MP_FILES:
        copy(mp, rel, os.path.join(FS, "modular-parsing"))
    for rel, folder in PROPBANK.items():
        path = os.path.join(FS, "modular-parsing", rel)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(propbank_json(os.path.join(mp, folder)), f, ensure_ascii=False, separators=(",", ":"))
    write_docs(sp)
    files = []
    for root in (FS, os.path.join(OUT, "bridge"), os.path.join(OUT, "docs")):
        for base, _, names in os.walk(root):
            for n in sorted(names):
                if n.endswith(".pyc"):
                    continue
                files.append(os.path.relpath(os.path.join(base, n), OUT).replace(os.sep, "/"))
    with open(os.path.join(OUT, "MANIFEST.json"), "w", encoding="utf-8") as f:
        json.dump({"files": sorted(files), "vendor": ["vendor/jieba-0.42.1.zip", "vendor/penman-1.3.1-py3-none-any.whl"]},
                  f, ensure_ascii=False, indent=0)
    vendor = os.path.join(OUT, "vendor")
    os.makedirs(vendor, exist_ok=True)
    if jieba_dir:
        with zipfile.ZipFile(os.path.join(vendor, "jieba-0.42.1.zip"), "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for base, _, names in os.walk(os.path.join(jieba_dir, "jieba")):
                for n in names:
                    rel = os.path.relpath(os.path.join(base, n), os.path.join(jieba_dir, "jieba")).replace(os.sep, "/")
                    if rel.startswith(JIEBA_KEEP) and not rel.endswith((".p", ".pyc")):
                        z.write(os.path.join(base, n), "jieba/" + rel)
            for lic in ("LICENSE", "LICENSE.txt"):
                if os.path.exists(os.path.join(jieba_dir, lic)):
                    z.write(os.path.join(jieba_dir, lic), "jieba/LICENSE")
    if penman_whl:
        shutil.copyfile(penman_whl, os.path.join(vendor, os.path.basename(penman_whl)))
    print("wrote", len(files), "files under", OUT)


if __name__ == "__main__":
    main(*sys.argv[1:])
