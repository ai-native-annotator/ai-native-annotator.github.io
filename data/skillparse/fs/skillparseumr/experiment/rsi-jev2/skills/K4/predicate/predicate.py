"""predicate (kind: jev): one clause — its event, sense and participants.

Three rounds of closed questions, each built from the answers before it:

  1. head     choice: which word of the clause is the predicate;
     kind     choice: an ordinary verb / adjective, or one of the abstract
              concepts for non-verbal predication (identity-91, have-91, ...).
  2. sense    choice among the head's PropBank rolesets (looked up locally;
              asked only when there are several);
     aspect, modstr  choice; polarity  noul.
  3. role_<w> per content word of the clause: which participant's phrase the
              word is in (the roles of the chosen sense, the general roles), or
              part of the predicate, or none;
     out_<A>  per core role, when the sentence has words outside the clause:
              where that participant is, inside, unexpressed, or one of the
              words outside.
Rule: runs of words with the same role are the placeholders (open), bridged
over a stray word with another label between two words of a core role or a
clause role (BRIDGE_EXTRA), never across the head or clause punctuation;
neighbouring temporal / duration runs are one temporal run; a
temporal phrase ending in 后 / 前 / 以来 / 时 keeps that word as a node with
the rest as its op1; a core role found outside gives `outside`.
A frame 在 / 于 / 当 / 自 ... + localizer (上, 中, 时, 后, ...) is one adjunct: every labelled word in it
takes the general role of the word right before the localizer (an event noun as a place -> temporal).
"""
import os
import sys

import jieba
import jieba.posseg

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import jevlib as J  # noqa: E402
import jieba.posseg  # noqa: E402

ABSTRACT = {
    "verb": "an ordinary verb or a stative verb / adjective (举行, 发生, 冷, 重要) is the head",
    "identity-91": "X 是 Y, both things: X is Y (equative, naming); not 是……的 focus, not a role or job",
    "have-role-91": "X 是 a doctor / teacher / singer: a role with no organization",
    "have-org-role-92": "X is the president / an employee / a member of an organization or country",
    "have-rel-role-92": "kinship or social relation: X is Y's mother / boss / friend",
    "have-mod-91": "X is (has the property) Y, with no verb or adjective that can be the head",
    "have-91": "X 有 Y: ownership, or a whole that has kinds or parts",
    "exist-91": "there is X (有人敲门, 存在问题), with no owner",
    "have-place-91": "X is at / in Y (location), with no verb",
    "have-quant-91": "X 有 / 仅有 + number + classifier: how many X there are",
    "belong-91": "X belongs to Y (X 属于 Y)",
    "resemble-91": "X is like Y (像, 如同)",
}
ABSTRACT_ROLES = {
    "identity-91": {"ARG1": "the thing", "ARG2": "what it is"},
    "have-role-91": {"ARG1": "the holder of the role", "ARG3": "the role"},
    "have-org-role-92": {"ARG1": "the office holder", "ARG2": "the organization", "ARG3": "the title"},
    "have-rel-role-92": {"ARG1": "the person", "ARG2": "the other person", "ARG3": "the relation"},
    "have-mod-91": {"ARG1": "the thing", "ARG2": "the property"},
    "have-91": {"ARG1": "the owner / whole", "ARG2": "the thing owned / its kinds"},
    "exist-91": {"ARG1": "the thing that exists"},
    "have-place-91": {"ARG1": "the thing", "ARG2": "the place"},
    "have-quant-91": {"ARG1": "the thing counted", "ARG2": "the quantity"},
    "belong-91": {"ARG1": "the thing", "ARG2": "the owner"},
    "resemble-91": {"ARG1": "the thing", "ARG2": "what it is like"},
}
NO_ASPECT = {"have-org-role-92", "have-role-91", "have-rel-role-92"}
ASPECT = {
    "habitual": "a habit or characteristic activity in general, not one occasion: what someone regularly does "
                "(他每天跑步), a clause that describes people by what they usually do. NOT a single event that only "
                "carries a frequency or continuation adverb (频繁, 经常, 多次, 照常): give it the aspect it would "
                "have without that adverb",
    "state": "a lasting condition with no act or change in it: being (是), having (有), belonging, knowing, "
             "believing, wanting, needing, a property or adjective, an abstract concept, a general rule of what a "
             "place or group does; also serving or counting as something (作为, 担任), an amount standing at a "
             "level (超过, 达到, 占), being located or gathered somewhere as a result (站在, 聚集在 + a place), "
             "being under someone's attention; a product's specification, equipment or features (配备, 搭载, 配置, 配有, 装有: a device fitted with a part). NOT an act of saying, reporting, asking or announcing (说, 指, "
             "表示, 要求, 宣布), NOT a document or picture showing something (显示, 表明), NOT becoming (成为, "
             "变成), NOT putting or hiding something somewhere (藏于, 放在): those name events",
    "performance": "one bounded occurrence of an event: holding or organizing something, saying, announcing, "
                   "stating, requesting or expressing something, giving, providing, helping, returning, "
                   "launching or starting something, becoming something, a kickoff or opening, a change with a "
                   "result (举行了, 死亡, 发生爆炸, 被定罪). Judge the event itself, not its tense or certainty: it "
                   "is performance also when planned, promised, announced, future, possible, negated, "
                   "hypothetical or under a belief or suspicion verb, and for a durative verb told as one step of "
                   "a narrative (回家休息). Also a completed past event over a stated period",
    "activity": "explicitly ongoing at the time talked about: 正在 / 在 + verb, 着, a progressive, an event going "
                "on while another happens; an open-ended activity described as under way (an ongoing inquiry, a "
                "search one needs to make); living or staying somewhere over time (住在, 居住). Not a verb that "
                "launches or offers something (展开, 提供): that is performance",
    "endeavor": "an attempt, or an action carried out whose result the text does not state or which failed "
                "(试图, 尝试, 抢救, 劝说)",
    "directed-activity": "a change of a value or amount in one direction with no final value reached in the "
                         "clause: a price or number falling or rising (下跌, 上涨, 减少, 增加, 下降, 降低, 提高), "
                         "when no 至 / 到 + end value follows",
    "process": "only an event with no single occurrence: a generic or unbounded event, a gradual change with no "
               "end point (逐渐, 越来越), an outcome only hoped for or judged good or bad for (对X有利), an "
               "event noun that names no single occurrence; or nothing above fits",
}
MODSTR = {
    "full-affirmative": "asserted as fact (also a fact in a past report); also the reporting, claiming, implying "
                        "or suspecting verb itself, and a plan or future event that someone announces or states (将 / "
                        "会 + verb under 宣布, 表示). A hedge inside its complement or in another clause does not "
                        "lower this event: judge only the event `predicate` itself",
    "partial-affirmative": "probably (很可能, 大概, 多半, 想必), or required / intended / demanded: 要, 应, "
                           "应当, 应该, 需要, 必须 + verb, or what a directive orders (要求 / 命令 + someone + "
                           "verb: that verb). Plain 可能 without 很 is NOT this",
    "neutral-affirmative": "possibly, may, might (可能, 也许, 或许), a question, a wish, an ability right on "
                           "the event (能)",
    "neutral-negative": "may not, cannot, must not, should not: a negated ability, possibility, permission or "
                        "requirement (不能, 不可, 不应该, 不得 + verb)",
    "partial-negative": "probably not",
    "full-negative": "asserted not to happen, with no modal (没有, 不, 从未, 并未 + verb); not 不能 / 不可 (those "
                     "are neutral-negative)",
}
NEGATORS = {"不", "没", "没有", "未", "未曾", "未能", "尚未", "并未", "并不", "并没有", "从未", "从不", "从没",
            "非", "别", "勿", "莫", "不要", "不能", "不会", "不再", "不得", "不可", "无法", "决不", "绝不",
            "再也不", "not", "n't", "never", "no"}
# an event under an obligation or intention marker is partial-affirmative (要 only right before the head:
# elsewhere it may be the future 'will')
DEONTIC = {"要", "应", "应当", "应该", "需要", "必须", "须", "务必"}
# the complement event of a directive verb is partial-affirmative, of a prohibiting verb partial-negative
DIRECTIVE_PARENT = {"要求", "命令", "呼吁", "号召", "敦促", "建议"}
PROHIBIT_PARENT = {"禁止", "严禁", "不准", "不许"}
GENERAL = {
    "place": "a place: in Beijing, at the arena (在X)",
    "temporal": "a time: a date or clock time (2017年5月22日, 22点33分), 当晚, 去年, 今后, after / before / "
                "when X (X后, X时, 当X时)",
    "duration": "how long: 三天, for 20 years",
    "frequency": "how often: 每天, twice",
    "manner": "how: 认真地, quickly",
    "instrument": "by what means: 用刀, by train",
    "degree": "a degree word on an adjective: 非常, 十分, 最, 极其",
    "mod": "another adverb: 大量, 只, 再也, 也, 都",
    "reason": "because ...: 因为, 由于, 因X而Y",
    "purpose": "in order to ...: 为了",
    "condition": "if ...: 如果, 只要",
    "concession": "although ...: 虽然, 尽管",
    "source": "from X: 从X",
    "goal": "to X: 到X, 向X",
    "companion": "together with X: 和X一起, 与X",
    "example": "特别是 / 尤其是 + an illustrating part",
}
OTHER = {
    "predicate": "part of the predicate itself, right next to it: the head's own particles, aspect 了 / 着 / "
                 "过, auxiliary, ability or possibility modal (能, 会, 可以), negation (不, 没), light verb "
                 "(进行, 作出), copula 是. Not a verb the head governs (the verb or clause after a phase, "
                 "obligation, citing or belief verb is that verb's argument), and not a modal, negation or "
                 "light verb of another verb inside a participant's phrase (that word takes the phrase's role)",
    "none": "only marks a role or links clauses (在, 从, 把, 被, 对, 的, 因为, 如果, 当), or punctuation",
}
COPULAS = {"是", "为", "有", "在", "像", "属于", "叫", "即", "乃", "系", "存在",
           "is", "are", "was", "were", "be", "have", "has", "had"}
TIME_WORDS = ("以后", "之后", "后", "以前", "之前", "前", "以来", "时", "时候", "的时候", "期间")
PARTICLES = set("的 地 得 了 着 过 吗 呢 吧 啊 呀".split())
# words that start with 不 / 没 but negate nothing (conjunctions, adverbs, 没收)
NOT_NEGATORS = {"不但", "不仅", "不过", "不论", "不管", "不同", "不久", "不断", "不少", "没收"}
PREFIX_DEGREE = set("很 最 更 太 较")     # a degree word fused with its adjective (很少 -> 少 :degree 很)
PREFIX_MOD = set("还 也 都 就")          # an adverb fused with its verb or copula (还是 -> 是 :mod 还)
# roles besides the core ARGs whose words make one phrase from the first to the last (a clause
# with its own time, adverbs and objects inside stays one child, parsed recursively)
BRIDGE_EXTRA = ()
TIME_ROLES = ("temporal", "duration")
# scalar change verbs: a process answer on one of them with no 至 / 到 + end value is directed-activity
SCALAR = {"涨", "跌", "上涨", "下跌", "下降", "上升", "减少", "增加", "降低", "提高", "扩大", "缩小", "下挫"}
SCALAR_FALLBACK = False

# a frame: a preposition opening it, a localizer closing it; the words between are one adjunct
FRAME_OPEN = {"在", "于", "当", "自"}
LOCALIZERS = {"上", "中", "里", "内", "时", "时候", "期间", "之际", "以来", "后", "前"}
FRAME_KEEP = {"时", "时候", "后", "前", "以来", "期间"}    # localizers that are a node of their own (时 :op1 X)
# a setting that names an event (在会议上): gold writes it as :temporal, not :place
EVENT_NOUNS = {"会议", "大会", "活动", "典礼", "仪式", "发布会", "峰会", "论坛", "比赛", "赛事", "展会", "展览",
               "晚会", "庆典", "会谈", "记者会", "开幕式", "闭幕式"}

# directive / modal verbs: gold writes <complement event> :modal-predicate <the verb> on the event of
# their ARG1 / ARG2 (禁止 + V, 要求 X + V, 拒绝 + V)
MODAL_PREDICATES = {"禁止", "严禁", "要求", "拒绝", "希望", "允许", "命令", "呼吁", "建议", "同意", "打算",
                    "计划", "想", "准备", "敦促", "号召"}
MODAL_ROLES = ("ARG1", "ARG2")


# words chosen as head that are not the event: the head moves to the first later verb of the clause that
# PropBank knows (see _redirect). A light verb before an event noun (得到 保证 -> 保证, only when that event is
# the clause's last content word; 获得 stays out: 获得授权 keeps 获得), a negator (没有 发布 -> 发布 :polarity -),
# a phase verb (开始 治理 -> 治理 :aspect inceptive), a coverb or purpose connective (由 X 提供 -> 提供 :ARG0 X,
# 透过 X 控制 -> 控制 :medium X, 用以 V -> V).
LIGHT_HEADS = {"得到", "进行", "加以", "作出", "给予"}
NEG_HEADS = {"没有", "没", "未", "并未"}
PHASE_HEADS = {"开始": "inceptive"}
COVERB_HEADS = {"由", "透过", "通过", "用以", "以便", "用于"}
# the role of the words between the coverb and the verb (the coverb needs such an object to be moved off)
COVERB_ROLE = {"由": "ARG0", "透过": "medium", "通过": "medium"}
REDIRECT = LIGHT_HEADS | NEG_HEADS | set(PHASE_HEADS) | COVERB_HEADS
def run(sent, token_sent, lang, text, span, **_):
    ws = J.inside(token_sent, span, lang)
    heads = [w for w in ws if not J.is_punct(w) and w.text not in PARTICLES and w.text != "被"] or ws
    st = J.state(sent, token_sent, span, lang)

    # 1. the head and the kind of predication
    q = {"kind": {"type": "choice",
                  "instructions": "What is the head concept of the clause `piece` (marked 【】 in "
                                  "`sentence_with_piece_marked`)?",
                  "criteria": ABSTRACT}}
    if len(heads) > 1:
        q["head"] = {"type": "choice",
                     "instructions": "Which word is the predicate of the clause `piece`: its main verb or "
                                     "predicate adjective? When one verb governs another verb or a whole "
                                     "clause, choose the GOVERNING verb; the governed verb or clause is its "
                                     "argument: an obligation "
                                     "verb (必须 + a verb), a citing or reporting verb whose content follows "
                                     "(引用, 报道, 宣布, 声称, 说, 表示; in 据X所说 the verb after 所), a belief "
                                     "verb (认为, 相信). Do NOT choose an aspect particle (了, 着, 过), an "
                                     "ability or possibility modal (能, 会, 可以, 可能, 应该), a future marker "
                                     "(将, 将要), a light verb before an event noun (进行, 作出, 加以, 遭到, "
                                     "受到, 发生 + noun), a polite 请 before a verb (请坐 -> 坐) or a causative "
                                     "令 / 使 / 让 + someone (令人吃惊 -> 吃惊): choose the event word they "
                                     "govern. Copula 是: in 是……的 choose the verb inside; in 最X的(就)是Y "
                                     "choose the adjective X; under a belief verb (认为这是Y) choose the "
                                     "belief verb. Only for a plain X是Y between two things choose 是; for "
                                     "X有Y choose 有. A relative clause's head is its verb, not the noun "
                                     "after 的.",
                     "criteria": {w.key: None for w in heads}}
    a = yield {"state": st, "questions": q}
    head = J.by_key(heads)[J.choice(a["head"])] if "head" in a else heads[0]
    kind = J.choice(a["kind"])
    orig = head
    head = _redirect(head, ws, lang)
    moved = head is not orig
    if moved:
        kind = "verb"               # the event the light verb / negator / coverb was on

    # 2. sense, aspect, modal strength, polarity
    lemma = _lemma(head.text, lang)
    prefix = None                   # a degree word or adverb fused into the head word: its own node
    if lang == "zh" and len(lemma) > 1 and lemma not in COPULAS and not J.rolesets(lemma, lang) \
            and lemma[0] in PREFIX_DEGREE | PREFIX_MOD:
        rest = lemma[1:]
        if rest in COPULAS or J.rolesets(rest, lang):
            prefix = "degree" if lemma[0] in PREFIX_DEGREE else "mod"
            lemma = rest
    senses = J.rolesets(lemma, lang)
    if kind != "verb" and senses and lemma not in COPULAS:
        kind = "verb"               # a verb PropBank knows (成, 变成) is the head, not identity-91
    if kind != "verb":
        senses = []
    ev = {**st, "predicate": head.text}
    q = {"aspect": {"type": "choice",
                    "instructions": "What is the aspect of the event `predicate` in the clause `piece`? Go "
                                    "down the list and take the first that applies. Judge the event itself "
                                    "as if no modal (可, 能, 能够, 可以, 会, 将) or adverb like 陆续 were on it.",
                    "criteria": ASPECT},
         "modstr": {"type": "choice",
                    "instructions": "How certain does the writer present the event `predicate` of the "
                                    "clause `piece`?",
                    "criteria": MODSTR},
         "negated": {"type": "noul",
                     "instructions": "Is the event `predicate` negated in the clause `piece` (不, 没, 未, "
                                     "非, not, never right on it)?"}}
    if len(senses) > 1:
        q["sense"] = {"type": "choice",
                      "instructions": "Which PropBank sense of `predicate` is used in the clause `piece`? "
                                      "Each option lists the sense's name and its argument roles. Do not take "
                                      "the first sense by default: choose the sense whose roles match the "
                                      "participants the clause actually has. (a) If the verb has an object and "
                                      "then a predicate about that object (V + X + 是 / 为 / 成 / 作为 + Y, or X "
                                      "被V + a predicate: regard, call, confirm or designate X as Y), choose the "
                                      "sense with a role for that attribute (an ARG2 such as attribute, as what, "
                                      "description), not the plain 'think / say that' sense; a full clause with "
                                      "its own subject as the content takes the 'that' sense. (b) If a recipient "
                                      "is marked by 向 / 给, choose the sense with a recipient role. (c) If an "
                                      "action or resources are launched or put into or against a target, choose "
                                      "the sense with separate roles for the thing and the target. (d) 有 with "
                                      "no owner (there is X) takes the exist sense; V + 起来 (looks, seems) "
                                      "takes the seem sense.",
                      "criteria": {r["roleset"]: J.roleset_text(r) for r in senses[:255]}}
    a = yield {"state": ev, "questions": q}
    if kind != "verb":
        concept, frame = kind, {"roleset": kind, "roles": ABSTRACT_ROLES[kind]}
    elif senses:
        pick = J.choice(a["sense"]) if "sense" in a else senses[0]["roleset"]
        frame = next(r for r in senses if r["roleset"] == pick)
        frame = {"roleset": frame["roleset"], "roles": frame["roles"]}
        concept = frame["roleset"]
    else:
        concept, frame = f"{lemma}-00", {}    # no PropBank frame: gold writes the senseless -00
    roles = frame.get("roles") or {"ARG0": "agent, causer", "ARG1": "patient, theme, thing affected"}
    aspect = "none" if kind in NO_ASPECT else J.choice(a["aspect"])
    if SCALAR_FALLBACK and aspect == "process" and lemma in SCALAR and not _end_value(head, ws):
        aspect = "directed-activity"
    if moved and orig.text in PHASE_HEADS:
        aspect = PHASE_HEADS[orig.text]     # 开始 + V: V :aspect inceptive
    before = []                     # the words before the head, from the last clause punctuation on
    for w in ws[:ws.index(head)]:
        before = [] if w.text in J.CLAUSE_PUNCT else before + [w]
    after = ws[ws.index(head) + 1:ws.index(head) + 2] if lang != "zh" else []
    prev = [w for w in J.outside(token_sent, span, lang) if w.last == span[0] - 1]   # 不再 | piece 需要
    negator = any(_negator(w, lang) for w in prev + before + after) or (
        lang == "zh" and len(head.text) > 1 and head.text[0] in "不没" and not J.rolesets(lemma, lang)
        and bool(J.rolesets(head.text[1:], lang)))
    negated = J.yes(a["negated"]) and negator      # a negation from a governing verb outside is not this event's
    if moved and orig.text in NEG_HEADS:
        negated = True              # 没有 + V: V :polarity -
    modstr = J.choice(a["modstr"])
    i = ws.index(head)
    right_before = ws[i - 1] if i > 0 else (prev[-1] if prev else None)
    parent = _parent(token_sent, span, lang)
    if any(w.text in DEONTIC and w.text != "要" for w in prev + before) or (
            right_before is not None and right_before.text == "要"):
        modstr = "partial-affirmative"
    elif parent in PROHIBIT_PARENT:
        modstr = "partial-negative"
    elif parent in DIRECTIVE_PARENT:
        modstr = "partial-affirmative"
    if negated and modstr.endswith("affirmative"):
        modstr = modstr.replace("affirmative", "negative")
    polarity = "negative" if negated else "positive"   # gold writes :polarity - as well as the negative modstr

    # 3. participants: a role per word inside, and where the core roles outside are
    asked = [w for w in ws if w is not head and not (moved and w is orig) and not J.is_function(w, lang)]
    options = {k: f"part of the phrase that is {k}: {v}" for k, v in roles.items()}
    options.update(GENERAL)
    options.update(OTHER)
    q = {}
    for n, w in enumerate(asked):
        q[f"role_{n}"] = {"type": "choice",
                          "instructions": {"question": "The clause `piece` has the predicate `predicate` "
                                                       f"({concept}). Which part of the clause is the word "
                                                       "`word` in? A word inside a participant's phrase "
                                                       "(its modifier, relative clause or name) belongs to "
                                                       "that participant.",
                                           "word": w.key},
                          "criteria": options}
    out_words = [w for w in J.content(J.outside(token_sent, span, lang), lang)]
    core = [r for r in roles if r.startswith("ARG")]
    if out_words:
        for r in core:
            q[f"out_{r}"] = {"type": "choice",
                             "instructions": {"question": f"Where is the {r} ({roles[r]}) of `predicate` in "
                                                          "this clause? `inside` if a word of the clause "
                                                          "expresses it; `unexpressed` if nothing in the "
                                                          "sentence is it, or if the clause is a relative "
                                                          "clause and it is the noun the clause modifies. "
                                                          "Otherwise the head word outside the clause that "
                                                          "is it (a dropped subject shared with another "
                                                          "clause, the subject of a controlling verb)."},
                             "criteria": {"inside": None, "unexpressed": None,
                                          **{w.key: None for w in out_words[:250]}}}
    a = yield {"state": ev, "questions": q}

    labels = {w: J.choice(a[f"role_{n}"]) for n, w in enumerate(asked)}
    weight = {w: J.probability(a[f"role_{n}"], labels[w]) for n, w in enumerate(asked)}
    if moved:
        labels[orig] = "none" if orig.text in COVERB_HEADS else "predicate"
        role = COVERB_ROLE.get(orig.text)
        if role:                    # 由 X V: X is V's ARG0; 透过 X V: X is V's medium
            for w in ws[ws.index(orig) + 1:ws.index(head)]:
                if w in labels:
                    labels[w], weight[w] = role, 1.0

    labels = _frames(ws, labels, head)     # 在 X 的 N 上 / 在 X 时: one adjunct, not one dependent per word
    runs = []
    bridge = tuple(r for r in roles if r.startswith("ARG")) + BRIDGE_EXTRA
    for role, group in _merge_time(J.runs(ws, {**labels, head: "@head"}, lang, bridge=bridge), ws):
        # the head splits every run
        if role in OTHER or role == "@head":
            continue
        if group[0].first <= head.first and head.last <= group[-1].last:
            continue                # never hand the predicate itself down again
        if group[0].first <= span[0] and group[-1].last >= span[1]:
            continue                # a placeholder equal to the clause cannot be expanded
        runs.append((role, group))
    best = {}                       # a core role is filled once: by its run with most weight, then nearest the head
    for role, group in runs:
        if role.startswith("ARG"):
            key = (round(sum(weight.get(w, 0.0) for w in group), 6),
                   -min(abs(w.first - head.first) for w in group))
            if role not in best or key > best[role][0]:
                best[role] = (key, group)
    nodes = [{"var": "e", "concept": concept, "span": head.span}]
    edges, opens, outside = [], [], []
    if prefix:
        nodes.append({"var": "m1", "concept": head.text[0], "span": [head.first, head.first]})
        edges.append(["e", prefix, "m1"])
    used = set()
    for role, group in runs:
        if role.startswith("ARG") and group is not best[role][1]:
            continue
        used.add(role)
        var = f"x{len(opens) + 1}"
        if role == "temporal" and len(group) > 1 and _time_word(group[-1]):
            rel, rest = group[-1], J.trim(group[:-1], lang)
            nodes.append({"var": f"t{len(nodes)}", "concept": rel.text, "span": rel.span})
            edges.append(["e", "temporal", nodes[-1]["var"]])
            if rest:
                edges.append([nodes[-1]["var"], "op1", var])
                opens.append({"var": var, "text": J.join(rest, token_sent, lang), "span": J.span_of(rest)})
            continue
        edges.append(["e", role, var])
        if lemma in MODAL_PREDICATES and role in MODAL_ROLES and _has_event(group, lang):
            edges.append([var, "modal-predicate", "e"])    # the demanded / forbidden event points back
        opens.append({"var": var, "text": J.join(group, token_sent, lang), "span": J.span_of(group)})
    cands = []
    for r in core:
        if r in used or f"out_{r}" not in a:
            continue
        ans = a[f"out_{r}"]
        pick = J.choice(ans)
        w = J.by_key(out_words).get(pick)
        p = J.probability(ans, pick)
        null = J.probability(ans, "unexpressed") + J.probability(ans, "inside")
        floor = 0.4 if r in ("ARG0", "ARG1") else 0.6    # a shared dropped argument is nearly always ARG0 / ARG1
        if w and p >= floor and p > null:
            cands.append((p, r, w))
    taken = set()
    for p, r, w in sorted(cands, key=lambda c: -c[0]):
        if w.key in taken:
            continue                # one word outside fills one role: the most probable one
        taken.add(w.key)
        outside.append({"text": w.text, "span": w.span, "role": r})

    alignment = _alignment(head, ws, labels)
    if moved:                       # the light verb / negator / coverb is expressed by the event node
        alignment = [min(alignment[0], orig.first), max(alignment[1], orig.last)]
    return {"graph": {"nodes": nodes, "edges": edges, "attrs": []}, "open": opens, "outside": outside,
            "alignment": alignment, "frame": frame,
            "aspect": aspect, "modstr": modstr, "polarity": polarity}


def _lemma(word, lang):
    if lang == "zh":
        # strip a final particle only when the whole word is unknown to PropBank and the rest is known
        # (通过, 超过, 为了 stay whole; 来过 -> 来)
        if len(word) > 1 and word[-1] in "了着过" and not J.rolesets(word, lang) \
                and J.rolesets(word[:-1], lang):
            return word[:-1]
        return word
    return word.lower()


def _parent(token_sent, span, lang):
    """The nearest content word before the clause, skipping function words, nouns and
    pronouns (the person ordered: 要求他 + clause) at most 4 words back, never past
    clause punctuation; None if there is none."""
    if lang != "zh":
        return None
    jieba.dt.check_initialized()
    tags = jieba.posseg.dt.word_tag_tab
    out = [w for w in J.outside(token_sent, span, lang) if w.last < span[0]]
    for w in list(reversed(out))[:4]:
        if w.text in J.CLAUSE_PUNCT:
            return None
        if w.text in PROHIBIT_PARENT or w.text in DIRECTIVE_PARENT:
            return w.text
        if J.is_function(w, lang) or tags.get(w.text, "n")[:1] in ("n", "r"):
            continue
        return None
    return None


def _end_value(head, ws):
    """Whether a 至 / 到 word (an end value) follows the head before the clause ends."""
    for w in ws[ws.index(head) + 1:]:
        if w.text in J.CLAUSE_PUNCT:
            return False
        if w.text[:1] in ("至", "到") and w.text not in ("至少", "至今", "到底", "至于"):
            return True
    return False


def _time_word(w):
    return w.text in TIME_WORDS



def _redirect(head, ws, lang):
    """The real event when the chosen head is a word of REDIRECT: the first later word before clause
    punctuation that jieba tags as a verb, that PropBank knows, that is not itself in REDIRECT and not
    right before 的. After 由 / 透过 / 通过 an object must come first; after a light verb the event must be
    the clause's last content word. Otherwise the head stays."""
    if lang != "zh" or head.text not in REDIRECT:
        return head
    jieba.dt.check_initialized()
    tags = jieba.posseg.dt.word_tag_tab
    seen = False
    for k in range(ws.index(head) + 1, len(ws)):
        w = ws[k]
        if w.text in J.CLAUSE_PUNCT:
            return head
        if J.is_function(w, lang) or w.text in REDIRECT:
            continue
        nxt = ws[k + 1].text if k + 1 < len(ws) else ""
        verb = tags.get(w.text, "")[:1] == "v" and nxt != "的" and bool(J.rolesets(_lemma(w.text, lang), lang))
        if verb and not (head.text in COVERB_ROLE and not seen):
            if head.text in LIGHT_HEADS:
                for x in ws[k + 1:]:
                    if x.text in J.CLAUSE_PUNCT:
                        break
                    if not J.is_function(x, lang):
                        return head     # 得到 + noun + more: a real 'obtain', not a light verb
            return w
        seen = True
    return head


def _has_event(group, lang):
    """Whether a run is an event (a verb phrase or a clause), not a plain noun phrase: in Chinese a
    word jieba tags as a plain verb ('v', not the verbal noun 'vn' of 改革方案), not a copula or a
    function word; in English a word PropBank knows that is not the run's last word."""
    if lang == "zh":
        jieba.dt.check_initialized()
        tags = jieba.posseg.dt.word_tag_tab
        return any(tags.get(w.text, "") == "v" and w.text not in COPULAS and not J.is_function(w, lang)
                   for w in group)
    return any(J.rolesets(w.text.lower(), lang) and w.text.lower() not in COPULAS
               and not J.is_function(w, lang) for w in group[:-1])


def _frames(ws, labels, head):
    """For each 在 / 于 / 当 / 自 followed by a localizer with no head and no clause
    punctuation between them, every labelled word between takes the general role of
    the last labelled word before the localizer. The localizer takes it too when it
    is a time word (时, 后, 前, 以来, 期间), or when it was given a general role of its
    own. A place frame whose last word names an event becomes temporal."""
    labels = dict(labels)
    for i, w in enumerate(ws):
        if w.text not in FRAME_OPEN or w is head:
            continue
        j = None
        for k in range(i + 1, len(ws)):
            x = ws[k]
            if x is head or x.text in J.CLAUSE_PUNCT:
                break
            if x.text in LOCALIZERS:
                j = k
                break
        if j is None or j == i + 1:
            continue
        inner = [x for x in ws[i + 1:j] if x in labels]
        if not inner:
            continue
        last = inner[-1]
        r = labels[last]
        if r not in GENERAL:
            continue
        if r == "place" and (last.text in EVENT_NOUNS or (len(last.text) > 1 and last.text[-1] in "会赛")):
            r = "temporal"
        for x in inner:
            labels[x] = r
        loc = ws[j]
        if loc in labels and (loc.text in FRAME_KEEP or labels[loc] in GENERAL):
            labels[loc] = r
    return labels

def _negator(w, lang):
    # one of NEGATORS, or a Chinese word starting with 不 / 没 (不再, 没有) that is not in NOT_NEGATORS
    t = w.text.lower()
    if t in NEGATORS:
        return True
    return lang == "zh" and len(t) > 1 and t[0] in "不没" and t not in NOT_NEGATORS


def _merge_time(rs, ws):
    """Neighbouring runs labelled temporal or duration, with no other labelled
    word and no clause punctuation between them, are one temporal run (from A
    to B years: one time phrase)."""
    out = []
    for role, group in rs:
        if out and role in TIME_ROLES and out[-1][0] in TIME_ROLES:
            prev = out[-1][1]
            a, b = ws.index(prev[0]), ws.index(group[-1])
            between = ws[ws.index(prev[-1]) + 1:ws.index(group[0])]
            if not any(w.text in J.CLAUSE_PUNCT for w in between):
                out[-1] = ("temporal", ws[a:b + 1])
                continue
        out.append((role, group))
    return out


def _alignment(head, ws, labels):
    """The head's span, widened over the words right next to it that are part
    of the predicate (了, 能, 开始, ...), so coverage does not hand them back."""
    i = ws.index(head)
    a, b = i, i
    while a > 0 and labels.get(ws[a - 1]) == "predicate":
        a -= 1
    while b + 1 < len(ws) and (labels.get(ws[b + 1]) == "predicate" or ws[b + 1].text in PARTICLES):
        b += 1
    return [ws[a].first, ws[b].last]
