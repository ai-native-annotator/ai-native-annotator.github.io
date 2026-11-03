"""modal (kind: rule): the modal dependencies of one sentence, made by rule, no model (web).

The input is the document wave's `sentences` (sp_bridge.py's RegistryEngine._table), the current
sentence last. The output handler already writes (root :modal author) and, for every event with
a modal strength (a predicate's modstr), (author :<modstr> <event>) unless the event has another
modal parent. This rule adds what the strengths alone do not say:

  - reported content: an event whose predicate step gave a reporting verb as its outside `quote`
    is the view of that verb's ARG0, the conceiver (its row's "conceiver"):
    (author :full-affirmative <conceiver>) and (<conceiver> :<modstr> <event>);
  - an event built inside a noun phrase (a concept with a sense, kind "event (nominal)") has no
    modstr: (author :full-affirmative <event>), or :full-negative when it is negated. An
    identity-91, which only joins an apposition, gets none.
"""
NO_MODAL = {"identity-91"}


def run(sentences=None, **_):
    tables = sentences or []
    if not tables:
        return {"relations": []}
    rows = tables[-1].get("nodes") or []
    out, seen = [], set()

    def add(source, relation, target):
        key = (source, relation, target)
        if key not in seen:
            seen.add(key)
            out.append({"group": "modal", "source": source, "relation": relation, "target": target})

    for r in rows:
        kind, node = str(r.get("kind") or ""), r.get("node")
        if not node or not kind.startswith("event"):
            continue
        if r.get("conceiver") and r["conceiver"] != node:
            add("author", "full-affirmative", r["conceiver"])
            add(r["conceiver"], r.get("modstr") or "full-affirmative", node)
        elif kind.startswith("event (nominal)") and r.get("concept") not in NO_MODAL:
            add("author", "full-negative" if "negative" in kind else "full-affirmative", node)
    return {"relations": out}
