"""Copy the SkillParseUMR skills this site runs into data/skillparse/fs/, and rebuild its data files.

    python3 scripts/sync_skillparse.py ../skillparseumr ../modular-parsing [jieba-0.42.1 dir] [penman wheel]

The page (index.html) runs these Python files unchanged in the browser (Pyodide). What is copied:

  skillparseumr/src/                registry.py, the UMR input and output handlers
  skillparseumr/skillsets/tools/    propbank.py (the shared PropBank lookup)
  skillparseumr/experiment/decision-orchestration/umr-{zh,en}-v11/versions/V12/
                                    the decision-orchestration procedures (kind: jev skills: rules
                                    list the options, Jev answers closed questions, Haiku takes the
                                    ones Jev is unsure of), after 12 rounds of measured reflection

The reflection code itself (rsi-batch/) is not copied. PropBank (modular-parsing/resources) is
24,521 + 5,618 XML files; each folder becomes one merged JSON file, and propbank.py is replaced by
the version in data/skillparse/overrides/, which reads the merged file and returns the same answers.
jieba is trimmed to what the skills import (the dictionary, finalseg, posseg) and zipped.
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
    "src/registry.py",
    "src/input_handler/__init__.py", "src/input_handler/umrinputhandler.py",
    "src/output_handler/__init__.py", "src/output_handler/umroutputhandler.py",
    "skillsets/tools/propbank.py", "skillsets/REGISTRY.md",
]
DO = "experiment/decision-orchestration"
SP_DIRS = [DO + "/umr-zh-v11/versions/V12", DO + "/umr-en-v11/versions/V12"]
MP_FILES = [
    "resources/Abstract_predicate_and_rolesets.csv", "resources/All_relations.csv",
    "resources/Attribute_Values.csv", "resources/SP_and_Discourse.csv",
    "resources/english-propbank/propbank-amr-frame-arg-descr.txt",
]
# a folder of one XML file per lemma -> one merged JSON file next to it
PROPBANK = {
    "resources/chinese-propbank.json": "resources/chinese-propbank",
    "resources/english-propbank/propbank-amr-frames-xml-2018-01-25.json":
        "resources/english-propbank/propbank-amr-frames-xml-2018-01-25",
}
# files changed here to read the merged PropBank files (copied over the originals)
OVERRIDES = os.path.join(OUT, "overrides")
# sample documents: the sentences only (header-only .umr: snt, Index, Words), no gold
# (both are in the decision-orchestration test sets)
DOCS = {"chinese_umr-0022": "newdata/chinese_umr-0022.umr",
        "english_umr-0008": "newdata/umr_en_normalized/english_umr-0008.umr"}
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
    for d in (FS, os.path.join(OUT, "docs")):
        if os.path.isdir(d):
            shutil.rmtree(d)
    for rel in SP_FILES:
        copy(sp, rel, os.path.join(FS, "skillparseumr"))
    for d in SP_DIRS:
        for base, _, files in os.walk(os.path.join(sp, d)):
            for f in files:
                if not f.endswith((".pyc",)):
                    copy(sp, os.path.relpath(os.path.join(base, f), sp), os.path.join(FS, "skillparseumr"))
    for rel in MP_FILES:
        copy(mp, rel, os.path.join(FS, "modular-parsing"))
    for base, _, names in os.walk(OVERRIDES):
        for n in names:
            src = os.path.join(base, n)
            dst = os.path.join(FS, os.path.relpath(src, OVERRIDES))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
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
