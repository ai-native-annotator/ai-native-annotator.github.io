"""propbank_lookup: the PropBank senses of a lemma, read off disk.

A word sense is looked up, not recalled. English comes from
propbank-amr-frame-arg-descr.txt (one line per roleset), Chinese from
chinese-propbank/<lemma>.xml (one file per lemma).

A general tool: it sits in skillsets/tools/, so every skill has it (a copied
skillset keeps it in its own tools/).

The PropBank files are not in this repository. They are found under
$PROPBANK_DIR, else in resources/ or modular-parsing/resources/ in or next to
any directory above this file (the repository, or a copied skillset in it).
"""
import functools
import os
import re
import xml.etree.ElementTree as ET

_CANDIDATES = [os.environ.get("PROPBANK_DIR", "")]
_d = os.path.dirname(os.path.abspath(__file__))
while os.path.dirname(_d) != _d:
    _CANDIDATES += [os.path.join(_d, "resources"), os.path.join(_d, "modular-parsing", "resources")]
    _d = os.path.dirname(_d)
_ZH_PARTICLES = ("了", "着", "过", "起来", "下去", "出来", "上去")
_EN_SUFFIXES = [("ies", "y"), ("ied", "y"), ("ing", ""), ("ed", ""), ("es", ""), ("s", "")]


def propbank_lookup(lemmas: list[str], language: str) -> dict:
    """Look up up to three lemmas (the lemma and alternates) in PropBank.

    language is "en" or "zh". Returns, per lemma, every roleset that exists
    with its argument descriptions, e.g.
    {"taste": [{"roleset": "taste-01", "roles": {"ARG0": "taster", ...}}]};
    an empty list means the lemma is not in PropBank.
    """
    # a model may write "Chinese" or "中文" for "zh"
    language = "zh" if str(language).strip().lower()[:2] in ("zh", "ch", "中文"[:2]) else "en"
    out = {}
    for lemma in [l for l in (lemmas or []) if isinstance(l, str) and l.strip()][:3]:
        found = []
        for form in _variants(lemma.strip(), language):
            found = _lookup(form, language)
            if found:
                break
        out[lemma] = found
    return out


def _resources():
    for path in _CANDIDATES:
        if path and os.path.isdir(os.path.join(path, "english-propbank")):
            return path
    return ""


def _variants(lemma, language):
    out = [lemma]
    if language == "zh":
        for p in _ZH_PARTICLES:
            if lemma.endswith(p) and len(lemma) > len(p):
                out.append(lemma[: -len(p)])
    else:
        low = lemma.lower()
        out.append(low)
        for suffix, repl in _EN_SUFFIXES:
            if low.endswith(suffix) and len(low) > len(suffix) + 2:
                out.append(low[: -len(suffix)] + repl)
                out.append(low[: -len(suffix)] + repl + "e")
    seen = []
    for x in out:
        if x not in seen:
            seen.append(x)
    return seen


def _lookup(lemma, language):
    return _lookup_zh(lemma) if language == "zh" else _english().get(lemma.lower(), [])


@functools.lru_cache(maxsize=1)
def _english():
    index = {}
    path = os.path.join(_resources(), "english-propbank", "propbank-amr-frame-arg-descr.txt")
    if not os.path.exists(path):
        return index
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            m = re.match(r"^(\S+?)-(\d+)\s+(.*)$", line.rstrip())
            if not m:
                continue
            roles = {}
            for part in re.split(r"\s{2,}", m.group(3).strip()):
                if ":" in part:
                    k, _, v = part.partition(":")
                    roles[k.strip()] = v.strip()
            index.setdefault(m.group(1), []).append({"roleset": "%s-%s" % (m.group(1), m.group(2)),
                                                     "roles": roles})
    return index


def _lookup_zh(lemma):
    # the lemma comes from the model and becomes part of a file path
    if "/" in lemma or "\\" in lemma or ".." in lemma or lemma.startswith("."):
        return []
    path = os.path.join(_resources(), "chinese-propbank", lemma + ".xml")
    if not os.path.exists(path):
        return []
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        return []
    out = []
    for roleset in root.iter("roleset"):
        roles = {"ARG" + r.get("n"): r.get("descr", "") for r in roleset.iter("role") if r.get("n")}
        out.append({"roleset": roleset.get("id", "").replace(".", "-"), "name": roleset.get("name", ""),
                    "roles": roles})
    return out
