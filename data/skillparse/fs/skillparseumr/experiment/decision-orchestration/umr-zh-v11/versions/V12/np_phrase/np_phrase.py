"""np_phrase (kind: jev): one noun phrase — its head and modifiers.

Rounds:
  1. head   choice: the head word of the phrase;
     shape  choice: what the head becomes (a plain noun, a pronoun, a person
            defined by an event or a role, a nominalised event, a coordination,
            a number + classifier with no noun).
  2. sense   when multiple PropBank frames exist, select the frame first;
  3. mod_<w>  per other content word: which modifier the word is in (mod,
              poss, quant, unit, relative clause ARG0-of / ARG1-of, place, ...);
     aspect  for a nominalised event or an embedded event in a person noun.
There are two rounds when sense selection is unnecessary. Event heads use
the existing predicate adjunct inventory plus the selected frame's core roles.
For agent/patient nouns, event:* choices attach to the inner event; ordinary
choices still attach to the person.
Rule: the head's nodes come from the shape; runs of words with the same
modifier role are placeholders, except what the fragment writes itself: a
number is the head's quant, a classifier its unit node, a demonstrative
(这 / 那 / 该) its mod node.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import jevlib as J  # noqa: E402
from prompt_loader import load_prompts  # noqa: E402

PROMPTS = load_prompts(__file__)
from event_modifiers import EVENT_MODIFIERS, NATIVE_CORE_ROLES  # noqa: E402

SHAPES = PROMPTS["tables"]["SHAPES"]
MODS = PROMPTS["tables"]["MODS"]
ASPECTS = PROMPTS["tables"]["ASPECTS"]
DEMONSTRATIVES = {"这", "那", "该", "此", "本", "这个", "那个", "这些", "那些", "这种", "那种", "其"}
CONJ_WORDS = {"和", "与", "及", "以及", "、", "或", "或者", "跟", "同", "and", "or", ","}
SUFFIXES = ("人员", "者", "员", "人", "家", "手", "方")


def _modifier_options(shape, frame, has_event):
    """Entity choices plus the roles that the current event can actually use."""
    opts = {key: value for key, value in MODS.items()
            if not re.fullmatch(r"ARG\d+", key) and (key != "org" or shape == "org-role")}
    if not has_event:
        return opts
    event = dict(EVENT_MODIFIERS)
    core = frame.get("roles") or {**{key: MODS[key] for key in ("ARG0", "ARG1")}, **NATIVE_CORE_ROLES}
    intrinsic = {"agent": {"ARG0", "actor"}, "patient": {"ARG1", "undergoer"}}.get(shape, set())
    event.update({key: value for key, value in core.items()
                  if (re.fullmatch(r"ARG\d+", key) or key in NATIVE_CORE_ROLES) and key not in intrinsic})
    if shape == "event":
        opts.update(event)
    else:
        opts.update({f"event:{key}": PROMPTS["templates"]["option_description_1"].format(value=value)
                     for key, value in event.items()})
    return opts


def run(sent, token_sent, lang, text, span, **_):
    ws = J.inside(token_sent, span, lang)
    cands = J.content(ws, lang) or ws
    st = J.state(sent, token_sent, span, lang)

    q = {"shape": {"type": "choice",
                   "instructions": PROMPTS["instructions"]["question_1"],
                   "criteria": SHAPES}}
    if len(cands) > 1:
        q["head"] = {"type": "choice",
                     "instructions": PROMPTS["instructions"]["question_2"],
                     "criteria": {w.key: None for w in cands}}
    a = yield {"state": st, "questions": q}
    head = J.by_key(cands)[J.choice(a["head"])] if "head" in a else cands[-1]
    shape = J.choice(a["shape"])
    if shape == "pronoun" and not J.pronoun(head.text, lang):
        shape = "noun"
    groups = _conjuncts(ws, lang) if shape == "and" else []
    if shape == "and" and len(groups) < 2:
        shape = "noun"

    asked = [w for w in ws if w is not head and not J.is_function(w, lang) and shape not in ("and", "count")]
    bare = shape in ("agent", "patient") and head.text in SUFFIXES
    stem = _stem(head.text) if shape in ("agent", "patient") else head.text
    has_event = shape == "event" or (shape in ("agent", "patient") and not bare)
    senses = J.rolesets(stem, lang) if has_event else []
    frame = senses[0] if senses else {}
    if len(senses) > 1:
        offered = {item["roleset"]: item for item in senses[:255]}
        picked = yield {"state": {**st, "head": head.text, "stem": stem},
                        "questions": {"sense": {
                            "type": "choice",
                            "instructions": PROMPTS["instructions"]["question_5"],
                            "criteria": {key: J.roleset_text(item) for key, item in offered.items()}}}}
        selected = J.choice(picked.get("sense"))
        if selected not in offered:
            raise ValueError(f"Sense was not offered: {selected!r}")
        frame = offered[selected]
    sense = frame.get("roleset", f"{stem}-00")
    opts = _modifier_options(shape, frame, has_event)
    q = {}
    if shape == "event" or (shape in ("agent", "patient") and head.text not in SUFFIXES):
        q["aspect"] = {"type": "choice",
                       "instructions": PROMPTS["instructions"]["question_3"],
                       "criteria": ASPECTS}
    for n, w in enumerate(asked):
        q[f"mod_{n}"] = {"type": "choice",
                         "instructions": {"question": PROMPTS["instructions"]["question_4"],
                                          "word": w.key},
                         "criteria": opts}
    a = yield {"state": {**st, "head": head.text, "stem": stem, "frame": frame}, "questions": q}

    nodes, edges, attrs = _head(shape, head, sense, ws, token_sent, lang)
    root = nodes[0]["var"]
    # the aspect goes on the event: the head itself, or the event r inside an agent / patient noun
    ev = root if shape == "event" else ("r" if shape in ("agent", "patient")
                                        and any(n["var"] == "r" for n in nodes) else None)
    if ev and J.choice(a.get("aspect")) not in (None, "none"):
        attrs.append([ev, "aspect", J.choice(a["aspect"])])
    org = next((n["var"] for n in nodes if n["concept"].startswith("have-")), root)
    labels = {}
    for n, word in enumerate(asked):
        selected = J.choice(a.get(f"mod_{n}"))
        if selected not in opts:
            raise ValueError(f"Modifier role was not offered: {selected!r}")
        labels[word] = selected
    labels[head] = "head"           # the head cuts runs: no modifier placeholder spans it
    if shape == "rel-role" and "poss" not in labels.values():    # nobody written it is a relation of
        nodes = [{"var": root, "concept": head.text if lang == "zh" else head.text.lower(), "span": head.span}]
        edges, org = [], root
    if shape in ("agent", "patient") and head.text in SUFFIXES:  # V | 者: the verb before is the event
        prev = [w for w in asked if w.last < head.first]
        if prev and labels[prev[-1]] not in ("ARG0-of", "ARG1-of") and J.rolesets(prev[-1].text, lang):
            labels[prev[-1]] = "ARG0-of" if shape == "agent" else "ARG1-of"
    for i, w in enumerate(ws):              # N岁 (以下): an age, written by rule as :age
        if w is head or w not in labels:
            continue
        if re.fullmatch(r".+岁", w.text) and J.number(w.text[:-1]) is not None:
            age = [w]
        elif w.text == "岁" and i and ws[i - 1] in labels and ws[i - 1] is not head \
                and J.number(ws[i - 1].text) is not None:
            age = [ws[i - 1], w]
        else:
            continue
        if i + 1 < len(ws) and ws[i + 1].text in ("以下", "以上", "左右") and ws[i + 1] in labels \
                and ws[i + 1] is not head:
            age.append(ws[i + 1])
        for x in age:
            labels[x] = "age"
    opens = []
    if shape == "and":
        conj = [w for w in ws if w.text in CONJ_WORDS and not J.is_punct(w)]
        nodes = [{"var": "a", "concept": "and", **({"span": conj[0].span} if conj else {})}]
        for n, g in enumerate(groups, 1):
            edges.append(["a", f"op{n}", f"x{n}"])
            opens.append({"var": f"x{n}", "text": J.join(g, token_sent, lang), "span": J.span_of(g)})
        return {"graph": {"nodes": nodes, "edges": edges, "attrs": []}, "open": opens, "outside": [],
                "alignment": conj[0].span if conj else J.span_of(groups[0])}
    for role, group in J.runs(ws, labels, lang):
        if role in ("head", "none", "conj"):
            continue
        g_text = J.join(group, token_sent, lang)
        value = J.number(g_text)
        m = re.fullmatch(r"([\d.]+|[零〇一二两三四五六七八九十百千万亿]+)(\D{1,2})", g_text)
        if role in ("quant", "unit") and value is None and m and J.number(m.group(1)) is not None:
            attrs.append([root, "quant", J.number(m.group(1))])      # 一个, 两名: quant and unit
            nodes.append({"var": f"n{len(nodes)}", "concept": m.group(2), "span": J.span_of(group)})
            edges.append([root, "unit", nodes[-1]["var"]])
            continue
        if role == "quant" and value is not None:
            attrs.append([root, "quant", value])
            continue
        if role == "unit" or (role == "mod" and g_text in DEMONSTRATIVES) or \
                (role == "quant" and len(group) == 1):
            var = f"n{len(nodes)}"
            nodes.append({"var": var, "concept": g_text, "span": J.span_of(group)})
            edges.append([root, role, var])
            continue
        var = f"x{len(opens) + 1}"
        if role == "place" and shape == "org-role":     # a country before a title is its organization
            role = "org"
        if role.startswith("event:"):
            if ev is None:
                raise ValueError("An event role requires an embedded event node")
            parent, edge_role = ev, role.removeprefix("event:")
        else:
            parent = org if role == "org" else root
            edge_role = {"org": "ARG2", "poss": "possessor"}.get(role, role)
        edges.append([parent, edge_role, var])
        opens.append({"var": var, "text": g_text, "span": J.span_of(group)})
    return {"graph": {"nodes": nodes, "edges": edges, "attrs": attrs}, "open": opens, "outside": [],
            "alignment": head.span}


def _stem(word):
    if word in SUFFIXES:            # the suffix alone (V | 者 cut apart): nothing to strip
        return word
    for s in SUFFIXES:
        if word.endswith(s) and len(word) > len(s):
            return word[: -len(s)]
    return word


def _head(shape, head, sense, ws, token_sent, lang):
    sp = head.span
    concept = head.text if lang == "zh" else head.text.lower()
    if shape == "pronoun":
        g = J.pronoun_graph("p", head.text, sp, lang)
        return g["nodes"], [], g["attrs"]
    if shape in ("agent", "patient") and head.text in SUFFIXES:    # the verb is its own word: an ARG*-of modifier
        return [{"var": "p", "concept": concept, "span": sp}], [], []
    if shape in ("agent", "patient"):   # the suffix (者, 人, 员) stays the concept: (者 :ARG0-of V)
        suf = next((s for s in SUFFIXES if head.text.endswith(s) and len(head.text) > len(s)), None)
        return ([{"var": "p", "concept": suf if suf and lang == "zh" else "person", "span": sp},
                 {"var": "r", "concept": sense, "span": sp}],
                [["p", "ARG0-of" if shape == "agent" else "ARG1-of", "r"]], [])
    if shape == "org-role":         # the title is the head: (title :ARG3-of (have-org-role-91 :ARG2 org))
        return ([{"var": "t", "concept": concept, "span": sp},
                 {"var": "h", "concept": "have-org-role-91"}],
                [["t", "ARG3-of", "h"]], [])
    if shape == "rel-role":
        return ([{"var": "p", "concept": "person", "span": sp},
                 {"var": "h", "concept": "have-rel-role-92"},
                 {"var": "t", "concept": concept, "span": sp}],
                [["p", "ARG1-of", "h"], ["h", "ARG3", "t"]], [])
    if shape == "event":
        return [{"var": "e", "concept": sense, "span": sp}], [], []
    if shape == "count":            # 23人 -> (人 :quant 23); a numeral+classifier word -> :quant N :unit CL
        quant, unit, nouns = None, None, []
        for w in J.trim(ws, lang):
            m = re.fullmatch(r"([\d.]+|[零〇一二两三四五六七八九十百千万亿]+)(\D{1,2})", w.text)
            if w.text in J.BIG and quant is not None:
                quant = quant * J.BIG[w.text]       # 697 | 万 | 人: the magnitude word multiplies the number
                continue
            if J.number(w.text) is not None:
                quant = J.number(w.text) if quant is None else quant
            elif m and J.number(m.group(1)) is not None:
                quant = J.number(m.group(1)) if quant is None else quant
                unit = unit or {"var": "u", "concept": m.group(2), "span": w.span}
            else:
                nouns.append(w)
        if nouns:
            root = {"var": "c", "concept": nouns[-1].text, "span": nouns[-1].span}
        elif unit:                  # only a numeral+classifier: the classifier carries the number
            root, unit = {**unit, "var": "c"}, None
        else:
            root = {"var": "c", "concept": head.text, "span": head.span}
        return ([root] + ([unit] if unit else []), [["c", "unit", "u"]] if unit else [],
                [["c", "quant", quant]] if quant is not None else [])
    return [{"var": "h", "concept": concept, "span": sp}], [], []


def _conjuncts(ws, lang):
    """The coordinated items: stretches between conjunction words."""
    groups, cur = [], []
    for w in ws:
        if w.text in CONJ_WORDS:
            if J.trim(cur, lang):
                groups.append(J.trim(cur, lang))
            cur = []
        else:
            cur.append(w)
    if J.trim(cur, lang):
        groups.append(J.trim(cur, lang))
    return groups
