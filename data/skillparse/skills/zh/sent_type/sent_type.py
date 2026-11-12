"""sent_type (kind: jev): what kind of piece is this?

One choice question: the piece's type; and, when the piece is one word that
PropBank has, a second choice: how the word is used here (an event, a state,
a manner adverb, a thing). A word Jev calls stop but that is used as an event
or a state goes to predicate, which gives it its sense, aspect and arguments.
A `stop` leaf is then built by rule: a pronoun from the pronoun table, any
other leaf the piece as written, without a sense (an English word lowercased).
A function word, or a word right before the particle 地, is never asked its use. A one-word pronoun needs no question at all. A
piece with a comma inside that Jev gives even a fair chance of being discourse
goes to discourse, which can still answer none (and so hand it to predicate).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import jevlib as J  # noqa: E402
from prompt_loader import load_prompts  # noqa: E402

PROMPTS = load_prompts(__file__)

DISCOURSE_IF_COMMA = 0.12
TYPES = PROMPTS["tables"]["TYPES"]


EVENT_IF = 0.5      # event + state probability of the use question that sends a stop word to predicate
USES = PROMPTS["tables"]["USES"]


NP_IF_SPLIT = 0.2       # np_phrase (or predicate) probability that keeps a stop piece of several words from one leaf
ONE_VERB_IF = 0.6       # yes to under_one_verb that keeps a piece with a comma inside one predicate
NOT_AGENT = set("记者 学者 作者 笔者 前者 后者 两者 二者 再者 患者 长者 使者".split())
UNDER_ONE_VERB = (PROMPTS["instructions"]["UNDER_ONE_VERB"])


def agent_noun(ws, lang):
    """One word built as a verb + 者, the one who does or undergoes the act: np_phrase writes 者 and the event."""
    if lang != "zh" or len(ws) != 1:
        return False
    t = ws[0].text
    return len(t) >= 2 and t.endswith("者") and t not in NOT_AGENT and bool(J.rolesets(t[:-1], lang))


def run(sent, token_sent, lang, text, span, **_):
    raw = J.inside(token_sent, span, lang)
    ws = J.content(raw, lang) or raw
    senses = J.rolesets(ws[0].text, lang) if len(ws) == 1 else []
    nxt = [w for w in J.words(token_sent, lang) if w.first == span[1] + 1]
    before_de = lang == "zh" and ((nxt and nxt[0].text == "地") or (len(raw) > 1 and raw[-1].text == "地"))
    if not J.content(raw, lang) or before_de:
        senses = []     # a function word, or a manner adverb before 地: a plain leaf, never an event
    answers = {}
    if len(ws) == 1 and J.pronoun(ws[0].text, lang):
        kind = "stop"
    else:
        inner = [w for w in raw[1:-1] if w.text in "，,；;"]
        q = {"type": {"type": "choice",
                      "instructions": PROMPTS["instructions"]["question_2"],
                      "criteria": TYPES}}
        if senses:
            q["use"] = {"type": "choice",
                        "instructions": PROMPTS["instructions"]["question_3"],
                        "criteria": USES}
        if inner:
            q["under_one_verb"] = {"type": "noul", "instructions": UNDER_ONE_VERB,
                                   "criteria": PROMPTS["tables"]["inline_options_3"]}
        answers = yield {"state": J.state(sent, token_sent, span, lang), "questions": q}
        kind = J.choice(answers["type"])
        one_verb = bool(inner) and J.yes(answers.get("under_one_verb"), ONE_VERB_IF)
        if kind == "discourse" and one_verb:
            kind = "predicate"      # a speech verb's content, or a noun's description, is not a second clause
        if kind == "predicate" and inner and not one_verb \
                and J.probability(answers["type"], "discourse") >= DISCOURSE_IF_COMMA:
            kind = "discourse"      # several clauses: discourse may still answer none, which goes to predicate
        if kind == "stop" and (len(J.content(raw, lang)) >= 2 or agent_noun(ws, lang)):
            np = J.probability(answers["type"], "np_phrase")
            pr = J.probability(answers["type"], "predicate") if len(ws) > 1 else 0.0
            if max(np, pr) >= NP_IF_SPLIT:
                kind = "np_phrase" if np >= pr else "predicate"     # a modifier and a head, not one atomic leaf
        use = answers.get("use")
        if kind == "stop" and senses and J.probability(use, "event") + J.probability(use, "state") >= EVENT_IF:
            kind = "predicate"      # an event or state word alone in its piece: sense, aspect, arguments outside
    if kind != "stop":
        return {"type": kind, "graph": {}, "outside": []}
    return {"type": "stop", "graph": leaf(ws, token_sent, span, lang), "outside": []}


DEMONSTRATIVES = {"zh": {"这": "singular", "那": "singular", "此": "singular", "这些": "plural", "那些": "plural"}}
INTERROGATIVES = {"zh": set("什么 谁 哪里 哪儿 啥".split())}


def leaf(ws, token_sent, span, lang):
    if len(ws) == 1:
        g = J.pronoun_graph("x", ws[0].text, ws[0].span, lang)
        if g:
            return g
        t = ws[0].text.lower()
        if t in INTERROGATIVES.get(lang, ()):
            return {"nodes": [{"var": "x", "concept": "umr-unknown", "span": ws[0].span}], "edges": [], "attrs": []}
        nxt = [w for w in J.words(token_sent, lang) if w.first == span[1] + 1]
        num = DEMONSTRATIVES.get(lang, {}).get(t)
        if num and (not nxt or J.is_function(nxt[0], lang)):   # a pro-form, not the determiner of a noun after it
            return {"nodes": [{"var": "x", "concept": "thing", "span": ws[0].span}], "edges": [],
                    "attrs": [["x", "refer-number", num]]}
    ws = J.trim(ws, lang) or ws
    concept = J.join(ws, token_sent, lang) if ws else J.text(token_sent, span, lang)
    if lang != "zh":
        concept = concept.lower()
    return {"nodes": [{"var": "x", "concept": concept, "span": J.span_of(ws) if ws else list(span)}],
            "edges": [], "attrs": []}
