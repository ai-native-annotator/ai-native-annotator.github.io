"""An existing .umr file's annotation, loaded into the page's step tree so that every node of it
can be run again.

The file's sentence graphs are taken apart the way the registry builds them: each UMR node is
reached through a sent_type step whose output is the node's kind, then the step of that kind
(predicate, np_phrase, special_entity or discourse) writes the node's fragment, with one
placeholder (`open`) per child, and each placeholder is again a sent_type step. A node with no
children is a sent_type `stop` leaf. Every step's input is what a run would have given it: the
text and span of its part of the sentence, so re-running any of them asks its skill again.
A second mention of a node (a re-entrancy) is an `outside` participant whose antecedent step is
merged into the node by the reentrancy step; the document-level relations become the document
step's output. All of these are written as a person's results (confirmed).

Alignments: the page numbers Chinese one character per token. A file whose Words: are words
(several characters) and whose alignments count words is converted to characters; a file whose
alignments already count characters is read as it is. English words are the tokens.
"""
import re

import penman

TOKEN = re.compile(r"[A-Za-z0-9]+|[^\sA-Za-z0-9]")
SPECIAL = {"date-entity", "date-interval", "ordinal-entity", "percentage-entity", "url-entity"}
EVENT = re.compile(r"-\d{2}$")
PREDICATE_FIELDS = ("aspect", "polarity", "modal-strength", "modstr")


class UNode:
    def __init__(self, var, concept):
        self.var = var
        self.concept = concept
        self.attrs = []         # (role, value)
        self.kids = []          # (role, UNode)
        self.refs = []          # (role, var): a node written elsewhere in the graph


def blocks(text):
    """The blocks strip_umr keeps (a `# :: sntN` with words), in order: {words, graph, align, doc}."""
    out = []
    for chunk in re.split(r"^#{20,}\s*$", text.replace("\r", ""), flags=re.M):
        m = re.search(r"^#\s*::\s*snt(\d+)[ \t]*(.*)$", chunk, re.M)
        if not m:
            continue
        w = re.search(r"^Words:[ \t]*(.*)$", chunk, re.M)
        words = (w.group(1) if w else m.group(2)).split()
        if not words:
            continue
        graph = re.search(r"#\s*sentence level graph:\s*\n(.*?)(?=\n\s*#\s*(?:alignment|document level annotation)|\Z)",
                          chunk, re.S)
        align = re.search(r"#\s*alignment:\s*\n(.*?)(?=\n\s*#\s*document level annotation|\Z)", chunk, re.S)
        doc = re.search(r"#\s*document level annotation:\s*\n(.*)", chunk, re.S)
        aligned = {}
        for line in (align.group(1) if align else "").splitlines():
            a = re.match(r"^\s*(\S+):\s*(\d+)-(\d+)\s*$", line)
            if a:
                aligned[a.group(1)] = (int(a.group(2)), int(a.group(3)))
        out.append({"words": words, "graph": (graph.group(1) if graph else "").strip(),
                    "align": aligned, "doc": doc.group(1) if doc else ""})
    return out


def unit_spans(words, tokens, aligned, lang):
    """(how the file counts, {unit number: (first token, last token)}): "char" or "word" for
    Chinese, "token" for English (its words are the tokens)."""
    if lang != "zh":
        return "token", {k: (k, k) for k in range(1, len(tokens) + 1)}
    owner = []                  # character of the sentence (no spaces) -> token number
    for k, t in enumerate(tokens, 1):
        owner += [k] * len(t)
    biggest = max([b for _, b in aligned.values()] + [0])
    if [t for w in words for t in TOKEN.findall(w)] == list(tokens) and all(len(TOKEN.findall(w)) == 1 for w in words):
        return "char", {k: (k, k) for k in range(1, len(tokens) + 1)}
    if biggest > len(words):    # word cut, but the alignments count characters
        return "char", {c: (owner[c - 1], owner[c - 1]) for c in range(1, len(owner) + 1)}
    spans, at = {}, 0
    for k, w in enumerate(words, 1):
        n = len(w)
        if at + n <= len(owner) and n:
            spans[k] = (owner[at], owner[at + n - 1])
        at += n
    return "word", spans


def tree_of(graph_text):
    """The graph as UNodes (the instance tree; a second mention of a variable is a ref)."""
    t = penman.parse(graph_text)
    variables = set()

    def collect(node):
        var, branches = node
        variables.add(var)
        for _, target in branches[1:]:
            if isinstance(target, tuple):
                collect(target)
    collect(t.node)

    def build(node):
        var, branches = node
        u = UNode(var, str(branches[0][1]) if branches and branches[0][0] == "/" else "thing")
        for role, target in branches[1:]:
            role = role.lstrip(":")
            if isinstance(target, tuple):
                u.kids.append((role, build(target)))
            elif target in variables:
                u.refs.append((role, target))
            else:
                u.attrs.append((role, target))
        return u
    return build(t.node)


class Loader:
    def __init__(self, engine):
        self.e = engine
        self.problems = []
        self.count = 0

    # -- the file's alignments on the page's tokens

    def span_of(self, var):
        a = self.align.get(var)
        if not a or a == (0, 0):
            return None
        lo, hi = self.units.get(a[0]), self.units.get(a[1])
        return [lo[0], hi[1]] if lo and hi else None

    def subtree_span(self, u):
        spans = [s for s in [self.span_of(u.var)] + [self.subtree_span(k) for _, k in u.kids] if s]
        return [min(s[0] for s in spans), max(s[1] for s in spans)] if spans else None

    def find(self, text):
        """The tokens where a text first occurs in the sentence, or None."""
        text = re.sub(r"\s+", "", text or "")
        if not text:
            return None
        toks = self.tokens
        for a in range(len(toks)):
            s = ""
            for b in range(a, len(toks)):
                s += toks[b]
                if s == text:
                    return [a + 1, b + 1]
                if len(s) >= len(text):
                    break
        return None

    def piece(self, u, fallback):
        """{text, span} of a node's part of the sentence: its subtree's tokens; with no
        alignment there, where its name or concept occurs; else the part it is in."""
        span = self.subtree_span(u)
        if span is None:
            name = next((k for r, k in u.kids if r == "name"), None)
            if name:
                span = self.find("".join(str(v).strip('"') for r, v in sorted(name.attrs) if r.startswith("op")))
            if span is None:
                span = self.find(EVENT.sub("", u.concept))
        span = span or fallback
        sep = "" if self.lang == "zh" else " "
        return {"text": sep.join(self.tokens[span[0] - 1:span[1]]), "span": span}

    # -- what kind of step writes a node

    def kind(self, u):
        if u.concept in SPECIAL or u.concept.endswith("-quantity") \
                or any(r == "name" and k.concept == "name" for r, k in u.kids):
            return "special_entity"
        if EVENT.search(u.concept) or any(r == "aspect" for r, _ in u.attrs):
            return "predicate"
        if not u.kids and not u.refs:
            return "stop"
        if u.concept in self.relations and not u.refs and not u.attrs \
                and all(re.fullmatch(r"op\d+|ARG\d+", r) for r, _ in u.kids) \
                and any(EVENT.search(k.concept) or k.concept in self.relations for _, k in u.kids):
            return "discourse"
        return "np_phrase"

    def node(self, u):
        # [0, 0]: not aligned in the file, and the output handler must not give it the step's span
        return {"var": u.var, "concept": u.concept, "span": self.span_of(u.var) or [0, 0]}

    def fragment(self, u, kind, part):
        """The step's output for node u, and the order of its children: [("open", UNode)],
        [("outside", var)]."""
        nodes, edges, attrs, opened, outside = [self.node(u)], [], [], [], []
        def include(v):             # a fixed part of a special entity: its whole subtree
            nodes.append(self.node(v))
            attrs.extend([v.var, r, val] for r, val in v.attrs)
            for r, k in v.kids:
                edges.append([v.var, r, k.var])
                include(k)
            for r, var in v.refs:
                edges.append([v.var, r, var])
                outside.append(var)

        fields = {}
        for r, val in u.attrs:
            if kind == "predicate" and r in PREDICATE_FIELDS:
                fields[r] = str(val).strip('"')
            else:
                attrs.append([u.var, r, val])
        for r, k in u.kids:
            edges.append([u.var, r, k.var])
            # a name, or a unit, is part of the entity, unless something elsewhere points into it
            if kind == "special_entity" and (r == "name" or (r == "unit" and not k.kids)) \
                    and not (self.vars_of(k) & self.referenced):
                include(k)
            else:
                opened.append(k)
        here = {n["var"] for n in nodes} | {k.var for k in opened}
        for r, var in u.refs:
            if var in here:         # its own child (or itself): an edge inside the fragment
                if var != u.var:
                    edges.append([u.var, r, var])
                continue
            if kind != "predicate":
                edges.append([u.var, r, var])
            outside.append((r, var))
        own = self.span_of(u.var) or []
        open_items = []
        for k in opened:
            p = self.piece(k, part["span"])
            open_items.append({"var": k.var, "text": p["text"], "span": p["span"]})
        out_items, out_vars = [], []
        for item in outside:
            r, var = item if isinstance(item, tuple) else (None, item)
            p = self.ref_piece(var, part["span"])
            if kind == "predicate":
                out_items.append({"text": p["text"], "span": p["span"], "role": r})
                out_vars.append(var)
            elif var not in out_vars:
                out_items.append({"var": var, "text": p["text"], "span": p["span"]})
                out_vars.append(var)
        out = {"graph": {"nodes": nodes, "edges": edges, "attrs": attrs},
               "open": open_items, "outside": out_items, "alignment": own}
        if kind == "predicate":
            aspect = fields.get("aspect", "none")
            # modstr: the author's strength for this event in the file; "none" when the file gives
            # it none (a loaded step may leave it empty, see RegistryEngine._check_emit)
            modstr = self.modstr.get(u.var) or fields.get("modal-strength") or fields.get("modstr")
            out.update(frame={}, aspect=aspect if aspect in self.aspects else "none",
                       modstr=modstr if modstr in self.modstrs else "none",
                       polarity="negative" if fields.get("polarity") == "-" else "positive")
        return out, opened, out_vars

    def vars_of(self, u):
        return {u.var}.union(*[self.vars_of(k) for _, k in u.kids])

    def ref_piece(self, var, fallback):
        u = self.by_var.get(var)
        span = (self.span_of(var) or (self.subtree_span(u) if u else None)) or fallback
        sep = "" if self.lang == "zh" else " "
        return {"text": sep.join(self.tokens[span[0] - 1:span[1]]), "span": span}

    # -- writing the steps

    def put(self, nid, output):
        r = self.e.set_output(self.w, self.i, nid, output)
        node = self.ep["nodes"][nid]
        node["loaded"] = True
        self.count += 1
        if r.get("status") == "error":
            self.problems.append("snt%d %s %s: %s" % (self.i + 1, nid, node["skill"], r.get("error")))
        return node

    def fill(self, nid, u):
        """sent_type step nid stands for node u: write it and everything under it."""
        part = self.ep["nodes"][nid]["input"]
        kind = self.kind(u)
        if kind == "stop":
            self.put(nid, {"type": "stop", "graph": {"nodes": [self.node(u)], "edges": [],
                                                     "attrs": [[u.var, r, v] for r, v in u.attrs]},
                           "outside": []})
            self.where[u.var] = nid
            return
        st = self.put(nid, {"type": kind, "graph": {}, "outside": []})
        if not st["children"]:
            self.problems.append("snt%d %s: no %s step after sent_type" % (self.i + 1, nid, kind))
            return
        cid = st["children"][0]
        if kind == "discourse":
            parts = [dict(self.piece(k, part["span"]), role=r) for r, k in u.kids]
            node = self.put(cid, {"relation": u.concept, "parts": parts})
            self.where[u.var] = cid
            kids = [k for _, k in u.kids]
            for sid in [c for c in node["children"] if self.ep["nodes"][c]["skill"] == "sent_type"]:
                if kids:
                    self.fill(sid, kids.pop(0))
            return
        out, opened, out_vars = self.fragment(u, kind, part)
        node = self.put(cid, out)
        self.where[u.var] = cid
        for nd in out["graph"]["nodes"][1:]:
            self.where_inner[nd["var"]] = cid
        kids = {k.var: k for k in opened}
        refs = list(out_vars)
        for c in node["children"]:
            child = self.ep["nodes"][c]
            if child["skill"] == "sent_type" and child["edge"] in kids:
                self.fill(c, kids.pop(child["edge"]))
            elif child["skill"] == "antecedent" and refs:
                self.put(c, {"span": child["input"].get("span") or part["span"]})
                self.antecedents.append((c, refs.pop(0)))
        for v in kids:
            self.problems.append("snt%d %s: no step for the placeholder %s" % (self.i + 1, cid, v))

    def sentence(self, i, b):
        self.i, self.w = i, "sentence"
        sent = self.e.doc.sents[i]
        self.tokens = list(sent.tokenized_text)
        self.align = b["align"]
        self.how, self.units = unit_spans(b["words"], self.tokens, b["align"], self.lang)
        self.where, self.where_inner, self.antecedents = {}, {}, []
        self.modstr = {t: s for g, s_, s, t in self.doc_rel(b["doc"]) if g == "modal" and s_ == "author"
                       and s in self.modstrs}
        if not b["graph"]:
            return None
        try:
            top = tree_of(b["graph"])
        except Exception as e:
            self.problems.append("snt%d: the graph cannot be read (%s)" % (i + 1, e))
            return None
        self.by_var, self.referenced = {}, set()

        def index(u):
            self.by_var[u.var] = u
            self.referenced.update(var for _, var in u.refs)
            for _, k in u.kids:
                index(k)
        index(top)
        self.e.start(self.w, i)
        self.ep = self.e.eps[self.w][i]
        self.fill("0", top)
        merges = []
        for ant, var in self.antecedents:
            if var in self.where:
                merges.append({"node": ant, "into": self.where[var]})
            else:
                self.problems.append("snt%d: the re-entrancy %s points inside a fixed structure; it is "
                                     "left out" % (i + 1, var))
        refs = {}
        for var, nid in self.where.items():
            refs[var] = "%d:%s/%s" % (sent.index, nid, var)
        for var, nid in self.where_inner.items():
            refs.setdefault(var, "%d:%s/%s" % (sent.index, nid, var))
        return merges, refs

    @staticmethod
    def doc_rel(text):
        """[(group, source, relation, target)] of a document-level annotation."""
        marks = [(m.start(), m.group(1)) for m in re.finditer(r":(temporal|modal|coref)\s*\(", text)]
        out = []
        for k, (start, group) in enumerate(marks):
            end = marks[k + 1][0] if k + 1 < len(marks) else len(text)
            for a, r, b in re.findall(r"\(\s*([^\s()]+)\s+:(\S+)\s+([^\s()]+)\s*\)", text[start:end]):
                out.append((group, a, r, b))
        return out

    def run(self, text):
        e = self.e
        self.lang = e.doc.lang
        sk = e.reg.skills
        self.relations = set(sk["discourse"].emit["relation"]) - {"none"} if "discourse" in sk else set()
        self.aspects = set(sk["predicate"].emit["aspect"])
        self.modstrs = set(sk["predicate"].emit["modstr"])
        bs = blocks(text)
        n = min(len(bs), len(e.doc.sents))
        saved = {w: (wave.max_depth, wave.max_nodes) for w, wave in e.waves.items()}
        e.loading = True             # a person's tree: no depth or size limit, no loop check
        for wave in e.waves.values():
            wave.max_depth = wave.max_nodes = None
        hows, per = set(), {}
        try:
            for i in range(n):
                got = self.sentence(i, bs[i])
                hows.add(self.how)
                if got:
                    per[i] = got
            if "reentrancy" in e.waves:
                for i in range(n):
                    e.start("reentrancy", i)
                    ep = e.eps["reentrancy"][i]
                    if ep["error"] or not ep["nodes"]:
                        self.problems.append("snt%d reentrancy: %s" % (i + 1, ep["error"] or "no step"))
                        continue
                    self.w, self.i, self.ep = "reentrancy", i, ep
                    self.put("0", {"merges": per.get(i, ([], {}))[0]})
            if "document" in e.waves:
                refs = {}
                for i in range(n):
                    refs.update(per.get(i, ([], {}))[1])
                for i in range(n):
                    e.start("document", i)
                    ep = e.eps["document"][i]
                    if ep["error"] or not ep["nodes"]:
                        self.problems.append("snt%d document: %s" % (i + 1, ep["error"] or "no step"))
                        continue
                    rels = [{"group": g, "source": refs.get(a, a), "relation": r, "target": refs.get(b, b)}
                            for g, a, r, b in self.doc_rel(bs[i]["doc"]) if not (g == "modal" and a == "root")]
                    self.w, self.i, self.ep = "document", i, ep
                    self.put("0", {"relations": rels})
        finally:
            e.loading = False
            for w, (d, m) in saved.items():
                e.waves[w].max_depth, e.waves[w].max_nodes = d, m
        how = "word" if "word" in hows else "char" if "char" in hows else "token"
        return {"alignment": how, "converted": how == "word", "sentences": n, "steps": self.count,
                "problems": self.problems[:50], "more_problems": max(0, len(self.problems) - 50)}


def load(engine, text):
    return Loader(engine).run(text)
