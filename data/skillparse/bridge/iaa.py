"""Several people's annotation of the same document, compared (the moderate mode).

Each annotation is a .umr file's text. Two annotations are compared with AnCast++ (Sun and Xue
2024; umr4nlp/ancast, vendored as it is released, run with its own defaults): for each sentence
it pairs the concepts of the two graphs by anchoring the ones that are alike and broadcasting
along their neighbours, and scores the labeled relations; over the document it scores the modal
dependencies, and the temporal and coreference relations by their closures, and gives a
comprehensive score. From its pairing of the nodes come

  the scores      per sentence AnCast's labeled relation F; per document its sentence, modal,
                  temporal, coreference and comprehensive F
  the differences a node only one has, a different concept, attribute, role or alignment, a
                  relation only one has, a document-level relation only one has or labelled differently
  B as A names it B's text with every paired variable renamed to A's, so the two texts can be read
                  side by side line by line

and, for the sentence a moderator takes from one annotator, its document-level relations with the
variables of other sentences renamed to those of the annotator each of them was taken from.
"""
import re

import penman

from umr_load import blocks, DOC_GROUP, DOC_TRIPLE

CURRENT = None          # the comparison open in the page (Session.iaa_open), for the prompt of compare_annotations
VAR = re.compile(r"^s(\d+)[A-Za-z]")
GROUPS = ("temporal", "modal", "coref")


class Sentence:
    """One annotator's annotation of one sentence."""

    def __init__(self, block):
        self.words = block["words"]
        self.graph = block["graph"]
        self.align = {v: tuple(a) for v, a in block["align"].items() if tuple(a) != (0, 0)}
        self.doc = block["doc"].strip()
        self.error = None
        self.top, self.concept, self.attrs, self.rels = None, {}, [], []
        if self.graph.startswith("("):
            try:
                g = penman.decode(self.graph)
                self.top = g.top
                self.concept = {v: str(c) for v, _, c in g.instances()}
                self.attrs = [(s, r.lstrip(":"), str(t)) for s, r, t in g.attributes()]
                self.rels = [(s, r.lstrip(":"), t) for s, r, t in g.edges()]
            except Exception as e:
                self.error = "%s: %s" % (type(e).__name__, e)
        self.relations = doc_relations(self.doc)

    @property
    def size(self):
        return len(self.concept) + len(self.attrs) + len(self.rels) + (1 if self.top else 0)

    def text(self, var):
        """A node as a person reads it: its concept and the words it is aligned to."""
        if var not in self.concept:
            return str(var)
        a = self.align.get(var)
        words = " ".join(self.words[a[0] - 1:a[1]]) if a else ""
        return "%s「%s」" % (self.concept[var], words) if words else self.concept[var]


def doc_relations(text):
    """[(group, a, relation, b)] of a document-level annotation."""
    marks = [(m.start(), m.group(1)) for m in DOC_GROUP.finditer(text)]
    out = []
    for k, (start, group) in enumerate(marks):
        end = marks[k + 1][0] if k + 1 < len(marks) else len(text)
        for a, rel, b in DOC_TRIPLE.findall(text[start:end]):
            if (group, a, rel, b) not in out:
                out.append((group, a, rel, b))
    return out


def doc_text(number, relations):
    """A document-level annotation written again from its relations."""
    lines = ["(s%ds0 / sentence" % number]
    for group in GROUPS:
        mine = [(a, r, b) for g, a, r, b in relations if g == group]
        if mine:
            pad = " " * len("    :%s (" % group)
            lines.append("    :%s (" % group + ("\n" + pad).join("(%s :%s %s)" % x for x in mine) + ")")
    return "\n".join(lines) + ")"


def identical(A, B, m):
    """Whether two annotations of a sentence are the same graph under the pairing m: every node
    paired, same concepts, attributes, relations, top and alignment."""
    if A.error or B.error or len(m) != len(A.concept) or len(A.concept) != len(B.concept) or len(set(m.values())) != len(m):
        return False
    if any(A.concept[a] != B.concept[b] or A.align.get(a) != B.align.get(b) for a, b in m.items()):
        return False
    if sorted((m[s], r, t) for s, r, t in A.attrs) != sorted(B.attrs):
        return False
    if sorted((m[s], r, m[t]) for s, r, t in A.rels) != sorted(B.rels):
        return False
    return (m.get(A.top) if A.top else None) == B.top


def _ancast():
    """AnCast (umr4nlp/ancast, vendored), which needs numpy."""
    try:
        from ancast.document import DocumentMatch, get_edge_list_temp, get_edge_list_coref
        from ancast.matches import MatchResolution
        from ancast.sentence import Sentence as AncastSentence
        from ancast.ops import protected_divide
    except ImportError as e:
        raise ValueError("AnCast could not be loaded (%s): it needs numpy" % e)
    return DocumentMatch, MatchResolution, AncastSentence, get_edge_list_temp, get_edge_list_coref, protected_divide


class Pair:
    """Annotator a's and annotator b's annotation of the document, compared by AnCast++ (a is its
    "test" side, b its "gold" side)."""

    def __init__(self, sa, sb):
        DocumentMatch, MatchResolution, AncastSentence, edges_temporal, edges_coref, divide = _ancast()
        self.sa, self.sb = sa, sb
        self.maps, self.sent = [], []
        dm = DocumentMatch()                # AnCast's own defaults, as its command line runs
        for k, (A, B) in enumerate(zip(sa, sb)):
            res = None
            if A.concept and B.concept:
                span = lambda S: {v: "%d-%d" % x for v, x in S.align.items()}  # noqa: E731
                ta = AncastSentence(sent=" ".join(A.words), semantic_text=A.graph, alignment=span(A), sent_num=k + 1, format="umr")
                tb = AncastSentence(sent=" ".join(B.words), semantic_text=B.graph, alignment=span(B), sent_num=k + 1, format="umr")
                if not ta.invalid and not tb.invalid:
                    res = MatchResolution(ta, tb, Cneighbor=dm.Cneighbor, sense_coefficient=dm.sense_coefficient,
                                          separate_1_and_2=dm.separate_1_and_2, use_alignment=dm.use_alignment,
                                          use_smatch_top=dm.use_smatch_top)
                    dm.add_doct_info(res, test_doc=A.doc, gold_doc=B.doc)
                    dm.macro_avg(res)
            m, taken = {}, set()
            for a, b in (res.match_list01.items() if res else ()):
                if a in A.concept and b in B.concept and b not in taken:
                    m[a] = b
                    taken.add(b)
            self.maps.append(m)
            self.sent.append({"f": round(float(res.lbd_fscore), 4), "concept": round(float(res.concept_match_fscore), 4)} if res else None)
        p, r = dm.semantic_metric_precision.compute("lr"), dm.semantic_metric_recall.compute("lr")
        total = {"sent": divide(2 * p * r, p + r), "modal": dm.calculate_modal()[2],
                 "temporal": dm.calculate_TCTC("temporal", edges_temporal)[2],
                 "coref": dm.calculate_TCTC("coref", edges_coref)[2]}
        p, r = dm.semantic_metric_precision.compute("document"), dm.semantic_metric_recall.compute("document")
        total["comp"] = divide(2 * p * r, p + r)
        self.total = {k: round(float(v), 4) for k, v in total.items()}
        self.forward = {a: b for m in self.maps for a, b in m.items()}      # a's variable -> b's, all sentences
        self.back = {b: a for a, b in self.forward.items()}

    def doc_same(self, i):
        """The document-level relations of sentence i both have (as a names them), only a has, only b has."""
        ra = self.sa[i].relations
        rb = [(g, self.back.get(x, x), r, self.back.get(y, y)) for g, x, r, y in self.sb[i].relations]
        both = [x for x in ra if x in rb]
        return both, [x for x in ra if x not in rb], [x for x in rb if x not in ra]

    def same(self, i):
        both, only_a, only_b = self.doc_same(i)
        return identical(self.sa[i], self.sb[i], self.maps[i]) and not only_a and not only_b

    def scores(self, i):
        """Sentence i: AnCast's labeled relation F of the two graphs and its concept F (None when
        one side has no graph), and whether the two annotations are the same."""
        s = self.sent[i] or {"f": None, "concept": None}
        return {"f": s["f"], "concept": s["concept"], "same": self.same(i)}

    def renamed(self, i):
        """B's graph and document-level annotation of sentence i with a's names for the paired variables."""
        used = set(self.forward)

        def name(v):
            if v in self.back:
                return self.back[v]
            return v + "_b" if v in used else v
        mine = sorted({v for S in self.sb for v in S.concept}, key=len, reverse=True)
        if not mine:
            return self.sb[i].graph, self.sb[i].doc
        token = re.compile(r"(?<![\w-])(%s)(?![\w-])" % "|".join(re.escape(v) for v in mine))
        fix = lambda text: token.sub(lambda mt: name(mt.group(1)), text)  # noqa: E731
        return fix(self.sb[i].graph), fix(self.sb[i].doc)

    def differences(self, i):
        """What the two annotations of sentence i do differently: [{kind, where, a, b}], a and b
        what each has there (None: nothing)."""
        A, B, m = self.sa[i], self.sb[i], self.maps[i]
        inv = {b: a for a, b in m.items()}
        out = []

        def add(kind, where, a, b):
            out.append({"kind": kind, "where": where, "a": a, "b": b})

        for S, side in ((A, "a"), (B, "b")):
            if S.error:
                add("unreadable", "", S.error if side == "a" else None, S.error if side == "b" else None)
        for a in A.concept:
            b = m.get(a)
            if not b:
                add("node", A.text(a), A.text(a), None)
                continue
            if A.concept[a] != B.concept[b]:
                add("concept", A.text(a), A.concept[a], B.concept[b])
            if A.align.get(a) != B.align.get(b):
                span = lambda S, v: "%d-%d %s" % (S.align[v] + (" ".join(S.words[S.align[v][0] - 1:S.align[v][1]]),)) if v in S.align else "0-0"  # noqa: E731
                add("alignment", A.text(a), span(A, a), span(B, b))
            xa = [(r, t) for s, r, t in A.attrs if s == a]
            xb = [(r, t) for s, r, t in B.attrs if s == b]
            for r in sorted({r for r, _ in xa + xb}):
                va, vb = sorted(t for x, t in xa if x == r), sorted(t for x, t in xb if x == r)
                if va != vb:
                    add("attribute", A.text(a), ":%s %s" % (r, " ".join(va)) if va else None, ":%s %s" % (r, " ".join(vb)) if vb else None)
        for b in B.concept:
            if b not in inv:
                add("node", B.text(b), None, B.text(b))
        if A.top and B.top and m.get(A.top) != B.top:
            add("top", "", A.text(A.top), B.text(B.top))
        rels_b, told = set(B.rels), set()
        for s, r, t in A.rels:
            bs, bt = m.get(s), m.get(t)
            if bs and bt and (bs, r, bt) in rels_b:
                continue
            where = "%s → %s" % (A.text(s), A.text(t))
            other = sorted(x for (p, x, q) in B.rels if p == bs and q == bt) if bs and bt else []
            if other:
                add("role", where, ":" + r, " ".join(":" + x for x in other))
                told.update((bs, x, bt) for x in other)
            else:
                add("relation", where, ":" + r, None)
        rels_a = {(m.get(s), r, m.get(t)) for s, r, t in A.rels}
        for s, r, t in B.rels:
            if (s, r, t) not in rels_a and (s, r, t) not in told:
                add("relation", "%s → %s" % (B.text(s), B.text(t)), None, ":" + r)

        def end(x, S_all):
            k = VAR.match(x)
            S = S_all[int(k.group(1)) - 1] if k and 0 < int(k.group(1)) <= len(S_all) else None
            return S.text(x) if S else x
        both, only_a, only_b = self.doc_same(i)
        pairs_b = {(g, x, y): r for g, x, r, y in only_b}
        for g, x, r, y in only_a:
            where = "%s: %s → %s" % (g, end(x, self.sa), end(y, self.sa))
            if (g, x, y) in pairs_b:
                add("document-label", where, ":" + r, ":" + pairs_b.pop((g, x, y)))
            else:
                add("document", where, ":" + r, None)
        for (g, x, y), r in pairs_b.items():
            add("document", "%s: %s → %s" % (g, end(self.forward.get(x, x), self.sb), end(self.forward.get(y, y), self.sb)), None, ":" + r)
        return out


class Comparison:
    def __init__(self, annotations):
        self.names, self.sents = [], {}
        for it in annotations:
            name = str(it["name"])
            if name in self.sents:
                raise ValueError("two annotations are named %s" % name)
            self.names.append(name)
            self.sents[name] = [Sentence(b) for b in blocks(it["text"])]
        if len(self.names) < 2:
            raise ValueError("comparing takes at least two annotations")
        n = len(self.sents[self.names[0]])
        if not n:
            raise ValueError("%s: no sentences found" % self.names[0])
        for name in self.names[1:]:
            mine = self.sents[name]
            if len(mine) != n:
                raise ValueError("%s has %d sentences, %s has %d: they are not annotations of the same document"
                                 % (self.names[0], n, name, len(mine)))
            for k, (x, y) in enumerate(zip(self.sents[self.names[0]], mine)):
                if x.words != y.words:
                    raise ValueError("sentence %d: %s and %s do not have the same words" % (k + 1, self.names[0], name))
        self.n = n
        self.pairs = {(a, b): Pair(self.sents[a], self.sents[b])
                      for k, a in enumerate(self.names) for b in self.names[k + 1:]}

    def pair(self, a, b):
        if (a, b) not in self.pairs:
            raise ValueError("no comparison of %s with %s (the first is the one listed first)" % (a, b))
        return self.pairs[(a, b)]

    def summary(self):
        """The whole comparison, for the page: the annotators, for each pair its scores over the
        document, and for each sentence whether everybody has the same and each pair's F."""
        pairs = []
        for (a, b), p in self.pairs.items():
            per = [p.scores(i) for i in range(self.n)]
            pairs.append({"a": a, "b": b, **p.total, "same": sum(1 for s in per if s["same"]),
                          "sentences": [{"f": s["f"], "same": s["same"]} for s in per]})
        first = self.sents[self.names[0]]
        return {"names": self.names, "count": self.n, "pairs": pairs,
                "sentences": [{"text": " ".join(first[i].words), "same": all(p.same(i) for p in self.pairs.values()),
                               "has": {name: bool(self.sents[name][i].graph.startswith("(")) for name in self.names}}
                              for i in range(self.n)]}

    def sentence(self, i, a, b):
        """Sentence i as a and b annotated it, side by side."""
        i = int(i)
        p = self.pair(a, b)
        graph_b, doc_b = p.renamed(i)
        A = self.sents[a][i]
        return {"index": i, "a": {"name": a, "graph": A.graph, "document": A.doc},
                "b": {"name": b, "graph": graph_b, "document": doc_b},
                "scores": p.scores(i), "differences": p.differences(i)}

    def block(self, i, name, chosen):
        """Sentence i as `name` annotated it, to be put into the document being moderated, where
        sentence k is `chosen[k]`'s: a document-level relation with a node of another sentence
        names that node as its annotator did, and is left out when that annotator has no such node."""
        i = int(i)
        S = self.sents[name][i]
        relations, dropped = [], []
        for g, x, r, y in S.relations:
            ends = []
            for v in (x, y):
                k = VAR.match(v)
                j = int(k.group(1)) - 1 if k else i
                other = chosen.get(j) if j != i else None
                if other and other != name and other in self.sents:
                    p, forward = (self.pairs[(name, other)], True) if (name, other) in self.pairs else (self.pairs[(other, name)], False)
                    v = (p.forward if forward else p.back).get(v)
                ends.append(v)
            if None in ends:
                dropped.append("(%s :%s %s)" % (x, r, y))
            else:
                relations.append((g, ends[0], r, ends[1]))
        return {"index": i + 1, "graph": S.graph, "alignment": {v: list(a) for v, a in S.align.items()},
                "document": doc_text(i + 1, relations), "dropped": dropped}

    def mentions(self, k, name, i):
        """Whether `name`'s annotation of sentence k has a document-level relation with a node of sentence i."""
        return any(VAR.match(v) and int(VAR.match(v).group(1)) - 1 == int(i)
                   for _, x, _, y in self.sents[name][int(k)].relations for v in (x, y))

    def prompt(self, i, a, b):
        """What compare_annotations is given about sentence i: the two annotations, and the list of
        places where they differ."""
        s = self.sentence(i, a, b)
        one = lambda x, label: "### Annotation %s\n\n```\n%s\n```\n\nDocument level:\n\n```\n%s\n```" % (label, x["graph"] or "(none)", x["document"] or "(none)")  # noqa: E731
        diffs = ["%d. %s — %s: A has %s; B has %s" % (k + 1, d["kind"], d["where"] or "the sentence", d["a"] or "nothing", d["b"] or "nothing")
                 for k, d in enumerate(s["differences"])]
        return {"annotations": one(s["a"], "A") + "\n\n" + one(s["b"], "B") + "\n\n(B's variables are renamed to A's where the two nodes correspond.)",
                "differences": "\n".join(diffs) or "(none found by comparing the triples)"}
