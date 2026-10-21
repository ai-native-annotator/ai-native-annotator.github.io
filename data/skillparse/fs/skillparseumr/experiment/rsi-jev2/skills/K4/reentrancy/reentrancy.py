"""reentrancy (kind: rule): merge the nodes of one sentence's tree that are the same thing.

    run(tree, **context) -> {"merges": [{"node": "0.2.1", "into": "0.1"}, ...]}

Two kinds of merge, both into the node that comes first in id order:

1. Two UMR nodes of the **same type** with the **same span**: the later one is
   merged into the first. The type is the skill that made the node
   (predicate, np_phrase, special_entity), or `stop` for a sent_type leaf. A
   node is never merged into its own ancestor.
2. An `antecedent` node (a participant a skill found outside its own piece,
   e.g. the subject of *to leave* in *Pope wanted to leave*, or the owner of
   其同类) is merged into the first UMR node of any type that is not its
   ancestor and whose span is the antecedent's span; failing that, into the
   first such node whose **head** has that span (the skills are asked to give
   only the participant's head word): its `alignment`, or for a stop leaf the
   span of its first node; failing that (jevumr), into the smallest such node
   whose span contains the antecedent's (the antecedent is a head word, the
   node the whole phrase). If there is none, it stays unmerged and the output
   handler leaves it out.
3. Repeated named entities: a special_entity node (or stop leaf) whose graph
   is a name structure (first node :name a name node with :op parts) is keyed
   by (first concept, the name's op values in order). A later node with the
   same key, neither an ancestor nor a descendant of the first, is merged into
   the first: one entity named twice in a sentence is one node. Dates and
   quantities are never keyed. (Run before 2, so an antecedent that matches a
   merged duplicate goes to the kept node.) With MERGE_GENERIC, a stop or
   np_phrase leaf that is only a generic word for a company (公司, 该公司, 集团,
   该集团) is merged into the sentence's company-named entity when there is
   exactly one.

The output handler turns a merge into a reentrant edge to the kept node.
"""

CONCEPT_SKILLS = {"predicate", "np_phrase", "special_entity"}
NOT_NAMED = {"date-entity", "date-interval", "quantity", "ordinal-entity", "percentage-entity",
             "temporal-quantity", "monetary-quantity", "distance-quantity", "mass-quantity",
             "area-quantity", "volume-quantity", "temperature-quantity"}
GENERIC_ORG = {"公司", "该公司", "集团", "该集团"}
MERGE_GENERIC = True


def run(tree, **_):
    nodes = sorted(tree["nodes"], key=lambda n: _key(n["id"]))
    parent = {n["id"]: n["parent"] for n in nodes}

    def ancestors(i):
        out = set()
        while parent.get(i) is not None:
            i = parent[i]
            out.add(i)
        return out

    kept = {}                   # (type, span) -> ids kept for it, in order
    by_span = {}                # span -> UMR node ids of any type, in order
    by_head = {}                # head span -> UMR node ids of any type, in order
    merges = []
    for n in nodes:
        span = n["input"].get("span")
        kind = _type(n)
        if n["status"] != "ok" or not span or kind is None:
            continue
        span = tuple(span)
        into = next((k for k in kept.get((kind, span), []) if k not in ancestors(n["id"])), None)
        if into is None:
            kept.setdefault((kind, span), []).append(n["id"])
            by_span.setdefault(span, []).append(n["id"])
            head = _head_span(n)
            if head:
                by_head.setdefault(head, []).append(n["id"])
        else:
            merges.append({"node": n["id"], "into": into})

    # 3. the same name twice in the sentence: one node
    merged = {m["node"] for m in merges}
    redirect = {}               # merged duplicate -> the node kept for it
    first_named = {}            # name key -> id of the first node with it
    for n in nodes:
        if n["status"] != "ok" or _type(n) not in ("special_entity", "stop"):
            continue
        if merged & (ancestors(n["id"]) | {n["id"]}):
            continue
        key = _name_key(n)
        if key is None:
            continue
        into = first_named.get(key)
        if into is None:
            first_named[key] = n["id"]
        elif into not in ancestors(n["id"]) and n["id"] not in ancestors(into):
            merges.append({"node": n["id"], "into": into})
            redirect[n["id"]] = into
            merged.add(n["id"])
    if MERGE_GENERIC:
        companies = [i for k, i in first_named.items() if k[0] == "company"]
        if len(companies) == 1:
            into = companies[0]
            for n in nodes:
                if n["status"] != "ok" or _type(n) not in ("stop", "np_phrase") or not _generic_org(n):
                    continue
                if merged & (ancestors(n["id"]) | {n["id"]}):
                    continue
                if into in ancestors(n["id"]) or n["id"] in ancestors(into):
                    continue
                merges.append({"node": n["id"], "into": into})
                redirect[n["id"]] = into
                merged.add(n["id"])

    for n in nodes:
        span = n["input"].get("span")
        if n["skill"] != "antecedent" or n["status"] != "ok" or not span:
            continue
        span = tuple(span)
        into = next((k for k in by_span.get(span, []) + by_head.get(span, [])
                     if k not in ancestors(n["id"])), None)
        if into is None:
            around = [(s[1] - s[0], k) for s, ks in by_span.items() for k in ks
                      if s[0] <= span[0] and span[1] <= s[1] and k not in ancestors(n["id"])]
            into = min(around, key=lambda x: (x[0], _key(x[1])))[1] if around else None
        if into is not None:
            into = redirect.get(into, into)
            if into in ancestors(n["id"]):
                into = None
        if into is not None:
            merges.append({"node": n["id"], "into": into})
    return {"merges": merges}


def _type(n):
    if n["skill"] in CONCEPT_SKILLS:
        return n["skill"]
    if n["skill"] == "sent_type" and n.get("type") == "stop":
        return "stop"
    return None


def _name_key(n):
    """(first concept, op values in order) when the node's graph is a name
    structure, else None. Dates and quantities are never keyed."""
    g = n.get("graph") or {}
    gn = [x for x in g.get("nodes") or [] if isinstance(x, dict)]
    if not gn:
        return None
    head = gn[0]
    concept = str(head.get("concept", ""))
    if not concept or concept in NOT_NAMED:
        return None
    name_var = next((e[2] for e in g.get("edges") or []
                     if isinstance(e, (list, tuple)) and len(e) == 3
                     and e[0] == head.get("var") and e[1] == "name"), None)
    if name_var is None:
        return None
    ops = sorted((int(str(a[1])[2:]), str(a[2])) for a in g.get("attrs") or []
                 if isinstance(a, (list, tuple)) and len(a) == 3 and a[0] == name_var
                 and str(a[1]).startswith("op") and str(a[1])[2:].isdigit())
    if not ops:
        return None
    return (concept, tuple(v for _, v in ops))


def _generic_org(n):
    """A leaf that is only a generic word for a company (公司, 该公司, ...)."""
    text = str((n.get("input") or {}).get("text", "")).strip()
    if text in GENERIC_ORG:
        return True
    gn = (n.get("graph") or {}).get("nodes") or []
    first = gn[0] if gn and isinstance(gn[0], dict) else {}
    return str(first.get("concept", "")) in GENERIC_ORG and len(text) <= 3 and text.endswith(str(first.get("concept", "")))


def _head_span(n):
    """The span of a node's head word: its `alignment`, or for a stop leaf the
    span of the first node of its graph."""
    head = n.get("alignment")
    if not head and n["skill"] == "sent_type":
        nodes = (n.get("graph") or {}).get("nodes") or []
        head = nodes[0].get("span") if nodes and isinstance(nodes[0], dict) else None
    if isinstance(head, (list, tuple)) and len(head) == 2:
        return tuple(head)
    return None


def _key(node_id):
    return tuple(int(p) for p in str(node_id).split("."))
