"""Output handler for UMR: write a Runner's worktree as a .umr file.

    out = UMROutputHandler()
    out.write(result["annotation"], result["worktree"], "out/english_umr-0003.umr")

The file has the layout of the gold files (newdata/, olddata/gold/), which is what
judges/umrjudge.py reads: per sentence a #### line, `# :: snt<i>`, Index /
Words, `# sentence level graph:`, `# alignment:`, `# document level annotation:`.

Sentence level graph (from worktree.sentence[i] and worktree.reentrancy[i]).
A tree node that made part of the graph stored it as a **fragment**:

    graph: {"nodes": [{"var": "p", "concept": "person", "span": [2, 2]},
                      {"var": "r", "concept": "rescue-01"}],
            "edges": [["p", "ARG0-of", "r"], ["p", "quant", "x1"]],
            "attrs": [["p", "refer-number", "plural"]]}
    open:  [{"var": "x1", "text": "more", "span": [1, 1]}]

  - The first node of `nodes` is the fragment's root. Variable names are the
    skill's own; they are renamed to s<i><letter>[<k>] here.
  - A var in `open` is a placeholder: a piece of the sentence handed on to
    other skills. The child tree node whose `edge` is that var fills it: its
    head (the root of the nearest fragment at or below it) takes the
    placeholder's place in every edge. A placeholder nobody filled becomes a
    leaf whose concept is its text.
  - A var in `outside` (np_phrase, special_entity, stop) is a participant
    written elsewhere in the sentence, {var, text, span}. Its child is an
    `antecedent` node whose `edge` is that var; through reentrancy's merge it
    fills the var like a placeholder, so the edge points at a node that already
    exists. If the antecedent was not merged, the edges with that var are left
    out. (predicate's `outside` items have no var: their antecedent is joined
    to the root by its role, as below.)
  - A child whose `edge` is not a placeholder var is joined to the root by
    that role (`mod` if it has none), e.g. discourse parts and coverage gaps.
  - A tree node without a fragment (sent_type that is not stop, discourse
    "none", coverage, a node in error) passes its children up.
  - Which nodes have a fragment: predicate, np_phrase, special_entity and
    sent_type with type stop (their `graph`); discourse with a relation (one
    node, the relation). A predicate's `aspect`, `modstr`, `polarity` are
    written on its root (ATTRIBUTES) unless the fragment already has them.
  - Modal strength never stays in the sentence graph: a `modal-strength` (a
    predicate's `modstr`, or one a fragment wrote itself) becomes the
    document-level relation (author :<value> <node>), as the Chinese gold
    writes it (Chun & Xue's cleanup gives the same for English).
  - Older runs stored `concept` instead of `graph`, or a penman string; both
    are still read.
  - reentrancy's `merges` {node, into}: node is not a UMR node of its own; its
    parent points at into's head instead (a reentrancy). Its subtree is a
    duplicate of into's and is left out. An `antecedent` node only ever
    appears through a merge.
Document level annotation (from worktree.document[i]): `relations`, each
{group, source, relation, target}. A source or target "<sentence>:<node id>"
(e.g. "3:0.2.1") becomes that node's head variable, "<sentence>:<node
id>/<var>" a node inside its fragment; anything else (author, ...) is written
as is. Every sentence's :modal starts with (root :modal author); then the
document skill's modal relations, and (author :<modstr> <event>) for every
event with a modal strength, unless the document skill gave that event a
parent other than author (a reported view: the conceiver's relation wins).
The document skill does not write the author's strength itself; if it does,
the event's modstr replaces it. The document skill sees the trees before assembly, so a reference
follows the merges: a merged node stands for its `into` (with a var, the node
of into's fragment with the same concept), and a node inside a merged node's
subtree, which is left out as a duplicate, for the node with the same skill
and span under `into`. A relation with a reference that stands for nothing in
the graph (no such node, a node with no head, no counterpart) is left out.
A wave that has not run is simply left out.
"""
import re

import penman

from output_handler import OutputHandler


# stored field -> (role, how its value is written; None leaves it out)
ATTRIBUTES = {
    "predicate": [
        ("aspect", "aspect", lambda v: None if v in (None, "", "none") else v),
        ("modstr", "modal-strength", lambda v: None if v in (None, "", "none") else v),
        ("polarity", "polarity", lambda v: "-" if v == "negative" else None),
    ],
}
FRAGMENT_SKILLS = {"predicate", "np_phrase", "special_entity"}
NO_ROLE = "mod"             # a child joined without any role
DOC_GROUPS = ["temporal", "modal", "coref"]     # their order in the file
MODAL_STRENGTH = ("modal-strength", "modstr")
INDENT = "    "


class UMROutputHandler(OutputHandler):

    suffix = ".umr"

    def render(self, annotation, worktree):
        graphs = {}
        for i, sent in enumerate(annotation.sents):
            graphs[sent.index] = _SentenceGraph(sent.index, _nodes(worktree, "sentence", i),
                                                _stored(worktree, "reentrancy", i, "merges"))
        blocks = []
        for i, sent in enumerate(annotation.sents):
            n = sent.index
            graph, align = graphs[n].render()
            relations = _stored(worktree, "document", i, "relations")
            blocks.append("\n".join([
                "#" * 80,
                f"# meta-info :: sent_id = {annotation.doc_id}-s{n}",
                f"# :: snt{n}",
                *_index_words(sent.tokenized_text),
                "",
                "# sentence level graph:",
                graph,
                "",
                "",
                "# alignment:",
                *(f"{var}: {a}" for var, a in align),
                "",
                "",
                "# document level annotation:",
                _doc_graph(n, relations, graphs, graphs[n].modal),
                "",
                "",
            ]))
        return "\n".join(blocks)


def provenance(annotation, worktree):
    """{sentence index: {variable: {"node": tree node id, "skill": skill, "var":
    the skill's own var}}}: which skill call made each node of the graph, for
    tracing an error back to the call that made it."""
    out = {}
    for i, sent in enumerate(annotation.sents):
        g = _SentenceGraph(sent.index, _nodes(worktree, "sentence", i),
                           _stored(worktree, "reentrancy", i, "merges"))
        out[sent.index] = {u.var: {"node": node_id, "skill": g.nodes[node_id]["skill"], "var": local}
                           for node_id, f in g.frags.items() for local, u in f.local.items()}
        for node_id, f in g.frags.items():          # leaves made for unfilled placeholders
            for var, us in f.fills.items():
                for u in us:
                    out[sent.index].setdefault(u.var, {"node": node_id, "skill": g.nodes[node_id]["skill"],
                                                       "var": var, "unfilled": True})
    return out


def _nodes(worktree, wave, i):
    trees = worktree.get(wave) or []
    return trees[i]["nodes"] if i < len(trees) and trees[i] else []


def _stored(worktree, wave, i, key):
    """A stored field of the root node of worktree[wave][i], or []."""
    nodes = _nodes(worktree, wave, i)
    return (nodes[0].get(key) or []) if nodes else []


def _index_words(tokens):
    widths = [max(len(t), len(str(k + 1))) for k, t in enumerate(tokens)]
    index = " ".join(str(k + 1).ljust(w) for k, w in enumerate(widths))
    words = " ".join(t.ljust(w) for t, w in zip(tokens, widths))
    return [f"Index: {index}".rstrip(), f"Words: {words}".rstrip()]


def _doc_graph(n, relations, graphs, modal=()):
    """The document-level block of sentence n. `modal` is the sentence's
    [(var, modal strength)]; see the module docstring for how it is merged
    with the document skill's modal relations."""
    def ref(x):
        """The variable a reference stands for, a constant as is, or None."""
        m = re.fullmatch(r"\s*(\d+)\s*:\s*([\d.]+)(?:/(\S+))?\s*", str(x))
        if not m:
            return str(x)
        if int(m.group(1)) not in graphs:
            return None
        u = graphs[int(m.group(1))].resolve(m.group(2), m.group(3))
        return u.var if u else None

    resolved = []                   # (group, source, relation, target)
    for r in relations:
        if isinstance(r, dict) and {"group", "source", "relation", "target"} <= set(r):
            source, target = ref(r["source"]), ref(r["target"])
            if source is None or target is None:
                continue
            resolved.append((str(r["group"]), source, str(r["relation"]).lstrip(":"), target))

    # modal: the root, the document skill's relations, the events' strengths
    strength = dict(modal)
    other_parent = {t for g, s_, _, t in resolved if g == "modal" and s_ not in ("author", "root")}
    rels = [("modal", "root", "modal", "author")]
    for g, s_, rel, t in resolved:
        if g == "modal" and s_ == "author" and t in strength:
            continue                # the event's own modstr says it
        if g == "modal" and s_ == "root":
            continue                # written once, first
        rels.append((g, s_, rel, t))
    for var, value in modal:
        if var not in other_parent:
            rels.append(("modal", "author", value, var))

    groups = {}
    for g, s_, rel, t in rels:
        line = f"({s_} :{rel} {t})"
        if line not in groups.setdefault(g, []):
            groups[g].append(line)
    head = f"(s{n}s0 / sentence"
    lines = [head]
    for g in DOC_GROUPS + sorted(set(groups) - set(DOC_GROUPS)):
        if g in groups:
            pad = " " * (len(f"{INDENT}:{g} ("))
            lines.append(f"{INDENT}:{g} (" + ("\n" + pad).join(groups[g]) + ")")
    return "\n".join(lines) + ")"


# ------------------------------------------------------------------ fragments

def fragment_of(x):
    """The fragment a tree node contributes, normalised to {nodes, edges,
    attrs, open}, or None if it contributes none. Variable names are the
    skill's own."""
    if x.get("status") != "ok":
        return None
    skill = x["skill"]
    if skill == "discourse":
        rel = x.get("relation")
        return _single(rel, None) if rel not in (None, "", "none") else None
    if skill == "sent_type" and x.get("type") != "stop":
        return None
    if skill != "sent_type" and skill not in FRAGMENT_SKILLS:
        return None
    frag = _normalise(x.get("graph"), x.get("open"), x.get("outside"))
    if frag is None and skill != "special_entity":       # older runs: a plain concept
        concept = x.get("concept")
        if skill == "sent_type" and not concept:
            concept = x["input"].get("text", "")
        if concept:
            frag = _single(concept, None)
    if frag is None:
        return None
    root = frag["nodes"][0]
    if root.get("span") is None:
        root["span"] = x.get("alignment") or (x["input"].get("span") if skill == "sent_type" else None)
    have = {role for v, role, _ in frag["attrs"] if v == root["var"]}
    for field, role, write in ATTRIBUTES.get(skill, []):
        value = write(x.get(field))
        if value is not None and role not in have:
            frag["attrs"].append((root["var"], role, value))
    return frag


def _single(concept, span):
    return {"nodes": [{"var": "x", "concept": _concept(concept), "span": span}],
            "edges": [], "attrs": [], "open": {}, "outside": {}}


def _normalise(graph, open_items, outside_items=None):
    """{nodes, edges, attrs, open, outside} from a skill's graph (a dict, or a
    penman string from older runs), open list and outside list; None if there
    is no node. Only outside items with a var count (predicate's have none)."""
    if isinstance(graph, str) and graph.strip():
        graph = _from_penman(graph)
    if not isinstance(graph, dict):
        return None
    nodes, seen = [], set()
    for nd in graph.get("nodes") or []:
        if isinstance(nd, dict) and nd.get("var") and nd.get("concept") and str(nd["var"]) not in seen:
            seen.add(str(nd["var"]))
            nodes.append({"var": str(nd["var"]), "concept": _concept(nd["concept"]), "span": nd.get("span")})
    if not nodes:
        return None
    opened = {}
    for item in open_items or []:
        if isinstance(item, dict) and item.get("var") and str(item["var"]) not in seen:
            opened[str(item["var"])] = item
    outside = {}
    for item in outside_items or []:
        if isinstance(item, dict) and item.get("var") and str(item["var"]) not in seen \
                and str(item["var"]) not in opened:
            outside[str(item["var"])] = item
    edges, attrs = [], []
    for e in graph.get("edges") or []:
        if isinstance(e, (list, tuple)) and len(e) == 3:
            a, role, b = (str(e[0]), _role(e[1]), e[2])
            if str(b) in seen or str(b) in opened or str(b) in outside:
                edges.append((a, role, str(b)))
            elif re.fullmatch(r"ARG\d+(-of)?|.+-of", role) and not re.fullmatch(r"-?\d+(\.\d+)?", str(b)):
                continue                            # a reference to a node that is not there, not a constant
            else:
                attrs.append((a, role, b))          # a constant given as an edge
    for a in graph.get("attrs") or []:
        if isinstance(a, (list, tuple)) and len(a) == 3:
            attrs.append((str(a[0]), _role(a[1]), a[2]))
    return {"nodes": nodes, "edges": edges, "attrs": attrs, "open": opened, "outside": outside}


def _from_penman(text):
    try:
        g = penman.decode(text)
    except Exception:
        return None
    instances = {v: c for v, _, c in g.instances()}
    nodes = [{"var": g.top, "concept": instances.get(g.top)}] + \
            [{"var": v, "concept": c} for v, c in instances.items() if v != g.top]
    edges = [[s, r, t] for s, r, t in g.edges()]
    attrs = [[s, r, t] for s, r, t in g.attributes()]
    return {"nodes": nodes, "edges": edges, "attrs": attrs}


def _concept(c):
    c = re.sub(r"[\s()/:\"]+", "-", str(c).strip().strip('"')).strip("-")
    return c if re.search(r"\w", c) else "thing"


def _role(r):
    return str(r).strip().lstrip(":")


def _value(role, value, concept):
    """An attribute value as penman writes it: names and wiki titles quoted."""
    v = str(value).strip()
    if v.startswith('"') and v.endswith('"') and len(v) >= 2:
        v = v[1:-1]
    bare = re.fullmatch(r"-?\d+(\.\d+)?|[-+]|[A-Za-z0-9_.-]+", v) is not None
    quote = (concept == "name" and role.startswith("op")) or (role == "wiki" and v != "-") or not bare
    return '"%s"' % v.replace('"', "'") if quote else v


# ------------------------------------------------------------ sentence graph

class _UNode:
    def __init__(self, var, concept, align):
        self.var = var
        self.concept = concept
        self.align = align          # "first-last", 1-based inclusive, or "0-0"
        self.attrs = []             # (role, value)
        self.edges = []             # (role, _UNode)


class _Frag:
    """One tree node's fragment, its variables made real."""
    def __init__(self, local, root, frag):
        self.local = local          # skill's var -> _UNode
        self.root = root
        self.frag = frag
        self.fills = {}             # placeholder or outside var -> [_UNode]
        self.joined = []            # (role, _UNode): children joined by role


class _SentenceGraph:

    def __init__(self, n, nodes, merges):
        self.n = n
        self.nodes = {str(x["id"]): x for x in nodes}
        self.kids = {}
        for x in sorted(nodes, key=lambda x: _key(x["id"])):
            parent = None if x["parent"] is None else str(x["parent"])
            self.kids.setdefault(parent, []).append(x)
        self.merged = {str(m["node"]): str(m["into"]) for m in merges
                       if isinstance(m, dict) and str(m.get("node")) in self.nodes
                       and str(m.get("into")) in self.nodes}
        self.used = set()
        self.placed = set()         # tree nodes the walk put in the graph (not merged, not under a merge)
        self.align = []             # (var, "a-b") in creation order
        self.frags = {}             # tree node id -> _Frag
        self.roots = []             # heads with no fragment above them
        self.strength = []          # (_UNode, modal strength), taken out of the sentence graph
        self.modal = []             # (var, modal strength) of the nodes render() wrote
        if self.kids.get(None):
            self._walk(self.kids[None][0], None, None)
        for f in self.frags.values():
            self._close(f)

    # -- building ----------------------------------------------------------

    def _frag(self, node_id):
        """The _Frag of a tree node, made on first use (in walk order)."""
        if node_id in self.frags:
            return self.frags[node_id]
        frag = fragment_of(self.nodes[node_id])
        if frag is None:
            return None
        local = {}
        for nd in frag["nodes"]:
            u = _UNode(self._var(nd["concept"]), nd["concept"], _align(nd.get("span")))
            local[nd["var"]] = u
            self.align.append((u.var, u.align))
        f = _Frag(local, local[frag["nodes"][0]["var"]], frag)
        self.frags[node_id] = f
        return f

    def head(self, node_id):
        """The _UNode a tree node stands for: its fragment's root, through a
        merge, or for a pass-through node its first child's head."""
        node_id = self.merged.get(str(node_id), str(node_id))
        if node_id not in self.nodes:
            return None
        f = self._frag(node_id)
        if f:
            return f.root
        for c in self.kids.get(node_id, []):
            u = self.head(c["id"])
            if u:
                return u
        return None

    def _walk(self, x, ctx, link):
        """Join tree node x's head to ctx (the nearest fragment above it) by
        link: ("slot", placeholder var), ("role", role) or None."""
        node_id = str(x["id"])
        if node_id in self.merged:
            u = self.head(node_id)
            if u:
                self._connect(ctx, link, u)
            return                  # its subtree duplicates into's
        self.placed.add(node_id)
        f = self._frag(node_id)
        if f:
            self._connect(ctx, link, f.root)
            ctx, link = f, None
        for c in self.kids.get(node_id, []):
            edge = c.get("edge")
            if edge is not None and ctx is not None and (str(edge) in ctx.frag["open"]
                                                         or str(edge) in ctx.frag["outside"]):
                child_link = ("slot", str(edge))
            elif edge is not None:
                child_link = ("role", _role(edge))
            else:
                child_link = link
            self._walk(c, ctx, child_link)

    def _connect(self, ctx, link, u):
        if ctx is None:
            self.roots.append(u)
        elif link and link[0] == "slot":
            ctx.fills.setdefault(link[1], []).append(u)
        else:
            ctx.joined.append((link[1] if link else NO_ROLE, u))

    def _close(self, f):
        """Turn a fragment's edges, attrs and fills into _UNode edges."""
        frag, local = f.frag, f.local

        def targets(var):
            if var in local:
                return [local[var]]
            if var in frag["outside"]:      # filled only through a merge; otherwise left out
                return f.fills.get(var, [])
            if var in frag["open"]:
                if var not in f.fills:      # nobody filled it: a leaf from its text
                    item = frag["open"][var]
                    u = _UNode(self._var(_concept(item.get("text", "thing"))),
                               _concept(item.get("text", "thing")), _align(item.get("span")))
                    self.align.append((u.var, u.align))
                    f.fills[var] = [u]
                return f.fills[var]
            return []

        used_slots = set()
        for a, role, b in frag["edges"]:
            used_slots |= {v for v in (a, b) if v in frag["open"]}
            for src in targets(a):
                for dst in targets(b):
                    if src is not dst:
                        src.edges.append((role, dst))
        for var, item in frag["open"].items():    # a placeholder no edge mentions
            if var not in used_slots:
                for dst in targets(var):
                    f.root.edges.append((_role(item.get("role") or NO_ROLE), dst))
        for a, role, value in frag["attrs"]:
            if a in local and role in MODAL_STRENGTH:     # goes to the document level
                self.strength.append((local[a], str(value).strip().strip('"')))
            elif a in local:
                local[a].attrs.append((role, _value(role, value, local[a].concept)))
        for role, u in f.joined:
            if u is not f.root:
                f.root.edges.append((role, u))
        # a node of the fragment not connected to the root (either direction) hangs off it
        nbrs = {id(u): set() for u in local.values()}
        for u in local.values():
            for _, d in u.edges:
                if id(d) in nbrs:
                    nbrs[id(u)].add(id(d))
                    nbrs[id(d)].add(id(u))
        reached = set()

        def reach(k):
            todo = [k]
            while todo:
                k = todo.pop()
                if k not in reached:
                    reached.add(k)
                    todo += list(nbrs[k])
        reach(id(f.root))
        for u in local.values():
            if id(u) not in reached:
                f.root.edges.append((NO_ROLE, u))
                reach(id(u))

    def _var(self, concept):
        head = next((ch for ch in concept.lower() if ch.isalpha() and ch.isascii()), "x")
        base = f"s{self.n}{head}"
        var, k = base, 1
        while var in self.used:
            k += 1
            var = f"{base}{k}"
        self.used.add(var)
        return var

    # -- output ------------------------------------------------------------

    def resolve(self, node_id, var=None):
        """The _UNode for a document-level reference: a tree node's head, or
        with var a node inside its fragment; None if it stands for nothing in
        the graph. A merged node stands for its into; a node under a merged
        node (left out) for its counterpart under into."""
        node_id = str(node_id)
        if node_id not in self.nodes:
            return None
        if node_id in self.merged:
            target = self.merged[node_id]
        elif node_id in self.placed:
            target = node_id
        else:
            target = self._counterpart(node_id)
        if target is None or target not in self.placed:
            return None
        if var and target != node_id:       # var is the left-out node's own: find its match
            return self._same_node(node_id, var, target)
        if var and target in self.frags and var in self.frags[target].local:
            return self.frags[target].local[var]
        return self.head(target)

    def _counterpart(self, node_id):
        """For a node under a merged node: the node under into with the same
        skill (and sent_type type) and span, or None."""
        anc = self.nodes[node_id]["parent"]
        while anc is not None and str(anc) not in self.merged:
            anc = self.nodes[str(anc)]["parent"]
        if anc is None:
            return None
        into, x = self.merged[str(anc)], self.nodes[node_id]

        def under_into(i):
            while i is not None and str(i) != into:
                i = self.nodes[str(i)]["parent"]
            return i is not None

        for i in sorted(self.placed, key=_key):
            y = self.nodes[i]
            if (y["skill"], y.get("type"), y["input"].get("span")) == \
                    (x["skill"], x.get("type"), x["input"].get("span")) and under_into(i):
                return i
        return None

    def _same_node(self, node_id, var, target):
        """The node of target's fragment that matches node var of node_id's
        fragment: target's head for the root, else the node with the same
        concept; None if there is none."""
        frag = fragment_of(self.nodes[node_id])
        nds = {nd["var"]: nd for nd in (frag or {}).get("nodes", [])}
        if var not in nds or var == frag["nodes"][0]["var"]:
            return self.head(target)
        f = self.frags.get(target)
        return next((u for u in (f.local.values() if f else []) if u.concept == nds[var]["concept"]), None)

    def render(self):
        if not self.roots:
            return f"(s{self.n}x / empty)", []
        if len(self.roots) == 1:
            top = self.roots[0]
        else:
            top = _UNode(self._var("and"), "and", "0-0")
            self.align.append((top.var, top.align))
            top.edges = [(f"op{k}", u) for k, u in enumerate(self.roots, 1)]
        triples, seen, queue = [], set(), [top]
        while queue:                        # everything reachable from top
            u = queue.pop(0)
            if id(u) in seen:
                continue
            seen.add(id(u))
            triples.append((u.var, ":instance", u.concept))
            triples += [(u.var, ":" + role, value) for role, value in u.attrs]
            for role, d in u.edges:
                triples.append((u.var, ":" + role, d.var))
                queue.append(d)
        try:
            text = penman.encode(penman.Graph(triples, top=top.var), indent=4)
        except Exception as e:              # should not happen; keep the file readable
            text = f"(s{self.n}x / error :mod \"{type(e).__name__}\")"
        reachable = {t[0] for t in triples}
        self.modal = [(u.var, v) for u, v in self.strength if u.var in reachable]
        return text, [(v, a) for v, a in self.align if v in reachable]


def _key(node_id):
    """Sort key of a node id: "0.10" comes after "0.9"."""
    return tuple(int(p) for p in str(node_id).split("."))


def _align(span):
    """A span [first, last] (1-based, both included) as gold writes it: "first-last"."""
    if isinstance(span, (list, tuple)) and len(span) == 2 and all(isinstance(s, int) for s in span) \
            and 1 <= span[0] <= span[1]:
        return f"{span[0]}-{span[1]}"
    return "0-0"
