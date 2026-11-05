"""convert (kind: rule, wave 0, web): umr_generate's answer checked, for the bridge to load.

umr_generate writes one sentence's graph (penman), its alignment ({variable: [first, last]}, the
page's token numbers) and its document-level annotation. This rule checks them and returns them
cleaned; when it is done, the bridge (RegistryEngine._apply_generated) loads them into the
sentence and document waves the way a .umr file is loaded (umr_load.load_generated).

An answer that cannot be loaded is an error of this step (re-run umr_generate with a hint):
the graph is not penman, a variable stands for two concepts, a span is out of the sentence. What
can be loaded but looks wrong is listed in `problems`.
"""
import re

import penman

DOC = re.compile(r":(temporal|modal|coref)\s*\(")
TRIPLE = re.compile(r"\(\s*([^\s()]+)\s+:(\S+)\s+([^\s()]+)\s*\)")
CONSTANTS = {"author", "root", "document-creation-time", "null-conceiver", "purpose", "have-condition"}


def run(graph="", alignment=None, document="", token_sent=None, index=None, **_):
    text = str(graph or "").strip()
    if not text:
        raise ValueError("the graph is empty")
    try:
        g = penman.decode(text)
    except Exception as e:
        raise ValueError("the graph is not valid penman: %s" % e)
    concepts = {}
    for v, _, c in g.instances():
        if v in concepts and concepts[v] != c:
            raise ValueError("the variable %s stands for two concepts (%s, %s)" % (v, concepts[v], c))
        concepts[v] = c
    problems = []
    prefix = "s%s" % index if index is not None else None
    if prefix and not all(v.startswith(prefix) for v in concepts):
        problems.append("variables should start with %s (sentence %s): %s"
                        % (prefix, index, ", ".join(v for v in concepts if not v.startswith(prefix))[:200]))
    n = len(token_sent or [])
    spans = {}
    for v, span in (alignment or {}).items():
        if isinstance(span, str):
            m = re.fullmatch(r"\s*(\d+)\s*-\s*(\d+)\s*", span)
            span = [int(m.group(1)), int(m.group(2))] if m else None
        if not (isinstance(span, (list, tuple)) and len(span) == 2 and all(isinstance(x, int) for x in span)):
            raise ValueError("the alignment of %s is not [first, last]: %r" % (v, span))
        a, b = span
        if [a, b] == [0, 0]:
            continue
        if v not in concepts:
            problems.append("the alignment names %s, which is not in the graph" % v)
            continue
        if not 1 <= a <= b <= max(n, 1):
            raise ValueError("the alignment of %s, [%d, %d], is outside the sentence's tokens 1-%d" % (v, a, b, n))
        spans[v] = [a, b]
    left = [v for v in concepts if v not in spans and concepts[v] != "name"]
    if left:
        problems.append("not aligned: %s" % ", ".join(left)[:200])
    doc = str(document or "").strip()
    if doc:
        if doc.count("(") != doc.count(")"):
            raise ValueError("the document-level annotation has unbalanced parentheses")
        groups = DOC.findall(doc)
        if not groups and TRIPLE.search(doc):
            raise ValueError("the document-level annotation has relations outside :temporal / :modal / :coref")
        for a, r, b in TRIPLE.findall(doc):
            for x in (a, b):
                if x not in CONSTANTS and not re.fullmatch(r"s\d+\w*", x):
                    problems.append("the document-level annotation names %s, not a variable or a constant" % x)
    return {"graph": penman.encode(g, indent=4), "alignment": spans, "document": doc, "problems": problems}
