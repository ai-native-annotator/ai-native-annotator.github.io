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

The output handler turns a merge into a reentrant edge to the kept node.
"""

CONCEPT_SKILLS = {"predicate", "np_phrase", "special_entity"}


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
            merges.append({"node": n["id"], "into": into})
    return {"merges": merges}


def _type(n):
    if n["skill"] in CONCEPT_SKILLS:
        return n["skill"]
    if n["skill"] == "sent_type" and n.get("type") == "stop":
        return "stop"
    return None


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
