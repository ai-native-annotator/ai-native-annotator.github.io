"""propbank_lookup: the PropBank senses of a lemma, read off disk.

A word sense is looked up, not recalled. English comes from
propbank-amr-frame-arg-descr.txt (one line per roleset), Chinese from
chinese-propbank/<lemma>.xml (one file per lemma).

The PropBank files are not in this repository. They are found under
$PROPBANK_DIR, else <repo>/resources, else ../modular-parsing/resources next
to the repository.
"""
import functools
import json
import os
import re
import xml.etree.ElementTree as ET

_REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
_CANDIDATES = [os.environ.get("PROPBANK_DIR", ""), os.path.join(_REPO, "resources"),
               os.path.join(os.path.dirname(_REPO), "modular-parsing", "resources")]
_ZH_PARTICLES = ("了", "着", "过", "起来", "下去", "出来", "上去")
_EN_SUFFIXES = [("ies", "y"), ("ied", "y"), ("ing", ""), ("ed", ""), ("es", ""), ("s", "")]


def propbank_lookup(lemmas: list[str], language: str) -> dict:
    """Look up up to three lemmas (the lemma and alternates) in PropBank.

    language is "en" or "zh". Returns, per lemma, every roleset that exists
    with its argument descriptions, e.g.
    {"taste": [{"roleset": "taste-01", "roles": {"ARG0": "taster", ...}}]};
    an empty list means the lemma is not in PropBank.
    """
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


@functools.lru_cache(maxsize=1)
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
