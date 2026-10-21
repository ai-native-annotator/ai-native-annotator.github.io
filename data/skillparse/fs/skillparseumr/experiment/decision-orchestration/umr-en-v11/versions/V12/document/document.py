"""document (kind: jev): temporal, modal and coreference relations of one sentence.

The trees of this sentence and the five before it list every event (a
predicate node) and entity (np_phrase, special_entity, stop leaf). Two rounds:

  1. time_<e>   per event of this sentence, choice: before / overlap / after
                its anchor. The anchor is, as in the gold, mostly another
                event: the nearest event above it in the tree; for an event
                with nothing above it, the event before it at the top of this
                sentence; for the first one, the time of writing. An event whose
                own clause has a date is anchored to that date, unasked.
     view_<e>   per event under another event, choice: whose view presents it,
                the author's or one of the sentence's entities';
     coref_<m>  per entity or event of this sentence, choice: the same one as an
                entity or event of the earlier sentences, or new.
  2. same_<m>   per coreference picked in round 1, noul: the very same thing,
                not merely a related one? Only a yes is kept.
Rule: (anchor <label> event); (dct before date) and (date overlap event); a
conceiver other than the author, when Jev is sure of it, gives (conceiver
<modstr> event) and (author full-affirmative conceiver); a kept coreference
gives (earlier same-entity / same-event current).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import jevlib as J  # noqa: E402
from prompt_loader import load_prompts  # noqa: E402

PROMPTS = load_prompts(__file__)

DCT = "document-creation-time"
TIME = PROMPTS["tables"]["TIME"]
DCT_TIME = PROMPTS["tables"]["DCT_TIME"]
DCT_ANCHOR = PROMPTS["instructions"]["DCT_ANCHOR"]
ENTITY_SKILLS = {"np_phrase", "special_entity"}
NOT_COREF = ("date-entity", "quantity", "ordinal-entity", "percentage-entity")
# bare adverbs, partitives and determiners that a tree may leave as their own node: never a mention
NON_REFERRING = {"也", "都", "还", "最", "其中", "之中", "中", "等", "这些", "那些", "该", "某些"}
# relation frames that state a property or identity: no place of their own on the timeline
STATIVE = ("identity-91", "have-mod-91", "have-rel-role-91", "have-org-role-91")
VIEW_SURE = 0.7
COREF_SURE = 0.4
VIEW_Q = (PROMPTS["instructions"]["VIEW_Q"])
VIEW_AUTHOR = (PROMPTS["instructions"]["VIEW_AUTHOR"])
VIEW_HOLDER = "`event` is part of what this entity says, claims or reports"
CLAIMED_Q = (PROMPTS["instructions"]["CLAIMED_Q"])
CLAIMED = PROMPTS["tables"]["CLAIMED"]
COREF_ENTITY_Q = (PROMPTS["instructions"]["COREF_ENTITY_Q"])
COREF_EVENT_Q = (PROMPTS["instructions"]["COREF_EVENT_Q"])
SAME_ENTITY_Q = (PROMPTS["instructions"]["SAME_ENTITY_Q"])
SAME_ENTITY = PROMPTS["tables"]["SAME_ENTITY"]
SAME_EVENT_Q = (PROMPTS["instructions"]["SAME_EVENT_Q"])
SAME_EVENT = PROMPTS["tables"]["SAME_EVENT"]


def run(sents, trees, lang, **_):
    tables = [_table(s, t) for s, t in zip(sents, trees)]
    if not tables:
        return {"relations": []}
    cur = tables[-1]
    st = {"sentences": "\n".join(f"[{t['index']}] {t['text']}" for t in tables),
          "current_sentence": f"[{cur['index']}] {cur['text']}",
          "language": "Chinese" if lang == "zh" else "English"}

    relations, q = [], {}
    events = [x for x in cur["nodes"] if x["kind"] == "event"]
    entities = [x for x in cur["nodes"] if x["kind"] == "entity"]
    mentions = [x for x in cur["nodes"] if _coref_ok(x)]
    earlier = [x for t in tables[:-1] for x in t["nodes"] if _coref_ok(x)]
    anchors = {}
    dated = set()
    top_before = None
    stative = [any(c in e["concept"] for c in STATIVE) for e in events]
    if stative and all(stative):
        stative[0] = False      # a sentence that only states a property still gets one time
    position = {x["id"]: k for k, x in enumerate(events)}
    holders = [x for x in entities
               if not ("-" in x["concept"] and x["concept"].rsplit("-", 1)[1].isdigit())
               and not any(c in x["concept"] for c in NOT_COREF)]
    for k, e in enumerate(events):
        date = _date_of(e, cur)
        if date:
            relations += [_rel("temporal", DCT, "before", date["ref"]),
                          _rel("temporal", date["ref"], "overlap", e["ref"])]
            dated.add(k)
        up = position.get(e["event_above"])
        if up is not None:
            anchors[k] = anchors.get(up) if stative[up] else events[up]
        else:
            anchors[k] = top_before
            if not e["event_above"] and not stative[k]:
                top_before = e
        if k in dated:
            continue
        a = anchors[k]
        if not stative[k]:
            ask = PROMPTS["instructions"]["temporal_question_base"]
            if a is None:
                ask += PROMPTS["instructions"]["temporal_question_context"]
            q[f"time_{k}"] = {"type": "choice",
                              "instructions": {"question": ask, "event": e["label"],
                                               "anchor": a["label"] if a else DCT_ANCHOR},
                              "criteria": DCT_TIME if a is None else TIME}
        if e["event_above"] and holders:
            q[f"view_{k}"] = {"type": "choice",
                              "instructions": {"question": VIEW_Q, "event": e["label"]},
                              "criteria": {"author": VIEW_AUTHOR,
                                           **{x["label"]: VIEW_HOLDER for x in holders[:250]}}}
    if earlier:
        for k, m in enumerate(mentions):
            pool = [y for y in earlier if y["kind"] == m["kind"]][-250:]
            if pool:
                q[f"coref_{k}"] = {"type": "choice",
                                   "instructions": {"question": COREF_EVENT_Q if m["kind"] == "event"
                                                    else COREF_ENTITY_Q,
                                                    "mention": m["label"]},
                                   "criteria": {"new": None, **{y["label"]: None for y in pool}}}
    a = yield {"state": st, "questions": q}

    by_label = {x["label"]: x for x in cur["nodes"] + earlier}
    picks = {}
    for k, m in enumerate(mentions):
        answer = a.get(f"coref_{k}")
        pick = J.choice(answer)
        if pick and pick != "new" and pick in by_label and by_label[pick]["kind"] == m["kind"] \
                and J.probability(answer, pick) >= COREF_SURE:
            picks[k] = by_label[pick]
    check = {}
    for k, y in picks.items():
        event = mentions[k]["kind"] == "event"
        check[f"same_{k}"] = {"type": "noul",
                              "instructions": {"question": SAME_EVENT_Q if event else SAME_ENTITY_Q,
                                               "first": y["label"], "second": mentions[k]["label"]},
                              "criteria": SAME_EVENT if event else SAME_ENTITY}
        if not event:
            check[f"occurrence_{k}"] = {
                "type": "noul",
                "instructions": {"question": PROMPTS["instructions"]["question_9"],
                                 "first": y["label"], "second": mentions[k]["label"]},
                "criteria": PROMPTS["tables"]["inline_options_6"]}
    views = {}
    for k, e in enumerate(events):
        view = a.get(f"view_{k}")
        pick = J.choice(view)
        if pick and pick != "author" and pick in by_label and J.probability(view, pick) >= VIEW_SURE:
            views[k] = by_label[pick]
            check[f"claimed_{k}"] = {"type": "noul",
                                     "instructions": {"question": CLAIMED_Q, "event": e["label"],
                                                      "conceiver": pick},
                                     "criteria": CLAIMED}
    b = yield {"state": st, "questions": check}

    conceivers = set()
    for k, e in enumerate(events):
        if f"time_{k}" in a:
            anchor = anchors[k]["ref"] if anchors[k] else DCT
            relations.append(_rel("temporal", anchor, J.choice(a[f"time_{k}"]), e["ref"]))
        if k in views and J.yes(b.get(f"claimed_{k}")):
            # the conceiver is kept only for its own claim; otherwise the event stays with the author
            who = views[k]["ref"]
            strength = e["modstr"] or "full-affirmative"
            relations.append(_rel("modal", who, strength, e["ref"]))
            if who not in conceivers:
                conceivers.add(who)
                relations.append(_rel("modal", "author", "full-affirmative", who))
    for k, y in picks.items():
        if J.yes(b.get(f"same_{k}")):
            event = mentions[k]["kind"] == "event" or J.yes(b.get(f"occurrence_{k}"))
            kind = "same-event" if event else "same-entity"
            relations.append(_rel("coref", y["ref"], kind, mentions[k]["ref"]))
    return {"relations": relations}


def _rel(group, source, relation, target):
    return {"group": group, "source": source, "relation": relation, "target": target}


def _coref_ok(x):
    if x["kind"] not in ("entity", "event") or any(c in x["concept"] for c in NOT_COREF):
        return False
    if x["concept"].endswith("-91") or x["concept"] == "implicit-predicate":
        return False    # relation frames state something about entities; they are not retold occurrences
    if x["concept"] == "name":
        return False    # the :name part of an entity; the entity that bears the name is the mention
    words = str((x["node"].get("input") or {}).get("text", "")).strip()
    determiners = ("此", "此一", "这一", "那一", "这种", "那种", "这类", "此类", "这起", "这个", "那个")
    return words not in NON_REFERRING and words not in determiners and words not in J.FUNCTION_ZH


def _table(sent, tree):
    """The events and entities of one sentence's tree, with how to refer to them."""
    index = sent["index"] if isinstance(sent, dict) else sent.index
    text = sent["text"] if isinstance(sent, dict) else sent.text
    root = (tree or {}).get("nodes") or [{}]
    nodes = (root[0].get("input") or {}).get("tree", {}).get("nodes", [])
    merged = {m["node"] for m in root[0].get("merges") or []}
    by_id = {x["id"]: x for x in nodes}
    out = []
    for x in nodes:
        if x.get("status") != "ok" or _under(x["id"], merged):
            continue
        first = ((x.get("graph") or {}).get("nodes") or [{}])[0]
        if x["skill"] == "predicate":
            kind = "event"
        elif x["skill"] in ENTITY_SKILLS or (x["skill"] == "sent_type" and x.get("type") == "stop"):
            kind = "entity"
        else:
            continue
        concept = str(first.get("concept", ""))
        words = x["input"].get("text", "")
        out.append({"id": x["id"], "ref": f"{index}:{x['id']}", "kind": kind, "concept": concept,
                    "label": f"[{index}:{x['id']}] {words} ({concept})", "node": x,
                    "modstr": x.get("modstr"), "event_above": _event_above(x, by_id)})
    return {"index": index, "text": text, "nodes": out, "by_id": by_id}


def _under(node_id, merged):
    return any(node_id == m or node_id.startswith(m + ".") for m in merged)


def _event_above(x, by_id):
    """The id of the nearest predicate node above x, or None."""
    p = by_id.get(x.get("parent"))
    while p:
        if p["skill"] == "predicate":
            return p["id"]
        p = by_id.get(p.get("parent"))
    return None


def _date_of(e, table):
    """The date-entity filling the event's time / temporal role, if any."""
    node = e["node"]
    roles = {v: r for _, r, v in (node.get("graph") or {}).get("edges") or [] if r in ("time", "temporal")}
    for child in table["by_id"].values():
        if child.get("parent") != node["id"] or child.get("edge") not in roles:
            continue
        frag = _fragment_below(child, table["by_id"])
        if frag and ((frag.get("graph") or {}).get("nodes") or [{}])[0].get("concept") == "date-entity":
            return next((x for x in table["nodes"] if x["id"] == frag["id"]), None)
    return None


def _fragment_below(x, by_id):
    """The first node at or below x that has a fragment of its own."""
    while x and x["skill"] == "sent_type" and x.get("type") != "stop":
        x = next((c for c in by_id.values() if c.get("parent") == x["id"]), None)
    if x and x.get("status") == "ok" and x["skill"] in ("special_entity", "np_phrase", "predicate", "sent_type"):
        return x
    return None
