"""apply_change (web): a rule of the right pane (registry user_panel). It applies the changes a person
picked from a local change to one sentence's graph, in order, and says what each did; the page
then makes the sentence's steps again from the new graph, down to the stop leaves.

The graph is penman, with each event's modal strength written as `:modstr` (the page puts it
there and takes it back into the predicate steps). Changes, each {"op", ...}:

    add_node         var (a new name), concept, span ([first, last] or null), parent, role
    delete_node      var: its edges and attributes go; what then hangs nowhere goes too
    rename_node      var, concept
    add_relation     source, role, target
    delete_relation  source, role, target
    set_attribute    var, attribute, value (null deletes it)

A role ending in -of is the inverse of the role without it, as penman reads it. A new node gets
the name s<index><first letter of its concept>[k], one the graph has not used (not even for a node
deleted by an earlier change). A change that cannot be
applied (a variable that is not there, the graph's top deleted) is left out and says why; the
others are applied.
"""
import re

import penman

OPS = ("add_node", "delete_node", "rename_node", "add_relation", "delete_relation", "set_attribute")
SYMBOL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.+\-]*$|^-$")


def _norm(source, role, target):
    """An edge as penman stores it: an inverse role (ARG0-of) is the plain role the other way."""
    role = str(role or "").strip().lstrip(":")
    if role.endswith("-of"):
        return (target, role[:-3], source)
    return (source, role, target)


def _value(v):
    """An attribute's value as penman writes it: a symbol or number as it is, else in quotes."""
    v = str(v).strip()
    if len(v) >= 2 and v[0] == v[-1] == '"':
        return v
    return v if SYMBOL.match(v) else '"%s"' % v.replace('"', '\\"')


def _bare(v):
    v = str(v)
    return v[1:-1] if len(v) >= 2 and v[0] == v[-1] == '"' else v


def run(graph, alignment, changes, index):
    g = penman.decode(graph)
    top = g.top
    concept = {v: str(c) for v, _, c in g.instances()}
    order = [v for v, _, _ in g.instances()]
    edges = [(s, r.lstrip(":"), t) for s, r, t in g.edges()]
    attrs = [(v, r.lstrip(":"), str(x)) for v, r, x in g.attributes()]
    align = {str(v): list(a) for v, a in (alignment or {}).items() if isinstance(a, (list, tuple)) and len(a) == 2}
    before = {"concept": dict(concept), "edges": list(edges), "attrs": list(attrs)}
    new_name = {}                   # the model's name of a new node -> its UMR variable
    applied, problems = [], []

    def var(v):
        v = str(v or "").strip()
        return new_name.get(v, v)

    def fresh(c):
        letter = next((ch.lower() for ch in str(c) if ch.isascii() and ch.isalpha()), "x")
        base = "s%s%s" % (index, letter)
        k, name = 1, base
        while name in order or name in align:     # never a name the graph had, even one deleted
            k += 1
            name = "%s%d" % (base, k)
        return name

    for k, ch in enumerate(changes or []):
        res = {"k": k, "op": (ch or {}).get("op"), "ok": False}
        try:
            op = ch.get("op")
            if op not in OPS:
                raise ValueError("unknown op %r" % op)
            if op == "add_node":
                parent, role, c = var(ch.get("parent")), str(ch.get("role") or "").lstrip(":"), str(ch.get("concept") or "").strip()
                if not c:
                    raise ValueError("a new node needs a concept")
                if parent not in concept:
                    raise ValueError("no node %s to hang it under" % parent)
                if not role:
                    raise ValueError("a new node needs a role from its parent")
                v = fresh(c)
                concept[v] = c
                order.append(v)
                edges.append(_norm(parent, role, v))
                span = ch.get("span")
                if isinstance(span, (list, tuple)) and len(span) == 2 and all(isinstance(x, int) for x in span):
                    align[v] = [int(span[0]), int(span[1])]
                if ch.get("var"):
                    new_name[str(ch["var"]).strip()] = v
                res["var"] = v
            elif op == "delete_node":
                v = var(ch.get("var"))
                if v not in concept:
                    raise ValueError("no node %s" % v)
                if v == top:
                    raise ValueError("%s is the top of the graph: change it instead" % v)
                del concept[v]
                edges = [e for e in edges if v not in (e[0], e[2])]
                attrs = [a for a in attrs if a[0] != v]
                align.pop(v, None)
            elif op == "rename_node":
                v, c = var(ch.get("var")), str(ch.get("concept") or "").strip()
                if v not in concept:
                    raise ValueError("no node %s" % v)
                if not c:
                    raise ValueError("no concept")
                concept[v] = c
            elif op in ("add_relation", "delete_relation"):
                e = _norm(var(ch.get("source")), ch.get("role"), var(ch.get("target")))
                for v in (e[0], e[2]):
                    if v not in concept:
                        raise ValueError("no node %s" % v)
                if not e[1]:
                    raise ValueError("no role")
                if op == "add_relation":
                    if e in edges:
                        raise ValueError("the graph already has it")
                    if e[0] == e[2]:
                        raise ValueError("an edge from a node to itself")
                    edges.append(e)
                else:
                    if e not in edges:
                        raise ValueError("the graph has no such edge")
                    edges.remove(e)
            elif op == "set_attribute":
                v, role = var(ch.get("var")), str(ch.get("attribute") or "").strip().lstrip(":")
                if v not in concept:
                    raise ValueError("no node %s" % v)
                if not role:
                    raise ValueError("no attribute")
                value = ch.get("value")
                kept = [a for a in attrs if not (a[0] == v and a[1] == role)]
                if value is None or str(value).strip() == "":
                    if len(kept) == len(attrs):
                        raise ValueError("%s has no %s" % (v, role))
                else:
                    pos = next((n for n, a in enumerate(attrs) if a[0] == v and a[1] == role), None)
                    kept.insert(pos if pos is not None else len(kept), (v, role, _value(value)))
                attrs = kept
            res["ok"] = True
        except Exception as err:
            res["why"] = str(err)
            problems.append("change %d (%s): %s" % (k + 1, res["op"], err))
        applied.append(res)

    # what no longer hangs from the top (through edges either way) is left out
    near = {}
    for s, _, t in edges:
        near.setdefault(s, set()).add(t)
        near.setdefault(t, set()).add(s)
    seen, todo = {top}, [top]
    while todo:
        for n in near.get(todo.pop(), ()):
            if n in concept and n not in seen:
                seen.add(n)
                todo.append(n)
    lost = [v for v in order if v in concept and v not in seen]
    for v in lost:
        problems.append("%s (%s) no longer hangs from the graph: left out" % (v, concept[v]))
        del concept[v]
        align.pop(v, None)
    edges = [e for e in edges if e[0] in concept and e[2] in concept]
    attrs = [a for a in attrs if a[0] in concept]

    triples = []
    for v in order:
        if v in concept:
            triples.append((v, ":instance", concept[v]))
            triples += [(a, ":" + r, x) for a, r, x in attrs if a == v]
            triples += [(s, ":" + r, t) for s, r, t in edges if s == v]
    out = penman.encode(penman.Graph(triples, top=top), indent=4)

    old_edges, new_edges = set(before["edges"]), set(edges)
    old_attrs = {(a, r): x for a, r, x in before["attrs"]}
    new_attrs = {(a, r): x for a, r, x in attrs}
    marks = {
        "added_nodes": [v for v in order if v in concept and v not in before["concept"]],
        "deleted_nodes": [v for v in before["concept"] if v not in concept],
        "renamed": {v: [before["concept"][v], concept[v]] for v in concept
                    if v in before["concept"] and before["concept"][v] != concept[v]},
        "added_edges": [list(e) for e in edges if e not in old_edges],
        "deleted_edges": [list(e) for e in before["edges"] if e not in new_edges],
        "attrs": [{"var": a, "role": r, "old": _bare(old_attrs[(a, r)]) if (a, r) in old_attrs else None,
                   "new": _bare(new_attrs[(a, r)]) if (a, r) in new_attrs else None}
                  for (a, r) in list(old_attrs) + [k for k in new_attrs if k not in old_attrs]
                  if old_attrs.get((a, r)) != new_attrs.get((a, r))],
        "new_names": new_name,
    }
    return {"graph": out, "alignment": {v: align[v] for v in concept if v in align},
            "applied": applied, "marks": marks, "problems": problems}
