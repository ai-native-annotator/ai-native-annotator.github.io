import re


def run(annotation: str, sentence: dict) -> str:
    """Write clock times as zero-padded nodes: ':time 5h30m' -> ':time (sNh1 / 05h30m)'; '/ 0h15m' -> '/ 00h15m'."""
    i1 = annotation.find('# alignment:')
    if i1 < 0:
        return annotation
    g, rest = annotation[:i1], annotation[i1:]
    m = re.search(r'\((s\d+)s0\s*/', rest)
    prefix = m.group(1) if m else 's%s' % sentence.get('index', 0)
    used = set(re.findall(r'\(\s*([^\s()]+)\s*/', g))
    counter = [0]

    def pad(h, mi):
        return '%02dh%02dm' % (int(h), int(mi))

    def newvar():
        while True:
            counter[0] += 1
            v = '%sh%d' % (prefix, counter[0])
            if v not in used:
                used.add(v)
                return v

    def repl(mm):
        return '%s(%s / %s)' % (mm.group(1), newvar(), pad(mm.group(2), mm.group(3)))

    g = re.sub(r'(:time\s+)(\d{1,2})h(\d{1,2})m(?=[\s)])', repl, g)
    g = re.sub(r'(/\s*)(\d{1,2})h(\d{1,2})m(?=[\s)])', lambda mm: mm.group(1) + pad(mm.group(2), mm.group(3)), g)
    return g + rest
