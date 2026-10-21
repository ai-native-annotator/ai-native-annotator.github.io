"""What every jev skill of experiment/jevumr shares: words, options, phrases, numbers.

Jev only judges (noul / choice / score); it never writes a span or a concept.
So everything a skill could answer is listed here first, from the tokens:

  - words: the input is one token per Chinese character, so a sentence is cut
    into words with jieba; a word is (first, last, text) in token numbers. A
    "which word" question is a choice among the words of the piece.
  - phrases: a "which part of the clause is this word in" question per word,
    then runs of words with the same answer are the phrases (placeholders).
  - numbers, pronouns, function words: fixed lists, no question.
"""
import functools
import logging
import os
import re
import importlib.util
from dataclasses import dataclass

import jieba
import jieba.posseg

jieba.setLogLevel(logging.WARNING)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = HERE
while not os.path.isdir(os.path.join(ROOT, "skillsets")) and os.path.dirname(ROOT) != ROOT:
    ROOT = os.path.dirname(ROOT)        # the repository, however deep this copy of the skills is

_spec = importlib.util.spec_from_file_location(
    "jevumr_propbank", os.path.join(ROOT, "skillsets", "tools", "propbank.py"))
_propbank = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_propbank)

PUNCT = re.compile(r"^[\W_]+$")
CLAUSE_PUNCT = set("，,；;。！!？?")
# words a fragment expresses without a node of their own (as in coverage.py)
FUNCTION_ZH = set("""
的 地 得 之 所 了 着 过 是 在 于 从 对 向 把 被 将 以 为 和 与 及 而 并 且 但 虽 然 因 或
不 没 未 别 会 能 可 要 应 该 吗 呢 吧 啊 呀 个 由 即 则 并且 而且 但是 虽然 因为 所以 由于
如果 为了 以及 或者 还是 就 也 都 还 又 已 已经 曾 曾经 正在 正 被 让 使 给 跟 同 当 自 向 往 们
""".split())
# the plural suffix: cut off its noun as a word of its own (see _parts), never a node of its own;
# gold writes it as :refer-number plural on the noun. Lexicalised words with 们 stay whole.
PLURAL = "们"
PLURAL_KEEP = {"哥们", "爷们", "娘们", "姐们", "哥儿们", "爷儿们"}
FUNCTION_EN = set("""
a an the of to in on at by for with from as into onto upon about and or but nor so yet if
because although though while whereas whether than then who whom whose which that where when
is am are was were be been being has have had having do does did will would shall should can
could may might must not n't never 's
""".split())


@dataclass(frozen=True)
class Word:
    first: int
    last: int
    text: str

    @property
    def span(self):
        return [self.first, self.last]

    @property
    def key(self):
        """The option name Jev sees for this word: the word and where it starts."""
        return f"{self.text} ({self.first})"


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
    owner, chars = [], []           # char offset -> token number
    for k, t in tokens:
        chars.append(t)
        owner += [k] * len(t)
    out = []
    at = 0
    for piece in _split(jieba.cut("".join(chars), HMM=False)):
        first, last = owner[at], owner[at + len(piece) - 1]
        at += len(piece)
        if out and first <= out[-1].last:           # a word ending inside a token: one word
            prev = out.pop()
            out.append(Word(prev.first, last, prev.text + piece))
        else:
            out.append(Word(first, last, piece))
    return tuple(_glue_unknown(_glue_names(out)))


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


def _glue_unknown(ws):
    """A foreign name the dictionary does not know comes out of jieba in pieces
    (single characters, or a character and a short word): neighbouring words
    made only of transliteration characters, at least one of them a single
    character and three characters or more in all, are one word."""
    out, i = [], 0
    while i < len(ws):
        j = i
        while j < len(ws) and _translit(ws[j]) and (j == i or ws[j].first == ws[j - 1].last + 1):
            j += 1
        run = ws[i:j]
        txt = "".join(w.text for w in run)
        if len(run) > 1 and len(txt) >= 3 and any(len(w.text) == 1 for w in run):
            out.append(Word(run[0].first, run[-1].last, txt))
            i = j
        else:
            out.append(ws[i])
            i += 1
    return out


def _name_side(w):
    return not is_punct(w) and not re.search(r"\d", w.text) and w.text not in FUNCTION_ZH


DEMONSTRATIVE_HEADS = ("该", "此")
COUNTERS = ("这", "那", "该", "此", "每", "哪")
CLASSIFIERS = set("个 名 位 架 本 张 篇 条 只 件 座 部 台 辆 枚 份 种 家 所 头 匹 艘 颗 幅".split())
PREFIXES = ("即将", "未", "最", "甚")
SPLIT_KEEP = set("""
此外 此时 此后 此前 此刻 此致 此间 此地 该当 该死 该着 未来 未必 未曾 最后 最近 最初 最终 最好 最为 甚至 甚么
""".split())
WHOLE_TAGS = ("i", "nr", "ns", "nt", "nz")


def _split(pieces):
    """Cut a jieba word where the gold has two concepts (see _parts)."""
    jieba.dt.check_initialized()
    tags = jieba.posseg.dt.word_tag_tab
    freq = jieba.dt.FREQ
    prev = ""
    for w in pieces:
        for p in _parts(w, prev, tags, freq):
            yield p
            prev = p


def _parts(w, prev, tags, freq):
    """The pieces of one jieba word, never cutting an idiom, a name or a word of
    SPLIT_KEEP:
      - a demonstrative fused with its noun (该国, 此人 -> 该 | 国, 此 | 人);
      - right after a demonstrative or a number, a classifier fused with its
        noun (这 | 本书 -> 这 | 本 | 书);
      - a four-character verb + object or noun + verb phrase whose halves are
        both common words (发生爆炸, 巡回演唱)."""
    tag = tags.get(w, "n")
    if len(w) >= 2 and w.endswith(PLURAL) and w not in PLURAL_KEEP and w not in PRONOUNS["zh"] \
            and not tag.startswith("r"):
        return [w[:-1], PLURAL]     # noun + plural suffix: the noun alone is the concept
    if len(w) < 2 or w in SPLIT_KEEP or tag in WHOLE_TAGS:
        return [w]
    if len(w) >= 3 and w[0] == "总" and freq.get(w[1:], 0) > 1000 and tags.get(w[1:], "").startswith("n"):
        return [w[0], w[1:]]        # a rank prefix on a common noun: gold writes noun :mod 总
    head, rest = w[0], w[1:]
    if head in DEMONSTRATIVE_HEADS and tag not in ("c", "d", "p", "t", "f", "v", "a") \
            and rest not in FUNCTION_ZH and (len(rest) == 1 or tags.get(rest, "").startswith("n")):
        return [head, rest]
    if head in CLASSIFIERS and (prev in COUNTERS or number(prev) is not None) \
            and freq.get(rest, 0) > 1000 and tags.get(rest, "").startswith("n"):
        return [head, rest]
    if len(w) == 4 and freq.get(w[:2], 0) > 1000 and freq.get(w[2:], 0) > 1000:
        return [w[:2], w[2:]]
    return [w]


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


def outside(token_sent, span, lang):
    first, last = span
    return [w for w in words(token_sent, lang) if w.last < first or w.first > last]


def text(token_sent, span, lang):
    sep = "" if lang == "zh" else " "
    return sep.join(str(t) for k, t in token_sent if span[0] <= int(k) <= span[1])


def is_punct(w):
    return bool(PUNCT.match(w.text))


def is_function(w, lang):
    return is_punct(w) or (w.text.lower() in (FUNCTION_ZH if lang == "zh" else FUNCTION_EN))


def content(ws, lang):
    return [w for w in ws if not is_function(w, lang)]


def state(sent, token_sent, span, lang, **more):
    """The state every question of a piece is judged against: the sentence, the
    piece, and the sentence with the piece in 【】."""
    sep = "" if lang == "zh" else " "
    toks = [(int(k), str(t)) for k, t in token_sent]
    marked = sep.join(("【" if k == span[0] else "") + t + ("】" if k == span[1] else "") for k, t in toks)
    return {"sentence": sent, "piece": text(token_sent, span, lang), "sentence_with_piece_marked": marked,
            "language": "Chinese" if lang == "zh" else "English", **more}


def by_key(ws):
    return {w.key: w for w in ws}


# -- answers -----------------------------------------------------------------

def choice(answer):
    return (answer or {}).get("choice")


def yes(answer, threshold=0.5):
    return (answer or {}).get("noul", 0.0) >= threshold


def probability(answer, option):
    return (answer or {}).get("probabilities", {}).get(option, 0.0)


def ranked(answer):
    """The options of a choice answer, most probable first."""
    probs = (answer or {}).get("probabilities", {})
    return sorted(probs, key=lambda k: -probs[k])


# -- phrases -----------------------------------------------------------------

STACK_BREAK = set("的 之 、 ， , ； ;".split())
DEGREE = set("很 非常 最 更 更加 极 极其 十分 相当 比较 太 特别 颇".split())


def _bridge(ws, labels, bridge):
    """The labels after bridging (see runs): widest label first; a label whose
    stretch lies inside one already bridged is left as it is."""
    labels = dict(labels)
    where = {}
    for k, w in enumerate(ws):
        lab = labels.get(w)
        if lab in bridge:
            a, b = where.get(lab, (k, k))
            where[lab] = (min(a, k), max(b, k))
    done = []
    for lab, (a, b) in sorted(where.items(), key=lambda x: x[1][0] - x[1][1]):
        if b - a < 2 or any(c <= a and b <= d for c, d in done):
            continue
        between = ws[a + 1:b]
        if any(str(labels.get(w) or "").startswith("@") or w.text in CLAUSE_PUNCT for w in between):
            continue        # never across the head or into another clause
        if any(where.get(labels.get(w), (a, b))[0] < a or where.get(labels.get(w), (a, b))[1] > b
               for w in between):
            continue        # another bridged role reaches outside: the two would cross
        for w in ws[a:b + 1]:
            labels[w] = lab
        done.append((a, b))
    return labels


def _stack_break(last, pending, lang):
    """Whether a stacked modifier run ends after `last` (see runs)."""
    if any(p.text in STACK_BREAK for p in pending):
        return True
    if pending or lang != "zh":
        return False
    jieba.dt.check_initialized()
    return last.text not in DEGREE and not jieba.posseg.dt.word_tag_tab.get(last.text, "").startswith("d")


def runs(ws, labels, lang, bridge=(), stack=()):
    """Runs of words with the same label, in order. A word without a label (a
    function word or punctuation nobody asked about) joins a run only between
    two words of that run's label, so a participant that is a clause with
    commas in it stays one run. Each run is (label, [words]) with function
    words trimmed off both ends.

    Two options, off by default:
      bridge  labels whose words make one phrase from the first to the last,
              even when a word inside got another label (the verb of a
              relative clause, a time word, a marker inside an argument):
              every word between takes the label, unless a "@..." label (the
              head), clause punctuation, or another bridged label reaching
              outside the stretch is between them;
      stack   labels whose neighbouring words are separate modifiers, not one
              phrase (A的 B N; a country and a state): a run of them is cut at
              的 / 之 / 、 / a comma, and in Chinese between two words with
              nothing between them unless the first is a degree adverb."""
    if bridge:
        labels = _bridge(ws, labels, bridge)
    out, cur, pending = [], None, []
    for w in ws:
        lab = labels.get(w)
        if lab is None:
            if cur:
                pending.append(w)
            continue
        if cur and cur[0] == lab and not (lab in stack and _stack_break(cur[1][-1], pending, lang)):
            cur[1].extend(pending + [w])
        else:
            cur = _close(out, cur)
            cur = (lab, [w])
        pending = []
    _close(out, cur)
    trimmed = []
    for lab, group in out:
        group = trim(group, lang)
        if group:
            trimmed.append((lab, group))
    return trimmed


def _close(out, cur):
    if cur:
        out.append(cur)
    return None


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
    return _propbank.propbank_lookup([lemma], lang).get(lemma, [])


def roleset_text(r):
    roles = "; ".join(f"{k}: {v}" for k, v in (r.get("roles") or {}).items())
    name = r.get("name") or ""
    return f"{name} | {roles}" if name else roles


# -- pronouns ----------------------------------------------------------------

PRONOUNS = {
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


# -- numbers -----------------------------------------------------------------

DIGITS = {"零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
          "八": 8, "九": 9}
UNITS = {"十": 10, "百": 100, "千": 1000}
BIG = {"万": 10 ** 4, "亿": 10 ** 8}


def number(s):
    """A number written in digits or Chinese numerals, or None: 1,500 -> 1500,
    二十 -> 20, 5万 -> 50000, 3.5 -> 3.5."""
    s = s.strip().replace(",", "").replace("，", "")
    if not s:
        return None
    m = re.fullmatch(r"(\d+(?:\.\d+)?)([万亿]?)", s)
    if m:
        v = float(m.group(1)) * BIG.get(m.group(2), 1)
        return int(v) if v == int(v) else v
    if not all(c in DIGITS or c in UNITS or c in BIG for c in s):
        return None
    if all(c in DIGITS for c in s) and len(s) > 1:       # 二〇一七 read digit by digit
        return int("".join(str(DIGITS[c]) for c in s))
    total, section, cur = 0, 0, 0
    for c in s:
        if c in DIGITS:
            cur = DIGITS[c]
        elif c in UNITS:
            section += (cur or 1) * UNITS[c]
            cur = 0
        else:
            total += (section + cur) * BIG[c]
            section, cur = 0, 0
    return total + section + cur

# -- name parts --------------------------------------------------------------

NAME_MARK_CHARS = "《》“”「」\""
NAME_DOT_CHARS = "·・．•‧"
NOT_NAME_START = set("前 原 现 第".split())


def name_parts(piece, lang):
    """The :op parts of a name as the gold writes them. A title or quote mark
    and a middle dot are parts of their own; a stretch between dots (a
    transliterated name) stays whole; elsewhere the parts are words, with a
    single leftover character joined to the word after it (an unknown name the
    segmenter broke) and a place name at the start of a longer name word (a
    country + an organization) a part of its own."""
    if lang != "zh":
        return piece.split()
    dotted = any(c in NAME_DOT_CHARS for c in piece)
    parts = []
    for chunk in re.split("([" + re.escape(NAME_MARK_CHARS + NAME_DOT_CHARS) + "])", piece):
        chunk = chunk.strip()
        if not chunk or chunk in "，,。；;、":
            continue
        if chunk in NAME_MARK_CHARS or chunk in NAME_DOT_CHARS or (dotted and not re.search(r"\d", chunk)):
            parts.append(chunk)
        else:
            parts += _name_words(chunk)
    return parts


def _name_words(chunk):
    jieba.dt.check_initialized()
    tags = jieba.posseg.dt.word_tag_tab
    freq = jieba.dt.FREQ
    ws = []
    for w in jieba.cut(chunk):
        w = w.strip()
        if w and w not in "，,。；;、":
            ws += _place_first(w, tags, freq)
    out, k = [], 0
    while k < len(ws):
        if _lone(ws[k]) and not (k > 0 and _lone(ws[k - 1])) and k + 1 < len(ws) and len(ws[k + 1]) > 1 \
                and re.fullmatch(r"[一-鿿]+", ws[k + 1]) and ws[k + 1] not in FUNCTION_ZH:
            out.append(ws[k] + ws[k + 1])
            k += 2
        else:
            out.append(ws[k])
            k += 1
    return out


def _lone(w):
    """A single Chinese character that is not a function word, pronoun, numeral
    or modifier like 前: a piece of a name the segmenter did not know."""
    return len(w) == 1 and "一" <= w <= "鿿" and w not in FUNCTION_ZH and w not in PRONOUNS["zh"] \
        and w not in NOT_NAME_START and w not in DIGITS and w not in UNITS and w not in BIG


def _place_first(w, tags, freq):
    """A name word that starts with a place name (a country + a party, an
    academy, a building) is two parts."""
    if len(w) >= 4 and tags.get(w) in ("nt", "nz", "ns"):
        for k in range(2, len(w) - 1):
            if tags.get(w[:k]) == "ns" and freq.get(w[k:], 0) > 0:
                return [w[:k], w[k:]]
    return [w]
