"""sent_type (kind: jev): what kind of piece is this?

One choice question: the piece's type; and, when the piece is one word that
PropBank has, a second choice: how the word is used here (an event, a state,
a manner adverb, a thing). A word Jev calls stop but that is used as an event
or a state goes to predicate, which gives it its sense, aspect and arguments.
A `stop` leaf is then built by rule: a pronoun from the pronoun table, any
other leaf the piece as written, without a sense (an English word lowercased).
A function word, or a word right before the particle 地, is never asked its use. A one-word pronoun needs no question at all. A
piece with a comma inside gets one more choice per comma: what the stretch after
that comma does (a new subject, the same subject with a new action, a
description of a noun before it, said content, a list). A discourse piece with
no comma that starts a new clause goes to predicate; a predicate piece with such
a comma, that Jev gives even a fair chance of being discourse, goes to discourse,
which can still answer none (and so hand it to predicate).
"""
import os
import sys

import jieba
import jieba.posseg

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import jevlib as J  # noqa: E402

DISCOURSE_IF_COMMA = 0.2
TYPES = {
    "discourse": "Two or more full clauses joined as equals: coordination (X，并且Y; X，但是Y; X或者Y; "
                 "X，然后Y; X and Y; X, but Y). The clauses may share one subject written only once: a subject "
                 "with two or more verb phrases, each with its own main verb, the later ones after a comma and "
                 "joined by 并/而/也/还 or by nothing (X关闭了工厂，并调走工人); a comma clause that goes on to "
                 "list who or what was involved (…，包括A、B和C) is a clause of its own too. A main clause with a "
                 "subordinate clause (因为, 如果, 当……时, 为了, 以便, 从而, a relative clause ending in 的) is NOT "
                 "this: it is predicate. Neither is one verb of saying, reporting, thinking, suspecting or showing "
                 "(说, 称, 表示, 声称, 认为, 怀疑, 显示) followed by what is said, thought or shown, even when that is "
                 "several clauses with commas between them: the whole piece is predicate. Nor a clause after a "
                 "comma that only says where or what the last noun before it is (放进盒子，藏在柜底, about the "
                 "box): predicate. It IS discourse when the speaker does something else after the comma, a "
                 "second action with its own verb (X称A，并主持了B).",
    "predicate": "One event or state: a clause or verb phrase with its participants, a relative clause given "
                 "alone (……的 with a verb in it), a predicate adjective (天很冷), an event noun used as an "
                 "event with its own participants. A whole simple sentence with one main verb (and its "
                 "subordinate clauses) is predicate, and so is a sentence whose main verb is a verb of saying, "
                 "reporting, thinking, suspecting or showing whose content runs over several comma clauses "
                 "(某人表示A，B，C; 官方怀疑A，B，C): that verb heads everything after it. Also a subject followed "
                 "directly by its verb or adjective, with no 的 between them and no 是/很 needed (房租昂贵, "
                 "工人罢工, 收入减少, 计划可行), and 最/更/很 + adjective or verb with no noun after it "
                 "(最受欢迎, 更加便宜). A single verb or stative adjective alone in the piece is predicate too when "
                 "it names an event or state here and its participants are outside the piece (the verb after "
                 "开始/继续/拒绝, the verb of a 为了 clause, the verb of a relative clause), and so is a verb with a "
                 "reflexive object (爱自己, 怪自己). Also a verb followed by its object, even when the piece ends "
                 "in a noun (保护森林, 资助那个“团体”); a piece starting with a copula 是/还是/不是 + a noun phrase "
                 "(还是队员, 是该校学生): a role or identity; 跟/和/与 X 有 + an event noun (与X有合作); and a noun + "
                 "verb compound naming the act done to the noun (火灾预防, 价格控制), unless a noun follows it "
                 "(火灾预防 + 部门 is np_phrase) or it names a field of study or work (企业管理 as a subject is "
                 "np_phrase). NOT predicate: a piece whose only verb-like words are grammar (an aspect marker "
                 "正/正在, the 时 of X时, a connective 若/如果, a preposition or frame 透过/通过/对X而言); judge it "
                 "by what is left: a plain noun left over is stop or np_phrase, an event noun is predicate.",
    "np_phrase": "A noun phrase that needs more than one node: a noun with modifiers (adjective, noun "
                 "modifier, possessor X的N, relative clause + noun), a number or demonstrative with a "
                 "classifier (三本书, 这种手机, 两张), coordinated nouns (A和B), or a single noun naming a "
                 "person by what they do or the role they hold (救援人员, 袭击者, 总统, 官员). Also a compound "
                 "whose first part modifies its head, even written as one word (体育新闻 = 新闻 + 体育, 红帽子, "
                 "网络安全, 金属箱子), a noun made of a verb + 者 (幸存者, 投资者), and a time word followed by a "
                 "smaller time word (明天下午). A place or country name before an ordinary noun is a modifier, "
                 "not part of a name: 德国当局, 杭州东部, 韩国电视台, 东京枪击案, 中方 are np_phrase; so is a "
                 "description made of ordinary words for one particular committee, centre or plan (X应急委员会, "
                 "救援中心), with quotes or without. A noun phrase ENDS in its noun head, every modifier before "
                 "it: a piece that ends in a verb or adjective saying something about the noun before it is NOT "
                 "np_phrase but predicate (价格昂贵), and so is a verb followed by its object (保护森林) or a piece "
                 "starting with 是/还是 (是协会会员), while 最受欢迎的X stays np_phrase. A name with a title, "
                 "job or state before it (已故作家X, 前市长X) is np_phrase. BUT a quoted title of a work is "
                 "special_entity, even with 一篇 / 两本 before it or its type word after it (“X”巡回演出, 《X》杂志).",
    "special_entity": "A proper name (person, place, country, a facility or organization called by its own "
                      "name), a date or clock time with numbers (2019年3月8日, 9点15分), a quantity with a unit "
                      "(20年, 3499美元; 5000人 is NOT: a number of people is np_phrase), a percentage, or an "
                      "ordinal (第三). The whole piece must be the name. A name stays whole when its last word "
                      "belongs to it: a club, team or university (X足球俱乐部, X大学), a named match or edition "
                      "of a competition (X杯决赛, X联赛), a show or tour named with its quoted or English title "
                      "(“X”巡回演唱会, 慈善晚会 + an English title), a website, platform or brand (often Latin "
                      "letters inside Chinese, like Snapchat). Also the title of a work in quotes or book marks "
                      "(an article, report, book, programme or song: 一篇「X」, 《海边的故事》); a number + "
                      "classifier before the title (一篇, 两本) belongs to it, and the words inside the title are "
                      "never analysed. Only the name or title itself is special_entity: an ordinary noun after a "
                      "place name (政府, 当局, 警察, 方, 南部, 电视台, X案) makes the piece np_phrase; quotes around "
                      "ordinary words do not make a name; a single ordinary noun for a place or body (教堂, "
                      "车站) is stop; a name with a title, descriptor or state before it (已故作家X, 前市长X) is "
                      "np_phrase; and a name followed by a verb and what it says or does (X表示……, X宣布……) is "
                      "predicate.",
    "stop": "One concept with nothing inside it: a single plain noun, pronoun, adjective, adverb or time "
            "word (尾声, 他, 今天, 当地, 混乱), or an ordinary noun for a place or body (教堂, 车站). Length "
            "is not structure: a long word with no modifier is still stop. BUT a compound whose first part "
            "modifies its head (体育新闻, 红帽子) or a verb + 者 noun (幸存者) is np_phrase, even written as one "
            "word. An adjective or noun that only modifies the noun after it (黑色 in 黑色外套, 公共 in "
            "公共汽车, 冠军 in 冠军奖杯) is stop, even if it can be a predicate elsewhere. Not a verb or an "
            "adjective that names an event or a state here, even alone in the piece with its participants "
            "outside it (the verb after 开始/继续, the verb of a 为了 clause, a verb + 自己): that is "
            "predicate. Not a noun naming an action, happening or feeling used as such (抗议, 谈判, 援助, "
            "担忧 as the object of 表示/提供/表达/进行, after 在…后 or 透过): that is predicate too. Not a "
            "proper name, even one word (a person, a place, a Latin-letter brand): special_entity.",
}


EVENT_IF = 0.5      # event + state probability of the use question that sends a stop word to predicate
USES = {
    "event": "An action or happening talked about as such: a verb, the verb of a relative clause or of a "
             "purpose clause, the verb after 开始/继续/拒绝, or a noun that names an act wherever it stands: "
             "the object of a light or communication verb (提供援助, 进行谈判, 发表演讲, 表达支持, the 调查 in "
             "拒绝调查), after a preposition or inside 在…后/前/中 (在讨论后, 透过谈判), the purpose of "
             "预定/准备/用于, the act inside an agent noun (the 投资 in 投资者), or a verb before a noun saying "
             "what that noun does or is for (报警器材, 援助资金, 训练场地). A noun for an announcement, plan, "
             "attack, criticism, rescue or greeting is the act, not a document or object.",
    "state": "A state or feeling said of something: the predicate of its clause (the 危险 in 路很危险, the "
             "健康 in 他很健康), or a feeling or attitude named as a noun after 表示/感到/表达/引起 (表示担忧, "
             "感到失望).",
    "manner": "An adverb or adverbial saying how, how long, how much, or that something still goes on: "
              "often before 地 or right before a verb (悄悄地, 认真, 临时, 彻底, 仍旧, 集体). NOT an event, "
              "even if the word can be a verb elsewhere.",
    "attribute": "A word before a noun (directly or with 的) that only says what kind of thing that noun is, "
                 "what it is about or what it comes from, with no participants of its own here: an adjective "
                 "(黑色 in 黑色外套, 简陋 in 简陋的房子), a noun (公共 in 公共汽车, 冠军 in 冠军奖杯), or an event "
                 "noun used only to classify (洪水 in 洪水灾害, 地震 in 地震的威力, 选举 in 选举结果). NOT an event "
                 "or a state, even if the word is a verb or adjective elsewhere. But a verb saying what the noun "
                 "does or is for (报警器材) is event.",
    "thing": "A concrete thing, a person, a place, or a notion that is not something happening or felt "
             "(寒冷 in 在寒冷中, 消遣 in 为了消遣). NOT an event; but a word that means 'the act of X-ing' and "
             "stands as an argument of its own is event.",
}


NP_IF_SPLIT = 0.2       # np_phrase (or predicate) probability that keeps a stop piece of several words from one leaf
SEP_IF = 0.5            # new_subject + same_subject_new_action probability that makes a comma a clause boundary
NOT_AGENT = set("记者 学者 作者 笔者 前者 后者 两者 二者 再者 患者 长者 使者".split())
AFTER_COMMA = {
    "new_subject": "A new clause with its own subject written right after the comma (a noun, name or pronoun "
                   "followed by its own verb), an event that holds on its own: …，公司表示…; …，股价下跌…; "
                   "…，他们随后离开. Choose this also when a different speaker starts saying something after "
                   "the comma.",
    "same_subject_new_action": "The same subject as before the comma, not repeated, does a second action "
                               "with a verb of its own, often after 并/并且/而/也/还/然后 or with nothing "
                               "(X关闭了工厂，并调走工人; 他吃完饭，然后出门).",
    "describes_noun": "Only says what a noun before the comma costs, is, has, or where it is: a price, a size, "
                      "a property, a place (推出新手机，售价N元; 新车明年开卖，价格为N元; 放进盒子，藏在柜底). "
                      "Choose this even when the stretch starts with a property noun such as 价格/售价/重量/尺寸: "
                      "that is a property of the thing just named, not a new subject; and when its verb "
                      "(定价, 售价, 价格为, 重, 长, 位于) gives a value of that thing rather than a new act.",
    "said_content": "Continues what a verb of saying, reporting, thinking, suspecting or showing before the "
                    "comma reports (他说A，B; 官方表示A，B; 报告显示A，B): the stretch is still part of that "
                    "content, by the same speaker.",
    "list": "Continues a list or an apposition of a noun before the comma (A、B, 包括A和B, 即X), with no "
            "verb of its own that makes a new event.",
}
SEPARATE = ("new_subject", "same_subject_new_action")     # labels that make a comma a clause boundary


# a named government body is a name even when it reads like a common noun: gold writes
# government-organization :name, with one :op per word (a jurisdiction before it is a part of the name)
NAMED_BODIES = set("国会 议会 参议院 众议院 白宫 国务院 联合国 欧盟 北约 最高法院 美联储 五角大楼 克里姆林宫 人大 全国人大 政协".split())
JURISDICTION = set("联邦 美国 中国 英国 法国 日本 俄罗斯 德国 州".split())


# a special_entity answer for a piece made only of plain dictionary words (a dynasty or era, a kind of
# building, a generic event or category) is kept only when Jev is this sure; otherwise stop / np_phrase
SE_KEEP = 0.6
ERA_SUFFIX = ("代", "朝", "时期", "年间")
NAME_TAGS = ("nr", "ns", "nt", "nz", "eng")
NAME_MARKS = set("《》“”「」\"")


def common_only(ws, piece, lang):
    """Every content word of the piece is a plain dictionary word: known to jieba, not tagged as a
    name, and the piece has no digit, Latin letter or quote / book mark. A 2-3 character word ending
    in an era suffix or tagged as a time word (a dynasty, a period) counts as common."""
    if lang != "zh" or not ws:
        return False
    if any(c.isdigit() or ("A" <= c <= "Z") or ("a" <= c <= "z") or c in NAME_MARKS for c in piece):
        return False
    jieba.dt.check_initialized()
    tags = jieba.posseg.dt.word_tag_tab
    freq = jieba.dt.FREQ
    for w in ws:
        t = w.text
        tag = tags.get(t, "")
        if 2 <= len(t) <= 3 and (t.endswith(ERA_SUFFIX) or tag.startswith("t")):
            continue        # a dynasty or period: a plain concept
        if freq.get(t, 0) <= 0 or tag.startswith(NAME_TAGS):
            return False
    return True

def jurisdiction(t):
    """A word naming a state or country: one of JURISDICTION, or any word jieba tags as a place name."""
    if t in JURISDICTION:
        return True
    jieba.dt.check_initialized()
    return jieba.posseg.dt.word_tag_tab.get(t, "") == "ns"


def named_body(ws, lang):
    """The piece's content words are exactly a named body, or a jurisdiction + a named body."""
    if lang != "zh" or not ws:
        return False
    ts = [w.text for w in ws]
    if len(ts) == 1:
        t = ts[0]
        if t in NAMED_BODIES:
            return True
        return any(jurisdiction(t[:k]) and t[k:] in NAMED_BODIES for k in range(1, len(t)))
    return len(ts) == 2 and jurisdiction(ts[0]) and ts[1] in NAMED_BODIES

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
    elif J.content(raw, lang) and named_body(ws, lang):
        kind = "special_entity"     # a named government body: a name, whatever it looks like
    else:
        inner = [w for w in raw[1:-1] if w.text in "，,；;"]
        q = {"type": {"type": "choice",
                      "instructions": "What kind of piece of a UMR graph is `piece` (marked 【】 in "
                                      "`sentence_with_piece_marked`)? Judge the piece as a whole.",
                      "criteria": TYPES}}
        if senses:
            q["use"] = {"type": "choice",
                        "instructions": "How is `piece` used in `sentence_with_piece_marked`? Judge its job in "
                                        "this sentence, not what the word can mean elsewhere.",
                        "criteria": USES}
        marks = {}
        for k, w in enumerate(inner):
            field = f"piece_comma_{k + 1}"
            marks[field] = (J.text(token_sent, [span[0], w.first - 1], lang) + "【" + w.text + "】"
                            + J.text(token_sent, [w.last + 1, span[1]], lang))
            q[f"after_comma_{k}"] = {
                "type": "choice",
                "instructions": f"What does the stretch right after the comma at token {w.first} in `piece` do? "
                                f"That comma (comma {k + 1} of {len(inner)} inside the piece) is marked 【】 in "
                                f"`{field}`. Judge the stretch from it up to the next comma or the end of the "
                                f"piece, and how it relates to the words before that comma.",
                "criteria": AFTER_COMMA}
        answers = yield {"state": J.state(sent, token_sent, span, lang, **marks), "questions": q}
        kind = J.choice(answers["type"])
        if kind == "special_entity" and common_only(J.content(raw, lang), J.text(token_sent, span, lang), lang) \
                and J.probability(answers["type"], "special_entity") < SE_KEEP:
            st = J.probability(answers["type"], "stop")
            npp = J.probability(answers["type"], "np_phrase")
            # plain dictionary words are no name: one word is a plain leaf, more may be a head + modifier
            kind = "stop" if len(J.content(raw, lang)) <= 1 or st >= npp else "np_phrase"
        comma_answers = [answers.get(f"after_comma_{k}") for k in range(len(inner))]
        asked = bool(inner) and all(comma_answers)
        split = asked and any(sum(J.probability(a, l) for l in SEPARATE) >= SEP_IF for a in comma_answers)
        if kind == "discourse" and asked and not split:
            kind = "predicate"      # a noun's description, said content or a list only: not a second clause
        if kind == "predicate" and inner and (split or not asked) \
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
