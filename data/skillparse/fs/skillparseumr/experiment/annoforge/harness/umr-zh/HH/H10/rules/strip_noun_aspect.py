import re

TOK = re.compile(r'"[^"]*"|\(\s*([^\s()]+)\s*/\s*([^\s()]+)|\(|\)|(:aspect\s+[^\s()]+)|(:ARG\d+(?![\w-])|:actor|:undergoer)(?=[\s)])')


def _cjk_only(c):
    return bool(c) and all(ord(ch) > 127 for ch in c) and not re.search(r'-\d+$', c)


def run(annotation: str, sentence: dict) -> str:
    """Remove :aspect from plain Chinese noun nodes (no -NN sense suffix, no core arguments)."""
    i1 = annotation.find('# alignment:')
    if i1 < 0:
        return annotation
    g, rest = annotation[:i1], annotation[i1:]
    stack = []
    dels = []
    for m in TOK.finditer(g):
        t = m.group(0)
        if m.group(1) is not None:
            stack.append({'c': m.group(2), 'core': False, 'asp': []})
        elif t == '(':
            stack.append(None)
        elif t == ')':
            if stack:
                n = stack.pop()
                if n and n['asp'] and not n['core'] and _cjk_only(n['c']):
                    dels.extend(n['asp'])
        elif m.group(3):
            if stack and stack[-1]:
                stack[-1]['asp'].append((m.start(), m.end()))
        elif m.group(4):
            if stack and stack[-1]:
                stack[-1]['core'] = True
    for s, e in sorted(dels, reverse=True):
        k = s
        while k > 0 and g[k - 1] in ' \t\n':
            k -= 1
        g = g[:k] + g[e:]
    return g + rest
