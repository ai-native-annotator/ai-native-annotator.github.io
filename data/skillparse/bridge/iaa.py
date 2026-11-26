"""Several people's annotation of the same document, compared (the moderate mode).

Each annotation is a .umr file's text. Two annotations of a sentence are compared the way Smatch
does it: the nodes of one are paired with the nodes of the other so that as many triples as
possible are the same (instance, attribute, relation, top), searched by hill climbing from a
start that pairs nodes of the same concept on the same words. From that pairing come

  the scores      matched triples / triples of each side (precision, recall, F), per sentence and
                  for the document; the same for the document-level relations
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


def pair_nodes(A, B):
    """{a's variable: b's variable} that makes the most triples the same, and how many are."""
    na, nb = list(A.concept), list(B.concept)
    attrs_b = {}
    for s, r, t in B.attrs:
        attrs_b.setdefault(s, []).append((r, t))
    base = {}
    for a in na:
        mine = [(r, t) for s, r, t in A.attrs if s == a]
        row = base[a] = {}
        for b in nb:
            left = list(attrs_b.get(b, []))
            n = 1 if A.concept[a] == B.concept[b] else 0
            for x in mine:
                if x in left:
                    left.remove(x)
                    n += 1
            if a == A.top and b == B.top:
                n += 1
            row[b] = n
    rels_b = set(B.rels)
    incident = {a: [] for a in na}
    for k, (s, r, t) in enumerate(A.rels):
        for v in {s, t}:
            if v in incident:
                incident[v].append((k, s, r, t))

    def local(nodes, m):
        n, seen = 0, set()
        for a in nodes:
            if m.get(a):
                n += base[a][m[a]]
            for rel in incident[a]:
                if rel[0] in seen:
                    continue
                seen.add(rel[0])
                if m.get(rel[1]) and m.get(rel[3]) and (m[rel[1]], rel[2], m[rel[3]]) in rels_b:
                    n += 1
        return n

    # the start: same concept on the same words, then same concept, then same words
    def likeness(a, b):
        same_words = a in A.align and A.align.get(a) == B.align.get(b)
        return (2 if A.concept[a] == B.concept[b] else 0) + (1 if same_words else 0), base[a][b]

    m, taken = {}, set()
    for score, a, b in sorted(((likeness(a, b), a, b) for a in na for b in nb), key=lambda x: (-x[0][0], -x[0][1], na.index(x[1]), nb.index(x[2]))):
        if score[0] and a not in m and b not in taken:
            m[a] = b
            taken.add(b)
    for _ in range(4 * (len(na) + 1)):
        inv = {b: a for a, b in m.items() if b}
        best = (0, None)
        for a in na:
            for b in nb + [None]:
                old = m.get(a)
                if old == b:
                    continue
                other = inv.get(b) if b else None
                nodes = [a] + ([other] if other else [])
                before = local(nodes, m)
                m[a] = b
                if other:
                    m[other] = old
                gain = local(nodes, m) - before
                m[a] = old
                if other:
                    m[other] = b
                if gain > best[0]:
                    best = (gain, (a, b, other, old))
        if not best[1]:
            break
        a, b, other, old = best[1]
        m[a] = b
        if other:
            m[other] = old
    m = {a: b for a, b in m.items() if b}
    return m, local(na, m)


def _f(match, test, gold):
    p = match / test if test else 1.0
    r = match / gold if gold else 1.0
    return {"match": match, "a": test, "b": gold, "p": round(p, 4), "r": round(r, 4),
            "f": round(2 * p * r / (p + r), 4) if p + r else 0.0}


class Pair:
    """Annotator a's and annotator b's annotation of the document, node by node."""

    def __init__(self, sa, sb):
        self.sa, self.sb = sa, sb
        self.maps, self.matches = [], []
        for A, B in zip(sa, sb):
            m, n = pair_nodes(A, B)
            self.maps.append(m)
            self.matches.append(n)
        self.forward = {a: b for m in self.maps for a, b in m.items()}      # a's variable -> b's, all sentences
        self.back = {b: a for a, b in self.forward.items()}

    def doc_same(self, i):
        """The document-level relations of sentence i both have (as a names them), only a has, only b has."""
        ra = self.sa[i].relations
        rb = [(g, self.back.get(x, x), r, self.back.get(y, y)) for g, x, r, y in self.sb[i].relations]
        both = [x for x in ra if x in rb]
        return both, [x for x in ra if x not in rb], [x for x in rb if x not in ra]

    def same(self, i):
        A, B, m = self.sa[i], self.sb[i], self.maps[i]
        both, only_a, only_b = self.doc_same(i)
        return (not A.error and not B.error and self.matches[i] == A.size == B.size and not only_a and not only_b
                and all(A.align.get(a) == B.align.get(b) for a, b in m.items()))

    def scores(self, i):
        A, B = self.sa[i], self.sb[i]
        both, only_a, only_b = self.doc_same(i)
        return {"graph": _f(self.matches[i], A.size, B.size),
                "document": _f(len(both), len(both) + len(only_a), len(both) + len(only_b)), "same": self.same(i)}

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
            total = lambda key: _f(sum(s[key]["match"] for s in per), sum(s[key]["a"] for s in per), sum(s[key]["b"] for s in per))  # noqa: E731
            pairs.append({"a": a, "b": b, "graph": total("graph"), "document": total("document"),
                          "same": sum(1 for s in per if s["same"]), "sentences": [{"f": s["graph"]["f"], "doc_f": s["document"]["f"], "same": s["same"]} for s in per]})
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
