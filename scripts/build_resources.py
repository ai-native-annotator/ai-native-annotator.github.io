"""Build data/skillparse/resources/: what the skills' tools search, from two upstream repositories.

    python3 scripts/build_resources.py ../skillparseumr ../modular-parsing

  gold/<lang>/gold.json          every gold sentence with its whole annotation (search_annotations)
  guidelines/umr_guidelines.md   the UMR guidelines, sha256-checked (search_guidelines)
  propbank/<lang>.json           each folder of one XML file per lemma, merged: every roleset with
                                 its roles and all its examples (propbank_lookup)

The files are in the repository; this is only needed when the upstream data changes. The skills
themselves are this site's files (data/skillparse/skills/) and are not built from anything.
"""
import hashlib
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

RESOURCES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "skillparse", "resources")
RULE = "#" * 80
GOLD = {
    # lang -> [(repo, folder)], earlier first: a document already taken is not taken again
    "zh": [("sp", "newdata"), ("mp", "resources/real-umr-data/chinese/umr_data")],
    "en": [("sp", "newdata/umr_en_normalized")],
}
GUIDELINES = ("experiment/annoforge/guidelines/umr_guidelines.md",       # umr4nlp/umr-guidelines guidelines.md
              "f60deebff42ef5262bc5bb95d9f69142e2792bff0308388c315c912bf75aa612")
PROPBANK = {
    "zh": "resources/chinese-propbank",
    "en": "resources/english-propbank/propbank-amr-frames-xml-2018-01-25",
}


def _label(a):
    """An example argument's label: ARG0, ARGM-TMP (English n / f), ARGM-LOC (Chinese type)."""
    if a.get("type"):
        t = a.get("type")
        return t[:4].upper() + t[4:].upper() if t.lower().startswith("argm") else t.upper()
    n, f = (a.get("n") or "").upper(), (a.get("f") or "").upper()
    return "ARGM-" + f if n == "M" and f else "ARG" + n + ("-" + f if f and n != "M" else "")


def _example(ex):
    """[name, sentence, [[label, text], ...], rel] of one <example>: a Chinese one has a treebank
    parse (its words, traces too, joined by spaces) and its arguments under <propbank>."""
    text = (ex.findtext("text") or "").strip()
    pb = ex.find("propbank")
    if pb is not None:              # Chinese
        text = " ".join(w for _, w in re.findall(r"\(([^\s()]+) ([^\s()]+)\)", text))
        items = list(pb)
    else:
        text = " ".join(text.split())
        items = list(ex)
    args = [[_label(a), " ".join((a.text or "").split())] for a in items if a.tag == "arg"]
    rel = " ".join(" ".join((a.text or "").split()) for a in items if a.tag == "rel")
    return [ex.get("name", ""), text, args, rel]


def propbank_json(folder):
    """{lemma: [[roleset id, name, [[n, descr], ...], [example, ...]], ...]} of a folder of frame
    files, lemma as each <predicate> gives it (eat, eat_up)."""
    out = {}
    for f in sorted(os.listdir(folder)):
        if not f.endswith(".xml"):
            continue
        root = ET.parse(os.path.join(folder, f)).getroot()
        for p in root.iter("predicate"):
            lemma = p.get("lemma") or f[:-4]
            out.setdefault(lemma, []).extend(
                [r.get("id", ""), r.get("name", ""), [[x.get("n", ""), x.get("descr", "")] for x in r.iter("role")],
                 [_example(e) for e in r.iter("example")]] for r in p.iter("roleset"))
    return out


def gold_records(path, doc):
    """[{doc, snt, text, annotation}] of one gold .umr file: each sentence's whole block."""
    with open(path, encoding="utf-8-sig") as f:
        text = f.read()
    out = []
    for block in text.split(RULE):
        m = re.search(r"^#\s*::\s*snt(\d+)[ \t]*(.*)$", block, re.M)
        if not m:
            continue
        w = re.search(r"^Words:[ \t]*(.*)$", block, re.M)
        words = (w.group(1) if w else m.group(2)).split()
        latin = lambda a, b: re.search(r"[A-Za-z0-9]$", a) and re.match(r"[A-Za-z0-9]", b)   # noqa: E731
        joined = ""
        for x in words:
            joined += (" " if joined and (doc.startswith("english") or latin(joined, x)) else "") + x
        out.append({"doc": doc, "snt": int(m.group(1)), "text": joined, "annotation": block[m.start():].strip()})
    return out


def write_resources(sp, mp):
    """resources/gold/<lang>/gold.json (every gold sentence, with its whole annotation) and
    resources/guidelines/umr_guidelines.md."""
    roots = {"sp": sp, "mp": mp}
    for lang, sources in GOLD.items():
        taken, records, from_where = set(), [], []
        for repo, folder in sources:
            d = os.path.join(roots[repo], folder)
            n = 0
            for name in sorted(os.listdir(d)):
                if not name.endswith(".umr") or name[:-4] in taken:
                    continue
                taken.add(name[:-4])
                records += gold_records(os.path.join(d, name), name[:-4])
                n += 1
            from_where.append("%s %s: %d documents" % ({"sp": "SkillParseUMR", "mp": "modular-parsing"}[repo], folder, n))
        out = os.path.join(RESOURCES, "gold", lang)
        os.makedirs(out, exist_ok=True)
        with open(os.path.join(out, "gold.json"), "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, separators=(",", ":"))
        with open(os.path.join(out, "SOURCE.md"), "w", encoding="utf-8") as f:
            f.write("# gold/%s\n\n%d sentences of %d documents, written by scripts/build_resources.py from:\n\n%s\n"
                    % (lang, len(records), len(taken), "".join("- %s\n" % x for x in from_where)))
    rel, digest = GUIDELINES
    with open(os.path.join(sp, rel), "rb") as f:
        data = f.read()
    if hashlib.sha256(data).hexdigest() != digest:
        raise SystemExit("%s is not the guidelines.md expected (sha256 %s)" % (rel, digest))
    os.makedirs(os.path.join(RESOURCES, "guidelines"), exist_ok=True)
    with open(os.path.join(RESOURCES, "guidelines", "umr_guidelines.md"), "wb") as f:
        f.write(data)
    with open(os.path.join(RESOURCES, "guidelines", "SOURCE.md"), "w", encoding="utf-8") as f:
        f.write("# guidelines\n\n`umr_guidelines.md`: the UMR guidelines, umr4nlp/umr-guidelines `guidelines.md`\n"
                "(https://github.com/umr4nlp/umr-guidelines/blob/master/guidelines.md), sha256 %s.\n" % digest)


def main(sp, mp):
    write_resources(sp, mp)
    os.makedirs(os.path.join(RESOURCES, "propbank"), exist_ok=True)
    for lang, folder in PROPBANK.items():
        with open(os.path.join(RESOURCES, "propbank", lang + ".json"), "w", encoding="utf-8") as f:
            json.dump(propbank_json(os.path.join(mp, folder)), f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(RESOURCES, "propbank", "SOURCE.md"), "w", encoding="utf-8") as f:
        f.write("# propbank\n\nWritten by scripts/build_resources.py from sxndqc/modular-parsing:\n\n"
                + "".join("- `%s.json`: `%s/*.xml`, every roleset with its roles and all its examples\n" % kv
                          for kv in PROPBANK.items()))


if __name__ == "__main__":
    main(*sys.argv[1:])
