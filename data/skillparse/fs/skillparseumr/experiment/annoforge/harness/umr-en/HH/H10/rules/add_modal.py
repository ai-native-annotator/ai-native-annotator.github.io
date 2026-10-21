import re


def block_end(s, start):
    """Return the index just after the paren closing the group that opens at s[start]."""
    depth = 0
    i = start
    in_str = False
    while i < len(s):
        c = s[i]
        if c == '"':
            in_str = not in_str
        elif not in_str:
            if c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0:
                    return i + 1
        i += 1
    return -1


def run(annotation: str, sentence: dict) -> str:
    """Add (author :full-affirmative e) (or speaker inside a report) for every sense-id event without a modal tuple."""
    i = annotation.find('# alignment:')
    j = annotation.find('# document level annotation:')
    if i < 0 or j < 0 or j < i:
        return annotation
    graph = annotation[:i]
    doc = annotation[j:]
    var = r's\d+[a-z]\d*'
    defs = {}
    order = []
    for m in re.finditer(r'\((' + var + r')\s*/\s*([^\s()]+)', graph):
        defs[m.group(1)] = (m.start(), m.group(2))
        order.append(m.group(1))
    if not defs:
        return annotation

    def span(v):
        st = defs[v][0]
        return st, block_end(graph, st)

    gstart = -1
    gend = -1
    gtext = ''
    gi = doc.find(':modal')
    if gi >= 0:
        p = doc.find('(', gi)
        if p >= 0:
            e = block_end(doc, p)
            if e > 0:
                gstart = p
                gend = e
                gtext = doc[p:e]
    mentioned = set(re.findall(r'\b' + var + r'\b', gtext))
    skip = set(re.findall(r':modal-predicate\s+(' + var + r')', graph))
    speaker = None
    say = None
    sp = (0, 0)
    ex = (0, 0)
    qm = re.search(r':quote\s+(' + var + r')', graph)
    if qm and qm.group(1) in defs:
        say = qm.group(1)
        sp = span(say)
        if sp[1] > 0:
            seg = graph[sp[0]:sp[1]]
            am = re.search(r':ARG0\s+\((' + var + r')\s*/', seg)
            if am and am.group(1) in defs:
                before = seg[:am.start()]
                if before.count('(') - before.count(')') == 1:
                    speaker = am.group(1)
                    ex = span(speaker)
        else:
            say = None
    new = []

    def add(src, v):
        new.append('(' + src + ' :full-affirmative ' + v + ')')
        mentioned.add(v)

    if say and say not in mentioned:
        add('author', say)
    if speaker and speaker not in mentioned:
        add('author', speaker)
    for v in order:
        c = defs[v][1]
        mm = re.fullmatch(r'[a-z][a-z0-9-]*-(\d+)', c)
        if not mm or mm.group(1).startswith('9'):
            continue
        if v in mentioned or v in skip or v == say:
            continue
        s, e = span(v)
        if e < 0:
            continue
        if re.search(r':polarity\s+-', graph[s:e]):
            continue
        if ex[0] <= s < ex[1]:
            continue
        if say and speaker and sp[0] < s < sp[1]:
            add(speaker, v)
        else:
            add('author', v)
    if not new:
        return annotation
    lines = ''.join('\n            ' + t for t in new)
    if gstart >= 0:
        doc = doc[:gend - 1] + lines + doc[gend - 1:]
    else:
        k = doc.rstrip().rfind(')')
        if k < 0:
            return annotation
        grp = '\n    :modal ((root :modal author)' + lines + ')'
        doc = doc[:k] + grp + doc[k:]
    return annotation[:j] + doc
