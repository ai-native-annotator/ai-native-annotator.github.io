import re

LETTERS = "abcdefghijklmnopqrstuvwxyz"
TOK = re.compile(r'"[^"]*"|\(|\)|:aspect\s+[^\s()]+')


def _dedupe_aspect(g):
    out = []
    pos = 0
    stack = []
    for m in TOK.finditer(g):
        out.append(g[pos:m.start()])
        pos = m.end()
        t = m.group(0)
        if t == '(':
            stack.append(False)
            out.append(t)
        elif t == ')':
            if stack:
                stack.pop()
            out.append(t)
        elif t.startswith(':aspect'):
            if stack and stack[-1]:
                continue
            if stack:
                stack[-1] = True
            out.append(t)
        else:
            out.append(t)
    out.append(g[pos:])
    return ''.join(out)


def _rename(text, mapping):
    if not mapping:
        return text
    names = sorted(mapping, key=len, reverse=True)
    pat = re.compile(r'(?<![^\s()])(' + '|'.join(re.escape(n) for n in names) + r')(?=[\s():]|$)')
    parts = re.split(r'("[^"]*")', text)
    for i in range(0, len(parts), 2):
        parts[i] = pat.sub(lambda m: mapping[m.group(1)], parts[i])
    return ''.join(parts)


def run(annotation: str, sentence: dict) -> str:
    """Rename declared graph variables that are not of the form sN+letter+digits
    (e.g. s5and) to valid fresh names, consistently in the graph, alignment and
    document level, and drop a repeated :aspect on the same node."""
    i1 = annotation.find('# alignment:')
    i2 = annotation.find('# document level annotation:')
    if i1 < 0 or i2 < i1:
        return annotation
    g, a, d = annotation[:i1], annotation[i1:i2], annotation[i2:]
    m = re.search(r'\((s\d+)s0\s*/', d)
    prefix = m.group(1) if m else 's%s' % sentence.get('index', 0)
    declared = re.findall(r'\(\s*([^\s()]+)\s*/', g)
    used = set(declared)
    used.add(prefix + 's0')
    valid = re.compile(r'^' + re.escape(prefix) + r'[a-z]\d*$')

    def fresh():
        for k in range(0, 1000):
            for L in LETTERS:
                cand = prefix + L + (str(k) if k else '')
                if cand not in used:
                    return cand
        return prefix + 'z999'

    mapping = {}
    for v in declared:
        if v in mapping or valid.match(v):
            continue
        nv = fresh()
        used.add(nv)
        mapping[v] = nv
    g = _dedupe_aspect(_rename(g, mapping))
    a = _rename(a, mapping)
    d = _rename(d, mapping)
    return g.rstrip() + '\n\n' + a.rstrip() + '\n\n' + d.strip() + '\n'
