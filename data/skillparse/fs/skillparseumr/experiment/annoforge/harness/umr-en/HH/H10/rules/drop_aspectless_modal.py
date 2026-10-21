import re

VAR = r's\d+[a-z][a-z0-9]*'
TUP = re.compile(r'\s*\(\s*(author|' + VAR + r')\s+(:(?:full|partial|neutral)-(?:affirmative|negative)|:unspecified)\s+(' + VAR + r')\s*\)')


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


def has_aspect(block):
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


def aspectless(graph):
    res = set()
    for m in re.finditer(r'\((' + VAR + r')\s*/\s*([^\s()]+)', graph):
        mm = re.fullmatch(r'[a-z][a-z0-9-]*-(\d+)', m.group(2))
        if not mm or mm.group(1).startswith('9'):
            continue
        e = block_end(graph, m.start())
        if e < 0:
            continue
        if not has_aspect(graph[m.start():e]):
            res.add(m.group(1))
    return res


def run(annotation: str, sentence: dict) -> str:
    """Remove modal-label tuples whose target is a sense-id event node of this sentence that has no own :aspect (particles such as up-03, adjective ARG2 nodes)."""
    i = annotation.find('# alignment:')
    j = annotation.find('# document level annotation:')
    if i < 0 or j < 0 or j < i:
        return annotation
    bad = aspectless(annotation[:i])
    if not bad:
        return annotation
    doc = TUP.sub(lambda m: '' if m.group(3) in bad else m.group(0), annotation[j:])
    return annotation[:j] + doc
