"""np_phrase (kind: jev): one noun phrase — its head and modifiers.

Two rounds:
  1. head   choice: the head word of the phrase;
     shape  choice: what the head becomes (a plain noun, a pronoun, a person
            defined by an event or a role, a nominalised event, a coordination,
            a number + classifier with no noun).
  2. mod_<w>  per other content word: which modifier the word is in (mod,
              poss, quant, unit, relative clause ARG0-of / ARG1-of, place, ...);
     sense    choice among PropBank rolesets when the head is an event.
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
import jieba.posseg  # noqa: E402

SHAPES = {
    "noun": "an ordinary noun or a compound word, annotated as written (歌手, 演唱会, 体育场, 产量). THIS IS THE "
            "DEFAULT for ordinary job, occupation and group nouns, even when counted, possessed or with an "
            "organization before them (编辑, 记者, 官员, 大使, 专家, 学者, 实习生, 孩子, 子公司, 市民, 群众, 嘉宾); "
            "for a person noun not built from a verb + 者 / 人 / 员 / 手 (熟客, 会员, 诗人, 职员); for a kinship "
            "noun with nobody written in the phrase that it is a relation of (父母 or 哥哥 alone); for a title "
            "used as the position itself, e.g. the object of 当 / 担任 / 成为 (当上经理: 经理); for nouns that mean "
            "'an event, an incident' but are never verbs (事件, 事故); and for a general noun that names a kind "
            "of conduct, activity, ceremony, task or money rather than one doing (举动, 典礼, 项目, 任务, 经费), "
            "even with an event word before it (纪念典礼: the head 典礼 is noun). Choose it when unsure between "
            "noun and a person shape (agent, patient, org-role, rel-role)",
    "pronoun": "a personal pronoun (他, 他们, 它)",
    "agent": "a person named by an activity they do, or by a happening that is theirs alone (getting hurt, "
             "dying, getting lost): the word ends in 者 / 人 / 员 / 手 and the part before it is a verb of its "
             "own (救援者, 袭击者, 发言人, 驾驶员, 创办人, 守门人; also 伤者, 伤员, 死者, 遇难者, 受害者, 失踪者). "
             "Also when the segmentation cut the suffix off as a word of its own (a verb, then 者 / 人员). Not a "
             "word without such a suffix (市民, 群众, 熟客 are noun), and not a word whose first part is not that "
             "verb (诗人, 会员, 职员 are noun)",
    "patient": "a person an action is done to by someone else, usually 被 + verb + 人 / 者 (被提名人, 被告人, "
               "被捕者). Not the only participant of a happening such as getting hurt, dying or getting lost "
               "(伤者, 死者 are agent). Not a lexicalised noun such as 专家 or 学者, and not a nationality or "
               "ethnic group + 人 (those are noun)",
    "org-role": "a high office or title held in a country or organization, said of a person (总统, 主席, 部长, "
                "首相, 会长). Not an ordinary job noun (编辑, 官员, 大使, 记者 are noun), and not a title used as "
                "the position itself (noun)",
    "rel-role": "a kinship or social relation said of a person, with the one it is a relation of written in "
                "the phrase (他的母亲, 某人的朋友, 她的同事, 他的同伙). A kinship noun with nobody written that it "
                "is a relation of is noun; not an ordinary noun such as 孩子 meaning a child, and never an "
                "organization (子公司 is noun)",
    "event": "a verb or adjective used as a noun for an action, a process, a state, a feeling or a quality, "
             "with or without written participants, also as a subject or object or after a 的-modifier (城市的毁灭, "
             "他的到来, 爆炸, 袭击, 调查, 支持, 摄影, 城市的美丽). Test: the word could be the verb of a clause "
             "for the same happening (将X, X了); then it is event even after another noun or a classifier, or as "
             "the object of a verb such as 取消 / 举行 / 表达 (一场比赛, 取消访问, 表达感谢, 人员损失). Not a word "
             "that is only a noun and never a clause's verb (事件, 事故 are noun), not a general noun for a kind "
             "of conduct, activity, ceremony or money (举动, 典礼, 经费 are noun), and not a descriptive word that "
             "only modifies another noun",
    "and": "a coordination of several nouns (A和B, A、B与C), only when a conjunction word or 、 is written "
           "between the items: a single compound word such as 父母, 夫妻, 兄弟 is noun",
    "count": "a number and the word it counts, nothing else (23人, 两张, 三起)",
}
MODS = {
    "mod": "a classifying adjective or noun that is not a place, an owner, a subject or a channel, or a "
           "demonstrative (危险, 恐怖, 木头, 这, 那, 这种). Also: 当地 'local' (当地商店: 当地); a noun telling which area or site is meant (港口区域: 港口); a place name before a "
           "head that is itself a place, country or region (亚洲城市: 亚洲; 德国柏林: 德国). NOT a verb and NOT "
           "an adjective that states something about the head as a predicate (救援小队: 救援; 可疑包裹: 可疑; "
           "运输车辆: 运输; 疑似X的病例: 疑似): those are ARG0-of or ARG1-of even with no 的. Adjectives that "
           "only say what kind (危险, 恐怖) stay mod",
    "poss": "the owner or holder of the head, with or without 的 (他的车, 公司的资金, 名人住宅: 名人). "
            "Not a whole the head is a part, edition or contents of (part-of), not what the head shows or is "
            "about (topic), not the device or object the head is a component of (part-of). Not the subject or "
            "object of a verb in a clause before 的 (工人修的路: 工人 goes with 修, ARG1-of). In X在Y的N only X "
            "is poss (Y is place)",
    "quant": "a number or a quantity word counting or measuring out the head (三, 500, 多, 一些, 部分, 一部分, "
             "大部分, 所有, 许多). A proportion word such as 部分 / 大部分 'some of, most of' before the head is "
             "quant, never mod or part-of (部分学校: 部分; 大部分城市: 大部分). Not an age (N岁)",
    "unit": "a classifier after a number or demonstrative (本, 种, 个, 名)",
    "ord": "an ordinal (第一, 首)",
    "ARG0-of": "a relative clause, or a verb or descriptive adjective with or without 的, of which the head "
               "is the doer or the thing described (跑步的人, 会飞的鸟). If the clause has its own subject "
               "before its verb, the head is not the doer: use ARG1-of",
    "ARG1-of": "a relative clause or a verb with or without 的, of which the head is the thing affected, made "
               "or written (他买的书: 他 and 买; 修改过的图片). The clause's own subject belongs here too",
    "place": "a place or country the separate thing named by the head is in, comes from or circulates in "
             "(美国歌手: 美国; 曼彻斯特的体育场; 山区居民; 网上的传言: 网上). Not when the head is a region or "
             "part of that place (part-of); not a time (temporal)",
    "part-of": "the whole that the head is a component or portion of: a region of a place (法国南部: 法国; "
               "城市上空: 城市), a section, edition, page, title, article or contents of a publication or text "
               "(杂志的封面: 杂志; 书的内容: 书; 杂志的电子版: 杂志), a part of a body or object (狮子的尾巴: 狮子; "
               "汽车的轮子: 汽车). Choose this rather than poss or place whenever the head is a piece of X",
    "topic": "what the head is about or shows: the subject of a picture, report, sign, figure, policy or "
             "message (猫的照片: 猫; 价格数字: 价格; 经济政策: 经济; 和平的呼声: 和平). Not an owner (poss)",
    "medium": "the channel, medium or language through which the head is carried or published (广播节目: "
              "广播; 网络杂志: 网络; 英文报纸: 英文)",
    "temporal": "a time or period, including a time noun followed by 上 / 中 / 里 (昨天的会议; 古代中的故事)",
    "material": "a material (木制, 铁质)",
    "ARG0": "the doer of the event the head names",
    "ARG1": "the thing affected by the event the head names",
    "org": "the organization of the head's title (英国的首相: 英国)",
    "conj": "one of the coordinated items",
    "name": "a proper name or abbreviation written right next to a common noun that it names (飞船“神舟五号”: "
            "神舟五号; 世界卫生组织WHO: WHO; 手机iPhone 15: iPhone 15), or a model name before its generic noun "
            "(X5芯片: X5)",
    "head": "a piece of the same single word as the head, cut off by the word segmentation (a character of "
            "a split name or loanword). A noun before the head that could stand as a word of its own (电脑 in "
            "电脑游戏, 体育 in 体育新闻) is NOT head: choose its relation (topic, medium, mod, ...)",
    "none": "a marker only: 的, 之, punctuation, a linking 是, a preposition (关于, 对于), or an existential "
            "有 before a counted noun",
}
ASPECTS = {
    "state": "a lasting condition, relation or quality, not a change (知识, 存在, 美丽)",
    "habitual": "something done again and again as a regular practice (日常巡逻, 每周的例会)",
    "activity": "an ongoing doing with no built-in end point (研究工作, 锻炼)",
    "endeavor": "an ongoing doing that stopped before any natural end",
    "performance": "one bounded action or event that reaches its end (一次访问, 那场演讲, 一声呼喊)",
    "process": "a dynamic event whose boundedness cannot be decided, e.g. an ongoing operation that is "
               "started, stopped or continued (生产, 运营)",
}
DEMONSTRATIVES = {"这", "那", "该", "此", "本", "这个", "那个", "这些", "那些", "这种", "那种", "其"}
# a demonstrative or quantity character fused with a classifier in one word (这种, 这个, 多种): gold splits it,
# the first character :mod (demonstrative) or :quant (quantity word), the classifier :unit
FUSED_DEM = {"这", "那", "该", "此", "每", "某", "哪", "各"}
FUSED_QUANT = {"多", "几", "数", "诸"}

# vague quantity words: gold writes them as one :quant node on the head (一部分 aligned whole, with its 一)
QUANT_WORDS = {"部分", "一部分", "大部分", "小部分", "一些", "许多", "很多", "所有", "多数", "少数", "大多数",
               "若干", "全部"}
# QUANT_RULE: the quantity words above become :quant nodes; SPLIT_FUSED_DEM: 这种 -> 这 :mod + 种 :unit
# (False: one node 这种 on :mod)
QUANT_RULE, SPLIT_FUSED_DEM = True, True
# 一种 in a copular 'X 是 … 的一种 N' description: gold writes neither a count nor a unit
DROP_KIND_ONE = True
CONJ_WORDS = {"和", "与", "及", "以及", "、", "或", "或者", "跟", "同", "and", "or", ","}
SUFFIXES = ("人员", "者", "员", "人", "家", "手", "方")
# words labelled head / name right next to the head: a name becomes the head's :name, a split Chinese
# piece is glued back into the head's concept (at most SPLIT_MAX characters in all)
QUOTES = set("“”《》「」\"'‘’")
SPLIT_MAX = 4
# STACK_MODS: neighbouring modifier words of these roles are separate sister edges on the head, not one
# placeholder (cut at 的 / 、 / comma, between two words unless the first is a degree adverb); quote marks
# break runs; two touching one-character Chinese words of one role are glued back (a split compound)
# (False: every stretch of one label is one placeholder, as before)
STACK_MODS = True
STACK_ROLES = ("mod", "topic", "medium", "material", "temporal")
LATIN = re.compile(r"[A-Za-z0-9]")

# the frame of a title held in an organization: (person :ARG1-of (ORG_ROLE :ARG2 org :ARG3 title))
ORG_ROLE = "have-org-role-92"


def run(sent, token_sent, lang, text, span, **_):
    ws = J.inside(token_sent, span, lang)
    cands = J.content(ws, lang) or ws
    st = J.state(sent, token_sent, span, lang)

    q = {"shape": {"type": "choice",
                   "instructions": "`piece` (marked 【】 in `sentence_with_piece_marked`) is a noun phrase. "
                                   "What is its head?",
                   "criteria": SHAPES}}
    if len(cands) > 1:
        q["head"] = {"type": "choice",
                     "instructions": "Which word is the head noun of the noun phrase `piece`? In Chinese "
                                     "it is usually the last noun; for a coordination, the first item.",
                     "criteria": {w.key: None for w in cands}}
    a = yield {"state": st, "questions": q}
    head = J.by_key(cands)[J.choice(a["head"])] if "head" in a else cands[-1]
    shape = J.choice(a["shape"])
    if shape == "pronoun" and not J.pronoun(head.text, lang):
        shape = "noun"
    # a person shape needs the suffix in the word, or a suffix the segmentation cut off right after it
    if shape in ("agent", "patient") and not any(head.text.endswith(s) for s in SUFFIXES) \
            and not _suffix_split(head, ws):
        shape = "noun"
    # ORG + title + Name: the name is the person, the title fills ARG3
    name_w, title_w = _org_role_words(cands, head, lang) if shape == "org-role" else (None, None)
    groups = _conjuncts(ws, lang) if shape == "and" else []
    if shape == "and" and len(groups) < 2:
        shape = "noun"

    asked = [w for w in ws if w is not head and w is not name_w and w is not title_w
             and not J.is_function(w, lang) and shape not in ("and", "count")]
    # only offer what the shape can use: org needs a title's role frame, ARG0 / ARG1 an event head
    opts = {k: v for k, v in MODS.items()
            if (k not in ("ARG0", "ARG1") or shape == "event") and (k != "org" or shape == "org-role")}
    q = {}
    if shape == "event" or (shape in ("agent", "patient") and head.text not in SUFFIXES):
        q["aspect"] = {"type": "choice",
                       "instructions": "The head `head` of `piece` names an event, or a person defined by the "
                                       "event `stem` (its doer or the one it happens to). As it is used in "
                                       "`sentence`, what kind of event is `stem` itself? Judge that event, not "
                                       "the person and not the verb that governs the noun phrase. A person "
                                       "named by one particular deed or mishap: usually performance. An "
                                       "undertaking people carry out over time (an investigation, an "
                                       "operation, work, a campaign) is activity, whatever is said about it; "
                                       "process only for the running of a business or facility that is "
                                       "started, stopped or continued.",
                       "criteria": ASPECTS}
    for n, w in enumerate(asked):
        q[f"mod_{n}"] = {"type": "choice",
                         "instructions": {"question": "In the noun phrase `piece`, with head `head`, what is "
                                                      "the word `word` part of? A word inside a relative "
                                                      "clause (a stretch before 的 that has a verb: its "
                                                      "subject, object, place, time or adverb) takes the "
                                                      "clause's label, ARG0-of or ARG1-of, even when it is a "
                                                      "person or a place. A word inside a possessor phrase "
                                                      "belongs to that modifier.",
                                          "word": w.key},
                         "criteria": opts}
    bare = shape in ("agent", "patient") and head.text in SUFFIXES     # V | 者 cut apart: no event here
    stem = _stem(head.text) if shape in ("agent", "patient") else head.text
    senses = J.rolesets(stem, lang) if shape in ("agent", "patient", "event") and not bare else []
    if len(senses) > 1:
        q["sense"] = {"type": "choice",
                      "instructions": "Which PropBank sense of `stem` does the head `head` of `piece` name?",
                      "criteria": {r["roleset"]: J.roleset_text(r) for r in senses[:255]}}
    a = yield {"state": {**st, "head": head.text, "stem": stem}, "questions": q}
    # a predicate with no PropBank frame gets -00, as in gold
    sense = (J.choice(a["sense"]) if "sense" in a else senses[0]["roleset"]) if senses else f"{stem}-00"

    nodes, edges, attrs = _head(shape, head, sense, ws, token_sent, lang)
    if name_w:                      # (person :name (name ...) :ARG1-of (ORG_ROLE :ARG3 title :aspect state))
        nodes, edges, attrs = _named_role(name_w, title_w, lang)
    root = nodes[0]["var"]
    # the aspect goes on the event: the head itself, or the event r inside an agent / patient noun
    ev = root if shape == "event" else ("r" if shape in ("agent", "patient")
                                        and any(n["var"] == "r" for n in nodes) else None)
    if ev and J.choice(a.get("aspect")):
        attrs.append([ev, "aspect", J.choice(a["aspect"])])
    org = next((n["var"] for n in nodes if n["concept"].startswith("have-")), root)
    labels = {w: J.choice(a[f"mod_{n}"]) for n, w in enumerate(asked)}
    labels[head] = "head"           # the head cuts runs: no modifier placeholder spans it
    if name_w:
        labels[name_w] = labels[title_w] = "head"
        # a rank word between the organization and the title (首席, 高级) is a mod of the title, never ord
        org_end = max([w.last for w in asked if w.last < title_w.first and labels[w] in ("org", "place")],
                      default=-1)
        for w in asked:
            if labels[w] in ("mod", "ord") and org_end < w.first and w.last < title_w.first \
                    and w.text not in DEMONSTRATIVES:
                labels[w] = "title-mod"
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
    align = name_w.span if name_w else head.span
    if not name_w:
        align = _glue(ws, labels, head, shape, nodes, edges, attrs, token_sent, lang)
    for w in ws:                    # a name not next to the head: an ordinary modifier
        if labels.get(w) == "name":
            labels[w] = "mod"
    if QUANT_RULE:                  # a vague quantity word (部分, 一些, 所有): the head's :quant node
        for i, w in enumerate(ws):
            if w is not head and w.text in QUANT_WORDS and labels.get(w) in ("mod", "part-of", "quant"):
                labels[w] = "qword"
                if i and ws[i - 1].text == "一" and ws[i - 1] is not head and ws[i - 1] in labels \
                        and ws[i - 1].last + 1 == w.first:
                    labels[ws[i - 1]] = "qword"
    tok = dict((int(k), str(t)) for k, t in token_sent)
    if STACK_MODS:
        for w in ws:                # a quote mark ends a run: a quoted unit is not glued to what precedes it
            if w is not head and w.text and all(c in QUOTES for c in w.text):
                labels[w] = "none"
        mod_runs = _restack(J.runs(ws, labels, lang, stack=STACK_ROLES))
    else:
        mod_runs = J.runs(ws, labels, lang)
    for role, group in mod_runs:
        if role in ("head", "none", "conj"):
            continue
        g_text = J.join(group, token_sent, lang)
        if role == "qword":
            q_span = J.span_of(group)
            # a 一 cut off just before the piece belongs to the word (一部分)
            if not g_text.startswith("一") and q_span[0] - 1 < span[0] and tok.get(q_span[0] - 1) == "一":
                q_span, g_text = [q_span[0] - 1, q_span[1]], "一" + g_text
            var = f"n{len(nodes)}"
            nodes.append({"var": var, "concept": g_text, "span": q_span})
            edges.append([root, "quant", var])
            continue
        if not SPLIT_FUSED_DEM and role in ("mod", "unit") and len(group) == 1 and len(g_text) == 2 \
                and g_text[1] in J.CLASSIFIERS and g_text[0] in FUSED_DEM:
            var = f"n{len(nodes)}"           # 这种 kept whole: one :mod node, no :unit
            nodes.append({"var": var, "concept": g_text, "span": J.span_of(group)})
            edges.append([root, "mod", var])
            continue
        if role in ("mod", "quant", "unit") and len(group) == 1 and len(g_text) == 2 \
                and g_text[1] in J.CLASSIFIERS and (g_text[0] in FUSED_DEM or g_text[0] in FUSED_QUANT):
            w = group[0]                    # 这种 -> 这 :mod, 种 :unit; 多种 -> 多 :quant, 种 :unit
            var = f"n{len(nodes)}"
            nodes.append({"var": var, "concept": g_text[0], "span": [w.first, w.first]})
            edges.append([root, "mod" if g_text[0] in FUSED_DEM else "quant", var])
            var2 = f"n{len(nodes)}"
            nodes.append({"var": var2, "concept": g_text[1], "span": [w.last, w.last]})
            edges.append([root, "unit", var2])
            continue
        if DROP_KIND_ONE and g_text == "一种" and _kind_one(group, head, token_sent):
            continue
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
        if role == "title-mod":     # a rank word on the title node of a named org role
            parent, role = "t", "mod"
        else:
            parent = org if role == "org" else root
        edges.append([parent, {"org": "ARG2", "poss": "possessor"}.get(role, role), var])
        opens.append({"var": var, "text": g_text, "span": J.span_of(group)})
    return {"graph": {"nodes": nodes, "edges": edges, "attrs": attrs}, "open": opens, "outside": [],
            "alignment": align}


def _touching(ws, labels, head, step):
    """The words labelled head or name right next to the head on one side (quote marks between them
    allowed, nothing else), in sentence order, and whether a quote mark was passed."""
    i = ws.index(head) + step
    got, quoted = [], False
    while 0 <= i < len(ws):
        w = ws[i]
        if w.text and all(c in QUOTES for c in w.text):
            quoted = True
        elif w is not head and labels.get(w) in ("head", "name"):
            got.append(w)
        else:
            break
        i += step
    if step < 0:
        got.reverse()
    return got, quoted


def _name_ops(group, token_sent):
    """The :op parts of a name: one per token (Latin words stay apart), quote marks dropped,
    neighbouring Chinese characters kept together."""
    tok = dict((int(k), str(t)) for k, t in token_sent)
    ops, cjk = [], False
    for k in range(group[0].first, group[-1].last + 1):
        t = "".join(c for c in tok.get(k, "") if c not in QUOTES).strip()
        if not t:
            continue
        is_cjk = bool(re.fullmatch(r"[一-鿿]+", t))
        if is_cjk and cjk and ops:
            ops[-1] += t
        else:
            ops.append(t)
        cjk = is_cjk
    return ops


def _glue(ws, labels, head, shape, nodes, edges, attrs, token_sent, lang):
    """Words labelled head / name touching the head. A split Chinese piece (head) is merged into the
    head's concept and span. A name (Latin letters or digits, quoted, or labelled name) after a
    common-noun head is its :name; a name before it makes the head (product :name (name ... noun)).
    The glued words are labelled head, so no placeholder is made for them. Returns the alignment."""
    before, q_before = _touching(ws, labels, head, -1)
    after, q_after = _touching(ws, labels, head, 1)
    old = head.text if lang == "zh" else head.text.lower()
    span = list(head.span)
    concept = old
    sides = []
    for side, run_, quoted in (("after", after, q_after), ("before", before, q_before)):
        if not run_:
            continue
        txt = "".join(w.text for w in run_)
        is_name = quoted or any(labels[w] == "name" for w in run_) \
            or (bool(LATIN.search(txt)) and J.number(txt) is None)
        sides.append((side, run_, txt, is_name))
    # (b) split words: glue the pieces back into the head
    for side, run_, txt, is_name in sides:
        if is_name or not re.fullmatch(r"[一-鿿]+", txt):
            continue
        first, last = min(span[0], run_[0].first), max(span[1], run_[-1].last)
        new = J.text(token_sent, [first, last], lang)
        if len(new) > SPLIT_MAX:
            continue
        span, concept = [first, last], new
    if concept != old:
        for n in nodes:
            if n.get("concept") == old and n.get("span") == list(head.span):
                n["concept"], n["span"] = concept, list(span)
    # (a) names
    root = nodes[0]
    named = False
    for side, run_, txt, is_name in sides:
        if not is_name:
            continue
        if named or shape != "noun" or LATIN.search(head.text) or root.get("concept") != concept:
            for w in run_:
                if labels[w] == "name":
                    labels[w] = "mod"
            continue
        ops = _name_ops(run_, token_sent)
        if not ops:
            continue
        if side == "before":        # model + generic noun: one product, the noun its last op
            ops.append(concept)
            span = [run_[0].first, max(span[1], head.last)]
            root["concept"], root["span"] = "product", list(span)
        nodes.append({"var": "hn", "concept": "name", "span": J.span_of(run_)})
        edges.append([root["var"], "name", "hn"])
        attrs.extend(["hn", f"op{k}", x] for k, x in enumerate(ops, 1))
        for w in run_:
            labels[w] = "head"
        named = True
    return span


def _one_char(group):
    """A group of one single-character Chinese word that is not a demonstrative."""
    return len(group) == 1 and re.fullmatch(r"[一-鿿]", group[0].text) is not None \
        and group[0].text not in DEMONSTRATIVES


def _restack(groups):
    """Stacked runs, with two touching one-character Chinese words of the same stacked role glued back
    into one group: a compound the segmenter split. Longer words stay separate modifiers."""
    out = []
    for role, group in groups:
        if out and role in STACK_ROLES and out[-1][0] == role and _one_char(out[-1][1]) and _one_char(group) \
                and out[-1][1][-1].last + 1 == group[0].first:
            out[-1] = (role, out[-1][1] + group)
        else:
            out.append((role, group))
    return out


def _kind_one(group, head, token_sent):
    """一种 right before the head, right after 的, with 是 earlier in the sentence (X 是 … 的一种 N)."""
    tok = dict((int(k), str(t)) for k, t in token_sent)
    first, last = group[0].first, group[-1].last
    if head.first != last + 1 or tok.get(first - 1) != "的":
        return False
    return any(t == "是" for k, t in tok.items() if k < first - 1)


def _stem(word):
    if word in SUFFIXES:            # the suffix alone (V | 者 cut apart): nothing to strip
        return word
    for s in SUFFIXES:
        if word.endswith(s) and len(word) > len(s):
            return word[: -len(s)]
    return word



def _suffix_split(head, ws):
    """The word right after the head is a person suffix the segmentation cut off (V | 者)."""
    after = [w for w in ws if w.first > head.last]
    return bool(after) and after[0].text in SUFFIXES


def _org_role_words(cands, head, lang):
    """In ORG + title + Name: the person's name word and the title word, or (None, None).
    The name is a word with a middle dot, or a word jieba tags as a person name (nr);
    the title is the head if it is not the name, else the last content word before the name."""
    jieba.dt.check_initialized()
    tags = jieba.posseg.dt.word_tag_tab
    names = [w for w in cands if any(c in J.NAME_DOT_CHARS for c in w.text)
             or (lang == "zh" and len(w.text) > 1 and tags.get(w.text) == "nr")]
    if not names:
        return None, None
    name_w = names[-1]
    if head is not name_w:
        return name_w, head
    before = [w for w in cands if w.last < name_w.first]
    return (name_w, before[-1]) if before else (None, None)


def _named_role(name_w, title_w, lang):
    """(p / person :name (n / name :op1 ...) :ARG1-of (h / ORG_ROLE :ARG3 (t / title) :aspect state))."""
    parts = [x for x in J.name_parts(name_w.text, lang) if x not in J.NAME_DOT_CHARS]
    title = title_w.text if lang == "zh" else title_w.text.lower()
    return ([{"var": "p", "concept": "person", "span": name_w.span},
             {"var": "n", "concept": "name", "span": name_w.span},
             {"var": "h", "concept": ORG_ROLE},
             {"var": "t", "concept": title, "span": title_w.span}],
            [["p", "name", "n"], ["p", "ARG1-of", "h"], ["h", "ARG3", "t"]],
            [["n", f"op{k}", x] for k, x in enumerate(parts, 1)] + [["h", "aspect", "state"]])

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
    if shape == "org-role":         # the title is the head: (title :ARG3-of (ORG_ROLE :ARG2 org :aspect state))
        return ([{"var": "t", "concept": concept, "span": sp},
                 {"var": "h", "concept": ORG_ROLE}],
                [["t", "ARG3-of", "h"]], [["h", "aspect", "state"]])
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
