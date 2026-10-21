"""discourse (kind: jev): which relation joins the clauses, and where they are cut.

One round, all questions at once:
  relation   a choice among the relations of the emit (none included);
  cut_<k>    a noul per place a clause could start: after a comma or semicolon,
             or at a connective word (但是, 然后, ...).
Rule: the parts are the stretches between the cuts Jev says yes to, without
connectives and punctuation at their ends. A relation with fewer than two parts
falls back to the single most likely cut; with no place to cut, `none`. Roles
are op1, op2, ... except for the have-*-91 relations, whose ARG1 (main clause)
and ARG2 are told apart by their marker words.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import jevlib as J  # noqa: E402
from prompt_loader import load_prompts  # noqa: E402

PROMPTS = load_prompts(__file__)

RELATIONS = PROMPTS["tables"]["RELATIONS"]
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
                              "instructions": PROMPTS["instructions"]["question_1"],
                              "criteria": RELATIONS}}
    for i in cuts:
        before = sep.join(w.text for w in ws[:i])
        after = sep.join(w.text for w in ws[i:])
        questions[f"cut_{i}"] = {
            "type": "noul",
            "instructions": {"question": PROMPTS["instructions"]["question_2"],
                             "before": before, "after": after}}
    answers = yield {"state": J.state(sent, token_sent, span, lang), "questions": questions}

    relation = J.choice(answers["relation"])
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
        if ws[b - 1].text in SENT_END or not (seg and seg[-1].text in TIME_TAILS):
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
    if relation.endswith("-91") and len(groups) != 2:
        relation = "and"
    parts = [{"text": J.join(g, token_sent, lang), "span": J.span_of(g), "role": f"op{n}"}
             for n, g in enumerate(groups, 1)]
    if relation in ("but-91", "contrast-91", "unexpected-co-occurrence-91"):
        for part, role in zip(parts, ("ARG1", "ARG2")):
            part["role"] = role
    elif relation.startswith("have-"):
        for p, r in zip(parts, _arg_roles(relation, raw)):
            p["role"] = r
    return {"relation": relation, "parts": parts}


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
