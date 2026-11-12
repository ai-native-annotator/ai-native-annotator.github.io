"""modal (kind: rule): the modal dependencies of one sentence, made by rule, no model (web).

The rules of the UMR annotation tool (umr-tool.cs.brandeis.edu; jinzhao3611/umr-annotation-tool,
umr_annot_tool/resources/utility_modules/modal_converter.py, after "UMR Simplified Modal
Annotation to Modal Dependency Structure"), read off the events' modal strength (a predicate's
modstr) and roles instead of a finished sentence graph. E, M, S, C are events; their strengths
E', M', S', C' (unspecified when an event has none):

  1. an event with a strength and nothing below: (author :E' E). The output handler writes this
     one itself, with (root :modal author), for every event no other conceiver has.
  2. E :modal-predicate M: (author :E' X) (X :full-affirmative M) (M :unspecified E), X the
     conceiver: the ARG0 / actor / experiencer / causer of the modal verb M (the tool takes E's,
     which gives Pope, not the charger, for the guidelines' "Pope ... charged with spying").
  3. E :quote S (E is reported by the speech event S): (author :S' S) (author :S' X) (X :E' E),
     X the speaker, S's ARG0 / actor / experiencer / causer.
  4. M :purpose E: (author :M' M), and (author :E' X) (X :partial-affirmative purpose) with X
     M's conceiver, or (author :partial-affirmative purpose); then (purpose :full-affirmative E).
  5. M :condition C: (author :neutral-affirmative have-condition) (have-condition :C' C)
     (have-condition :M' M).

When rule 2 or 3 finds no conceiver, the tool falls back to the author; the guidelines (Part
1, "Pope ... was charged with spying") introduce a null conceiver instead: so does this rule,
as `null-conceiver` (the tool's own name for one). A node without a strength (an entity, an
event inside a noun phrase, an apposition's identity-91) gets nothing.

Input: the document wave's `sentences` (sp_bridge.py's RegistryEngine._table), the current
sentence last; a predicate's row has "modstr" and "roles" ({role: node}).
"""
AGENTS = ("ARG0", "actor", "experiencer", "causer")
NULL = "null-conceiver"


def run(sentences=None, **_):
    tables = sentences or []
    if not tables:
        return {"relations": []}
    rows = [r for r in tables[-1].get("nodes") or [] if r.get("node")]
    by = {r["node"]: r for r in rows}
    out, seen, handled = [], set(), set()

    def strength(node):
        return (by.get(node) or {}).get("modstr") or "unspecified"

    def conceiver(node):
        roles = (by.get(node) or {}).get("roles") or {}
        return next((roles[k] for k in AGENTS if roles.get(k)), None)

    def add(source, relation, target):
        if (source, relation, target) not in seen:
            seen.add((source, relation, target))
            out.append({"group": "modal", "source": source, "relation": relation, "target": target})

    events = [r for r in rows if r.get("modstr") or r.get("roles")]
    for r in events:                                        # 2. modal predicate
        e, m = r["node"], (r.get("roles") or {}).get("modal-predicate") or (r.get("roles") or {}).get("modpred")
        if not m:
            continue
        handled |= {e, m}
        x = conceiver(m) or NULL
        add("author", strength(e), x)
        add(x, "full-affirmative", m)
        add(m, "unspecified", e)
    for r in events:                                        # 3. quote
        e, s = r["node"], (r.get("roles") or {}).get("quote")
        if not s:
            continue
        handled |= {e, s}
        x = conceiver(s) or NULL
        add("author", strength(s), s)
        add("author", strength(s), x)
        add(x, strength(e), e)
    for r in events:                                        # 4. purpose
        m, e = r["node"], (r.get("roles") or {}).get("purpose")
        if not e or (m in handled and e in handled):
            continue
        handled |= {m, e}
        add("author", strength(m), m)
        x = conceiver(m)
        if x:
            add("author", strength(e), x)
            add(x, "partial-affirmative", "purpose")
        else:
            add("author", "partial-affirmative", "purpose")
        add("purpose", "full-affirmative", e)
    for r in events:                                        # 5. condition
        m, c = r["node"], (r.get("roles") or {}).get("condition")
        if not c or (m in handled and c in handled):
            continue
        handled |= {m, c}
        add("author", "neutral-affirmative", "have-condition")
        add("have-condition", strength(c), c)
        add("have-condition", strength(m), m)
    return {"relations": out}
