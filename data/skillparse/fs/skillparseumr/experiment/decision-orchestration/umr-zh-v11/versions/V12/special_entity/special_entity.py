"""special_entity (kind: jev): names, dates, quantities, percentages, ordinals.

One round:
  kind     choice: name / date / quantity / percentage / ordinal;
  netype   choice: the most specific named-entity type (asked every time, used
           for names);
  unit     choice: what kind of quantity (asked when the piece has a number).
Rule: the fixed structure is filled from the piece's own words and numbers:
name parts are the words (· dropped), a date's 年 / 月 / 日 / 点 / 分 become
:year :month :day :time, a quantity's number is :quant and the rest its unit.
A piece the rule cannot read as the kind Jev chose is written as a name.
"""
import os
import re
import sys

import jieba

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import jevlib as J  # noqa: E402
from prompt_loader import load_prompts  # noqa: E402

PROMPTS = load_prompts(__file__)

KINDS = PROMPTS["tables"]["KINDS"]
NETYPES = PROMPTS["tables"]["NETYPES"]

NETYPE_HINTS = PROMPTS["tables"]["NETYPE_HINTS"]
QUANTITIES = PROMPTS["tables"]["QUANTITIES"]
TIME_UNITS = {"年": "年", "个月": "月", "月": "月", "天": "天", "日": "日", "周": "周", "星期": "星期",
              "小时": "小时", "分钟": "分钟", "秒": "秒", "世纪": "世纪", "year": "year", "month": "month",
              "day": "day", "week": "week", "hour": "hour", "minute": "minute"}
WEEKDAYS = {"一": "monday", "二": "tuesday", "三": "wednesday", "四": "thursday", "五": "friday",
            "六": "saturday", "日": "sunday", "天": "sunday"}
NUM = r"[\d.,零〇一二两三四五六七八九十百千万亿]+"


def run(sent, token_sent, lang, text, span, **_):
    piece = J.text(token_sent, span, lang)
    st = J.state(sent, token_sent, span, lang)
    q = {"kind": {"type": "choice",
                  "instructions": PROMPTS["instructions"]["question_1"],
                  "criteria": KINDS},
         "netype": {"type": "choice",
                    "instructions": PROMPTS["instructions"]["question_2"],
                    "criteria": {t: NETYPE_HINTS.get(t) for t in NETYPES}}}
    if re.search(NUM, piece):
        q["unit"] = {"type": "choice", "instructions": PROMPTS["instructions"]["question_3"],
                     "criteria": QUANTITIES}
    titles = _person_titles(token_sent, span, lang)
    if titles:
        q["title"] = {"type": "choice",
                      "instructions": PROMPTS["instructions"]["question_4"],
                      "criteria": {"none": "the piece is only the name, or it does not name a person",
                                   **{t: f'"{t}" is a title before the name "{v[1]}"' for t, v in titles.items()}}}
    a = yield {"state": st, "questions": q}
    kind = J.choice(a["kind"])
    graph = None
    if kind == "date":
        graph = _date(piece)
    elif kind == "percentage":
        graph = _percentage(piece)
    elif kind == "ordinal":
        graph = _ordinal(piece, lang)
    elif kind == "quantity":
        graph = _quantity(piece, J.choice(a.get("unit")), lang)
    if graph is None and kind == "name" and re.search(r"\d", piece) \
            and J.probability(a["kind"], "date") >= 0.03:
        graph = _date(piece)        # 当地时间22:33分 judged a name: a clock time all the same
    if graph is None and kind in ("quantity", "percentage", "ordinal") \
            and J.probability(a["kind"], "name") < 0.3:
        m = re.search(NUM, piece)       # judged a number that no reader could take: the number alone
        if m and _num(m.group(0)) is not None:
            graph = {"nodes": [{"var": "q", "concept": "quantity"}], "edges": [],
                     "attrs": [["q", "quant", _num(m.group(0))]]}
    if graph is None:
        netype = J.choice(a["netype"])
        cut = J.choice(a.get("title"))
        if netype == "individual-person" and cut in titles and J.probability(a.get("title"), cut) >= 0.5:
            title_span, rest = titles[cut]
            graph = _name(rest, netype, lang)
            graph["nodes"][0]["concept"] = "person"    # gold: a person with an office is (person :ARG1-of have-org-role-92)
            graph["nodes"] += [{"var": "h", "concept": "have-org-role-92"},
                               {"var": "x", "concept": cut, "span": list(title_span)}]
            graph["attrs"] = list(graph.get("attrs", [])) + [["h", "aspect", "state"]]
            graph["edges"] += [["e", "ARG1-of", "h"], ["h", "ARG3", "x"]]
        else:
            if lang == "zh":
                span, piece = _title(token_sent, span, piece, lang)
            graph = _name(piece, netype, lang)
    return {"graph": graph, "open": [], "outside": [], "alignment": list(span)}


def _person_titles(token_sent, span, lang):
    """The leading words of a Chinese piece that could be a title before a
    person's name: the first one to three words, each plain Chinese and not a
    function word, with a content word left for the name. Option text ->
    (title span, the rest of the piece)."""
    if lang != "zh":
        return {}
    ws = J.inside(token_sent, span, lang)
    out = {}
    for n in range(1, min(3, len(ws) - 1) + 1):
        lead, rest = ws[:n], ws[n:]
        if not all(re.fullmatch(r"[一-鿿]+", w.text) and not J.is_function(w, lang) for w in lead):
            break
        if not J.content(rest, lang):
            break
        out["".join(w.text for w in lead)] = ([lead[0].first, lead[-1].last],
                                             J.text(token_sent, [rest[0].first, rest[-1].last], lang))
    return out


def _title(token_sent, span, piece, lang):
    """A name written as a title is the whole 《…》, brackets included: a piece
    that holds a 《, or starts right after one, grows back to that 《 and ends at
    the first 》 after it. Words before the 《 or after the 》 are left out of the
    name and of the alignment. A piece with two titles is left as it is."""
    if piece.count("《") > 1 or piece.count("》") > 1:
        return span, piece
    toks = {int(k): str(t) for k, t in token_sent}
    lo, hi = span
    start = next((k for k in range(lo, hi + 1) if toks.get(k) == "《"), None)
    if start is None and toks.get(lo - 1) == "《":
        start = lo - 1
    if start is None:
        return span, piece
    end = None
    for k in range(start + 1, max(toks) + 1):
        t = toks.get(k)
        if t == "》":
            end = k
            break
        if t == "《" or t in J.CLAUSE_PUNCT:
            break
    if end is None or end - start < 2:
        return span, piece
    return [start, end], J.text(token_sent, [start, end], lang)


GENERIC_HEADS = ("清真寺", "教堂", "大学", "学院", "中学", "小学", "俱乐部", "足球", "球场", "体育场", "体育馆",
                 "竞技场", "公司", "集团", "银行", "医院", "广场", "公园", "机场", "车站", "大桥", "大厦")
NAME_PREFIXES = ("老", "小")
NAME_TAGS = ("nr", "nrt", "nrfg", "ns", "nt", "nz")


def _zh_name_parts(piece):
    """The :op parts of a Chinese name without a middle dot: name units, not
    segmenter words. A generic head (a common noun such as 大学 or 俱乐部) is a
    part of its own, and so are marks, Latin words, numerals and function
    words; a place name at the start of a longer name word is split off. A
    single character or a word the dictionary does not know is a piece of the
    unit before it (a transliteration the segmenter broke, a suffix like 区 or
    市), but two known words stay two parts. 老 / 小 opening a longer name is a
    part of its own; a single character cut off the front of a head goes back
    to it."""
    jieba.dt.check_initialized()
    tags = jieba.posseg.dt.word_tag_tab      # jieba.posseg is loaded by jevlib
    freq = jieba.dt.FREQ
    ws = []
    for w in jieba.cut(piece):
        w = w.strip()
        if w and w not in "，,。；;、":
            for x in J._place_first(w, tags, freq):
                pieces = [x]
                if len(x) >= 4 and re.fullmatch(r"[一-鿿]+", x) and tags.get(x, "") != "nr":
                    import math
                    best = {0: (0.0, [])}     # best cut into known words of two or more characters
                    for i in range(2, len(x) + 1):
                        for j in range(0, i - 1):
                            p = x[j:i]
                            if j in best and freq.get(p, 0) > 0 and not (j == 0 and i == len(x)):
                                s = best[j][0] + math.log(freq[p] / jieba.dt.total)
                                if i not in best or s > best[i][0]:
                                    best[i] = (s, best[j][1] + [p])
                    if len(x) in best:
                        pieces = best[len(x)][1]
                ws += pieces
    if len(ws) > 1 and len(ws[0]) == 2 and ws[0][0] in NAME_PREFIXES and not freq.get(ws[0], 0):
        ws[0:1] = [ws[0][0], ws[0][1]]

    def head(w):
        t = tags.get(w, "")
        return w in GENERIC_HEADS or (len(w) > 1 and t.startswith("n") and t not in NAME_TAGS
                                      and freq.get(w, 0) > 1000)

    def alone(w):
        return not re.fullmatch(r"[一-鿿]+", w) or w in J.FUNCTION_ZH or w[0] in J.DIGITS or w[0] == "十"

    def known(w):
        return len(w) > 1 and freq.get(w, 0) > 0

    parts, closed, prev, k = [], True, "", 0
    while k < len(ws):
        w = ws[k]
        nxt = ws[k + 1] if k + 1 < len(ws) else ""
        if len(w) == 1 and not alone(w) and nxt and head(nxt) and freq.get(w + nxt[0], 0) > 0:
            parts.append(w + nxt)
            closed, prev, k = True, nxt, k + 2
            continue
        if alone(w) or head(w) or (k == 0 and w in NAME_PREFIXES and nxt):
            parts.append(w)
            closed = True
        elif closed or (len(w) > 1 and known(prev) and (known(w) or tags.get(prev) in ("ns", "nt", "nz"))):
            parts.append(w)
            closed = False
        else:
            parts[-1] += w
        prev, k = w, k + 1
    return parts


def _name(piece, netype, lang):
    """Name parts as the Chinese gold writes them: · and quotes are parts of
    their own; a transliterated name between dots is one part; a name without
    dots is cut into name units (_zh_name_parts)."""
    if lang != "zh":
        parts = piece.split()
    elif "·" in piece:
        parts = [p for chunk in re.split(r"(·)", piece) for p in ([chunk] if chunk == "·" else
                 [w for w in jieba.cut(chunk) if w.strip()] if re.search(r"[“”《》\d]", chunk) else [chunk])]
    else:
        parts = _zh_name_parts(piece)
    parts = [p for p in parts if p.strip() and p not in "，,。；;、"]
    if lang == "zh":       # a Latin name written together (AppleVisionPro) is one :op per capitalised word
        split = []
        for p in parts:
            if re.fullmatch(r"[A-Za-z0-9]+", p) and re.search(r"[a-z][A-Z]", p):
                split += re.findall(r"[A-Z][a-z]+|[A-Z]+(?![a-z])|[a-z]+|\d+", p)
            else:
                split.append(p)
        parts = split
    return {"nodes": [{"var": "e", "concept": netype}, {"var": "n", "concept": "name"}],
            "edges": [["e", "name", "n"]],
            "attrs": [["n", f"op{k}", p] for k, p in enumerate(parts, 1)]}


RELATIVE_DAYS = ("第二天", "前一天", "翌日", "次日", "隔天", "当天", "当日", "当晚", "当夜", "今天", "昨天",
                 "明天", "今晚", "昨晚", "明晚", "前天", "后天")


def _date(piece):
    attrs = []
    m = re.search(rf"({NUM})世纪", piece)
    if m and J.number(m.group(1)) is not None:
        attrs.append(["d", "century", J.number(m.group(1))])
    m = re.search(rf"({NUM})年代", piece)
    if m and J.number(m.group(1)) is not None:
        v = J.number(m.group(1))
        attrs.append(["d", "decade" if v < 100 else "era", v])     # gold: a four-digit N年代 is :era N
    for role, pattern in (("year", rf"({NUM})年(?!代)"), ("month", rf"({NUM})月"), ("day", rf"({NUM})[日号]")):
        m = re.search(pattern, piece)
        if m and J.number(m.group(1)) is not None:
            attrs.append(["d", role, J.number(m.group(1))])
    nodes = [{"var": "d", "concept": "date-entity"}]
    edges = []
    m = re.search(rf"({NUM})\s*[:：点时]\s*(?:({NUM})\s*分?)?(?:\s*[:：]?\s*({NUM})\s*秒|[:：]({NUM}))?", piece)
    if m and J.number(m.group(1)) is not None and not re.search(rf"{NUM}[日号]\s*$", m.group(0)):
        minutes = J.number(m.group(2)) if m.group(2) else 0
        sec_text = m.group(3) or m.group(4)
        secs = J.number(sec_text) if sec_text else None
        clock = f"{int(J.number(m.group(1))):02d}:{int(minutes or 0):02d}"
        if secs is not None:
            clock += f":{int(secs):02d}"
        attrs.append(["d", "time", clock])        # gold: a clock time is the attribute :time HH:MM[:SS]
    m = re.search("|".join(sorted(RELATIVE_DAYS, key=len, reverse=True)), piece)
    if m and not any(x[1] == "day" for x in attrs):
        nodes.append({"var": "r", "concept": m.group(0)})
        edges.append(["d", "day", "r"])         # a relative day word is :day with the word as concept
    m = re.search(r"(?:星期|周|礼拜)([一二三四五六日天])", piece)
    if m:
        nodes.append({"var": "w", "concept": WEEKDAYS[m.group(1)]})
        edges.append(["d", "weekday", "w"])
    if not attrs and not edges:
        return None
    return {"nodes": nodes, "edges": edges, "attrs": attrs}


def _percentage(piece):
    m = re.search(rf"百分之({NUM})", piece) or re.search(rf"({NUM})\s*[%％]", piece) \
        or re.fullmatch(rf"\s*({NUM})\s*", piece)     # judged a percentage, its % cut off: the number alone
    if not m or _num(m.group(1)) is None:
        return None
    return {"nodes": [{"var": "p", "concept": "percentage-entity"}], "edges": [],
            "attrs": [["p", "value", _num(m.group(1))]]}


def _num(s):
    """A number as J.number reads it, or one that mixes digits and Chinese
    numerals (5万2千 -> 52000): a run of digits counts as one digit."""
    v = J.number(s)
    if v is not None:
        return v
    s = s.strip().replace(",", "").replace("，", "")
    parts = re.findall(r"\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万亿]", s)
    if not parts or "".join(parts) != s:
        return None
    total, section, cur = 0, 0, 0
    for p in parts:
        if p in J.UNITS:
            section += (cur or 1) * J.UNITS[p]
            cur = 0
        elif p in J.BIG:
            total += (section + cur) * J.BIG[p]
            section, cur = 0, 0
        else:
            cur = float(p) if p[0].isdigit() else J.DIGITS[p]
    v = total + section + cur
    return int(v) if v == int(v) else v


def _ordinal(piece, lang):
    m = re.search(rf"第({NUM})(.*)", piece)
    if m and J.number(m.group(1)) is not None:
        value, rest = J.number(m.group(1)), m.group(2).strip()
    elif piece.startswith("首"):
        value, rest = 1, piece[1:]
    else:
        return None
    unit = next((u for u in TIME_UNITS if rest.startswith(u)), None)
    if unit:
        return {"nodes": [{"var": "t", "concept": "temporal-quantity"}, {"var": "u", "concept": TIME_UNITS[unit]},
                          {"var": "o", "concept": "ordinal-entity"}],
                "edges": [["t", "unit", "u"], ["t", "ord", "o"]], "attrs": [["o", "value", value]]}
    return {"nodes": [{"var": "o", "concept": "ordinal-entity"}], "edges": [], "attrs": [["o", "value", value]]}


def _quantity(piece, measure, lang):
    m = re.search(rf"({NUM})\s*(.*)", piece)
    if not m or _num(m.group(1)) is None:
        return None
    value, unit = _num(m.group(1)), m.group(2).strip().strip("多余")
    unit = re.sub(r"^[多余]", "", unit)
    if not unit:
        return None
    if measure == "count":
        return {"nodes": [{"var": "q", "concept": unit}], "edges": [], "attrs": [["q", "quant", value]]}
    if unit in TIME_UNITS:
        measure, unit = "temporal-quantity", TIME_UNITS[unit]
    return {"nodes": [{"var": "q", "concept": measure or "quantity"}, {"var": "u", "concept": unit}],
            "edges": [["q", "unit", "u"]], "attrs": [["q", "quant", value]]}
