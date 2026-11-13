"""A document's steps as a .umr file: each sentence's steps assembled into one graph, its
alignment, and its document-level annotation.

    parts = assemble(doc, steps, relations)     # one per sentence: graph, align, relations, provenance
    text = "\n".join(umr_blocks(doc, parts))

`steps[i]` is sentence i's steps as the page keeps them ({id, skill, parent, edge, status, input,
output}), or None when it has none; `relations[i]` its document-level relations.

The file has the layout of the gold files: per sentence a #### line, `# :: snt<i>`, Index /
Words, `# sentence level graph:`, `# alignment:`, `# document level annotation:`.

Sentence level graph. A step that made part of the graph wrote a **fragment**:

    graph: {"nodes": [{"var": "p", "concept": "person", "span": [2, 2]},
                      {"var": "r", "concept": "rescue-01"}],
            "edges": [["p", "ARG0-of", "r"], ["p", "quant", "x1"]],
            "attrs": [["p", "refer-number", "plural"]]}
    open:  [{"var": "x1", "text": "more", "span": [1, 1]}]

  - The first node of `nodes` is the fragment's root. Variable names are the
    skill's own; they are renamed to s<i><letter>[<k>] here.
  - A var in `open` is a placeholder: a piece of the sentence handed on to
    other skills. The child step whose `edge` is that var fills it: its
    head (the root of the nearest fragment at or below it) takes the
    placeholder's place in every edge. A placeholder nobody filled becomes a
    leaf whose concept is its text.
  - An item of `outside` is a participant written elsewhere in the sentence: it names the step
    that stands for it (`node`, as the table in the step's input names it: "0.1"). That step's
    head is joined here, so the edge points at a node that already exists (a re-entrancy): to
    the root by the item's `role` (predicate), or in place of the item's `var` in the
    fragment's edges (the others). An item that names no step of the sentence is left out.
  - A child whose `edge` is not a placeholder var is joined to the root by
    that role (`mod` if it has none), e.g. discourse parts.
  - A step without a fragment (sent_type that is not stop, discourse
    "none", a step in error) passes its children up.
  - Which steps have a fragment: predicate, np_phrase, special_entity and
    sent_type with type stop (their `graph`); discourse with a relation (one
    node, the relation). A predicate's `polarity` is written on its root.
  - Modal strength never stays in the sentence graph: a `modstr` (or `modal-strength`)
    attribute becomes the document-level relation (author :<value> <node>), as the Chinese gold
    writes it (Chun & Xue's cleanup gives the same for English).
  - Two steps that write the same concept over the same span are one node (same_nodes): the
    later one is not a UMR node of its own; its parent points at the first one's head instead
    (a re-entrancy). Its subtree is a duplicate of the first's and is left out.
Document level annotation: `relations`, each
{group, source, relation, target}. A source or target "<sentence>:<node>"
(e.g. "3:0.1") becomes that node's head variable, "<sentence>:<node>/<var>" a node inside its
fragment; anything else (author, ...) is written
as is. Every sentence's :modal starts with (root :modal author); then the
modal relations, and (author :<modstr> <event>) for every
event with a modal strength, unless a relation gave that event a
parent other than author (a reported view: the conceiver's relation wins).
The document steps see the steps before assembly, so a reference
follows the merges: a merged node stands for the node it is one with (with a var, the node
of that fragment with the same concept), and a node inside a merged node's
subtree, which is left out as a duplicate, for the node with the same skill
and span under the kept one. A relation with a reference that stands for nothing in
the graph (no such node, a node with no head, no counterpart) is left out.
"""
import re

import penman


FRAGMENT_SKILLS = ("predicate", "np_phrase", "special_entity")
TYPER = "sent_type"         # its step "0.1B" decides what the node "0.1" is; a stop is the node itself
NO_ROLE = "mod"             # a child joined without any role
DOC_GROUPS = ["temporal", "modal", "coref"]     # their order in the file
MODAL_STRENGTH = ("modal-strength", "modstr")
INDENT = "    "
EMPTY = "(s%dx / empty)"    # the graph of a sentence with no node yet


def assemble(annotation, steps, relations, fill_alignments=False):
    """One part per sentence:

      index        the sentence's number
      graph        its graph, penman
      align        [(variable, "first-last")], "0-0" for one that is not aligned
      added        [[sentence, variable, "first-last"]]: the alignments filled in (fill_alignments)
      relations    [{group, a, rel, b}]: its document-level relations, variables for nodes
      document     the same as the file writes it (with the root's fixed (root :modal author))
      provenance   {variable: {"node": step id, "skill", "var": the skill's own var[, "unfilled":
                   True]}}: which step made each node (unfilled: a leaf made for a placeholder
                   nobody filled)
    """
    graphs = {sent.index: _SentenceGraph(sent.index, steps[i] or []) for i, sent in enumerate(annotation.sents)}
    parts = []
    for i, sent in enumerate(annotation.sents):
        g = graphs[sent.index]
        graph, align = g.render()
        added = _fill_alignments(align, g.concepts, sent.tokenized_text, annotation.lang) if fill_alignments else []
        prov = {u.var: {"node": node_id, "skill": g.nodes[node_id]["skill"], "var": local}
                for node_id, f in g.frags.items() for local, u in f.local.items()}
        for node_id, f in g.frags.items():
            for var, us in f.fills.items():
                for u in us:
                    prov.setdefault(u.var, {"node": node_id, "skill": g.nodes[node_id]["skill"],
                                            "var": var, "unfilled": True})
        document, rels = _doc_graph(sent.index, relations[i] or [], graphs, g.modal)
        parts.append({"index": sent.index, "graph": graph, "align": align, "provenance": prov,
                      "added": [[sent.index, var, a] for var, a in added],
                      "relations": [{"group": grp, "a": a, "rel": rel, "b": b} for grp, a, rel, b in rels],
                      "document": document})
    return parts


def umr_blocks(annotation, parts):
    """Each sentence's block of the .umr file; the file is the blocks joined by newlines."""
    blocks = []
    for sent, part in zip(annotation.sents, parts):
        n = sent.index
        blocks.append("\n".join([
            "#" * 80,
            f"# meta-info :: sent_id = {annotation.doc_id}-s{n}",
            f"# :: snt{n}",
            *_index_words(sent.tokenized_text),
            "",
            "# sentence level graph:",
            part["graph"],
            "",
            "",
            "# alignment:",
            *(f"{var}: {a}" for var, a in part["align"]),
            "",
            "",
            "# document level annotation:",
            part["document"],
            "",
            "",
        ]))
    return blocks


# ------------------------------------------------------------------ alignments filled in

# concepts no word of the sentence is: they stay 0-0
ABSTRACT = re.compile(r"^(and|or|but|person|thing|name|sentence|have-.*-9\d|.*-9\d|date-entity|temporal-quantity|"
                      r"monetary-quantity|ordinal-entity|percentage-entity|.*-quantity|.*-entity|identity-91|"
                      r"consecutive|contrast-91|multi-sentence|empty)$")


def _fill_alignments(align, concepts, words, lang):
    """Give every variable aligned 0-0 whose concept is written in the sentence the position of
    those words (the first such place no other variable already has). Abstract concepts, names and
    entity types stay 0-0. `align` is changed in place; returns [(variable, "first-last")] added."""
    used = set()
    for _, a in align:
        lo, hi = (int(x) for x in a.split("-"))
        if lo:
            used.update(range(lo, hi + 1))
    added = []
    for k, (var, a) in enumerate(align):
        concept = concepts.get(var, "")
        lemma = re.sub(r"-\d+$", "", concept.strip('"'))
        if a != "0-0" or not lemma or ABSTRACT.match(concept):
            continue
        span = _find(words, lemma, used, lang)
        if span:
            used.update(range(span[0], span[1] + 1))
            align[k] = (var, "%d-%d" % span)
            added.append(align[k])
    return added


def _find(words, lemma, used, lang):
    """1-based (first, last) of the words that spell lemma (one word, or several run together in
    Chinese), preferring a place nobody has."""
    low = [w.lower() for w in words]
    target = lemma.lower()
    hits = []
    for a in range(len(words)):
        s = ""
        for b in range(a, min(len(words), a + 16)):
            s = s + low[b] if lang == "zh" else (s + " " + low[b]).strip()
            if s == target or (lang != "zh" and b == a and (_stem(low[a]) == _stem(target) or
                                                             (len(target) >= 4 and low[a].startswith(target)))):
                hits.append((a + 1, b + 1))
                break
            if not target.startswith(s.replace(" ", "-") if lang != "zh" else s) and s != target:
                break
    free = [h for h in hits if not any(k in used for k in range(h[0], h[1] + 1))]
    return (free or hits or [None])[0]


def _stem(w):
    for suf in ("ing", "ed", "es", "s", "e"):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            return w[:-len(suf)]
    return w


def _index_words(tokens):
    widths = [max(len(t), len(str(k + 1))) for k, t in enumerate(tokens)]
    index = " ".join(str(k + 1).ljust(w) for k, w in enumerate(widths))
    words = " ".join(t.ljust(w) for t, w in zip(tokens, widths))
    return [f"Index: {index}".rstrip(), f"Words: {words}".rstrip()]


def _doc_graph(n, relations, graphs, modal):
    """The document-level block of sentence n, and its relations [(group, source, relation,
    target)] as the block has them (without the root's fixed one). `modal` is the sentence's
    [(var, modal strength)]; see the module docstring for how it is merged with the modal
    relations."""
    def ref(x):
        """The variable a reference stands for, a constant as is, or None."""
        m = re.fullmatch(r"\s*(\d+)\s*:\s*([\d.]+B?)(?:/(\S+))?\s*", str(x))
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
        if (s_, rel, t) not in groups.setdefault(g, []):
            groups[g].append((s_, rel, t))
    lines, written = [f"(s{n}s0 / sentence"], []
    for g in DOC_GROUPS + sorted(set(groups) - set(DOC_GROUPS)):
        if g in groups:
            pad = " " * (len(f"{INDENT}:{g} ("))
            lines.append(f"{INDENT}:{g} (" + ("\n" + pad).join(f"({s_} :{rel} {t})" for s_, rel, t in groups[g]) + ")")
            written += [(g, s_, rel, t) for s_, rel, t in groups[g] if (g, s_) != ("modal", "root")]
    return "\n".join(lines) + ")", written


# ------------------------------------------------------------------ fragments

def step_of(nodes, name):
    """The step a node name stands for, in a sentence's {id: step}: "0.1" is step 0.1, else the
    sent_type leaf 0.1B."""
    name = str(name).strip()
    return nodes.get(name) or nodes.get(name + "B")


def fragment_of(x):
    """The fragment a step contributes, normalised to {nodes, edges, attrs, open, outside}, or
    None if it contributes none. Variable names are the skill's own."""
    o = x.get("output") if x.get("status") == "ok" else None
    if not isinstance(o, dict):
        return None
    skill = x["skill"]
    if skill == "discourse":
        rel = o.get("relation")
        return _single(rel) if rel not in (None, "", "none") else None
    if skill == TYPER and o.get("type") != "stop":
        return None
    if skill != TYPER and skill not in FRAGMENT_SKILLS:
        return None
    # a predicate's outside items are joined by their role, the others' stand for a var of the fragment
    frag = _normalise(o.get("graph"), o.get("open"), None if skill == "predicate" else o.get("outside"))
    if frag is None and skill == TYPER and x["input"].get("text"):
        frag = _single(x["input"]["text"])          # a leaf with no graph: the piece as written
    if frag is None:
        return None
    root = frag["nodes"][0]
    if root.get("span") is None:
        root["span"] = o.get("alignment") or (x["input"].get("span") if skill == TYPER else None)
    if skill == "predicate" and o.get("polarity") == "negative" \
            and not any(v == root["var"] and role == "polarity" for v, role, _ in frag["attrs"]):
        frag["attrs"].append((root["var"], "polarity", "-"))
    return frag


def same_nodes(steps):
    """{step id: the step it is one node with}: two steps that write the same concept over the same
    span (the later into the first that is not its ancestor). A step writes a concept when it is a
    predicate, np_phrase, special_entity or a sent_type leaf; its span is its input's."""
    parent = {x["id"]: x["parent"] for x in steps}

    def ancestors(node_id):
        out = set()
        while parent.get(node_id) is not None:
            node_id = parent[node_id]
            out.add(node_id)
        return out

    kept, out = {}, {}
    for x in sorted(steps, key=lambda x: _key(x["id"])):
        o = x.get("output") if x.get("status") == "ok" else None
        if not isinstance(o, dict) or not (x["skill"] in FRAGMENT_SKILLS or (x["skill"] == TYPER and o.get("type") == "stop")):
            continue
        g = (o.get("graph") or {}).get("nodes") or [] if isinstance(o.get("graph"), dict) else []
        span = (x.get("input") or {}).get("span")
        if not g or not isinstance(g[0], dict) or not span:
            continue
        key = (tuple(span), _concept(g[0].get("concept")))
        into = next((k for k in kept.get(key, []) if k not in ancestors(x["id"])), None)
        if into is not None:
            out[x["id"]] = into
        else:
            kept.setdefault(key, []).append(x["id"])
    return out


def _single(concept):
    return {"nodes": [{"var": "x", "concept": _concept(concept), "span": None}],
            "edges": [], "attrs": [], "open": {}, "outside": {}}


def _normalise(graph, open_items, outside_items=None):
    """{nodes, edges, attrs, open, outside} from a skill's graph, open list and outside list; None
    if there is no node. Only outside items with a var count."""
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
    bare = re.fullmatch(r"-?\d+(\.\d+)?|[-+]|[A-Za-z0-9_-]+", v) is not None   # web: 12306.cn is quoted
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

    def __init__(self, n, nodes):
        self.n = n
        self.nodes = {str(x["id"]): x for x in nodes}
        self.kids = {}
        for x in sorted(nodes, key=lambda x: _key(x["id"])):
            parent = None if x["parent"] is None else str(x["parent"])
            self.kids.setdefault(parent, []).append(x)
        self.merged = same_nodes(nodes)
        self.used = set()
        self.reserved = {str(nd.get("var")) for x in nodes for nd in ((fragment_of(x) or {}).get("nodes") or [])
                         if re.fullmatch(r"s%d[a-z]\w*" % n, str(nd.get("var", "")))}
        self.placed = set()         # tree nodes the walk put in the graph (not merged, not under a merge)
        self.align = []             # (var, "a-b") in creation order
        self.frags = {}             # tree node id -> _Frag
        self.roots = []             # heads with no fragment above them
        self.strength = []          # (_UNode, modal strength), taken out of the sentence graph
        self.modal = []             # (var, modal strength) of the nodes render() wrote
        self.concepts = {}          # var -> concept of the nodes render() wrote
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
            u = _UNode(self._var(nd["concept"], nd["var"]), nd["concept"], _align(nd.get("span")))
            local[nd["var"]] = u
            self.align.append((u.var, u.align))
        f = _Frag(local, local[frag["nodes"][0]["var"]], frag)
        self.frags[node_id] = f
        return f

    def head(self, node_id):
        """The _UNode a step stands for: its fragment's root, through a merge, or for a
        pass-through step its first child's head."""
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
        # its children, and the nodes its outside items name, in order: item k after child k
        below = [(_key(c["id"]), c, None) for c in self.kids.get(node_id, [])]
        o = x.get("output") if x.get("status") == "ok" else None
        items = [it for it in (o.get("outside") or [] if isinstance(o, dict) else []) if isinstance(it, dict)
                 and isinstance(it.get("node"), str)]
        below += [(_key(node_id) + (k, 2), None, it) for k, it in enumerate(items)]
        for _, c, item in sorted(below, key=lambda b: b[0]):
            edge = c.get("edge") if c else item.get("role") if x["skill"] == "predicate" else item.get("var")
            if edge is not None and ctx is not None and (str(edge) in ctx.frag["open"]
                                                         or str(edge) in ctx.frag["outside"]):
                child_link = ("slot", str(edge))
            elif edge is not None:
                child_link = ("role", _role(edge))
            else:
                child_link = link
            if c:
                self._walk(c, ctx, child_link)
                continue
            target = step_of(self.nodes, item["node"])
            if target is not None and target["status"] == "ok" and target["id"] != node_id:
                u = self.head(target["id"])       # through a merge: the node the target is one with
                if u:
                    self._connect(ctx, child_link, u)

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

    def _var(self, concept, prefer=None):
        if prefer in self.reserved and prefer not in self.used:
            self.used.add(prefer)
            return prefer
        head = next((ch for ch in concept.lower() if ch.isalpha() and ch.isascii()), "x")
        base = f"s{self.n}{head}"
        var, k = base, 1
        while var in self.used or var in self.reserved:
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
        x = step_of(self.nodes, node_id)
        if x is None:
            return None
        node_id = str(x["id"])
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
            if (y["skill"], _type(y), y["input"].get("span")) == \
                    (x["skill"], _type(x), x["input"].get("span")) and under_into(i):
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
            return EMPTY % self.n, []
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
            self.concepts[u.var] = u.concept
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


def _type(x):
    """A sent_type step's answer (None for any other step, or one with no output)."""
    o = x.get("output")
    return o.get("type") if isinstance(o, dict) and x.get("status") == "ok" else None


def _key(node_id):
    """Sort key of a step id: "0B" < "0" < "0.0B" < "0.0" < "0.1B"; "0.10" comes after "0.9". A
    part can end in B (a sent_type step: the step it decides on takes its number)."""
    out = []
    for p in str(node_id).split("."):
        m = re.match(r"^(\d+)(B?)$", p)
        out += [int(m.group(1)), 0 if m.group(2) else 1] if m else [1 << 30, 0]
    return tuple(out)


def _align(span):
    """A span [first, last] (1-based, both included) as gold writes it: "first-last"."""
    if isinstance(span, (list, tuple)) and len(span) == 2 and all(isinstance(s, int) for s in span) \
            and 1 <= span[0] <= span[1]:
        return f"{span[0]}-{span[1]}"
    return "0-0"
