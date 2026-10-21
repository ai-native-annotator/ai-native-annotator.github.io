import re


def run(annotation: str, sentence: dict) -> str:
    """Normalize the alignment section of a UMR annotation.

    Every variable declared in the sentence-level graph gets exactly one
    alignment line of the form 'var: start-end' (the first span if several are
    given, '0-0' if missing). Alignment lines for undeclared variables are
    dropped. Returns the annotation unchanged if the sections are not found.
    """
    i1 = annotation.find('# alignment:')
    i2 = annotation.find('# document level annotation:')
    if i1 < 0 or i2 < i1:
        return annotation
    g = annotation[:i1]
    a = annotation[i1:i2]
    d = annotation[i2:]
    decl = []
    for v in re.findall(r'\(\s*([A-Za-z0-9_]+)\s*/', g):
        if v not in decl:
            decl.append(v)
    seen = {}
    for ln in a.split('\n')[1:]:
        m = re.match(r'\s*([^\s:]+)\s*:\s*(.*)$', ln)
        if not m:
            continue
        v = m.group(1)
        val = m.group(2).strip()
        sp = re.match(r'(\d+)\s*-\s*(\d+)', val)
        if sp:
            lo, hi = int(sp.group(1)), int(sp.group(2))
            if lo > hi:
                lo, hi = hi, lo
            new = '%d-%d' % (lo, hi)
        else:
            n = re.match(r'(\d+)', val)
            new = '%s-%s' % (n.group(1), n.group(1)) if n else '0-0'
        if v not in seen:
            seen[v] = new
    lines = ['%s: %s' % (v, seen.get(v, '0-0')) for v in decl]
    return g.rstrip() + '\n\n# alignment:\n' + '\n'.join(lines) + '\n\n' + d.strip() + '\n'
