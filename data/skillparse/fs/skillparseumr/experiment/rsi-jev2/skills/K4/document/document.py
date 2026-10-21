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
Rule: (anchor <label> event). An event whose time / temporal role holds a time expression is anchored
to it, unasked: (dct before date) and (date contained event); a relative past word (此前, 以前) gives
(past-reference depends-on timex) and (timex overlap event); another time word or frame (前, 后, 来,
时) gives (timex contained event). A date fronted as the first operand of a discourse node anchors
the first top event when it has none of its own. A
conceiver other than the author, when Jev is sure of it, gives (conceiver
<modstr> event) and (author full-affirmative conceiver); a kept coreference
gives (earlier same-entity / same-event current).
"""
import os
import sys

import jieba

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import jevlib as J  # noqa: E402

DCT = "document-creation-time"
TIME = {"before": "`event` happened before `anchor`. Choose this when (1) `anchor` says, reports, claims, "
                  "announces, shows, implies, suspects, investigates or tries to determine `event`, and `event` "
                  "is an act or happening that had already taken place by then (X表示 + someone was hurt; a "
                  "trace 显示/暗示 + how something was hidden or done; 怀疑/确定 + what someone planned or did), "
                  "even with no past marker; (2) `event` is the cause of `anchor`: the act that is the subject "
                  "of a verb of affecting (a remark that angered someone: the remark is before the anger), or "
                  "the happening in which `anchor` came about (hurt in a fire: the fire is before the hurt); "
                  "(3) a report or story that `anchor` retells; what `anchor` went through (历经, 经过); 曾, 已, "
                  "以前, 'had' on `event` itself (已 on `anchor` says nothing about `event`).",
        "overlap": "`event` and `anchor` share their time: one holds while the other happens. This is the "
                   "answer whenever no word orders them: what `anchor` acts on, decides, holds, cancels, avoids "
                   "or keeps up (取消X, 避免X, 举办X), but never what `anchor` orders, demands, forbids or "
                   "recommends (that is after); the state named as "
                   "the object of a causative `anchor` (引起X, 让X, 使X); a STATE that `anchor` says, shows, sees "
                   "or learns (X说 + 'is', learning that someone is safe); the means or purpose carried out by "
                   "doing `anchor` (以X表达); an event that only describes a participant of `anchor` inside a "
                   "noun phrase (所V的N, V的N) unless it is marked as earlier; a ...时 or 在...的同时 clause; two "
                   "acts of one operation or occasion joined by 并, 且, 还, 和 or a comma, even when one is told "
                   "first. Logical order (deciding before doing, causing before resulting) is not time order. "
                   "When unsure, choose this.",
        "after": "`event` happened after `anchor`. Choose this when `event` is what `anchor` orders, demands, "
                 "asks, forbids, refuses, recommends, plans or says should or must be done (要求X做Y, 禁止X, "
                 "拒绝X, 号召, 呼吁, 应当/应该/要/需要 + Y, 计划, 打算): the demanded, forbidden or recommended "
                 "act would come later, so answer after even with no time word. Also when a word says so "
                 "(然后, 后来, 随后, 之后, "
                 "...后, 再, 接着, 'then', 'later'); when `event` is a separate happening that results from "
                 "`anchor` and `anchor` is the cause itself (the deaths, injuries or damage after an explosion "
                 "or a crash, each of several results listed after 致使, 导致, 造成); a feeling, reply or protest "
                 "that reacts to `anchor`; a separate plan for a later time (将, 会); a purpose reached only "
                 "later (为了 + a later goal)."}
DCT_TIME = {"before": "`event` already happened or held when the text was written. Choose this for everything "
                      "the text narrates or reports about the past, even when Chinese uses no past marker: "
                      "what a publication or a person did, contained, was like or was called; what someone "
                      "said, claimed, quoted or reported; how something was judged; states of a thing that "
                      "has stopped or no longer exists.",
            "overlap": "`event` still holds at the time of writing. Only when the text marks it as current "
                       "(目前, 现在, 仍, 至今, 依然, 'still', 'now') or states a general truth that is plainly "
                       "still true.",
            "after": "`event` is still to come at the time of writing (将, 会, 即将, 'will')."}
DCT_ANCHOR = "the time the text was written"
ENTITY_SKILLS = {"np_phrase", "special_entity"}
NOT_COREF = ("date-entity", "quantity", "ordinal-entity", "percentage-entity")
# bare adverbs, partitives and determiners that a tree may leave as their own node: never a mention
NON_REFERRING = {"也", "都", "还", "最", "其中", "之中", "中", "等", "这些", "那些", "该", "某些"}
# relation frames that state a property or identity: no place of their own on the timeline
STATIVE = ("identity-91", "have-mod-91", "have-rel-role-91", "have-org-role-91")
VIEW_SURE = 0.7
COREF_SURE = 0.4

# verbs whose complement event is conceived by the one who issues them (the verb's ARG0)
ISSUE_VERBS = {"要求", "命令", "指示", "规定", "号召", "呼吁", "敦促", "责令", "强调", "计划", "决定", "打算",
               "主张", "建议", "请求", "督促", "部署"}
ISSUE_NEG = {"禁止", "拒绝", "反对", "阻止", "严禁", "抵制"}
# a standalone word right before the verb that makes the event something required or intended
MODAL_WORDS = {"要", "应", "应当", "需要", "须"}
ISSUER_Q = ("In `current_sentence`, who orders, demands, forbids, refuses or plans `event` (through `directive` "
            "or a word like 要, 应当, 需要)? Choose the person, group or organization that issues the demand, "
            "ban, refusal or plan: the one who would say it, not the one who must carry it out. When an "
            "organization issues it through a document, choose the organization, not the document. Answer "
            "`none` if no entity of the sentence issues it.")
DATE_REL = "contained"
TIMEX_ANCHOR = True
# time words and frames that anchor the event they modify (timex contained event)
TIMEX_HEADS = {"前", "后", "以前", "以后", "之前", "之后", "时", "来", "期间"}
TIMEX_ENDS = ("前", "后", "来", "间")
# relative past words: (past-reference depends-on timex) and (timex overlap event)
RELATIVE_PAST = {"此前", "之前", "以前", "过去", "先前", "近年", "近年来", "早前"}# verbs whose complement event (what is ordered, forbidden, recommended or planned) lies after them
DIRECTIVE = {"要求", "禁止", "拒绝", "命令", "规定", "呼吁", "号召", "建议", "计划", "打算", "希望", "要",
             "应当", "应该", "需要", "允许", "准许"}
DIRECTIVE_AFTER_RULE = True
VIEW_Q = ("In `current_sentence`, whose view presents `event`? Answer an entity X only if `event` is part of "
          "the CONTENT of what X says, claims, reports or quotes: it sits inside a clause introduced by X说, "
          "X称, X声称, X表示, X宣称, 据X(所言, 报导), X引用报导, and X is the one who says it. Answer author "
          "in every other case: (a) the verb of saying, reporting, quoting or being interviewed itself is the "
          "writer's own statement; (b) what X does, can do, must do or keeps doing is the writer's statement, "
          "not X's view; (c) a headline, title, photo, article, device or satellite never holds a view, nor "
          "does a news item, message, rumour, source of news, report, statement or piece of intelligence "
          "(消息, 报道, 情报, 声明): answer author; (d) when X reports that Y did something, choose X (the "
          "one who says), never Y (the one who acted).")
VIEW_AUTHOR = ("the writer asserts it directly: every verb of saying or reporting itself, and every action, "
               "ability or state of a participant")
VIEW_HOLDER = "`event` is part of what this entity says, claims or reports"
CLAIMED_Q = ("In `current_sentence`, is `event` `conceiver`'s own claim, opinion, judgment or allegation: "
             "something `conceiver` asserts, judges, alleges or is said or rumoured to hold (称, 声称, 宣称, "
             "认为, 据传, 指, 据X报导, X引用报导), without the writer vouching for it? Answer no when `event` "
             "is what `conceiver` decides, plans, promises, offers or announces it will do (宣布, 声明, 决定, "
             "表示愿意 + its own coming action); when `conceiver` tells, recalls or reports a plain fact "
             "(告诉, 回忆); when `event` is the act of saying itself; when `conceiver` is not a person or an "
             "organization.")
CLAIMED = {"true": "the conceiver's own claim, judgment or allegation, not vouched for by the writer",
           "false": "an announced decision, plan or offer of the conceiver, a plain fact the writer relays, "
                    "or the act of saying itself"}
COREF_ENTITY_Q = ("Is `mention` of `current_sentence` the very same particular thing as one mentioned in an "
                  "earlier sentence (a pronoun's antecedent, a repeated or shortened name, 该X, 此X or 'the X' "
                  "pointing back)? If it is mentioned several times earlier, pick its most recent mention. "
                  "Answer `new` for: a related thing (its part or component, its end, its place, a member, "
                  "the set it belongs to); a noun used in a general or kind sense (news in general, content in "
                  "general, a source of news); a noun used as a modifier or inside a name or title; what "
                  "something is called, judged to be or becomes (in 'X is called Y' or 'X is Y', Y is a "
                  "description, not a mention); the same kind of measure or amount at another time or place; "
                  "a word inside a fixed expression that refers to nothing; an act rather than a thing (a "
                  "report is not the text it produces).")
COREF_EVENT_Q = ("Does `mention` of `current_sentence` tell again the very same single occurrence that an "
                 "earlier sentence already told: the same act by the same participants at the same time, only "
                 "described again (the verb repeated, a synonym, a shorter form, or a noun naming that act)? "
                 "A different act that involves the same thing is `new`: building a bridge vs crossing it, "
                 "writing a letter vs reading or copying it, publishing a story vs what the story says, taking "
                 "a picture vs showing it, one finding vs another finding on another occasion, a state vs an "
                 "act. If in doubt, answer `new`.")
SAME_ENTITY_Q = ("Do `first` and `second` refer to one and the same particular person, thing or group (the "
                 "number in brackets is the sentence in `sentences`)? Answer yes when `second` is a shortened or "
                 "pointing-back way of naming `first`: a demonstrative + head noun (该X, 此X, 这个X, 'the X', "
                 "'this X'), a pronoun (它, 他们, 'they') standing for an organization or publication, a "
                 "repeated or shortened name. Answer no for a part, a member, a place, a result, the set "
                 "something belongs to, a general or kind use of a noun, a description of what something is "
                 "called or is, the same kind of amount at another time, or another thing of the same kind.")
SAME_ENTITY = {"true": "both point to one particular individual",
               "false": "one is generic, a kind, a description, a part, a set, another time's value, or the "
                        "two are only similar"}
SAME_EVENT_Q = ("Are `first` and `second` one and the same occurrence (same act, same doer, same time) told "
                "twice, and not two different acts that concern the same thing, or two acts of the same kind? "
                "The number in brackets is the sentence in `sentences`.")
SAME_EVENT = {"true": "one occurrence told twice",
              "false": "different acts, even if they share a participant or a topic"}


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
    directed = set()
    placed = set()
    first_top = True
    top_before = None
    stative = [any(c in e["concept"] for c in STATIVE) for e in events]
    if stative and all(stative):
        stative[0] = False      # a sentence that only states a property still gets one time
    position = {x["id"]: k for k, x in enumerate(events)}
    holders = [x for x in entities
               if not ("-" in x["concept"] and x["concept"].rsplit("-", 1)[1].isdigit())
               and not any(c in x["concept"] for c in NOT_COREF)]
    issued = {}     # event index -> True when the issuer forbids or refuses it
    issuers = {}    # event index -> the entity that orders, forbids or plans it
    for k, e in enumerate(events):
        tx = _timex_of(e, cur)
        if not e["event_above"]:
            if TIMEX_ANCHOR and not tx and first_top:
                tx = _lead_date(cur)
            first_top = False
        if tx:
            if tx["ref"] not in placed:
                placed.add(tx["ref"])
                if tx["kind"] == "date":
                    relations.append(_rel("temporal", DCT, "before", tx["ref"]))
                elif tx["kind"] == "past":
                    relations.append(_rel("temporal", "past-reference", "depends-on", tx["ref"]))
            label = DATE_REL if tx["kind"] == "date" else "overlap" if tx["kind"] == "past" else "contained"
            relations.append(_rel("temporal", tx["ref"], label, e["ref"]))
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
        if not stative[k] and DIRECTIVE_AFTER_RULE and a is not None and a["id"] == e["event_above"] \
                and _lemma(a["concept"]) in DIRECTIVE:
            directed.add(k)     # the ordered, forbidden or recommended act comes after the directive
        elif not stative[k]:
            ask = "In `current_sentence`, how is the time of `event` related to the time of `anchor`?"
            if a is None:
                ask += (" Read `sentences` for context: if an earlier sentence says the thing has ended or "
                        "stopped, what is told about it is in the past.")
            q[f"time_{k}"] = {"type": "choice",
                              "instructions": {"question": ask, "event": e["label"],
                                               "anchor": a["label"] if a else DCT_ANCHOR},
                              "criteria": DCT_TIME if a is None else TIME}
        how = _issued(e, events[up]) if up is not None and e["event_above"] else None
        if how:
            # a demanded, forbidden, refused or planned event: its issuer is the conceiver
            issued[k] = _lemma(str(events[up]["concept"])) in ISSUE_NEG
            issuer = _arg0(events[up], cur) if how == "verb" else None
            if issuer:
                issuers[k] = issuer
            elif holders:
                q[f"issuer_{k}"] = {"type": "choice",
                                    "instructions": {"question": ISSUER_Q, "event": e["label"],
                                                     "directive": events[up]["label"]},
                                    "criteria": {"none": "no entity of the sentence issues it",
                                                 **{x["label"]: None for x in holders[:250]}}}
        elif e["event_above"] and holders:
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
    for k in issued:
        pick = J.choice(a.get(f"issuer_{k}"))
        if k not in issuers and pick and pick != "none" and pick in by_label:
            issuers[k] = by_label[pick]
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
                "instructions": {"question": "Do `first` and `second` name an occurrence: something that "
                                             "happens or is held at a particular time (a concert, show, "
                                             "match, game, race, attack, explosion, incident, accident, "
                                             "ceremony, meeting, war), rather than a person, group, object, "
                                             "place, document, text or abstract idea? The number in brackets "
                                             "is the sentence in `sentences`.",
                                 "first": y["label"], "second": mentions[k]["label"]},
                "criteria": {"true": "a happening with a time of its own",
                             "false": "a person, thing, place, organization, text or idea"}}
    views = {}
    for k, e in enumerate(events):
        if k in issued:
            continue
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
        elif k in directed:
            relations.append(_rel("temporal", anchors[k]["ref"], "after", e["ref"]))
        if k in issuers:
            who = issuers[k]["ref"]
            strength = "partial-negative" if issued[k] else "partial-affirmative"
            relations.append(_rel("modal", who, strength, e["ref"]))
            if who not in conceivers:
                conceivers.add(who)
                relations.append(_rel("modal", "author", "full-affirmative", who))
        elif k in views and J.yes(b.get(f"claimed_{k}")):
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


def _issued(e, up):
    """How the event is ordered, forbidden, refused or planned: 'verb' when the event above it is a
    directive verb, 'modal' when a standalone modal word (要, 应当, 需要) stands right before its verb,
    else None."""
    lemma = _lemma(str(up["concept"]))
    if lemma in ISSUE_VERBS or lemma in ISSUE_NEG:
        return "verb"
    verb = _lemma(str(e["concept"]))
    if not verb:
        return None
    for node in (e["node"], up["node"]):
        text = str((node.get("input") or {}).get("text", ""))
        at = text.find(verb)
        if at > 0:
            ws = [w for w in jieba.cut(text[:at], HMM=False) if w.strip()]
            return "modal" if any(w in MODAL_WORDS for w in ws[-2:]) else None
    return None


def _arg0(up, table):
    """The entity of the table that fills the ARG0 of the event `up`, or None."""
    by_id = table["by_id"]
    for c in by_id.values():
        if c.get("parent") == up["id"] and str(c.get("edge", "")).lstrip(":") == "ARG0":
            frag = _fragment_below(c, by_id)
            if frag:
                return next((x for x in table["nodes"] if x["id"] == frag["id"] and x["kind"] == "entity"),
                            None)
    return None


def _rel(group, source, relation, target):
    return {"group": group, "source": source, "relation": relation, "target": target}


def _lemma(concept):
    """The lemma of a concept: the part before a -NN sense number."""
    head, _, tail = concept.rpartition("-")
    return head if head and tail.isdigit() else concept


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


def _timex_of(e, table):
    """The time expression filling the event's time / temporal role, if any, as {ref, kind}:
    kind date (a date-entity), past (a relative past word) or other (a time entity or frame)."""
    node = e["node"]
    roles = {v: r for _, r, v in (node.get("graph") or {}).get("edges") or []
             if str(r).lstrip(":") in ("time", "temporal")}
    known = {x["id"]: x for x in table["nodes"]}
    for child in table["by_id"].values():
        if child.get("parent") != node["id"] or child.get("edge") not in roles:
            continue
        frag = _fragment_below(child, table["by_id"])
        if not frag or frag["id"] not in known:
            continue
        found = _timex(frag, table, known)
        if found:
            return found
    return None


def _timex(frag, table, known):
    """Whether a fragment is a time expression that can anchor an event, and of which kind."""
    concept = str(((frag.get("graph") or {}).get("nodes") or [{}])[0].get("concept", ""))
    words = str((frag.get("input") or {}).get("text", "")).strip()
    ref = f"{table['index']}:{frag['id']}"
    if concept == "date-entity":
        return {"ref": ref, "kind": "date"}
    if not TIMEX_ANCHOR:
        return None
    if words in RELATIVE_PAST or concept in RELATIVE_PAST:
        return {"ref": ref, "kind": "past"}
    entity = (known.get(frag["id"]) or {}).get("kind") == "entity"
    head = concept in TIMEX_HEADS or words in TIMEX_HEADS or (bool(concept) and concept.endswith(TIMEX_ENDS))
    if entity or head:
        return {"ref": ref, "kind": "other"}
    return None


def _lead_date(table):
    """A date-entity that is the first operand of the sentence's top discourse node, if any."""
    by_id = table["by_id"]
    known = {x["id"] for x in table["nodes"]}
    top = next((x for x in by_id.values() if x.get("parent") not in by_id), None)
    while top and top.get("skill") == "sent_type" and top.get("type") != "stop":
        top = next((c for c in by_id.values() if c.get("parent") == top["id"]), None)
    if not top or top.get("skill") != "discourse":
        return None
    first = {v for _, r, v in (top.get("graph") or {}).get("edges") or [] if str(r).lstrip(":") == "op1"}
    for child in by_id.values():
        if child.get("parent") != top["id"] or not (child.get("edge") in first or child.get("edge") == "op1"):
            continue
        frag = _fragment_below(child, by_id)
        if frag and frag["id"] in known \
                and ((frag.get("graph") or {}).get("nodes") or [{}])[0].get("concept") == "date-entity":
            return {"ref": f"{table['index']}:{frag['id']}", "kind": "date"}
    return None


def _fragment_below(x, by_id):
    """The first node at or below x that has a fragment of its own."""
    while x and x["skill"] == "sent_type" and x.get("type") != "stop":
        x = next((c for c in by_id.values() if c.get("parent") == x["id"]), None)
    if x and x.get("status") == "ok" and x["skill"] in ("special_entity", "np_phrase", "predicate", "sent_type"):
        return x
    return None
