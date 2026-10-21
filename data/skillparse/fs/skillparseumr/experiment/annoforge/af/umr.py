"""UMR documents as sentences, for a harness that annotates one sentence at a time.

    doc = load("newdata/chinese_umr-0001.umr")
    doc["sents"]            [{index, words, text, head, gold}]; head is the block's header lines
                            (# :: sntN, Index:, Words:), gold the three sections as the gold file has them
    gold_umr(doc, n)        the gold of the first n sentences as a .umr text (all when n is None)
    parse_annotation(i, t)  a model's annotation of sentence i -> (sections, problems)
    render_pred(doc, n, s)  {i: sections} -> .umr text of the first n sentences

An annotation is written as a UMR file writes a sentence: `# sentence level graph:` with the PENMAN
graph, `# alignment:` with `var: start-end` lines (1-based word positions, 0-0 for none) and
`# document level annotation:` with the (s<i>s0 / sentence ...) graph.
"""
import os
import re
import sys

import penman

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import compare_ancast as C  # noqa: E402

SECTIONS = C.SECTIONS
RULE = "#" * 80


def load(path):
    with open(path, encoding="utf-8-sig") as f:
        text = f.read()
    sents = []
    for head, sections in C.blocks(text):
        m = re.search(r"#\s*::\s*snt(\d+)", head)
        if not m:
            continue
        words = re.search(r"^Words:\s*(.*)$", head, re.M)
        words = words.group(1).split() if words else []
        # one Index/Words pair, aligned simply (the gold files pad the columns)
        lines = [l for l in head.splitlines() if not l.startswith(("Index:", "Words:"))]
        index_line = "Index: " + " ".join(str(k + 1) for k in range(len(words)))
        words_line = "Words: " + " ".join(words)
        sents.append({"index": int(m.group(1)), "words": words,
                      "text": ("" if _cjk(words) else " ").join(words),
                      "head": "\n".join(lines + [index_line, words_line]),
                      "gold": {k: sections.get(k, "").strip() for k in SECTIONS}})
    lang = "zh" if os.path.basename(path).startswith("chinese") else "en"
    return {"name": os.path.basename(path)[:-4], "lang": lang, "sents": sents, "path": path}


def _cjk(words):
    return any("一" <= ch <= "鿿" for w in words for ch in w)


def numbered(sent):
    """The sentence as the annotator sees it: word positions and words."""
    return "\n".join("%d %s" % (k + 1, w) for k, w in enumerate(sent["words"]))


def gold_block(sent):
    return "\n\n".join("%s\n%s" % (k, sent["gold"][k]) for k in SECTIONS)


def gold_umr(doc, n=None):
    """The gold, normalised as predictions are (graphs re-encoded, every variable aligned, at most
    0-0), so that every scorer reads both sides the same way."""
    sents = doc["sents"][:n] if n else doc["sents"]
    return _render([(s["head"], normalise(s["index"], s["gold"])) for s in sents])


def normalise(index, sections):
    out, _ = parse_annotation(index, as_text(sections), strict=False)
    return out or empty(index)


def _render(blocks):
    out = []
    for head, sections in blocks:
        pieces = [head.strip()] + ["%s\n%s" % (k, (sections.get(k) or "").strip()) for k in SECTIONS]
        out.append(RULE + "\n" + "\n\n".join(pieces))
    return "\n\n\n".join(out) + "\n"


def parse_annotation(index, text, strict=True):
    """(sections, problems). sections is None when there is no parseable sentence graph."""
    problems = []
    text = text.replace("\r", "")
    text = re.sub(r"^```\w*\s*$", "", text, flags=re.M)
    found = {}
    current = None
    for line in text.splitlines():
        marker = next((m for m in SECTIONS if line.strip().lower().startswith(m)), None)
        if marker:
            current = marker
            found[current] = ""
            continue
        if current:
            found[current] += line + "\n"
    if SECTIONS[0] not in found:
        # a bare graph: take it as the sentence graph
        if text.strip().startswith("("):
            found[SECTIONS[0]] = text
        else:
            return None, ["no sentence level graph section"]
    graph = found[SECTIONS[0]].strip()
    try:
        g = penman.decode(graph if strict else _balance(graph))
    except Exception as e:
        return None, ["sentence graph does not parse: %s" % str(e)[:200]]
    prefix = "s%d" % index
    bad = [v for v in g.variables() if not re.match(r"^%s[a-z]" % prefix, v)]
    if bad and strict:
        problems.append("variables without the prefix %s: %s" % (prefix, ", ".join(sorted(bad)[:8])))
    graph = penman.encode(g, indent=4)
    align = []
    for line in found.get(SECTIONS[1], "").splitlines():
        m = re.match(r"^\s*(\S+)\s*:\s*(-?\d+)\s*-\s*(-?\d+)\s*$", line)
        if m:
            align.append("%s: %s-%s" % m.groups())
        elif line.strip():
            problems.append("alignment line not understood: %s" % line.strip()[:80])
    known = set(g.variables())
    align = [a for a in align if a.split(":")[0] in known]
    for v in sorted(known - {a.split(":")[0] for a in align}):
        align.append("%s: 0-0" % v)
    doc_text = found.get(SECTIONS[2], "")
    triples = read_doc(doc_text)
    if doc_text.strip() and not triples and re.search(r":(temporal|modal|coref)", doc_text):
        problems.append("document level annotation has no readable (a :rel b) triples")
    doc = render_doc(index, triples)
    return {SECTIONS[0]: graph, SECTIONS[1]: "\n".join(align), SECTIONS[2]: doc}, problems


DOC_GROUP = re.compile(r":(temporal|modal|coref)\b")
DOC_TRIPLE = re.compile(r"\(\s*([^\s()]+)\s+:([\w-]+)\s+([^\s()]+)\s*\)")


def read_doc(text):
    """[(group, parent, relation, child)] of a document-level annotation."""
    marks = [(m.start(), m.group(1)) for m in DOC_GROUP.finditer(text)]
    out = []
    for k, (start, group) in enumerate(marks):
        end = marks[k + 1][0] if k + 1 < len(marks) else len(text)
        for a, r, b in DOC_TRIPLE.findall(text[start:end]):
            t = (group, a, r, b.rstrip(")"))
            if t not in out:
                out.append(t)
    return out


def render_doc(index, triples):
    lines = ["(s%ds0 / sentence" % index]
    for group in ("temporal", "modal", "coref"):
        mine = ["(%s :%s %s)" % (a, r, b) for g, a, r, b in triples if g == group]
        if mine:
            lines.append("    :%s (%s)" % (group, ("\n" + " " * (len(group) + 7)).join(mine)))
    return "\n".join(lines) + ")"


def _balance(text):
    """Drop closing brackets that close nothing (the gold has a few stray ones)."""
    out, depth, quoted = [], 0, False
    for ch in text:
        if ch == '"':
            quoted = not quoted
        if not quoted and ch == "(":
            depth += 1
        elif not quoted and ch == ")":
            if depth == 0:
                continue
            depth -= 1
        out.append(ch)
    return "".join(out) + ")" * depth


def empty(index):
    return {SECTIONS[0]: "(s%dx0 / empty)" % index, SECTIONS[1]: "s%dx0: 0-0" % index,
            SECTIONS[2]: "(s%ds0 / sentence)" % index}


def render_pred(doc, n, per_sentence):
    sents = doc["sents"][:n] if n else doc["sents"]
    return _render([(s["head"], per_sentence.get(s["index"]) or empty(s["index"])) for s in sents])


VAR = re.compile(r"\bs(\d+)([a-z][\w-]*)")


def renumber(sections, mapping):
    """The sections with every variable s<k>... renamed to s<mapping[k]>...; document-level triples that
    mention a sentence outside the mapping are dropped."""
    def sub(text):
        return VAR.sub(lambda m: "s%d%s" % (mapping[int(m.group(1))], m.group(2)) if int(m.group(1)) in mapping
                       else m.group(0), text)
    graph = sub(sections[SECTIONS[0]])
    align = sub(sections[SECTIONS[1]])
    keep = []
    for g, a, r, b in read_doc(sections[SECTIONS[2]]):
        ends = [int(m.group(1)) for x in (a, b) for m in [VAR.fullmatch(x)] if m]
        if all(k in mapping for k in ends):
            keep.append((g, sub(a), r, sub(b)))
    index = int(re.search(r"\(s(\d+)", sections[SECTIONS[2]]).group(1))
    return {SECTIONS[0]: graph, SECTIONS[1]: align, SECTIONS[2]: render_doc(mapping.get(index, index), keep)}


def window_files(doc, start, n, per_sentence):
    """(gold .umr, predicted .umr) of sentences start..start+n-1, renumbered 1..n on both sides."""
    sents = doc["sents"][start - 1:start - 1 + n]
    mapping = {s["index"]: k + 1 for k, s in enumerate(sents)}
    gold, pred = [], []
    for s in sents:
        i = mapping[s["index"]]
        head = re.sub(r"snt\d+", "snt%d" % i, s["head"])
        gold.append((head, renumber(normalise(s["index"], s["gold"]), mapping)))
        pred.append((head, renumber(per_sentence.get(s["index"]) or empty(s["index"]), mapping)))
    return _render(gold), _render(pred)


def as_text(sections):
    return "\n\n".join("%s\n%s" % (k, sections[k]) for k in SECTIONS)
