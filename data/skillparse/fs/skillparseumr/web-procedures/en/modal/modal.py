"""modal (kind: rule): the modal dependencies of one sentence, made by rule, no model (web).

The input is the document wave's `sentences` (sp_bridge.py's RegistryEngine._table), the current
sentence last. Every event a predicate step annotated with a modal strength (its modstr) is
someone's view:

  - the author's: (author :<modstr> <event>), which the output handler already writes for every
    event with a modstr (with (root :modal author)), so this rule writes nothing for it;
  - when the predicate step gave a reporting verb as its outside `quote`, the conceiver's, the
    ARG0 of that verb (its row's "conceiver"): (author :full-affirmative <conceiver>) and
    (<conceiver> :<modstr> <event>); the handler then writes no author link for the event.

A node without a modstr (an entity, an event built inside a noun phrase) gets no modal relation.
"""


def run(sentences=None, **_):
    tables = sentences or []
    if not tables:
        return {"relations": []}
    out, seen = [], set()

    def add(source, relation, target):
        if (source, relation, target) not in seen:
            seen.add((source, relation, target))
            out.append({"group": "modal", "source": source, "relation": relation, "target": target})

    for r in tables[-1].get("nodes") or []:
        node, who = r.get("node"), r.get("conceiver")
        if node and r.get("modstr") and who and who != node:
            add("author", "full-affirmative", who)
            add(who, r["modstr"], node)
    return {"relations": out}
