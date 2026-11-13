"""What sent_type (kind: jev) works from, for every language: words, function words, pronouns.

Jev only judges (noul / choice); it never writes a span or a concept. So what the skill could
answer is listed here first, from the tokens:

  - words: Chinese input is one token per character, and a sentence is cut only at punctuation
    (there is no word segmenter); any other language keeps its tokens. A word is
    (first, last, text) in token numbers.
  - pronouns, function words: fixed lists per language, no question.
"""
import functools
import os
import re
import importlib.util
from dataclasses import dataclass


HERE = os.path.dirname(os.path.abspath(__file__))

# the PropBank tool every skill uses: tools/ next to the procedures
_spec = importlib.util.spec_from_file_location(
    "jevumr_propbank", os.path.join(os.path.dirname(HERE), "tools", "propbank.py"))
_propbank = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_propbank)

PUNCT = re.compile(r"^[\W_]+$")
# words a fragment expresses without a node of their own (as in coverage.py)
FUNCTION_ZH = set("""
的 地 得 之 所 了 着 过 是 在 于 从 对 向 把 被 将 以 为 和 与 及 而 并 且 但 虽 然 因 或
不 没 未 别 会 能 可 要 应 该 吗 呢 吧 啊 呀 个 由 即 则 并且 而且 但是 虽然 因为 所以 由于
如果 为了 以及 或者 还是 就 也 都 还 又 已 已经 曾 曾经 正在 正 被 让 使 给 跟 同 当 自 向 往 们
""".split())
FUNCTION_EN = set("""
a an the of to in on at by for with from as into onto upon about and or but nor so yet if
because although though while whereas whether than then who whom whose which that where when
is am are was were be been being has have had having do does did will would shall should can
could may might must not n't never 's
""".split())

# web: Uzbek conjunctions, postpositions and particles
FUNCTION_UZ = set("""
va hamda yoki yo lekin ammo biroq balki esa ham chunki agar garchi go'yo deb ki-ku
bilan uchun haqida kabi singari sari tomon orqali keyin so'ng oldin beri qadar sababli tufayli
emas edi ekan emish bo'lsa ham-da
""".split())


@dataclass(frozen=True)
class Word:
    first: int
    last: int
    text: str

    @property
    def span(self):
        return [self.first, self.last]


# -- words -------------------------------------------------------------------

def words(token_sent, lang):
    return _words(tuple((int(k), str(t)) for k, t in token_sent), lang)


@functools.lru_cache(maxsize=4096)
def _words(tokens, lang):
    if lang != "zh":
        def _clean(t):
            m = re.match(r"^([^\W\d_]+)[,;]", t)
            c = m.group(1) if m else t.strip(".,;:!?\"'")
            return c or t
        return tuple(Word(k, k, _clean(t)) for k, t in tokens)
    # web: no jieba. sent_type needs no words, so a Chinese piece is cut only at punctuation: a
    # run of tokens between punctuation marks is one word, each mark a word of its own
    out = []
    for k, t in tokens:
        if PUNCT.match(t) or not out or PUNCT.match(out[-1].text):
            out.append(Word(k, k, t))
        else:
            prev = out.pop()
            gap = " " if re.match(r"[A-Za-z0-9]", t) and re.search(r"[A-Za-z0-9]$", prev.text) else ""
            out.append(Word(prev.first, k, prev.text + gap + t))
    return tuple(_glue_names(out))


NAME_DOTS = set("·・．•‧")


# characters of transliterated foreign names (the usual table), without those that are common words
# on their own (比, 多, 达, 内, 里, 加, 什, 提, 切, ...)
TRANSLIT = set("""
阿 埃 艾 安 奥 巴 拜 邦 贝 波 伯 博 布 茨 黛 丹 德 迪 蒂 杜 顿 厄 恩 尔 法 菲 芬 弗 伏 福 盖 戈 格 古 瓜 圭
哈 汉 赫 胡 霍 基 吉 杰 捷 喀 卡 凯 坎 科 克 肯 库 奎 拉 莱 兰 朗 劳 勒 雷 蕾 莉 利 丽 林 琳 卢 鲁 路 伦 罗
洛 玛 马 迈 麦 曼 梅 蒙 米 莫 姆 穆 纳 娜 奈 尼 妮 涅 纽 努 诺 欧 帕 佩 彭 皮 珀 普 齐 奇 恰 乔 琼 萨 塞 桑
瑟 森 沙 莎 史 斯 苏 索 塔 泰 坦 汤 特 图 托 瓦 威 韦 维 沃 乌 西 希 谢 辛 雅 亚 扬 耶 伊 尤 约 泽 扎 詹 兹
""".split())


def _glue_names(ws):
    """A foreign name written with a middle dot (X·Y, X·Y·Z) is one word: each
    dot with the words right next to it, when both are letters (not digits,
    punctuation or function words). Then the words right before and after the
    dotted name that are made only of transliteration characters are pieces of
    it the segmenter cut off (X | Y·Z | W -> XY·ZW)."""
    ws = list(ws)
    i = 1
    while i < len(ws) - 1:
        a, d, b = ws[i - 1], ws[i], ws[i + 1]
        if d.text in NAME_DOTS and _name_side(a) and _name_side(b):
            ws[i - 1:i + 2] = [Word(a.first, b.last, a.text + d.text + b.text)]
        else:
            i += 1
    i = 0
    while i < len(ws):
        w = ws[i]
        if len(w.text) > 1 and any(c in NAME_DOTS for c in w.text) and not re.search(r"\d", w.text):
            if i > 0 and _translit(ws[i - 1]) and ws[i - 1].last + 1 == w.first:
                ws[i - 1:i + 1] = [Word(ws[i - 1].first, w.last, ws[i - 1].text + w.text)]
                i -= 1
                continue
            if i + 1 < len(ws) and _translit(ws[i + 1]) and w.last + 1 == ws[i + 1].first:
                ws[i:i + 2] = [Word(w.first, ws[i + 1].last, w.text + ws[i + 1].text)]
                continue
        i += 1
    return ws


def _translit(w):
    """A word made only of transliteration characters, not a function word."""
    return bool(w.text) and w.text not in FUNCTION_ZH and all(c in TRANSLIT for c in w.text)


def _name_side(w):
    return not is_punct(w) and not re.search(r"\d", w.text) and w.text not in FUNCTION_ZH


def inside(token_sent, span, lang):
    """The words of a span, a word that crosses its edge cut at the edge."""
    first, last = span
    tok = dict((int(k), str(t)) for k, t in token_sent)
    sep = "" if lang == "zh" else " "
    out = []
    for w in words(token_sent, lang):
        a, b = max(w.first, first), min(w.last, last)
        if a > b:
            continue
        out.append(w if (a, b) == (w.first, w.last) else Word(a, b, sep.join(tok[k] for k in range(a, b + 1))))
    return out


def text(token_sent, span, lang):
    sep = "" if lang == "zh" else " "
    return sep.join(str(t) for k, t in token_sent if span[0] <= int(k) <= span[1])


def is_punct(w):
    return bool(PUNCT.match(w.text))


def is_function(w, lang):
    return is_punct(w) or (w.text.lower() in (FUNCTION_ZH if lang == "zh" else FUNCTION_UZ if lang == "uz"
                                              else FUNCTION_EN))


def content(ws, lang):
    return [w for w in ws if not is_function(w, lang)]


def state(sent, token_sent, span, lang, **more):
    """The state every question of a piece is judged against: the sentence, the
    piece, and the sentence with the piece in 【】."""
    sep = "" if lang == "zh" else " "
    toks = [(int(k), str(t)) for k, t in token_sent]
    marked = sep.join(("【" if k == span[0] else "") + t + ("】" if k == span[1] else "") for k, t in toks)
    return {"sentence": sent, "piece": text(token_sent, span, lang), "sentence_with_piece_marked": marked,
            "language": {"zh": "Chinese", "uz": "Uzbek"}.get(lang, "English"), **more}


# -- answers -----------------------------------------------------------------

def choice(answer):
    return (answer or {}).get("choice")


def yes(answer, threshold=0.5):
    return (answer or {}).get("noul", 0.0) >= threshold


def probability(answer, option):
    return (answer or {}).get("probabilities", {}).get(option, 0.0)


def trim(ws, lang):
    ws = list(ws)
    while ws and is_function(ws[0], lang):
        ws.pop(0)
    while ws and (is_function(ws[-1], lang)):
        ws.pop()
    return ws


def span_of(ws):
    return [ws[0].first, ws[-1].last]


def join(ws, token_sent, lang):
    return text(token_sent, span_of(ws), lang)


# -- PropBank ----------------------------------------------------------------

def rolesets(lemma, lang):
    """PropBank rolesets of a lemma, [] if it has none."""
    return _propbank._rolesets(lemma, lang)      # web: the data (propbank_lookup is Markdown)


# -- pronouns ----------------------------------------------------------------

PRONOUNS = {
    # web: Uzbek, with the case forms a pronoun takes
    "uz": {**{w: ("person", "1st", "singular") for w in "men meni menga menda mendan mening".split()},
           **{w: ("person", "2nd", "singular") for w in "sen seni senga senda sendan sening".split()},
           **{w: ("person", "3rd", "singular") for w in "u uni unga unda undan uning".split()},
           **{w: ("person", "1st", "plural") for w in "biz bizni bizga bizda bizdan bizning".split()},
           **{w: ("person", "2nd", "plural") for w in "siz sizni sizga sizda sizdan sizning".split()},
           **{w: ("person", "3rd", "plural") for w in "ular ularni ularga ularda ulardan ularning".split()}},
    "zh": {"我": ("person", "1st", "singular"), "你": ("person", "2nd", "singular"),
           "您": ("person", "2nd", "singular"), "他": ("person", "3rd", "singular"),
           "她": ("person", "3rd", "singular"), "它": ("thing", "3rd", "singular"),
           "我们": ("person", "1st", "plural"), "咱们": ("person", "1st", "plural"),
           "你们": ("person", "2nd", "plural"), "他们": ("person", "3rd", "plural"),
           "她们": ("person", "3rd", "plural"), "它们": ("thing", "3rd", "plural")},
    "en": {"i": ("person", "1st", "singular"), "me": ("person", "1st", "singular"),
           "my": ("person", "1st", "singular"), "you": ("person", "2nd", "singular"),
           "your": ("person", "2nd", "singular"), "he": ("person", "3rd", "singular"),
           "him": ("person", "3rd", "singular"), "his": ("person", "3rd", "singular"),
           "she": ("person", "3rd", "singular"), "her": ("person", "3rd", "singular"),
           "it": ("thing", "3rd", "singular"), "its": ("thing", "3rd", "singular"),
           "we": ("person", "1st", "plural"), "us": ("person", "1st", "plural"),
           "our": ("person", "1st", "plural"), "they": ("person", "3rd", "plural"),
           "them": ("person", "3rd", "plural"), "their": ("person", "3rd", "plural")},
}


def pronoun(word_text, lang):
    t = word_text.strip().lower()
    if lang == "zh":
        t = t[:-1] if t.endswith("的") and t[:-1] in PRONOUNS["zh"] else t
    elif lang == "en":
        for suf in ("'s", "\u2019s", "'ll", "'d", "'m", "'re", "'ve"):
            if t.endswith(suf) and t[:-len(suf)] in PRONOUNS["en"]:
                t = t[:-len(suf)]     # he's / you're / I'll: the pronoun plus a contracted verb
                break
    return PRONOUNS.get(lang, {}).get(t)


def pronoun_graph(var, word_text, span, lang):
    p = pronoun(word_text, lang)
    if not p:
        return None
    concept, person, number = p
    return {"nodes": [{"var": var, "concept": concept, "span": list(span)}], "edges": [],
            "attrs": [[var, "refer-person", person], [var, "refer-number", number]]}
