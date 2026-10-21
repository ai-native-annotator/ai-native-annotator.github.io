import re

EDGE = re.compile(r"\(\s*([^\s()]+)\s+(:[^\s()]+)\s+([^\s()]+)\s*\)")
XREF = re.compile(r"(:[A-Za-z][A-Za-z0-9\-]*)(\s+)(s\d+[a-z]\d*)(?=[\s)])")


def find_group(doc, key):
    m = re.search(r":" + key + r"\s*\(", doc)
    if not m:
        return None
    o = m.end() - 1
    depth = 0
    for j in range(o, len(doc)):
        c = doc[j]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return m.start(), o, j
    return None


def fmt(key, edges):
    return ":%s (%s)" % (key, "\n               ".join("(%s %s %s)" % e for e in edges))


def run(annotation: str, sentence: dict) -> str:
    """Post-process a UMR annotation string.

    Replaces references to variables from other sentences with local
    implicit-argument nodes linked by :same-entity coref edges, and rewrites
    temporal ':depends-on' edges targeting date-entities as ':overlap' edges
    (dropping redundant document-creation-time edges). Returns the annotation
    unchanged if the expected sections are missing.
    """
    i1 = annotation.find("# alignment:")
    i2 = annotation.find("# document level annotation:")
    if i1 < 0 or i2 < i1:
        return annotation
    g, a, d = annotation[:i1], annotation[i1:i2], annotation[i2:]
    hm = re.search(r"\((s\d+)s0\s*/\s*sentence", d)
    if not hm:
        return annotation
    cur = hm.group(1)
    declared = set(re.findall(r"\(\s*([^\s()]+)\s*/", g))
    mapping = {}
    new_coref = []

    def repl(m):
        v = m.group(3)
        pre = re.match(r"(s\d+)[a-z]", v)
        if v in declared or not pre or pre.group(1) == cur:
            return m.group(0)
        if v in mapping:
            return m.group(1) + m.group(2) + mapping[v]
        nv = "%sz%d" % (cur, len(mapping) + 1)
        mapping[v] = nv
        new_coref.append((v, ":same-entity", nv))
        return "%s%s(%s / implicit-argument)" % (m.group(1), m.group(2), nv)

    g = XREF.sub(repl, g)
    dates = set(re.findall(r"\(\s*([^\s()]+)\s*/\s*date-entity", g))
    tg = find_group(d, "temporal")
    if dates and tg:
        edges = EDGE.findall(d[tg[1]:tg[2] + 1])
        new = []
        for x, r, y in edges:
            if r == ":depends-on" and y in dates and x not in dates:
                new.append((y, ":overlap", x))
        moved = set(e[2] for e in new)
        for x, r, y in edges:
            if r == ":depends-on" and y in dates and x not in dates:
                continue
            if y in moved:
                continue
            new.append((x, r, y))
        dpar = set(e[2] for e in new if e[0] in dates)
        new = [e for e in new if not (e[0] == "document-creation-time" and e[2] in dpar)]
        d = d[:tg[0]] + fmt("temporal", new) + d[tg[2] + 1:]
    if new_coref:
        cg = find_group(d, "coref")
        if cg:
            old = EDGE.findall(d[cg[1]:cg[2] + 1])
            d = d[:cg[0]] + fmt("coref", old + new_coref) + d[cg[2] + 1:]
        else:
            s = d.rstrip()
            k = s.rfind(")")
            d = s[:k] + "\n    " + fmt("coref", new_coref) + s[k:]
    return g.rstrip() + "\n\n" + a.rstrip() + "\n\n" + d.strip() + "\n"
