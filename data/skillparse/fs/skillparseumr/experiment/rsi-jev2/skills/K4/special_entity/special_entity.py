"""special_entity (kind: jev): names, dates, quantities, percentages, ordinals.

One round:
  kind     choice: name / date / quantity / percentage / ordinal;
  netype   choice: the most specific named-entity type (asked every time, used
           for names);
  unit     choice: what kind of quantity (asked when the piece has a number).
Rule: the fixed structure is filled from the piece's own words and numbers:
name parts are the words (· dropped), a date's 年 / 月 / 日 / 点 / 分 become
:year :month :day :time, a quantity's number is :quant and the rest its unit.
A year range (A至B, A-B) is a date-interval :op1 A :op2 B, a bare year a
date-entity :year. A piece Jev surely judged a date, quantity, percentage or
ordinal is never written as a name: what the rule cannot read becomes a bare
year, a bare number, or a plain node of its words. Other pieces the rule
cannot read as the kind Jev chose are written as names.
A number + a currency or measure unit + a common noun (3美元金币, 5公斤大米), whatever
kind Jev chose except a date, is the noun with :mod (monetary-quantity :quant N
:unit 美元): a denomination is not a named product.
"""
import os
import re
import sys

import jieba

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import jevlib as J  # noqa: E402

KINDS = {
    "name": "a proper name of a person, place, organization, facility, event, show, product, ..., or "
            "a country or place name used as a modifier (美国 in 美国歌手, Russian)",
    "date": "a calendar date or a clock time (2017年5月22日, 当地时间22:33, 22点33分, 星期五)",
    "quantity": "a number with a unit (20年, 3499美元, 3公里)",
    "percentage": "a percentage (百分之五, 4.6%)",
    "ordinal": "an ordinal (第三, 首次, the first)",
}
NETYPES = ["individual-person", "country", "country-region", "province", "state", "city", "city-district",
           "local-region", "world-region", "continent", "island", "river", "mountain", "planet", "park",
           "road", "station", "building", "sports-facility", "facility", "company", "government-organization",
           "armed-organization", "political-party", "sports-organization", "school", "academic-organization",
           "religious-organization", "organization", "social-group", "ethnic-group", "language",
           "newspaper", "publication", "book", "broadcast-program", "show", "work-of-art", "game", "event",
           "product", "ship", "cultural-artifact", "award", "law", "disease"]

NETYPE_HINTS = {
    "sports-facility": "a named stadium, arena, sports ground or gym; always this, not building or facility",
    "station": "a named railway, metro or bus station or stop (not a website)",
    "building": "a named building that is not a sports venue, a station or a school",
    "facility": "a named installation no more specific type fits (an airport, a port, a bridge, a power plant)",
    "school": "a named school, college or university, where people study",
    "academic-organization": "a research academy, institute or learned society that does not teach; "
                             "a university is school",
    "game": "a named sports competition: a cup, a league season, a tournament, a final, a match",
    "event": "a named happening that is not a sports competition (a festival, a summit, an attack, an election)",
    "country": "a sovereign country that exists today",
    "country-region": "a country or polity that no longer exists (a former state, a dissolved union, an empire), "
                      "or a region that is not a sovereign country",
    "company": "a business named as a business (it sells, hires, is bought, is a parent company); "
               "a named source of news is newspaper",
    "government-organization": "a state body acting as a body (parliament, ministry, police, court)",
    "newspaper": "a news outlet of any medium: a newspaper, a news agency, a news website or portal, "
                 "a broadcaster's news site; any named source that reports news",
    "publication": "a publication that is not a news outlet (a journal, a catalogue, a yearbook)",
}
QUANTITIES = {
    "temporal-quantity": "a length of time (年, 月, 天, 小时)",
    "monetary-quantity": "money (元, 美元, 欧元, 英镑)",
    "distance-quantity": "a distance (公里, 米)",
    "mass-quantity": "a weight (吨, 公斤)",
    "area-quantity": "an area (平方米, 公顷)",
    "volume-quantity": "a volume (升)",
    "temperature-quantity": "a temperature (度)",
    "count": "a number of things with a classifier (23人, 三起)",
}
TIME_UNITS = {"年": "年", "个月": "月", "月": "月", "天": "天", "日": "日", "周": "周", "星期": "星期",
              "小时": "小时", "分钟": "分钟", "秒": "秒", "世纪": "世纪", "year": "year", "month": "month",
              "day": "day", "week": "week", "hour": "hour", "minute": "minute"}
WEEKDAYS = {"一": "monday", "二": "tuesday", "三": "wednesday", "四": "thursday", "五": "friday",
            "六": "saturday", "日": "sunday", "天": "sunday"}
NUM = r"[\d.,零〇一二两三四五六七八九十百千万亿]+"
KIND_TRUST = 0.8     # a non-name kind this sure is never written as a name

# currency and measure units that can stand between a number and a common noun (3美元金币);
# 分 and 角 are left out: 3分钟 would read as 分 + 钟
CURRENCY = {"美元", "美分", "元", "人民币", "欧元", "英镑", "日元", "港元", "卢布", "法郎", "马克", "便士",
            "先令", "澳元", "加元", "韩元", "台币"}
MEASURE = {"公里": "distance-quantity", "千米": "distance-quantity", "米": "distance-quantity",
           "厘米": "distance-quantity", "毫米": "distance-quantity", "英里": "distance-quantity",
           "吨": "mass-quantity", "公斤": "mass-quantity", "千克": "mass-quantity",
           "平方米": "area-quantity", "平方公里": "area-quantity", "公顷": "area-quantity",
           "升": "volume-quantity", "毫升": "volume-quantity"}

def run(sent, token_sent, lang, text, span, **_):
    piece = J.text(token_sent, span, lang)
    st = J.state(sent, token_sent, span, lang)
    q = {"kind": {"type": "choice",
                  "instructions": "What is `piece` (marked 【】 in `sentence_with_piece_marked`)?",
                  "criteria": KINDS},
         "netype": {"type": "choice",
                    "instructions": "If `piece` is a name, what is the most specific type of the thing it "
                                    "names? Prefer the specific type to a generic one: a stadium, arena or sports ground is "
                                    "sports-facility (not building or facility), a school, college or university is "
                                    "school (not academic-organization), a railway, metro or bus station is station "
                                    "(not facility), and a named cup, league, tournament, final or match is game (not "
                                    "event). A state body (parliament, ministry, police, court) is "
                                    "government-organization. A named outlet that reports or publishes news (print, "
                                    "agency, website or portal) is newspaper, not company or publication. "
                                    "A country that no longer exists (called former) is country-region.",
                    "criteria": {t: NETYPE_HINTS.get(t) for t in NETYPES}}}
    if re.search(NUM, piece):
        q["unit"] = {"type": "choice", "instructions": "If `piece` is a quantity, what does it measure?",
                     "criteria": QUANTITIES}
    titles = _person_titles(token_sent, span, lang)
    if titles:
        q["title"] = {"type": "choice",
                      "instructions": "If `piece` names a person, does it begin with a title, office, rank or job "
                                      "of that person written before the name (a head of state or government, a "
                                      "monarch, a minister, a general, a bishop, a coach)? Choose the words that "
                                      "are the title, or none if every word belongs to the name. A given name, a "
                                      "surname or a nickname is never a title; a generation number after the name "
                                      "(II, Jr.) is part of the name.",
                      "criteria": {"none": "the piece is only the name, or it does not name a person",
                                   **{t: f'"{t}" is a title before the name "{v[1]}"' for t, v in titles.items()}}}
    a = yield {"state": st, "questions": q}
    kind = J.choice(a["kind"])
    graph = None if kind == "date" else _denomination(piece, J.choice(a.get("unit")))
    if graph is not None:
        pass
    elif kind == "date":
        graph = _date(piece)
    elif kind == "percentage":
        graph = _percentage(piece)
    elif kind == "ordinal":
        graph = _ordinal(piece, lang)
    elif kind == "quantity":
        graph = _quantity(piece, J.choice(a.get("unit")), lang)
    if graph is None and kind == "name" and re.search(r"\d", piece):
        graph = _date(piece)        # 当地时间22:33分 judged a name: a clock time all the same
    if graph is None and kind in ("quantity", "percentage", "ordinal") \
            and J.probability(a["kind"], "name") < 0.3:
        m = re.search(NUM, piece)       # judged a number that no reader could take: the number alone
        if m and _num(m.group(0)) is not None:
            graph = {"nodes": [{"var": "q", "concept": "quantity"}], "edges": [],
                     "attrs": [["q", "quant", _num(m.group(0))]]}
    if graph is None and kind in ("date", "quantity", "percentage", "ordinal") \
            and J.probability(a["kind"], kind) >= KIND_TRUST:
        graph = _kind_fallback(piece, kind, token_sent, span, lang)
    if graph is None:
        netype = J.choice(a["netype"])
        cut = J.choice(a.get("title"))
        if netype == "individual-person" and cut in titles and J.probability(a.get("title"), cut) >= 0.5:
            title_span, rest = titles[cut]
            graph = _name(rest, netype, lang)
            graph["nodes"] += [{"var": "h", "concept": "have-org-role-91"},
                               {"var": "x", "concept": cut, "span": list(title_span)}]
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
            ws += J._place_first(w, tags, freq)
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
    return {"nodes": [{"var": "e", "concept": netype}, {"var": "n", "concept": "name"}],
            "edges": [["e", "name", "n"]],
            "attrs": [["n", f"op{k}", p] for k, p in enumerate(parts, 1)]}


def _kind_fallback(piece, kind, token_sent, span, lang):
    """A piece surely judged a date or a number that the rules could not read:
    a date with a four-digit number is that year; a number kind with a number
    is the number alone; otherwise one plain node of the piece's content words
    (a bare unit), never a name."""
    if kind == "date":
        m = re.search(r"(?<!\d)(\d{4})(?!\d)", piece)
        if m:
            return {"nodes": [{"var": "d", "concept": "date-entity"}], "edges": [],
                    "attrs": [["d", "year", int(m.group(1))]]}
    else:
        m = re.search(NUM, piece)
        if m and _num(m.group(0)) is not None:
            return {"nodes": [{"var": "q", "concept": "quantity"}], "edges": [],
                    "attrs": [["q", "quant", _num(m.group(0))]]}
    sep = "" if lang == "zh" else " "
    ws = J.content(J.inside(token_sent, span, lang), lang)
    concept = sep.join(w.text for w in ws).strip()
    if not concept:
        return None
    return {"nodes": [{"var": "x", "concept": concept}], "edges": [], "attrs": []}


def _year(s):
    """The value of a year-like number (1000 to 2100), or None."""
    v = J.number(s) if s else None
    if v is None or v != int(v) or not 1000 <= v <= 2100:
        return None
    return int(v)


RELATIVE_DAYS = ("第二天", "前一天", "翌日", "次日", "隔天", "当天", "当日", "当晚", "当夜", "今天", "昨天",
                 "明天", "今晚", "昨晚", "明晚", "前天", "后天")


def _date(piece):
    # a range of years (A至B, A年到B年, A-B; A至 alone when B is cut off): gold's flat date-interval
    m = re.search(rf"({NUM})\s*年?\s*(至|到|－|-|—|~|～)\s*({NUM})?", piece)
    if m and _year(m.group(1)) is not None and (m.group(3) or m.group(2) in ("至", "到")):
        v2 = _year(m.group(3))
        return {"nodes": [{"var": "d", "concept": "date-interval"}], "edges": [],
                "attrs": [["d", "op1", _year(m.group(1))]] + ([["d", "op2", v2]] if v2 is not None else [])}
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
    m = re.search(rf"({NUM})\s*[:：点时]\s*({NUM})?", piece)
    if m and J.number(m.group(1)) is not None and not re.search(rf"{NUM}[日号]\s*$", m.group(0)):
        minutes = J.number(m.group(2)) if m.group(2) else 0
        nodes.append({"var": "h", "concept": f"h{int(J.number(m.group(1)))}m{int(minutes or 0):02d}"})
        edges.append(["d", "time", "h"])        # gold: a clock time is the concept hHmMM
    m = re.search("|".join(sorted(RELATIVE_DAYS, key=len, reverse=True)), piece)
    if m and not any(x[1] == "day" for x in attrs):
        nodes.append({"var": "r", "concept": m.group(0)})
        edges.append(["d", "day", "r"])         # a relative day word is :day with the word as concept
    m = re.search(r"(?:星期|周|礼拜)([一二三四五六日天])", piece)
    if m:
        nodes.append({"var": "w", "concept": WEEKDAYS[m.group(1)]})
        edges.append(["d", "weekday", "w"])
    if not attrs and not edges:
        m = re.fullmatch(r"\s*(\d{3,4})\s*(?:年间?)?\s*", piece)     # a bare year
        if m:
            return {"nodes": nodes, "edges": [], "attrs": [["d", "year", int(m.group(1))]]}
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



def _denomination(piece, measure):
    """A number + a currency or measure unit + a common noun (3美元金币, 10吨钢材):
    the noun is the head and the amount its :mod (monetary-quantity for money,
    the quantity type of the unit otherwise). A bracketed part (a foreign gloss)
    is cut off first. None when the piece is not of that shape or what follows
    the unit is not a common noun."""
    core = re.split(r"[（(]", piece)[0].strip()
    units = "|".join(sorted(CURRENCY | set(MEASURE), key=len, reverse=True))
    m = re.fullmatch(rf"\s*({NUM})\s*({units})(.+?)[\s，,。；;、：:]*", core)
    if not m or _num(m.group(1)) is None:
        return None
    value, unit, rest = _num(m.group(1)), m.group(2), m.group(3).strip()
    if not re.fullmatch(r"[一-鿿]+", rest) or len(rest) > 4 or rest[0] in "多余" or rest in TIME_UNITS:
        return None
    jieba.dt.check_initialized()
    tag = jieba.posseg.dt.word_tag_tab.get(rest, "")
    if tag in NAME_TAGS or not (tag.startswith("n") or jieba.dt.FREQ.get(rest, 0) > 0):
        return None
    if unit in CURRENCY:
        kind = "monetary-quantity"
    else:
        kind = MEASURE.get(unit) or (measure if measure and measure != "count" else "quantity")
    return {"nodes": [{"var": "e", "concept": rest}, {"var": "q", "concept": kind},
                      {"var": "u", "concept": unit}],
            "edges": [["e", "mod", "q"], ["q", "unit", "u"]],
            "attrs": [["q", "quant", value]]}