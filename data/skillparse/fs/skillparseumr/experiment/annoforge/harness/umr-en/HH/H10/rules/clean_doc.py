import re

OKTOK = ('author', 'root', 'document-creation-time')
LABELS = (':full-affirmative', ':partial-affirmative', ':neutral-affirmative', ':full-negative', ':partial-negative', ':neutral-negative', ':unspecified')
TUP = re.compile(r'\(\s*([^\s()]+)\s+(:[A-Za-z-]+)\s+([^\s()]+)\s*\)')


def block_end(s, start):
    depth = 0
    in_str = False
    i = start
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


def own_aspect(block):
    depth = 0
    in_str = False
    for k, c in enumerate(block):
        if c == '"':
            in_str = not in_str
        elif not in_str:
            if c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
            elif depth == 1 and block.startswith(':aspect', k):
                return True
    return False


def good(v, n):
    return re.fullmatch(r's%d[a-z][a-z0-9]*' % n, v) is not None


def sent_no(annotation, sentence):
    m = re.search(r'\(\s*s(\d+)s0\s*/\s*sentence', annotation)
    if m:
        return int(m.group(1))
    c = {}
    for v in re.findall(r'\(\s*s(\d+)[a-z][a-z0-9]*\s*/', annotation):
        c[v] = c.get(v, 0) + 1
    if c:
        return int(max(c, key=lambda k: c[k]))
    try:
        return int(sentence.get('index'))
    except Exception:
        return -1


def rename_vars(annotation, n):
    i = annotation.find('# alignment:')
    graph = annotation[:i]
    defs = re.findall(r'\(\s*([A-Za-z][A-Za-z0-9]*)\s*/', graph)
    bad = [v for v in defs if not good(v, n)]
    if not bad:
        return annotation
    used = set(defs)
    mapping = {}
    for v in bad:
        if v in mapping:
            continue
        cand = 's%d%s' % (n, v.lower())
        while cand in used:
            cand += 'z'
        used.add(cand)
        mapping[v] = cand
    names = sorted(mapping, key=len, reverse=True)
    pat = re.compile(r'(?<![\w:\-./])(' + '|'.join(re.escape(x) for x in names) + r')(?![\w\-])')
    parts = re.split(r'("[^"]*")', annotation)
    out = []
    for k, p in enumerate(parts):
        if k % 2 == 0:
            p = pat.sub(lambda m: mapping[m.group(1)], p)
        out.append(p)
    return ''.join(out)


def clean_tuples(doc, graph, n):
    defs = {}
    for m in re.finditer(r'\((s\d+[a-z][a-z0-9]*)\s*/\s*([^\s()]+)', graph):
        defs[m.group(1)] = (m.start(), m.group(2))
    drop = set()
    for v in defs:
        st = defs[v][0]
        concept = defs[v][1]
        if not re.fullmatch(r'[a-z][a-z0-9-]*-\d+', concept):
            continue
        if concept.rsplit('-', 1)[1].startswith('9'):
            continue
        e = block_end(graph, st)
        if e < 0:
            continue
        if own_aspect(graph[st:e]):
            continue
        pre = graph[:st].rstrip()
        mm = re.search(r'(:[A-Za-z0-9-]+)$', pre)
        rel = mm.group(1) if mm else ''
        if rel == ':mod' or rel.endswith('-of'):
            drop.add(v)

    def fix(m):
        a = m.group(1)
        rel = m.group(2)
        b = m.group(3)
        for t in (a, b):
            if t in OKTOK:
                continue
            if re.fullmatch(r's%d[a-z][a-z0-9]*' % n, t):
                if t not in defs:
                    return ''
                continue
            if re.fullmatch(r's\d+[a-z][a-z0-9]*', t):
                continue
            if re.fullmatch(r'[a-z]{1,4}\d*', t):
                return ''
        if rel in LABELS and b in drop:
            return ''
        return m.group(0)

    doc = TUP.sub(fix, doc)
    doc = re.sub(r'\n[ \t]*:(?:temporal|modal|coref)\s*\(\s*\)', '', doc)
    return doc


def ensure_root(doc):
    if re.search(r':modal\s*\(', doc) and 'root :modal author' not in doc:
        doc = re.sub(r'(:modal\s*\()\s*\(', lambda m: m.group(1) + '(root :modal author)\n            (', doc, count=1)
    return doc


def run(annotation: str, sentence: dict) -> str:
    """Final cleanup: rename variables lacking the sN prefix (graph, alignment, document level), drop document-level tuples that use undefined or bare variables, drop modal tuples of aspect-less modifier events (:mod / -of adjective senses), and make sure the modal group starts with (root :modal author)."""
    i = annotation.find('# alignment:')
    j = annotation.find('# document level annotation:')
    if i < 0 or j < 0 or j < i:
        return annotation
    n = sent_no(annotation, sentence)
    if n < 0:
        return annotation
    annotation = rename_vars(annotation, n)
    i = annotation.find('# alignment:')
    j = annotation.find('# document level annotation:')
    graph = annotation[:i]
    mid = annotation[i:j]
    doc = annotation[j:]
    doc = clean_tuples(doc, graph, n)
    doc = ensure_root(doc)
    return graph + mid + doc
