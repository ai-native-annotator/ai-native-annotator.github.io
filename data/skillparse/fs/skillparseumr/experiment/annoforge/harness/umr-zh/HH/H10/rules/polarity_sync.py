import re


def run(annotation: str, sentence: dict) -> str:
    """If the document-level modal says (author :full-negative v) and v has no :polarity in the graph, add ':polarity -' to v."""
    i1 = annotation.find('# alignment:')
    i2 = annotation.find('# document level annotation:')
    if i1 < 0 or i2 < i1:
        return annotation
    g, rest = annotation[:i1], annotation[i1:]
    doc = annotation[i2:]
    negs = re.findall(r'\(\s*author\s+:full-negative\s+([^\s()]+)\s*\)', doc)
    for v in negs:
        m = re.search(r'\(\s*' + re.escape(v) + r'\s*/\s*([^\s()]+)', g)
        if not m:
            continue
        depth = 0
        has = False
        end = None
        for k in range(m.start(), len(g)):
            c = g[k]
            if c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0:
                    end = k
                    break
            elif c == ':' and depth == 1 and g.startswith(':polarity', k):
                has = True
        if end is None or has:
            continue
        g = g[:m.end()] + ' :polarity -' + g[m.end():]
    return g + rest
