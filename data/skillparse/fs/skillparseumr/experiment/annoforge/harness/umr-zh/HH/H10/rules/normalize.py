import re

METAS = ("PAST_REF", "PRESENT_REF", "FUTURE_REF")
MODMAP = {
    "fullaff": "full-affirmative",
    "prtaff": "partial-affirmative",
    "partialaff": "partial-affirmative",
    "neutaff": "neutral-affirmative",
    "neutneg": "neutral-negative",
    "prtneg": "partial-negative",
    "partialneg": "partial-negative",
    "fullneg": "full-negative",
    "unsp": "unspecified",
    "unspecified": "unspecified",
    "full-affirmative": "full-affirmative",
    "partial-affirmative": "partial-affirmative",
    "neutral-affirmative": "neutral-affirmative",
    "full-negative": "full-negative",
    "partial-negative": "partial-negative",
    "neutral-negative": "neutral-negative",
}
EDGE = re.compile(r"\(\s*([^\s()]+)\s+(:[^\s()]+)\s+([^\s()]+)\s*\)")
TOK = re.compile(
    r"(\(\s*[^\s()]+\s*/)|(\()|(\))|(\s*:modstr\s+[^\s()]+)|(:aspect\s+[^\s()]+)|(\s*:(?:modpred|quot)\s+[A-Za-z0-9_\-]+(?=[\s)]))"
)


def norm_label(lab):
    base = lab.lstrip(":")
    return ":" + MODMAP.get(base.lower(), base)


def norm_node(x):
    if x.upper() == "AUTH" or x.lower() == "author":
        return "author"
    if x.upper() == "DCT":
        return "document-creation-time"
    return x


def clean_graph(g):
    modstr = {}
    events = []
    stack = []
    res = []
    pos = 0
    for m in TOK.finditer(g):
        res.append(g[pos:m.start()])
        pos = m.end()
        if m.group(1):
            stack.append(m.group(1)[1:-1].strip())
            res.append(m.group(1))
        elif m.group(2):
            stack.append(None)
            res.append("(")
        elif m.group(3):
            if stack:
                stack.pop()
            res.append(")")
        elif m.group(4):
            if stack and stack[-1]:
                modstr[stack[-1]] = m.group(4).split()[1]
        elif m.group(5):
            val = m.group(5).split()[1]
            if stack and stack[-1] and stack[-1] not in events:
                events.append(stack[-1])
            res.append(":aspect " + val.lower())
    res.append(g[pos:])
    out = "".join(res)
    out = re.sub(
        r":ref(?:er)?-(person|number)\s+([^\s()]+)",
        lambda m: ":refer-%s %s" % (m.group(1), m.group(2).lower()),
        out,
    )
    return out, modstr, events


def find_group(doc, key):
    m = re.search(r"\n?[ \t]*:" + key + r"\s*\(", doc)
    if not m:
        return None
    open_idx = m.end() - 1
    depth = 0
    for j in range(open_idx, len(doc)):
        c = doc[j]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return m.start(), open_idx, j
    return None


def read_edges(doc, key):
    g = find_group(doc, key)
    edges = []
    if g:
        txt = doc[g[1]:g[2] + 1]
        for a, r, b in EDGE.findall(txt):
            edges.append((a, r, b))
    return g, edges


def write_group(doc, g, key, edges):
    if edges:
        body = "\n            ".join("(%s %s %s)" % e for e in edges)
        new = "\n    :" + key + " (" + body + ")"
    else:
        new = ""
    if g:
        return doc[:g[0]] + new + doc[g[2] + 1:]
    if not new:
        return doc
    stripped = doc.rstrip()
    k = stripped.rfind(")")
    if k < 0:
        return doc
    return stripped[:k] + new + stripped[k:]


def fix_temporal(doc):
    g, edges = read_edges(doc, "temporal")
    if not g:
        return doc
    res = []
    seen = set()
    for a, r, b in edges:
        a = norm_node(a)
        b = norm_node(b)
        if a in METAS or b in METAS:
            continue
        if b in seen:
            continue
        seen.add(b)
        res.append((a, r, b))
    return write_group(doc, g, "temporal", res)


def fix_modal(doc, modstr, events):
    g, edges = read_edges(doc, "modal")
    seen = set()
    res = []
    for a, r, b in edges:
        a = norm_node(a)
        b = norm_node(b)
        r = norm_label(r)
        if (a, b) in seen:
            continue
        seen.add((a, b))
        res.append((a, r, b))
    authored = set(b for a, r, b in res if a == "author")
    for v in events:
        if v not in authored:
            lab = norm_label(modstr.get(v, "full-affirmative"))
            res.append(("author", lab, v))
            authored.add(v)
    return write_group(doc, g, "modal", res)


def run(annotation: str, sentence: dict) -> str:
    """Post-process a UMR annotation string and return the cleaned annotation.

    Normalizes the sentence-level graph (removes :modstr, lowercases aspect and
    referent values), then repairs the document-level annotation: drops
    meta-reference temporal edges and duplicate targets, normalizes node and
    modal labels, and ensures every event has an author modal edge.
    If the annotation lacks the expected sections it is returned unchanged.

    Args:
        annotation: the full annotation text (graph, alignment, document level).
        sentence: sentence metadata (e.g. index and text); currently unused.

    Returns:
        The corrected annotation text.
    """
    i1 = annotation.find("# alignment:")
    i2 = annotation.find("# document level annotation:")
    if i1 < 0 or i2 < i1:
        return annotation
    g, a, d = annotation[:i1], annotation[i1:i2], annotation[i2:]
    g2, modstr, events = clean_graph(g)
    d = fix_temporal(d)
    d = fix_modal(d, modstr, events)
    return g2.rstrip() + "\n\n" + a.rstrip() + "\n\n" + d.strip() + "\n"
