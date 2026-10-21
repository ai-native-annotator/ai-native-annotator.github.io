import re

INV = {':before': ':after', ':after': ':before', ':overlap': ':overlap', ':depends-on': ':depends-on'}
PAT = re.compile(r'\(\s*([^\s()]+)\s+(:before|:after|:overlap|:depends-on)\s+document-creation-time\s*\)')


def run(annotation: str, sentence: dict) -> str:
    """Rewrite temporal edges that have document-creation-time as the child so that
    document-creation-time is the parent (inverting :before/:after)."""
    i = annotation.find('# document level annotation:')
    if i < 0:
        return annotation
    head, doc = annotation[:i], annotation[i:]
    doc = PAT.sub(lambda m: '(document-creation-time %s %s)' % (INV[m.group(2)], m.group(1)), doc)
    return head + doc
