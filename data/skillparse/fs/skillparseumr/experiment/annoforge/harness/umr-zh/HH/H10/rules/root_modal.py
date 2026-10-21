import re

PAT = re.compile(r'\(\s*root\s+:modal\s+author\s*\)')


def run(annotation: str, sentence: dict) -> str:
    """Ensure the document-level :modal group contains (root :modal author), creating the group if absent."""
    i = annotation.find('# document level annotation:')
    if i < 0:
        return annotation
    head, doc = annotation[:i], annotation[i:]
    if PAT.search(doc):
        return annotation
    m = re.search(r':modal\s*\(', doc)
    if m:
        k = m.end()
        doc = doc[:k] + '(root :modal author)\n            ' + doc[k:]
    else:
        s = doc.rstrip()
        k = s.rfind(')')
        if k < 0:
            return annotation
        doc = s[:k] + '\n    :modal ((root :modal author))' + s[k:] + '\n'
    return head + doc
