"""predicate (kind: jev): one clause — its event, sense and participants.

Three rounds of closed questions, each built from the answers before it:

  1. head     choice: which word of the clause is the predicate;
     kind     choice: an ordinary verb / adjective, or one of the abstract
              concepts for non-verbal predication (identity-91, have-91, ...).
  2. sense    choice among the head's PropBank rolesets (looked up locally;
              asked only when there are several);
     aspect, modstr  choice; polarity  noul.
  3. role_<w> per content word of the clause: which participant's phrase the
              word is in (the roles of the chosen sense, the general roles), or
              part of the predicate, or none;
     out_<A>  per core role, when the sentence has words outside the clause:
              where that participant is, inside, unexpressed, or one of the
              words outside.
Rule: runs of words with the same role are the placeholders (open); a
temporal phrase ending in 后 / 前 / 以来 / 时 keeps that word as a node with
the rest as its op1; a core role found outside gives `outside`.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import jevlib as J  # noqa: E402
from prompt_loader import load_prompts  # noqa: E402

PROMPTS = load_prompts(__file__)

ABSTRACT = PROMPTS["tables"]["ABSTRACT"]
ABSTRACT_ROLES = PROMPTS["tables"]["ABSTRACT_ROLES"]
NO_ASPECT = {"have-org-role-92", "have-role-91", "have-rel-role-92"}
ASPECT = PROMPTS["tables"]["ASPECT"]
MODSTR = PROMPTS["tables"]["MODSTR"]
NEGATORS = {"不", "没", "没有", "未", "未曾", "未能", "尚未", "并未", "并不", "并没有", "从未", "从不", "从没",
            "非", "别", "勿", "莫", "不要", "不能", "不会", "不再", "不得", "不可", "无法", "决不", "绝不",
            "再也不", "not", "n't", "never", "no"}
GENERAL = PROMPTS["tables"]["GENERAL"]
OTHER = PROMPTS["tables"]["OTHER"]
COPULAS = {"是", "为", "有", "在", "像", "属于", "叫", "即", "乃", "系", "存在",
           "is", "are", "was", "were", "be", "have", "has", "had"}
TIME_WORDS = ("以后", "之后", "后", "以前", "之前", "前", "以来", "时", "的时候", "期间")
PARTICLES = set("的 地 得 了 着 过 吗 呢 吧 啊 呀".split())


def run(sent, token_sent, lang, text, span, **_):
    ws = J.inside(token_sent, span, lang)
    heads = [w for w in ws if not J.is_punct(w) and w.text not in PARTICLES and w.text != "被"] or ws
    st = J.state(sent, token_sent, span, lang)

    # 1. the head and the kind of predication
    q = {"kind": {"type": "choice",
                  "instructions": PROMPTS["instructions"]["question_1"],
                  "criteria": ABSTRACT}}
    if len(heads) > 1:
        q["head"] = {"type": "choice",
                     "instructions": PROMPTS["instructions"]["question_2"],
                     "criteria": {w.key: None for w in heads}}
    a = yield {"state": st, "questions": q}
    head = J.by_key(heads)[J.choice(a["head"])] if "head" in a else heads[0]
    kind = J.choice(a["kind"])

    # 2. sense, aspect, modal strength, polarity
    lemma = _lemma(head.text, lang)
    senses = J.rolesets(lemma, lang)
    if kind != "verb" and senses and lemma not in COPULAS:
        kind = "verb"               # a verb PropBank knows (成, 变成) is the head, not identity-91
    if kind != "verb":
        senses = []
    ev = {**st, "predicate": head.text}
    q = {"aspect": {"type": "choice",
                    "instructions": PROMPTS["instructions"]["question_3"],
                    "criteria": ASPECT},
         "modstr": {"type": "choice",
                    "instructions": PROMPTS["instructions"]["question_4"],
                    "criteria": MODSTR},
         "negated": {"type": "noul",
                     "instructions": PROMPTS["instructions"]["question_5"]}}
    if len(senses) > 1:
        q["sense"] = {"type": "choice",
                      "instructions": PROMPTS["instructions"]["question_6"],
                      "criteria": {r["roleset"]: J.roleset_text(r) for r in senses[:255]}}
    a = yield {"state": ev, "questions": q}
    if kind != "verb":
        concept, frame = kind, {"roleset": kind, "roles": ABSTRACT_ROLES[kind]}
    elif senses:
        pick = J.choice(a["sense"]) if "sense" in a else senses[0]["roleset"]
        frame = next(r for r in senses if r["roleset"] == pick)
        frame = {"roleset": frame["roleset"], "roles": frame["roles"]}
        concept = frame["roleset"]
    else:
        concept, frame = f"{lemma}-00", {}    # no PropBank frame: gold writes the senseless -00
    roles = frame.get("roles") or PROMPTS["tables"]["FALLBACK_ROLES"]
    aspect = "none" if kind in NO_ASPECT else J.choice(a["aspect"])
    before = []                     # the words before the head, from the last clause punctuation on
    for w in ws[:ws.index(head)]:
        before = [] if w.text in J.CLAUSE_PUNCT else before + [w]
    after = ws[ws.index(head) + 1:ws.index(head) + 2] if lang != "zh" else []
    negator = any(w.text.lower() in NEGATORS or w.text.lower().endswith("n't") or w.text.lower() == "cannot"
                  for w in before + after) or (
        lang == "zh" and len(head.text) > 1 and head.text[0] in "不没" and not J.rolesets(lemma, lang)
        and bool(J.rolesets(head.text[1:], lang)))
    negated = J.yes(a["negated"]) and negator      # a negation from a governing verb outside is not this event's
    modstr = J.choice(a["modstr"])
    if negated and modstr.endswith("affirmative"):
        modstr = modstr.replace("affirmative", "negative")
    polarity = "negative" if negated else "positive"   # gold writes :polarity - on a negated event as well as the negative modstr

    # 3. participants: a role per word inside, and where the core roles outside are
    asked = [w for w in ws if w is not head and not J.is_function(w, lang)]
    options = {k: PROMPTS["templates"]["option_description_3"].format(k=k, v=v) for k, v in roles.items()}
    options.update(GENERAL)
    options.update(OTHER)
    q = {}
    for n, w in enumerate(asked):
        q[f"role_{n}"] = {"type": "choice",
                          "instructions": {"question": PROMPTS["templates"]["question_1"].format(concept=concept),
                                           "word": w.key},
                          "criteria": options}
    out_words = [w for w in J.content(J.outside(token_sent, span, lang), lang)]
    core = list(roles)
    if out_words:
        for r in core:
            q[f"out_{r}"] = {"type": "choice",
                             "instructions": {"question": PROMPTS["templates"]["question_2"].format(r=r, role_description=roles[r])},
                             "criteria": {"inside": None, "unexpressed": None,
                                          **{w.key: None for w in out_words[:250]}}}
    a = yield {"state": ev, "questions": q}

    labels = {w: J.choice(a[f"role_{n}"]) for n, w in enumerate(asked)}
    weight = {w: J.probability(a[f"role_{n}"], labels[w]) for n, w in enumerate(asked)}
    runs = []
    for role, group in J.runs(ws, {**labels, head: "@head"}, lang):    # the head splits every run
        if role in OTHER or role == "@head":
            continue
        if group[0].first <= head.first and head.last <= group[-1].last:
            continue                # never hand the predicate itself down again
        if group[0].first <= span[0] and group[-1].last >= span[1]:
            continue                # a placeholder equal to the clause cannot be expanded
        runs.append((role, group))
    best = {}                       # a core role is filled once: by its run with most weight, then nearest the head
    for role, group in runs:
        if role in roles:
            key = (round(sum(weight.get(w, 0.0) for w in group), 6),
                   -min(abs(w.first - head.first) for w in group))
            if role not in best or key > best[role][0]:
                best[role] = (key, group)
    nodes = [{"var": "e", "concept": concept, "span": head.span}]
    edges, opens, outside = [], [], []
    used = set()
    for role, group in runs:
        if role in roles and group is not best[role][1]:
            continue
        used.add(role)
        var = f"x{len(opens) + 1}"
        if role == "temporal" and group[-1].text in ("时", "时候", "的时候"):
            group = J.trim(group[:-1], lang)    # X时: 时 only marks the clause, X itself is the time
            if not group:
                continue
        elif role == "temporal" and len(group) > 1 and _time_word(group[-1]):
            rel, rest = group[-1], J.trim(group[:-1], lang)
            nodes.append({"var": f"t{len(nodes)}", "concept": rel.text, "span": rel.span})
            edges.append(["e", "temporal", nodes[-1]["var"]])
            if rest:
                edges.append([nodes[-1]["var"], "op1", var])
                opens.append({"var": var, "text": J.join(rest, token_sent, lang), "span": J.span_of(rest)})
            continue
        edges.append(["e", role, var])
        opens.append({"var": var, "text": J.join(group, token_sent, lang), "span": J.span_of(group)})
    cands = []
    for r in core:
        if r in used or f"out_{r}" not in a:
            continue
        ans = a[f"out_{r}"]
        pick = J.choice(ans)
        w = J.by_key(out_words).get(pick)
        p = J.probability(ans, pick)
        null = J.probability(ans, "unexpressed") + J.probability(ans, "inside")
        floor = 0.4 if r in ("ARG0", "ARG1") else 0.6    # a shared dropped argument is nearly always ARG0 / ARG1
        if w and p >= floor and p > null:
            cands.append((p, r, w))
    taken = set()
    for p, r, w in sorted(cands, key=lambda c: -c[0]):
        if w.key in taken:
            continue                # one word outside fills one role: the most probable one
        taken.add(w.key)
        outside.append({"text": w.text, "span": w.span, "role": r})

    return {"graph": {"nodes": nodes, "edges": edges, "attrs": []}, "open": opens, "outside": outside,
            "alignment": _alignment(head, ws, labels), "frame": frame,
            "aspect": aspect, "modstr": modstr, "polarity": polarity}


def _lemma(word, lang):
    if lang == "zh":
        for p in ("了", "着", "过"):
            if word.endswith(p) and len(word) > 1:
                return word[:-1]
        return word
    return _lemma_en(word.lower())


IRREGULAR_EN = {
    "began": "begin", "begun": "begin", "stolen": "steal", "stole": "steal", "took": "take", "taken": "take",
    "gave": "give", "given": "give", "went": "go", "gone": "go", "said": "say", "made": "make", "got": "get",
    "gotten": "get", "saw": "see", "seen": "see", "came": "come", "knew": "know", "known": "know",
    "thought": "think", "told": "tell", "found": "find", "held": "hold", "kept": "keep", "left": "leave",
    "brought": "bring", "bought": "buy", "built": "build", "sold": "sell", "sent": "send", "spent": "spend",
    "paid": "pay", "met": "meet", "led": "lead", "ran": "run", "wrote": "write", "written": "write",
    "won": "win", "lost": "lose", "felt": "feel", "heard": "hear", "stood": "stand", "understood": "understand",
    "fell": "fall", "fallen": "fall", "broke": "break", "broken": "break", "chose": "choose", "chosen": "choose",
    "drove": "drive", "driven": "drive", "rose": "rise", "risen": "rise", "shot": "shoot", "fought": "fight",
    "hid": "hide", "hidden": "hide", "caught": "catch", "taught": "teach", "sat": "sit", "spoke": "speak",
    "spoken": "speak", "forgot": "forget", "became": "become", "ate": "eat", "eaten": "eat", "grew": "grow",
    "grown": "grow", "threw": "throw", "thrown": "throw", "drew": "draw", "drawn": "draw", "flew": "fly",
    "flown": "fly", "has": "have", "had": "have", "is": "be", "are": "be", "was": "be", "were": "be",
    "been": "be", "does": "do", "did": "do", "done": "do",
}


def _lemma_en(w):
    """An English verb form to its base form: irregular table, then -ing / -ed / -s stripping, keeping the
    first candidate that PropBank knows (hoping -> hope, not hop)."""
    if w in IRREGULAR_EN:
        return IRREGULAR_EN[w]
    cands = []
    if w.endswith("ing") and len(w) > 5:
        s = w[:-3]
        cands = [s + "e", s] + ([s[:-1]] if len(s) > 2 and s[-1] == s[-2] else [])
    elif w.endswith("ied") and len(w) > 4:
        cands = [w[:-3] + "y", w[:-1]]
    elif w.endswith("ed") and len(w) > 4:
        s = w[:-2]
        cands = [w[:-1], s] + ([s[:-1]] if len(s) > 2 and s[-1] == s[-2] else [])
    elif w.endswith("ies") and len(w) > 4:
        cands = [w[:-3] + "y"]
    elif w.endswith("s") and not w.endswith("ss") and len(w) > 3:
        cands = [w[:-1], w[:-2]]
    for c in cands:
        if c and J.rolesets(c, "en"):
            return c
    return w


def _time_word(w):
    return w.text in TIME_WORDS


def _alignment(head, ws, labels):
    """The head's span, widened over the words right next to it that are part
    of the predicate (了, 能, 开始, ...), so coverage does not hand them back."""
    i = ws.index(head)
    a, b = i, i
    while a > 0 and labels.get(ws[a - 1]) == "predicate":
        a -= 1
    while b + 1 < len(ws) and (labels.get(ws[b + 1]) == "predicate" or ws[b + 1].text in PARTICLES):
        b += 1
    return [ws[a].first, ws[b].last]
