"""Copy the SkillParseUMR skills this site runs into data/skillparse/fs/, and rebuild its data files.

    python3 scripts/sync_skillparse.py ../skillparseumr ../modular-parsing [jieba-0.42.1 dir] [penman wheel]

The page (index.html) runs these files with SkillParseUMR's own registry semantics (src/runner.py,
src/skill_callable.py), in the browser (Pyodide). Two procedures are composed here, one per language,
under skillparseumr/web-procedures/<lang>/, each a registry.yaml whose only kind: jev skill is
sent_type and whose other model skills are kind: agent (a skill.md prompt, answered by Haiku):

  zh   experiment/decision-orchestration/umr-zh-frag/versions/R42   registry, agent skills, rules
       experiment/decision-orchestration/umr-zh-v11/versions/V12    sent_type (kind: jev) and the
                                                                    modules it imports
  en   skillsets/umr-tree                                           registry, agent skills, rules
       experiment/decision-orchestration/umr-en-v11/versions/V12    sent_type (kind: jev), the same

  web-procedures/tools/   skillsets/tools (get_example, propbank_lookup): the general tools, found
                          next to the procedures as in experiment/rsi-zh2/skills/tools

Also copied: src/registry.py and the UMR input and output handlers. The reflection code (rsi-batch/)
is not. PropBank (modular-parsing/resources) is 24,521 + 5,618 XML files; each folder becomes one
merged JSON file, and every propbank.py copied is patched to read it (same answers).
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
WEB = "web-procedures"
# lang -> (the procedure whose registry, agent skills and rules are used, the version whose sent_type is used)
PROCEDURES = {
    "zh": (DO + "/umr-zh-frag/versions/R42", DO + "/umr-zh-v11/versions/V12"),
    "en": ("skillsets/umr-tree", DO + "/umr-en-v11/versions/V12"),
}
JEV_SKILL = "sent_type"
JEV_MODULES = ["jevlib.py", "prompt_loader.py", "event_modifiers.py", "event_modifiers.yaml"]
SHARED_TOOLS = ["skillsets/tools/example.py", "skillsets/tools/propbank.py"]
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


MERGED_LOOKUP = '''@functools.lru_cache(maxsize=1)
def _chinese():
    # ai-native-annotator.github.io: chinese-propbank/ (24,521 XML files) is one merged file,
    # chinese-propbank.json ({lemma: [[roleset id, name, [[n, descr], ...]], ...]}, made by
    # scripts/sync_skillparse.py); the lookup reads it instead of a file per lemma, same answers
    path = os.path.join(_resources(), "chinese-propbank.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _lookup_zh(lemma):
    out = []
    for rid, name, roles in _chinese().get(lemma, []):
        out.append({"roleset": rid.replace(".", "-"), "name": name,
                    "roles": {"ARG" + n: d for n, d in roles if n}})
    return out
'''


def patch_propbank(path):
    """A copied propbank.py, reading the merged Chinese PropBank file (its _lookup_zh is the last
    function of the file in every copy that reads the files itself; a copy that only delegates to
    another one, like R42's np_phrase/tools/propbank.py, is left as it is)."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    head, sep, _ = text.partition("def _lookup_zh(lemma):")
    if not sep:
        if "chinese-propbank" not in text:
            return
        raise SystemExit("%s: reads chinese-propbank but has no _lookup_zh to patch" % path)
    head = head.replace("import functools\n", "import functools\nimport json\n", 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(head + MERGED_LOOKUP)


def compose(sp, lang):
    """web-procedures/<lang>: the agent procedure, with sent_type taken from a jev version."""
    agent, jev = PROCEDURES[lang]
    dst = os.path.join(FS, "skillparseumr", WEB, lang)
    shutil.copytree(os.path.join(sp, agent), dst, ignore=shutil.ignore_patterns("*.pyc", "__pycache__"))
    shutil.rmtree(os.path.join(dst, JEV_SKILL))
    shutil.copytree(os.path.join(sp, jev, JEV_SKILL), os.path.join(dst, JEV_SKILL),
                    ignore=shutil.ignore_patterns("*.pyc", "__pycache__"))
    for m in JEV_MODULES:
        shutil.copyfile(os.path.join(sp, jev, m), os.path.join(dst, m))
    reg = os.path.join(dst, "registry.yaml")
    with open(reg, encoding="utf-8") as f:
        text = f.read()
    anchor = "  %s:\n    path: %s\n" % (JEV_SKILL, JEV_SKILL)
    if text.count(anchor) != 1 or "kind: jev" in text:
        raise SystemExit("%s: cannot mark %s as kind: jev" % (reg, JEV_SKILL))
    text = text.replace(anchor, anchor + "    kind: jev                 # web: Jev, from %s\n" % jev)
    header = ("# web-procedures/%s, composed by ai-native-annotator.github.io scripts/sync_skillparse.py:\n"
              "# %s, with %s from %s (kind: jev, and %s it imports).\n"
              "# Every other model skill is kind: agent: its skill.md, answered by Haiku.\n"
              % (lang, agent, JEV_SKILL, jev, ", ".join(JEV_MODULES)))
    with open(reg, "w", encoding="utf-8") as f:
        f.write(header + text)


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
    for lang in PROCEDURES:
        compose(sp, lang)
    for rel in SHARED_TOOLS:
        dst = os.path.join(FS, "skillparseumr", WEB, "tools", os.path.basename(rel))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(sp, rel), dst)
    for base, _, names in os.walk(FS):
        for n in names:
            if n == "propbank.py":
                patch_propbank(os.path.join(base, n))
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
