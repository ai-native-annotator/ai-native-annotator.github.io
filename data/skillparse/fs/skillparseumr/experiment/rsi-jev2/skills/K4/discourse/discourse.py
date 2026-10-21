"""discourse (kind: jev): which relation joins the clauses, and where they are cut.

One round, all questions at once:
  relation   a choice among the relations of the emit (none included);
  cut_<k>    a noul per place a clause could start: after a comma or semicolon,
             or at a connective word (但是, 然后, ...).
Rule: the parts are the stretches between the cuts Jev says yes to, without
connectives and punctuation at their ends. A relation with fewer than two parts
falls back to the single most likely cut; with no place to cut, `none`. Roles
are op1, op2, ... except for the have-*-91 relations, whose ARG1 (main clause)
and ARG2 are told apart by their marker words, and contrast-91, whose ARG1 is the
first clause and ARG2 the rest. A stretch that is only a time
expression (a date, 今年, 当时) is never a part: it stays with the clause after it.
In and / consecutive / or, a sentence-initial time word (此前, 目前, a date)
followed directly by the rest of the first clause covers all the clauses: it
becomes an extra part with role temporal, before the ops.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import jevlib as J  # noqa: E402

RELATIONS = {
    "none": "NOT a coordination: one event only. A single clause, possibly with a long object or a relative "
            "clause of one noun; a main clause with a clause of time, condition or purpose that only sets "
            "the scene (当……时, 在……时, 如果, 为了); a reported clause right after a speech verb (X说Y, "
            "X宣布Y, X称Y); a subject or topic noun phrase followed by a comma and then its own predicate. "
            "NOT none when, after a comma, a second verb starts a new statement, whether with the same "
            "subject (他买了书，还读了两遍) or with a new one (该X…, 其中…, 许多Y也…). Never none when the "
            "piece holds two or more sentences ended by 。, ！ or ？.",
    "and": "plain addition of clauses of equal status: 并且, 而且, 不但……而且, 同时, 也; clauses with "
           "DIFFERENT subjects placed side by side with a comma and no time word (A did X，B did Y); "
           "clauses sharing one subject joined by 还, 甚至, 也 or 并 when the actions are not ordered in "
           "time (states or activities that overlap, several facts about the same agent); two results of "
           "one event listed with commas; a second claim about the same subject (X…，表明/显示…); a "
           "clause followed by a comment on it (其中…); the sentences of one quotation or report, "
           "separated by 。！？ (one flat and, each sentence its own part). Each clause is its own part; "
           "the first clause is not the head of the others. If the clauses are clearly ordered in time, "
           "see consecutive.",
    "consecutive": "distinct events that happen one after another: (a) the later clause has an explicit "
                   "later-time word (然后, 随后, 接着, 之后, 在X后, 第二天, 次年), even when the clauses are "
                   "joined by 并, 且 or 和; or (b) ONE agent does two or more different actions in turn, in "
                   "comma-joined clauses with no connective (他打开门，走进房间; 店主报了警，关上了店门). Not for "
                   "states or activities that hold at the same time, and not for clauses with different "
                   "subjects side by side (choose and).",
    "contrast-91": "adversative or opposing clauses: the later clause turns against, limits or opposes the "
                   "earlier one. Choose this for 但, 但是, 可是, 不过, 然而, 却, and 而 meaning whereas "
                   "(他喜欢冬天，而她讨厌冬天; 产量很高，但用途有限). Also choose it when a clause is followed by "
                   "a negated clause that corrects or opposes it (X是Y，并未/并不/却没有…: it is said to do one "
                   "thing but in fact does not do another). 而 that only carries the story on to a next "
                   "event or to how other people reacted is NOT contrast: choose and.",
    "or": "或者, 还是: one or the other",
    "have-condition-91": "the point is a conditional link: 如果X，就Y; 只要X，就Y",
    "have-cause-91": "ONLY with an overt causal word: 因为/由于 X，(所以) Y; X，所以/因此/因而/以致(于)/致使/导致 "
                     "Y; X，于是 Y when Y happens because of X (if Y only follows X in time, choose "
                     "consecutive). Clauses joined by a bare comma are NEVER have-cause-91, even when one "
                     "plausibly leads to the other (saw smoke, called for help: consecutive); two results "
                     "of one event are and; a second claim about the same subject is and.",
    "have-purpose-91": "the point is the purpose link: X，以便Y",
}
# The relations of the emit left out of the question (additive, and-but, ...) are almost never
# used in the Chinese gold; asking for them only adds wrong answers.

CONNECTIVES = set("""但是 但 可是 不过 然而 而 却 并且 而且 并 且 同时 然后 随后 接着 之后 于是 所以 因此 因而
从而 以便 或者 或 还是 要么 此外 另外 而是 也 还 再 虽然 尽管 如果 只要 因为 由于 为了 以致 以致于 and but or
so then yet however although because if while whereas""".split())
# adverbs that belong to the clause: kept in the part (gold keeps them as :mod)
ADVERB_CUES = {"也", "还", "再"}
# words that follow a subject inside one clause: a cut there only after a comma
NO_CUT = ADVERB_CUES | {"并", "且", "却"}
# connective adverbs stripped from the start of a part but never a place to cut
STRIP_ONLY = {"后来", "结果"}
OPENERS, CLOSERS = set("（(「『“‘《[【"), set("）)」』”’》]】")
ADVERSATIVE = ("但是", "但", "可是", "不过", "然而", "却", "but", "yet", "however", "whereas")
CONCESSIVE = ("虽然", "尽管", "虽", "虽说", "although", "though")
ARG2_MARKERS = {
    "have-condition-91": ("如果", "若", "假如", "要是", "只要", "只有", "一旦", "if", "unless"),
    "have-cause-91": ("因为", "由于", "because", "since"),
    "have-concession-91": ("虽然", "尽管", "虽", "although", "though", "even"),
    "have-purpose-91": ("为了", "以便", "以", "好让", "to", "so"),
}
ARG1_MARKERS = ("所以", "因此", "因而", "于是", "从而", "就", "则", "致使", "以致", "so", "therefore", "then")
# sentence-final punctuation inside a piece (several sentences of one quotation): always a cut
SENT_END = set("。！!？?")
# a stretch that ends in one of these before a comma only sets the time of the clause after it
TIME_TAILS = {"前", "后", "之前", "之后", "以前", "以后", "时", "之时", "期间", "中", "当晚", "当天", "当日",
              "以来", "之际", "此前", "此后", "事后", "在此之前", "在此之后"}
CLAUSE_END = "，,；;。！!？?"

# words that alone make a time expression (with numbers and date words such as 2023年, 2月, 三日)
TIME_WORDS = {"年", "月", "日", "号", "年代", "年初", "年底", "上旬", "中旬", "下旬", "早上", "晚上", "当天", "次日",
              "近年", "近年来", "目前", "如今", "当时", "去年", "今年", "明年"}
DATE_UNITS = {"年", "月", "日", "号"}
DATE_WORD = re.compile(r"^(?:(?:\d+|[零〇一二两三四五六七八九十百千]+)(?:年|月|日|号))+$")   # 2023年, or a whole date glued into one word
# a sentence-initial time word that covers every clause of a coordination: :temporal of the connective
SCOPE_TIME = {"此前", "此后", "之前", "之后", "目前", "如今", "近年来", "近年", "当时", "同时期", "最近", "过去"}

def run(sent, token_sent, lang, text, span, **_):
    ws = J.inside(token_sent, span, lang)
    depth, d = [], 0                # how deep each word is inside brackets or quotation marks
    for w in ws:
        if w.text in CLOSERS:
            d = max(d - 1, 0)
        depth.append(d)
        if w.text in OPENERS:
            d += 1
    if d:                           # unbalanced: a stray bracket must not block every cut
        depth = [0] * len(ws)
    cuts = []                       # index in ws where a part may start
    for i, w in enumerate(ws[1:-1], 1):
        if depth[i]:
            continue                # never cut inside a quotation or a parenthesis
        if w.text in SENT_END:
            if any(not J.is_punct(x) for x in ws[i + 1:]):
                cuts.append(i + 1)  # a new sentence starts here: always kept (see below)
        elif w.text in "，,；;：:" and i + 1 < len(ws):
            if not (w.text in "：:" and ws[i + 1].text in OPENERS):
                cuts.append(i + 1)
        elif w.text == "并" and ws[i - 1].text not in CLAUSE_END and ws[i + 1].text[:1] not in "不未没非无":
            cuts.append(i)          # 并 between two verb phrases (not the emphatic 并不 / 并未)
        elif (w.text.lower() in CONNECTIVES and w.text.lower() not in NO_CUT
              and w.text not in TIME_TAILS and ws[i - 1].text not in CLAUSE_END):
            cuts.append(i)
    sep = "" if lang == "zh" else " "
    questions = {"relation": {"type": "choice",
                              "instructions": "Which discourse relation joins the clauses of `piece` "
                                              "(marked 【】 in `sentence_with_piece_marked`)?",
                              "criteria": RELATIONS}}
    for i in cuts:
        before = sep.join(w.text for w in ws[:i])
        after = sep.join(w.text for w in ws[i:])
        questions[f"cut_{i}"] = {
            "type": "noul",
            "instructions": {"question": "Does `after` start a new clause of its own, linked to `before` as an "
                                         "addition, a sequence, a contrast, a concession, a cause or a result? "
                                         "Answer YES when (a) `after` begins with its own subject followed by "
                                         "its own verb, even if `before` is already a complete clause or has a "
                                         "speech verb such as 宣布/表示/称 earlier on; (b) `after` begins "
                                         "directly with a second verb of the same agent (他们修好了车，开回了家; "
                                         "她写了信，说…), a speech verb included; (c) `after` is opened by 因为, "
                                         "以致, 于是, 因而, 但, 还, 甚至, or by 并/并且 between two verb phrases of "
                                         "one subject (the object and any 在…/到… phrase after 并 belong to the "
                                         "second verb). Answer NO when: the word just before this place (说, "
                                         "表示, 宣布, 认为, a colon) takes `after` as its object or reported "
                                         "content; `after` modifies a noun or is part of the same clause; "
                                         "`before` is only a noun phrase (the subject or topic of the verb in "
                                         "`after`); `before` ends with a phrase that only sets the time or the "
                                         "reason of the next clause (在/当…前/后/时/中, 此前, or 因为/由于 + a "
                                         "noun phrase with no verb of its own outside its modifiers); `after` "
                                         "only says what the action in `before` is for (it reads as 'in order "
                                         "to …', 以 or 为了 could be put in front); or `after` is only an "
                                         "adverb or a connective.",
                             "before": before, "after": after}}
    answers = yield {"state": J.state(sent, token_sent, span, lang), "questions": questions}

    relation = J.choice(answers["relation"])
    if relation == "but-91":
        relation = "contrast-91"    # gold writes adversatives as contrast-91 :ARG1 :ARG2
    forced = {i for i in cuts if ws[i - 1].text in "。！!？?"}
    if relation == "none" and forced:
        relation = "and"            # two sentences are never one event
    if relation == "none" or not cuts:
        return {"relation": "none", "parts": []}
    # once the piece is a coordination, a comma between clauses needs less confidence to be cut
    floor = 0.4 if relation in ("and", "consecutive", "or") else 0.5
    chosen = [i for i in cuts if i in forced
              or J.yes(answers[f"cut_{i}"], floor if ws[i - 1].text in "，,；;" else 0.5)]
    if not chosen:
        chosen = [max(cuts, key=lambda i: answers[f"cut_{i}"]["noul"])]

    # a fronted time phrase (在X后，/ X前，/ X中，/ 此前，) only sets the scene of the clause after it: no cut
    kept = []
    for a, b in zip([0] + chosen, chosen):
        seg = [w for w in ws[a:b] if not J.is_punct(w)]
        if ws[b - 1].text in SENT_END or not (seg and (seg[-1].text in TIME_TAILS or _time_only(seg))):
            kept.append(b)
    chosen = kept
    bounds = [0] + chosen + [len(ws)]
    raw = [ws[a:b] for a, b in zip(bounds, bounds[1:])]
    raw = [r for r in raw if J.trim(_strip_connectives(r), lang)]
    groups = []                     # only connectives and punctuation are cut off: a copula, 让 or 被 after them stays
    for r in raw:
        g = _strip_connectives(r)
        while g and J.is_punct(g[-1]):
            g.pop()
        groups.append(g)
    if len(groups) < 2:
        return {"relation": "none", "parts": []}
    if relation.startswith("have-") and len(groups) != 2:
        relation = "and"
    if relation == "contrast-91" and len(groups) > 2:
        # contrast-91 has two arguments: the first clause, and everything after it as one part
        a, b = groups[1][0].first, groups[-1][-1].last
        groups = [groups[0], [w for w in ws if w.first >= a and w.last <= b]]
    # a time word or date at the very start, run on into the first clause, covers all the clauses
    temporal = None
    if relation in ("and", "consecutive", "or") and len(groups) >= 2:
        g0 = groups[0]
        k = 1 if g0 and g0[0].text in SCOPE_TIME else 0
        if not k:
            while k < len(g0) and _time_word(g0[k]):
                k += 1
            if not any(DATE_WORD.match(w.text) or w.text in DATE_UNITS for w in g0[:k]):
                k = 0               # a bare number (两, 三) is not a date
        if 0 < k < len(g0) and not J.is_punct(g0[k]):
            temporal, groups[0] = g0[:k], g0[k:]
    parts = ([{"text": J.join(temporal, token_sent, lang), "span": J.span_of(temporal), "role": "temporal"}]
             if temporal else [])
    parts += [{"text": J.join(g, token_sent, lang), "span": J.span_of(g), "role": f"op{n}"}
              for n, g in enumerate(groups, 1)]
    if relation.startswith("have-"):
        for p, r in zip(parts, _arg_roles(relation, raw)):
            p["role"] = r
    elif relation == "contrast-91":
        for p, r in zip(parts, ("ARG1", "ARG2")):
            p["role"] = r
    return {"relation": relation, "parts": parts}


def _time_word(w):
    """A word that can only be part of a time expression: a number, a date word, a time noun."""
    return w.text in TIME_WORDS or bool(DATE_WORD.match(w.text)) or J.number(w.text) is not None


def _time_only(seg):
    """A stretch that is only a time expression (no verb): it sets the time of the clause after it."""
    return bool(seg) and all(_time_word(w) for w in seg)


def _strip_connectives(g):
    g = list(g)
    while g and (g[0].text.lower() in CONNECTIVES or J.is_punct(g[0])):
        g.pop(0)
    return g


def _arg_roles(relation, raw):
    """ARG1 / ARG2 of two parts: the one with a subordinating marker is ARG2,
    the one with a result marker ARG1; otherwise the first is ARG2, except for
    purpose, whose purpose clause usually comes second."""
    starts = ["".join(w.text for w in r if not J.is_punct(w)).lower() for r in raw]
    for k in (0, 1):
        if any(starts[k].startswith(m) for m in ARG2_MARKERS.get(relation, ())):
            return ["ARG2", "ARG1"] if k == 0 else ["ARG1", "ARG2"]
    for k in (0, 1):
        if any(starts[k].startswith(m) for m in ARG1_MARKERS):
            return ["ARG1", "ARG2"] if k == 0 else ["ARG2", "ARG1"]
    return ["ARG1", "ARG2"] if relation == "have-purpose-91" else ["ARG2", "ARG1"]
