import re


def fix_graph(g: str) -> str:
    """Quote bare :opN and :wiki values in the sentence-level graph text."""
    def q(m):
        v = m.group(2)
        if re.fullmatch(r'-?\d+(\.\d+)?', v) or re.fullmatch(r's\d+[a-z]\d*', v):
            return m.group(0)
        return m.group(1) + '"' + v + '"'
    g = re.sub(r'(:op\d+\s+)([^\s()"]+)', q, g)
    g = re.sub(r'(:wiki\s+)([^\s()"-][^\s()"]*)', lambda m: m.group(1) + '"' + m.group(2) + '"', g)
    return g


def run(annotation: str, sentence: dict) -> str:
    """Repair a UMR annotation string.

    Quotes unquoted :opN / :wiki string values in the sentence-level graph
    (leaving numbers, variable references and '-' alone), and ensures the
    document-level modal structure has a '(root :modal author)' entry, replacing
    a bogus '(sNs0 :modal author)' root if present. Returns the annotation
    unchanged if it has no '# alignment:' section.
    """
    i = annotation.find('# alignment:')
    if i < 0:
        return annotation
    j = annotation.find('# document level annotation:')
    graph = fix_graph(annotation[:i])
    if j < 0:
        return graph + annotation[i:]
    mid = annotation[i:j]
    doc = annotation[j:]
    doc = re.sub(r'\(\s*s\d+s0\s+:modal\s+author\s*\)', '(root :modal author)', doc)
    if re.search(r':modal\s*\(', doc) and 'root :modal author' not in doc:
        doc = re.sub(r'(:modal\s*\()\s*\(', lambda m: m.group(1) + '(root :modal author)\n            (', doc, count=1)
    return graph + mid + doc
