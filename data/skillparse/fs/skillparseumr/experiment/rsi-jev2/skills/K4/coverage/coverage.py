"""coverage (kind: rule): the content words of a piece that nothing took.

    run(span, graph, open, alignment, token_sent, outside=None, **context)
        -> {"gaps": [{"text": "far", "span": [7, 7], "role": "mod"}, ...]}

A token of the piece's span is covered when it is in the span of an `open`
placeholder, in the head's `alignment`, in the `span` of a node of the
fragment, or in the `at` of an `outside` item (a pronoun such as 他的 that
stands for a participant written elsewhere and so has no node of its own). Every maximal run of uncovered tokens is a gap, trimmed of function
words and punctuation at both ends; a run with no content word left is not a
gap. Gaps go back to sent_type and hang off the fragment's root as `mod`.

Function words are the ones a fragment expresses without a node: articles,
auxiliaries and copulas, aspect particles, negation (`:polarity`), modals
(modal strength), subordinators and role-marking prepositions. Temporal
prepositions (after, before, until, ...) are content words: UMR gives them a
node. Numbers are not content words either: a fragment writes them as
attributes (:quant 3, :year 1853), which have no span.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import jevlib as J  # noqa: E402

FUNCTION_EN = set("""
a an the this that these those of to in on at by for with from as into onto upon about
and or but nor so yet if because although though while whereas whether than then
who whom whose which what that where when why how
is am are was were be been being has have had having do does did done
will would shall should can could may might must ought
not no n't never
it its 's ' " , . ; : ! ? - -- ( ) [ ] ` `` ''
""".split())
FUNCTION_ZH = set("""
的 地 得 之 所 了 着 过 是 在 于 从 对 向 把 被 将 以 为 和 与 及 而 并 且 但 虽 然 因 或
不 没 未 别 会 能 可 要 应 该 吗 呢 吧 啊 呀 个 由 间 中 内 里 其 此 等 即 则
， 。 、 ； ： “ ” ‘ ’ （ ） 《 》 ！ ？ · — …
""".split())

# Chinese works on jieba words, not characters: a whole word is a function word or not.
# Localizers (在…上), the plural suffix 们, the list-closing 等, frames (除开…外, 自…后), modals
# (modal strength) and connectives / topic markers get no node. 也 / 还 / 又 stay content (gold keeps them).
FUNCTION_ZH_WORDS = FUNCTION_ZH | set("""
们 上 中 里 内 外 等 除开 除了 自 关于 有关 对于 根据 应当 应该 可以 以便 以及 并且 而且 但是 虽然
因为 所以 由于 如果 为了
""".split())
NUMBER = r"[\d.,]+|[一二三四五六七八九十百千万亿两零〇]+"


def _content_word(w):
    t = w.text.strip()
    return bool(t) and t not in FUNCTION_ZH_WORDS and not J.is_punct(w) and not re.fullmatch(NUMBER, t)


def _zh_gaps(span, covered, token_sent):
    """Maximal runs of uncovered words (a word is covered when any of its tokens is), broken at
    clause punctuation, trimmed of function words at both ends."""
    if not (isinstance(span, (list, tuple)) and len(span) == 2):
        return []
    ws = J.inside(token_sent, [int(span[0]), int(span[1])], "zh")
    gaps, run_ = [], []
    for w in list(ws) + [None]:     # None flushes the last run
        if w is not None and w.text not in J.CLAUSE_PUNCT \
                and not any(k in covered for k in range(w.first, w.last + 1)):
            run_.append(w)
            continue
        while run_ and not _content_word(run_[0]):
            run_.pop(0)
        while run_ and not _content_word(run_[-1]):
            run_.pop()
        if run_:
            gaps.append({"text": J.join(run_, token_sent, "zh"), "span": J.span_of(run_), "role": "mod"})
        run_ = []
    return gaps

def run(span, graph, open, alignment, token_sent, outside=None, lang="en", **_):
    words = {int(k): str(w) for k, w in token_sent}
    covered = set()

    def cover(s):
        if isinstance(s, (list, tuple)) and len(s) == 2 and all(isinstance(v, int) for v in s):
            covered.update(range(s[0], s[1] + 1))

    for item in open or []:
        if isinstance(item, dict):
            cover(item.get("span"))
    for item in outside or []:
        if isinstance(item, dict):
            cover(item.get("at"))
    cover(alignment)
    for nd in (graph or {}).get("nodes") or []:
        if isinstance(nd, dict):
            cover(nd.get("span"))

    if lang == "zh":
        return {"gaps": _zh_gaps(span, covered, token_sent)}

    function = FUNCTION_ZH if lang == "zh" else FUNCTION_EN

    def content(k):
        w = words.get(k, "").lower()
        return bool(w) and w not in function and not re.fullmatch(r"\W+", w) \
            and not re.fullmatch(r"[\d.,]+|[一二三四五六七八九十百千万亿两零〇]+", w)

    gaps, run_ = [], []
    first, last = (span[0], span[1]) if isinstance(span, (list, tuple)) and len(span) == 2 else (1, 0)
    for k in range(first, last + 2):          # one past the end flushes the last run
        if first <= k <= last and k in words and k not in covered:
            run_.append(k)
            continue
        while run_ and not content(run_[0]):
            run_.pop(0)
        while run_ and not content(run_[-1]):
            run_.pop()
        if run_:
            sep = "" if lang == "zh" else " "
            gaps.append({"text": sep.join(words[t] for t in run_), "span": [run_[0], run_[-1]], "role": "mod"})
        run_ = []
    return {"gaps": gaps}
