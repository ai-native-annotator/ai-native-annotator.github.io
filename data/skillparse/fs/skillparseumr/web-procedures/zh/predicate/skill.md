# Skill: one clause — its event, sense and participants

You are building a Uniform Meaning Representation (UMR) graph for one sentence.
You are given one clause (one event or state). Decide **its head concept and
PropBank sense**, then write **the graph fragment of the event**: the event
node, and one placeholder for each participant, which other skills annotate
later. Also give the event's aspect, modal strength and polarity.

The sentence and the clause are given under **Input** at the end.

## 1. The head concept

**Abstract concepts** for non-verbal predication (no lookup needed):

| the clause says | concept and roles |
|---|---|
| X is the president / an employee of an organization or country | `have-org-role-91`: ARG1 X, ARG2 the organization, ARG3 the title |
| X is a doctor, a teacher (a role with no organization) | `have-role-91`: ARG1 X, ARG3 the role |
| his mother, X's boss (kinship, social relation) | `have-rel-role-92`: ARG1 X, ARG2 the other person, ARG3 X's role |
| X is Y (equative, naming) | `identity-91`: ARG1 X, ARG2 Y |

| X 是 Y where Y is not a post in an organization but says what X is to a place or thing (常客, 访客, 粉丝, 老顾客) | `identity-91` (aspect `state`), never `have-org-role-91`. A place or thing Y relates to (X是某店的常客) hangs on Y as `[y, "ARG0-of", p]`, p a node `implicit-predicate` with ARG1 that place (re-entered from `outside` when it is already named) |

| X is red, beautiful (property) | `have-mod-91`: ARG1 X, ARG2 the property |
| a whole that has kinds, versions or parts (X存在多种Y, X有许多品种) | `have-91`: ARG1 whole, ARG2 its kinds; belonging `belong-91` |
| X has Y (ownership); Chinese X 有 N where X (a person, group, work or thing; not a place or time) owns, holds or has N (有很多粉丝, 有一套房子, 有重要地位, 有一个打算) | `have-91`: ARG0 the possessor X, ARG1 the thing had N, aspect `state`; never a lexical 有-01 frame and not `exist-91` |

| Chinese 有 in the fixed expressions 有能力, 与B有关系, 有这么一回事 | the lexical 有 frame from the lookup (有-03, 有-04, 有-06), not `have-91` / `exist-91`: ARG0 the possessor, ARG1 the thing had. In A 与 B 有 N both parties form one ARG0 (`and`), never `companion`. In 有能力 + VP, ARG1 is 能力, and the VP hangs on 能力 as `:ARG1-of identity-91 :ARG2` VP |
| X 达到 / 跌至 / 升至 + number + classifier (the value X reaches) | the verb is the head, with X as its argument; the amount is **not** an argument of the verb. Add a node `have-quant-91` (span of the number) with edges `[x1, "ARG1-of", h]` and `[h, "unit", u]` (u the classifier node) and the attr `[h, "ARG2", N]` |

| there is X, with no owner or whole (there are problems, 有人敲门) | `exist-91`: ARG1 the thing |
| X (和 Y) 有(adj)区别 / 差异 | `exist-91`: ARG1 X (an `and` placeholder for X和Y), ARG2 the noun 区别 / 差异 (a noun, not a verb), with its adjective as `mod` of that noun |

| X的题材 / 内容 / 种类有A、B、C等 (listing members of a category) | not `have-91`: the head is the verb of the category noun's relative clause (报导 in 经常报导的题材), the category noun is its argument, and the list is a placeholder hung on the noun with `example` |
| (其中)最A的(就)是Y | not `identity-91`: the adjective's event is the head (著名-01), Y its first argument, 最 a `have-degree-91` linked to it as below; 就 gets no node |

| LOC 有 X, where LOC is a part or side of an object being described (盒子侧面有一个把手) | `有-03`: ARG1 the object (often dropped: see section 3), ARG2 X, `place` LOC; not `exist-91` |
| X 有 / 仅有 number + classifier (how many X there are) | `have-quant-91`: ARG1 X, ARG2 the quantity phrase |

| X中(有) N + noun as a subject ('N of the X': 乘客中有三人是外国人) | a subset: the placeholder for N + noun hangs `[x1, "ARG1-of", i]`, i a node `include-91` (aspect `state`) with `[i, "ARG2", x2]`, x2 the set X. 中 and 有 get no node, and X is never `mod` |

| LOC 是 X, saying what is on a part of an object (盒子背面是公司标志) | `identity-91`: ARG1 the object (often dropped), ARG2 X, `place` LOC |
| X 是为了 Y (X exists or was made for Y) | `identity-91`: ARG1 X, `purpose` Y; X is not an argument of Y's verb |
| X is at/in Y (location; Chinese X 在 Y) | `have-location-91`: ARG0 the thing, ARG1 the place |
| X is like Y | `resemble-91` |

| X (可)算是 Y (a judgment) | `算是-01` (span 算是): ARG0 X, ARG1 Y, aspect `state`; never make Y's noun or adjective the head |
| 以 X 为 目的 / 目标 | `identity-91`: ARG1 a placeholder for 目的, ARG2 a placeholder for X; the subject hangs on 目的 with `[x1, "purpose-of", x3]` |
| X 靠 Y + VP (got VP by relying on Y) | VP's verb is the head and Y is its `reason`; 靠 gets no node and no event |
| 拍 / 摄 a photo of X (拍到一张X的照片) | ARG1 is X (what is photographed) and ARG2 is the photo: two placeholders, never one NP |
| 下令 / 命令 + person + action (pivot) | ARG1 the person placeholder; the action is a placeholder hung on the person with `[x1, "ARG0-of", x2]` |
| bare 传 + clause ('it is rumoured', no 据) | `传-01`, ARG1 the clause, aspect `state`; never a `mod` |


- Chinese stative verbs and adjectives (冷, 高兴, 重要) are verbs with a sense
  (`冷-01`), not `have-mod-91`.

  Two exceptions are `have-mod-91` (ARG1 the thing, ARG2 the adjective as a
  bare concept with no sense): an adjective in 是…的 (报导都是真实的), and an
  idiom or adjective with no frame in the lookup (荒诞不经).
- In X 是 Y，以…而闻名 (or another clause that goes on describing Y), the
  trailing clause hangs on Y, the predicate nominal: Y is the ARG1 of 闻名 (闻名 / 著名 take no ARG0; never add one from `outside`), and
  any implicit agent re-enters Y, not X. More generally, a comma-joined clause with no subject that keeps describing a noun of your clause (the thing just created: 创办了Z，专门刊登…; the thing just printed: 登出一幅画，画中…; what an object contains: 采用格式，有日期等) is one placeholder hung on that noun's placeholder with the role the noun plays in it (`["x2", "ARG0-of", "x3"]`). It is not a sibling of your event. But a comma clause that tells a new event of X itself, with its own time or place (X是某剧的第N集，于某年在某台播出), does not describe Y: the first node is `and`, op1 the 是 clause and op2 that event, which takes X from `outside`.

- **是……的 is not identity.** In 这座桥是由他设计的 or 他是昨天来的 the
  copula only focuses a part; the head is the verb inside (`设计-01`, `来-01`).
  `identity-91` is only for X 是 Y where both are things (他是老师 →
  `have-role-91`; 这是桥 → `identity-91`).

- **V X 为 / 是 Y with a verb of declaring, judging, confirming or calling** (宣布, 认定, 确认, 证实, 称, 视为: 宣布会议为非法, 认定该人是嫌犯, 称此事是“…”): 为 / 是 gets no node and no `identity-91`. The verb takes X as ARG1 and Y as ARG2, as two placeholders, with the sense that has an ARG2 (认定-02, 确认-02). A clause after Y that goes on about Y (…，他已被通缉) hangs on Y's placeholder, not in the verb's argument.

- 认为 / 觉得 X 是 Y ('regards X as Y') is the same: `认为-02` with ARG1 X and ARG2 Y as two placeholders. When Y is 一件 / 一个 + ADJ + 的 + 事, the ARG2 phrase is headed by 事 (the adjective hangs on it as `ARG0-of`, the number and classifier go on 事), never by the adjective.



- This holds also when 的 is followed by a classifier and a noun that only
  names X's kind: X 是 …V1，…V2，…V3 的(一种 / 一个) N. Do not use `identity-91`
  and do not create a node for N or for 一种. The head is the **first** verb V1,
  and X is its participant (a placeholder). Each other verb phrase is a
  placeholder hung on X's placeholder with the role X plays in it
  (`["x1", "ARG0-of", "x3"]`, `["x1", "ARG1-of", "x4"]`). The verb phrases are
  not coordinated: no `and`.


**Otherwise the lemma of the head verb.** Strip aspect particles 了 / 着 /
过; a passive is the active lemma (*was convicted* → `convict`). A light verb
(*make a decision*, 进行讨论, 作出决定, 发生爆炸, 发生事故) is not the head: the event noun is, with a sense (`事故-01`). Its node and `alignment` cover 发生 / 作出 too (发生事故), so the light verb is never left over; but with 进行 / 加以 (进行改组) the node and `alignment` are the content verb only. Likewise 有 + an eventive noun (跟X有联系) is headed by the noun's frame (`联系-02`), with both parties as its arguments; and 用 / 利用 X + VP is headed by the VP's verb, with X as its `instrument` and no 利用 node. But 展开 / 开展 / 发表 + an eventive noun (展开行动, 发表声明) keeps the verb as head: the eventive noun is its ARG1 placeholder (built later as an event), never skipped. When you are that eventive noun's clause, take no place, time or other oblique from `outside` (they stay on the governing verb), and after 表达 / 致以 (慰问, 哀悼) add no ARG0 from `outside` either. Its aspect follows the context: `performance` for a completed 表达了X, `activity` for an ongoing operation (展开行动).
Verbs of getting (获得, 得到, 取得 + N: 获得批准; but in 取得成功 / 获得胜利, where N is the subject's own outcome, drop the verb: N's event is the head, with the subject as its ARG0) are not light verbs: the
verb is the head, and N is its ARG1 as a plain noun with no sense. But 遭到 /
受到 / 遭受 + an event noun (遭到诅咒, 受到批评) is a passive: the event noun is
the head with a sense, the subject of 遭到 is its ARG1, and the doer is its
ARG0. A phase verb (开始, 继续, 停止, *begin*, *stop*) **is** the head: the
governed event is one ARG1 placeholder. In Chinese the agent is the ARG0 of the governed event (its own placeholder x2, hung with `["x1", "ARG0", "x2"]`), never 开始 / 继续 / 启's; in English it is the phase verb's
ARG0; it is never a `mod` of that event. When 继续 has a subject written in the clause (X仍继续V), that subject is the placeholder hung on the ARG1 placeholder (above), and the continued event's clause does not take it again from `outside`. When there is no subject in the clause, add no agent from `outside`. 继续's span and alignment are 继续 alone; 仍 / 仍然 before it gets no node and no role. A modal of possibility (*can*, 能,
可以) is not the head: the verb it governs is.
A verb of need or obligation (需要, 必须, 必须要) **is** the head: the subject of 需要 is its ARG0 (必须 takes no ARG0: its subject belongs to the governed verb)
and the whole governed verb phrase is one ARG1 placeholder; a 不 / 不再 before
it belongs to it, not to the governed verb. 没(有) or 不 right before a verb is
that verb's negation, never a separate `有-03`.

**Reporting frames.** In 据X报导 / 据X所言 / 据X说 / X称 / X指 / 被指 the speech
verb is the head (报导-01, 言-02, 说-01, 指-02), the speaker is its ARG0, and
**all** the reported clauses are one ARG1 placeholder, also when there are
several of them; 据 and 所 get no node. In X引用报导 + content, 引用 and 报导 are two events, not a verb and its object. The first node is `and`:
- op1 is `引用-01`, with ARG0 X and ARG1 a node `implicit-argument` (the unnamed source cited);
- op2 is `报导-01`, with ARG0 X again and ARG1 one placeholder for all the reported content.
In `attrs`, give both events their aspect (`performance`). See the example. A clause that gives the content of a noun (消息, 新闻,
说法, 警语, and a 问题 / 难题 / 障碍 whose following clause says what it is) after a comma hangs on that noun with `:ARG1-of identity-91 :ARG2`.

**Other constructions.** In 令 / 使 + X + VP (令科学家大惑不解) the causative
gets no node: the VP is the event, X is its argument, and the causing clause
is linked with `cause-of` on it. When your clause is the causing event and 令 / 使 X Y follows it, give one placeholder for the whole 令X Y (令 included) with `[e, "cause-of", x]`; never leave it to be picked up later. 请 + VP addressed to the reader is an
imperative: drop 请, make the VP the head, and add the attr
`[e, "mode", "imperative"]`. A verb + result complement (V得, V到) is one
concept only when the lookup lists it; otherwise use the bare verb (拍到 → `拍-01`). A perception or cognition verb + 到 (感觉到, 意识到, 明白到, 目睹到) is the bare verb, aligned to the verb alone. In V成 / V为 / V致 + X (改造成X, 合成为X, 击致昏倒) the node's span covers the complement so that it is never left over (alignment: the verb, plus 致). 改造成 X takes X as ARG2. For a making or combining verb (合成为 X, 制成 X), X is `result`; a result event after V致 / V得 (击致昏倒) is `result`, never `cause-of`.

 V + 于 / 至 (置于, 用于, 设于, 追溯至) is the bare verb (`置-01`, `设-01`, `追溯-02`), with 于 / 至 only marking the argument and left out of the node's span and `alignment`. But a V于 that the lookup lists as one verb (限于, 位于, 属于) is one concept covering both characters.
 Either way the node's span and `alignment` cover the complement too (跌至, 增至, 降到), so it is not left over.

More Chinese constructions:
- A lexicalized speech compound 写道 / 说道 / 问道 is **one** predicate (`写道-01`: ARG0 the writer, ARG1 the content, ARG2 the medium, such as a platform). Another V + 道 (批评道, 笑道, 补充道) is two events: the first node is `and`, op1 the verb (its own arguments only), op2 `道-01` (ARG0 the speaker, ARG1 the quoted content); give each event its aspect in `attrs`.
- V + 给 + recipient (复制给X, 送给X) is `consecutive`: op1 V, op2 `给-01`, which shares V's ARG1 and takes the recipient as ARG2; 给 is never left over.
- V1到V2 where 到 marks degree or result (饿到发抖, 节食到太饿): V2 is the head and V1 is its `reason`.

- V + NP + 到 + place (送伤员到医院): 到 is its own event `到-01`, the ARG2 of V, with ARG0 the moved NP and ARG1 the place; never a `goal` role.
- Serial verbs of one subject with no connective (乘火车抵达X, 回到X举办Y, 去X做Y, 撬锁进入房间) are not `instrument` or `manner`. The first node is plain `and`, with one placeholder op per verb phrase. In a story narrative where the verbs are successive steps (告别众人，回到船上，驾船离去), it is `consecutive`: one flat node with one op per verb phrase, never a nested `and`. A leading 在…后 / 在…外 'after / besides doing X' is then its first op, never a `temporal`. The subject is a placeholder in the first op, and every later verb takes it again from `outside` as its own ARG0. A leading time phrase goes with the first verb. But when V1 gathers, brings or sends people to a place so that V2 happens there (聚集在X购买Y, 把A带到X认领B), V1 is the head and V2 is one `purpose` placeholder. A bringing verb with 到 right after it (带到, 送到) is then one concept (`带到-01`) with the place as ARG2. A place already named earlier in the sentence is given in `outside`.
- 分别 'respectively' with coordinated arguments or dates (A和B分别于3日和4日获释) is still **one** event: 分别 gets no node and no role, the coordinated dates are one `temporal` placeholder (built later as `and` of date-entities), and coordinated participants are one placeholder. Never copy the event. 各自 'each' gets no node and no role.
- 让 / 叫 + X + VP with a written causer (公司让他回家休养): `让-02` is the head, with ARG0 the causer, ARG1 X and ARG2 the caused VP (several verbs give one placeholder, cut into `and` later; each takes X from `outside`). An adverb 先 is a `mod` of 让.
- An adverbial predicate that comments on a whole event (照常举行, 如期举行, 共同演出) is an event `照常-01` / `共同-01` (aspect `state`) that takes the event as its ARG0. In a main clause it is the head, with the event as an ARG0 placeholder. When the event is the head of a relative clause, link it with `[e, "ARG0-of", c]`. Never `manner`.
- A coordinative V+V compound (死伤, 伤亡 'dead and injured') is `and` with one event per verb (`死-01`, `伤-01`), each aspect `state`. A reporting compound 报称 is `报-01` with ARG1 `称-02`; the speaker is the ARG0 of both (an edge from each), and only 报-01 gets an aspect. X报道称 is `称-02` with ARG0 the event `报道-01` (whose ARG0 is X). Never merge them into one node.
- 被捕 is one lexicalized predicate `被捕-01` (its span and alignment include 被), with its subject as ARG0.

- A four-character idiom (chengyu) used as a verb (舍己为人, 破釜沉舟) is one concept, the whole idiom with `-00`, with the doer as ARG0; never split it into its inner verbs and nouns.
- 吸引 / 引起 + N + V (吸引了上万人观看): ARG1 the N placeholder and ARG2 the V placeholder. The V clause takes nothing from `outside` (no ARG0, no ARG1). A placeholder never contains the predicate word: when 共 / 总共 stands before the verb (共吸引N人), leave it out of every placeholder; it gets no node.
- X 与 Y + V where both do V together (他们将与盟友迁往别处): ARG0 is one `and` placeholder spanning X…Y, never `companion`.
- 问 / 知道 + a how or when question (问她如何认识他): ARG1 is one placeholder for the whole embedded clause, 如何 included. That clause's verb takes `manner` (如何) or `temporal` (何时) as a node `umr-unknown` with the wh-word's span. The umr-unknown is never ARG1 itself, and it is never added twice.

- X怀疑 + VP in news ('X is suspected of'): `怀疑-01` with no ARG0. All of the VP, with every coordinated verb, is one ARG1 placeholder, and X is the ARG0 of those verbs. The ARG1 placeholder x1 starts **after** 怀疑 and never contains 怀疑 itself. X is its own placeholder x2, hung with `["x1", "ARG0", "x2"]` so that it is built once, and every embedded verb takes X from `outside` as its ARG0. X is never left over as a `mod` of 怀疑. The suspected events are hedged: their modstr is `neutral-affirmative`.
- X，致使 / 导致 / 造成 Y: X's event is the head and Y is one placeholder with `[e, "cause-of", x]`, never `have-cause-91`. A preceding clause that only sets the time (会议临近结束，…) is a `temporal` placeholder of the main event.

- 如 / 例如 / 比如 opening the sentence: the first node is `implicit-argument` (span of 比如) with `[i, "example", x]`, x a placeholder for the rest of the sentence; 比如 gets no other node, and `aspect` is `none`.
- A hearsay word with no named source (据传, 据说, 传闻) is not a head and gives no `quote`: it is a `mod` node with the whole word as concept (据传) on the first reported event.

- 事发 / 案发 ('when it happened') is `事发-01` with no argument at all (no `implicit-argument` node), aspect `performance`.
- 派遣 / 派 / 出动 + NP + VP (派遣十辆车赶往现场) is a pivot: the NP is ARG1 of 派遣 and the VP is 派遣's ARG2 placeholder (`[e, "ARG2", x2]`); the VP's verb takes the NP again as its ARG0 from `outside`. Later clauses about what was sent (…，护送伤员…) take the NP, not the sender, as ARG0 from `outside`.
- A与B联手V: V is the head, and its ARG0 is one `and` of A and B (a pronoun 其 for B is given in `outside`). 联手-01 is a bare `manner` node with no argument and no aspect.
- X作为Y (money given as a fund): X `ARG1-of` 作为-01 with ARG2 Y, aspect `state`; never `purpose`, and 作 is never left over.
- 若 / 如果 X，(将) Y inside your clause: the node is `have-condition-91` with ARG1 Y and ARG2 X, in the slot the whole conditional fills; 若 gets no node.
- N + 发生 (事故发生, the noun before the verb): `发生-01` is the head with N as ARG0 (a plain noun). Only 发生 + N is the light-verb case.
- A separable verb–object compound that the lookup does not list (破门, 开枪) is the verb's frame (`破-02`) with the object noun as ARG1.
- X的N 包括 A、B…: 包括-01 is the head, with ARG0 N (and its 的-clause) and ARG1 the list; a verb inside the 的-clause is never the head. A trailing ，包括A、B… that lists members of a noun of the main clause (…制作多种节目，包括《A》、《B》) hangs on that noun: one placeholder for the 包括 clause, hung `[x, "ARG0-of", x2]` on the noun's placeholder, with no `and`. Only when it lists no noun's members is the first node `and` (op1 the main clause, op2 `包括-01` with only ARG1 the list).
- 暂停 / 停止 + a service noun (X暂停服务): X is the ARG0 of the service event, and 暂停 takes only ARG1 = that event.
- 多达 / 高达 / 长达 + number + noun: `达-01` with ARG0 the subject and ARG1 the counted noun (with `quant` N on it), plus the attr `[e, "degree", "intensifier"]`. No `have-quant-91`.
- 知道 / 问 + an embedded wh-question (不知道他是谁): ARG1 is a node `umr-unknown` (span of the wh-word), and the question clause is a placeholder hung on it with `[u, "ARG1-of", x]`. Never `amr-unknown`. When you are that question clause (X是谁), the head is `identity-91` with only `ARG2` X. Its ARG1 is the umr-unknown that already exists, so open no placeholder for the wh-word.
- 照常 / 共同 + V: the placeholder for V never includes the adverb itself.

- 可能是 / 应该是 + VP describing a noun (可能是X的人): 是 is a filler, never `identity-91`. The VP's verb is the head, and 可能 is only its modstr (`neutral-affirmative`).
- 非因 X 而 Y / 不是因为 X 而 Y: Y is the head and stays affirmative, with `[e, "ARG1-of", r]`. r is a node `have-reason-91` (span of 因) with `[r, "ARG2", x]` and the attr `[r, "polarity", "-"]`. 非 gets no node.
- 是否 A 还是 B (whether A or B) inside your clause: the node is `umr-choice` with op1 / op2, never `or`. 是否 gets no node, and umr-choice gets no aspect.
- N + time unit + 后 / 前 (三天后, 事发两周后): `[e, "temporal", p]`, where p is a node `implicit-predicate` with `[p, "op1", t]`. t is a node `temporal-quantity` (attr `quant` N, `unit` the unit word as a node) with `[t, "temporal-of", a]`, and a is the node 后 / 前 with `op1` the event X. Never drop the duration.
- 当地 + noun means 'local': it is part of the noun phrase (`place` on that noun), never the start of a 当…时 / 当…前 frame.
- 为此 'for this' is a `purpose` placeholder for the whole word; it is built as `thing` (refer-person 3rd, refer-number singular), with 为 carried by the role.
- A sentence-level connective opening your clause (the clause is the whole sentence after it):
  - 然而 / 但是 / 可是 / 不过 contrasting with an earlier sentence: first node `but-91` (span of the connective), `[b, "ARG2", x]` with x a placeholder for the rest; no ARG1, `aspect` field `none`;
  - 此外 / 另外 / 然后 / 其次 adding to the previous sentence: first node `and` (span of the connective), op1 a node `implicit-predicate` (same span), op2 a placeholder for the rest; `aspect` `none`;
  - 原来 'it turns out': first node `have-reason-91` (span of 原来), ARG1 a node `implicit-predicate` (same span, standing for what was found or told before), ARG2 a placeholder for the rest; `aspect` `none`;
  - 首先 / 第一 opening a list of items that runs across sentences: first node `and` (span of 首先), op1 a placeholder for the rest, with no implicit op. 还有 + N (one more item of the list, often followed by a clause about it): first node `and` (span of 还有), op1 a placeholder for N with its clause; no `exist-91`, and 还 gets no node.
  Never drop the connective, and never make it a `mod` or `temporal` of the event.
- The rest after 首先 / 然后 / 其次 + 是 + N(的问题), once the `and` above is built: `exist-91` with ARG1 N (aspect `state`). A following clause that says what the problem is hangs on N only (`[x1, "ARG1-of", i]`, i an `identity-91` with aspect `state` and ARG2 the clause), never also as a `mod` of exist-91.
- 试图 / 想 X …，未能成功 / 没有成功: `成功-01` (polarity negative) takes the attempted event X as its ARG0 (in `outside`), not the agent.
- 以X为Y 'take X as the Y' (以某城为背景, 以小说为基础): `为-02` with ARG0 the taker (the work or person), ARG1 Y and ARG2 X; never `identity-91`. 以X为目的 keeps its own rule above.
- 将 / 把 X 拿去 / 拿来 V: 拿去 is not an event. V is the head, and the 将-object is its ARG1.
- 只用了 / 用了 + a duration + (就) V: V is the head with the duration as `duration` (只 inside that placeholder); 用 gets no node.
- X给Y + a score (给Y打了N分, 给Y Z的评分): `给-01` with ARG0 X, ARG1 Y (what is rated) and ARG2 a node `score-on-scale-91` whose ARG1 is the score (a grade letter in lower case). A numeric score and the top of the scale are plain numbers in attrs: `[s, "ARG1", 7]`, and 在N分为满分下 / 满分N分 gives `[s, "ARG3", N]`. There is no 分 node and no `identity-91`, and score-on-scale-91 gets no aspect.

- X的(最大)股东 / 主席 / 董事长 为 / 是 Y (the role noun of an organization is the subject, the holder comes after 为 / 是): `identity-91` (aspect `state`) with ARG1 the role-noun phrase and ARG2 Y, as two placeholders. The role and its organization are built inside ARG1; never one `have-org-role-91` as the head.

- 最 + adjective modifying a noun with no 的 (最大股东): when you are this piece, have-degree-91 gets `aspect` `none` (its modstr stays), and its ARG2 is the bare adjective with no sense (大, not 大-01).

- 获 + agent + verb + a noun object (获X发放牌照, 获Y颁发奖项): 获-01 is the head, with ARG0 the subject (the recipient), ARG1 the noun and the time phrase; the verb hangs on the noun's placeholder (`["x1", "ARG1-of", "x2"]`, the agent being that verb's ARG0).
- 获 + a bare verb (获批, 获政府批准, 获选): a passive. The content verb is the head (`批-01`, `批准-01`), the subject of 获 is its ARG1, and a doer between them is its ARG0. 获 gets no node; the alignment is 获批 when adjacent, else the verb alone. 获得 / 得到 + a noun keeps the rule above.
- 启播 / 开播 ('start broadcasting'): two nodes, `启-02` (begin) with `[e, "ARG1", b]`, b a node `播-01` with the same span and `[b, "aspect", "habitual"]` (`process` when the start is negated or not yet realized: 未能启播). 启-02 takes no ARG0 from `outside`. Never one 启播-00.
- 斥资 / 花费 + money + VP (spend money to do VP): `斥资-01` is the head, ARG2 the money, ARG1 a placeholder for the VP (its event gets aspect `process`). The VP is never the head with 斥资 as `instrument`.
- A verb + 予 / 给 compound with a 将-object (将A售予B, 将此牌照批予X) is **one** event, never two: 售予 / 卖给 → `售-01`, 批予 → `予-01`. ARG1 is the 将-object (with its 此 / 该 as `mod`) and ARG2 the recipient. The node and `alignment` cover both characters.
- A与B不同 / 相同: the adjective's event is the head with ARG0 a node `and` (span of 与) whose op1 and op2 are A and B. The 与-object is never `companion`.
- 以X(的)名义 'under the name X': a `mod` placeholder for 名义 and the name, never `manner`.
- 除了X(以)外，(亦)Y: the first node is `subtract-91` with ARG1 a placeholder for the main clause Y and ARG2 a placeholder for X. But when X is a list of people or things set against one noun of Y (besides A and B, C also has …), there is no subtract-91: Y's own event is the head, and X is a placeholder hung on that noun's placeholder with `subtraction`. 除, 了, 以外, 外 get no node; 外 / 以外 are part of the alignment. subtract-91 is not an event: its `aspect` is `none`.
- A verb used as an adverb before another verb (集中发展, 大力推广, 全面采用): the second verb is the head, and the first is a bare `manner` node (the word, no sense, no arguments, no aspect). Its text is never handed on as a clause.
- N times per unit (每天播放两次) and a recurring clock time (每晚7:30播出) are one `frequency` placeholder covering the whole phrase, built as `rate-entity-91`. Never split them into a 每X node and a separate count or time.
- An obvious typo for a known verb (a homophone written for the real verb) takes the corrected lemma with its real sense; -00 only when the corrected verb has no frame.
- 前者 / 后者 ('the former / the latter') refers to a noun written earlier in the sentence: give that noun in `outside`, never a placeholder.

- 有 right before a verb (亦有自制X, 有参与): not `have-91` and not a node. The following verb is the head and takes the subject, the adverbs and the purpose clause directly.
- X 联同 / 联合 Y + V (both do V): ARG0 is one `and` placeholder spanning X…Y, never `companion`; 联同 gets no node.
- 属 / 属于 'belong to' is `属-02`: ARG0 the owner or group, ARG1 the thing that belongs.
- X限于 + place + V (限于某省以内广播): `限于-02` with ARG0 X, ARG1 the place phrase (a localizer 以内 is its head) and ARG2 the activity; the place is never a `place` of V.
- 转型 / 改组 / 改为 / 变成 + 为 Y: Y is `end-state` (never `goal` or a numbered argument), and 从 X is `source`. 转型-01's ARG0 is the thing that transforms (the 将-object or the subject); add no separate causer.
- A fronted 与B不同 whose subject A is written after it: in the ARG0 `and`, op1 is B (the 与-object) and op2 is A, in surface order.
- A trailing clause with no subject that says what a newly mentioned noun does (申请创办一条频道，主要播放X) hangs on that noun's own placeholder, never on the event that introduces the noun: give the noun as its own placeholder so that the clause can hang on it.
- Add no `outside` subject to an event that is only the content of 申请 (申请创办X), nor to a later conjunct (再次获批, 启播) whose only candidate is the agent of an earlier conjunct.
- 同年 / 当年 alone, meaning a date written earlier in this sentence (于某年…，并于同年V), is that date: give it in `outside` with role `temporal` and the date's span, never a new placeholder.






**Look the lemma up with `propbank_lookup` before choosing a sense** (give the
lemma and up to two alternates), then pick the sense whose argument
descriptions fit the participants of this clause. Never invent a sense
number; a lemma the lookup does not return is `<lemma>-00` (never `-01` by default: 注销-00, 转寄-00, 加注-00, 摄-00). The concept is the predicate word as written in the clause; never expand it to a synonym compound (最富创意 → `富-01`, not `富有-01`).

## 2. The participants

Use **the roles of the sense you chose**. A numbered argument the sense does
not list does not exist.

- ARG0 is the agent, not "the subject": in *the window broke* the window is
  ARG1. A passive's unexpressed agent is left out.

- Number every role from the role descriptions of the sense, not from a default subject = ARG0, object = ARG1. Many Chinese frames start at ARG1 or put the content or result in ARG2 (成为-01: ARG1 the thing, ARG2 what it becomes; 声称-01: content ARG2; 联系-02: both parties ARG1). The person contacted by 接触 is ARG1. Never give one verb two ARG0s.

- A complement clause is one participant: *said that the package arrived* →
  ARG1 is "the package arrived".
- A role the clause does not express is left out.

- Before using `place`, check the frame: placement verbs (停放, 放置, 摆) take the location as a numbered argument (ARG2).


- A thing and its part or side before the verb (盒子底部印有日期: the box's
  bottom) are two participants: the thing is the numbered argument and the
  part is `place`. Never give them as one placeholder.


Other roles:

| the piece says | role |
|---|---|
| a place: in Beijing, at the base | `place` |
| how long: for 20 years, 三天 | `duration` |
| how often: twice, 每天 | `frequency` |
| by train, with a knife | `instrument` |
| a language, a signal or a transmission system an event is carried out in (以普通话广播, 以某语言服务, 以同一讯号播放, 以有线电视接收, 用英语写) | `medium`, never `instrument`; but 以 + a picture quality or format (以标清 / 以高清播放) is `manner` |
| quickly, 认真地 | `manner` |

| a degree word on an adjective or stative verb (非常, 十分, 极其, 相当, *very*); the plain 很 before an adjective is not annotated | the attr `[e, "degree", "intensifier"]` plus the word itself as a `mod` placeholder |
| a superlative, comparative or excess degree (最, 更, 太, *most*) on the head | a node `have-degree-91` (span of 最), always the **first** node. Its roles: `[h, "ARG1", x]` the thing that has the quality (a placeholder, or `outside`; nothing when it is the noun a relative clause modifies), `[h, "ARG2", e]` the property event, `[h, "ARG3", m]` (m a node whose concept is the Chinese word itself: 最 / 更 / 太, never `most`). The property event takes no argument and no aspect (死伤最惨重 → have-degree-91 ARG1 死伤, ARG2 惨重-01 alone). The `aspect` field (`state`) and the modstr belong to have-degree-91. A comparison set such as 其中 is a `mod` of the property event, never ARG5. A 自X以来 'since X' that limits the superlative is have-degree-91's `range`: a node `以来` with `:op1` X. Never `degree` |
| 其中 'among them' (restricting to a set) | `mod` |

| 就 X 'about / regarding X' on a verb of announcing, commenting or deciding (就X发表声明) | `topic`, not a numbered argument |

| 在X方面 / 在X上 'as for X, in terms of X' framing the clause | `topic`: a placeholder for X alone; 在 and 方面 get no node |
| the channel or broadcaster after 在 / 于 with a broadcasting verb (在某台首播, 于X播出) | `ARG0` (the broadcaster), never `place` |
| an evaluative or evidential adverb (成功(地), 亲眼, 亲自) | `mod`, never `manner` |

| a deliberate-manner adverb (特意, 故意, 专门) | `manner`, never `mod` |
| 终于, 最后, 终究 | `temporal`, never `mod` |
| 仅 / 只 'only' right before the verb (not before a counted object or a duration) | no placeholder and no node |
| 在X的指令 / 命令 / 要求下 'under X's order' | `cause`: a placeholder for the noun with X (在 and 下 get no node) |
| a verbal classifier with a count after the verb (救了他一把, 去了一次, 敲了一下) | `frequency`: a node `rate-entity-91` (span of the count) with the attr `[r, "ARG1", N]` |
| a X过程 / X期间 / X时 phrase as the subject of 遇到 / 发生 / 出现 | `duration`: a placeholder for X's event (过程 / 期间 get no node), never ARG0 |

| a totalizing or limiting word right before a counted object or a duration (共 / 总共 / 一共 + N人; 只 in 只用了N天) | inside that quantity's placeholder span (it becomes `mod` of the counted noun or of the temporal-quantity), never `mod` of the verb |



| 在 + event + 中 on a death or injury (在火灾中丧生) | `reason`, not `place`; but a general noun 事件 / 案 there (在事件中受伤) is `place` |
| a channel, platform, place or means that an action goes through (透过电视, 在微博上, 通过一座塔把信号传出) | `medium` (ARG2 when the frame lists the medium, as for 写道) |
| the 向-addressee of 表达 (向家属表达慰问) | `affectee`, not `goal`; but the one honoured by 致敬 (向X致敬) is its `ARG1` |


| a focus word before the subject (只有, 只, 唯有 + subject) | inside the subject's placeholder span (it becomes `mod` of the subject), not a role of the verb |

| X历史上 'in X's history' | `temporal` (on the thing described), never `place` |
| a temporal adverb: 同时, 随后, 当时, 从 (从不) | `temporal`: a placeholder for the word; never leave it out |
| an aspectual, experiential, repetition, sequence or focus adverb: 曾, 曾经, 一直, 原, 原本, 再度, 再次, 重新, 亦, 遂, 重点, 主要 | `mod`: a placeholder for the word, never `temporal` or `manner`. But 又, 正 (progressive), 而, 再 meaning 'then' between conjuncts, and the focus / additive adverbs 也, 还, 都, 就, 才, 则, 已 / 已经 get no placeholder and no node |
| an adverb of amount, extent or restriction (大量, 大规模, 只能, 再也) | `mod`, the whole word |
| 特别是 / 尤其是 + clause(s) illustrating this clause | `example` |

| because of + noun phrase, 因 N 而 Y | `reason`; but a Chinese reason **clause** (因为/由于 X，Y; X，因而 Y) is not a role: it is `have-reason-91`, built by the discourse step. When such a pair is part of reported content (X告诉Y：…，因为…), put both clauses in **one** ARG1 placeholder of the speech verb |
| to ..., in order to ... (English) | `purpose`; so is a Chinese 为了/为 X clause before or after the main clause (X is a `purpose` placeholder of the main verb, 为 gets no node) |
| if ... | `condition` |
| although ... (English) | `concession`; Chinese 尽管/虽然 X，(仍) Y is `but-91` from the discourse step |
| from X / to Y | `source` / `goal` |
| together with X | `companion` |
| a calendar date: in 1998, on 3 May 2001, 2001年3月 | `temporal` (UMR has no `time` role) |
| any other time: yesterday, last week, 去年, 今后, when ... | `temporal` |

**Time expressions.** A bare time (*yesterday*, *when he left*) is
one `temporal` placeholder; a bare calendar date (*in 1998*, 2001年) is also one
`temporal` placeholder. A preposition before it (在, 于, 至, 到) gets no node. A time **relative to something** keeps its
relation word as a node, with the something as its `op1`:

| the piece says | in the fragment |
|---|---|
| after the war (English) | node `after` (the word's span), `[event, "temporal", a]`, `[a, "op1", x]` |
| before X, until X, since X (English) | node `before` / `until` / `since`, the same way |
| Chinese X后 / X以后 / X前 / X以前 / X以来 / 战后 | the whole Chinese word as written is the node (`后`, `以后`, `以前`, `以来`; never cut 以前 down to 前), the same way; never `after` / `before`, never a `mod` of the verb |
| Chinese 在X时 / X时 / X的时候 | **no** node for 时: X (without 在 and 时) is one placeholder, `[event, "temporal", x]` |
| a year range: between 1920 and 1925, 1920至1925年间 | one node `date-interval` (span of the whole range), `[event, "temporal", d]`, the bare years as attributes `[d, "op1", 1920]`, `[d, "op2", 1925]`; no `between`, no date placeholders |
| during X | `temporal` placeholder for X |

| 直到X / 一直到X (until X) | node `直到` (its span), `[event, "temporal", a]`, `[a, "op1", x]`; the time is the placeholder x |
| X年开始 / 自X起 (since X) | node `开始` (or `起`), `[event, "temporal", a]`, `[a, "op1", x]`; not an event |
| 在X的同时，Y (your clause is the whole of it) | the head is `have-temporal-91` (span of 同时), first node: ARG1 a placeholder for Y, ARG2 a placeholder for X (without 在 and 的同时); 在 and 同时 get no other node |

| for three days | `duration` placeholder (a quantity) |

**Not participants:** negation and modals (they are `polarity` and `modstr`
below), the relative pronoun of a relative clause and the noun it modifies (the
noun phrase links to this clause itself), and the subordinator that only marks
a role (*because*, *if*, *when*; the role says it).

## 3. Participants outside the clause: `outside`

Some participants are written **outside** the clause's span:

- control and raising: in *Pope wanted to leave*, the clause *to leave* has
  ARG0 *Pope*;
- a subject shared by coordinated clauses: in *Pope denied it and left*, the
  clause *left* has ARG0 *Pope*;
- a pronoun in the clause that refers to someone **named elsewhere in this
  sentence**: in *Pope was ill when he was arrested*, the clause *he was
  arrested* has ARG1 *Pope*. Give Pope in `outside` and not *he* as a
  placeholder. A pronoun whose referent is not in this sentence stays an
  ordinary placeholder.

- the same referent written twice in the sentence (他们…他们, a name repeated as a signature, 看守人…看守人): the second mention is not a new placeholder; give it in `outside` with the span of the first mention.


- Chinese often drops the subject or topic of later clauses: when a clause
  keeps describing a thing named in an earlier clause (…正面有X，背面是Y),
  that thing is its participant; give it in `outside`.
- Exceptions (Chinese): in a pivot construction (方便 / 让 / 使 / 帮助 + NP +
  VP) the NP is a participant of the governing verb only, and the subject of
  需要 is not repeated in the clause it governs. When you are that governed
  clause, do not list them in `outside`.

- Reported content: when your clause is (part of) what a reporting or saying
  verb outside it reports (报导, 说, 宣称, 声称, 指, 据…所言), give that verb in
  `outside` with role `quote` and its span as the main clause has it. Every
  event inside the reported content does this, however deeply nested.

 When reports are nested (报导 … X声称 …), the `quote` is always the **outermost** reporting verb (报导). This holds also for the nested speech verb 声称 itself and for everything under it.

- Do not put in `outside` an agent that the clause and the sentence leave
  implicit.

- An overt subject written in your clause (我们 inside a quotation) is an ordinary placeholder. Never replace it with the quoting clause's speaker or any other antecedent. But when the same pronoun is written again in a later clause of the same quotation (我们不认识他，我们没见过他), the later one is the same referent: give it in `outside` with the span of the first mention.
- A quotation in its own quote marks introduced by its own speech verb (…道：‘…’) takes that nearest verb as `quote`.

- When your clause modifies a noun (a relative clause, a describing clause, a 包括 list), that noun is already linked to your event by the parent's inverse role (`ARG0-of`, `ARG1-of`). Never also give it in `outside`.
- Do not give the governing clause's subject in `outside` for a verb inside a purpose clause, a 除了…外 clause, the VP under 斥资, the planned clause under 计划 / 打算 with its own 将-object, or a relative-clause verb whose missing participant is already an argument of the governing verb (the recipient of 发放 in 获…发放的牌照). These implicit participants stay unexpressed. A placeholder `x0` you did not open never appears in `edges`.





Each is `{{"text": ..., "span": [first, last], "role": ...}}`, with the span
of that participant **exactly as the main clause has it**, so the two can be
joined into one node. Return `outside: []` when there are none.

## 4. Aspect, modal strength, polarity (always required)

**aspect** — go down this list and stop at the first that applies:

1. usual, repeated, or a disposition (*he bakes pies*) → `habitual`
2. a state: the abstract concepts above, predicate adjectives, *know*,
   *believe*, *want*, *be in remission* → `state`
3. ongoing with no endpoint in view (*was walking*, a progressive) → `activity`
4. completed and reaching a result (*tasted*, *convicted*, *was flown*) →
   `performance`
5. ended without a result (*searched in vain*) → `endeavor`. The attempt verb 试图 itself is `performance`, and the event it governs is `process`; 寻找 under 需要 is `activity`
6. a single instant (*knocked once*) → `semelfactive`
7. an event named by a noun, or nothing above fits → `process`

`have-org-role-91`, `have-role-91` and `have-rel-role-92` take `none`. A future
or hypothetical event still gets the aspect it would have.

More on aspect:

- A completed past event that went on over a stated period (*was built from
  1920 to 1925*, 于2002至2010年间颁发) is `performance`, not `activity`.
- A general description of what a place or group does, allows or refuses
  (只收现金, 不接受支票) is `state`; so is *ensure* / 确保 that something holds.
- An unbounded, generic activity inside a purpose clause (为了让学生多读书:
  the reading) is `process`.
- An event used as a modifier of a noun (自杀 in 自杀攻击, 控制 in X控制小组, 直播 in 直播活动) still gets an aspect: `performance` for one act, `activity` for an ongoing function, `process` otherwise. An event noun that is only an oblique of another event (爆炸 in 在爆炸中身亡) gets `none`. A stative verb or property in a
  relative clause (属于X的, 富有创意的, 在黑暗中发光的 describing what a thing is
  like) is `state`, never `none`.
- A recurring, characteristic activity of an organization or publication
  (publishing, printing, reporting, gathering content, regularly adding a
  notice from some date on) is `habitual`, even with 了. So is an event that is
  the content of an ability (有能力 / 能 + V). But publishing one specific counted item (刊载了一张照片, 刊登了一篇X) is `performance`.
- A single past act of reporting, citing, announcing or naming (报导, 引用, 公布,
  被称为) is `performance`, not `process` or `activity`, even with 直到…仍.
- Mental-state verbs (怀疑, 相信) and verbs of persisting (坚持, 保持) are
  `state`, also with 从不 / 仍. The speech verb of 据X所言 is `state`.
- A frequency word (有时, 经常) is the `frequency` role: the event keeps the
  aspect of one occurrence (`performance`), not `habitual`. 经常 / 常常 / 总是 / 重复, however, describe a regular practice: they are still the `frequency` role, but the event is `habitual`.
- 继续 / 持续 + an activity is `activity`; 继续 + a state (继续限于X, 继续保持) is `state`. 已经停止 V / 已经停刊 in a relative clause describing a noun is `state`. A verb with 了 reporting one change (怀了孩子) is `performance`. A single past claim or allegation (指, 被指, 称) is `performance`; but 称 X (为 / 是) Y that characterizes something (称事件是“…”) is `称-01` with aspect `state`. What a photo or image shows (上面现出X) is `state`.

- An event that is only the content of a headline, title or slogan (标题为「X出现在Y」) is `state`, with modstr `partial-affirmative`.
- An imperative, requested or ordered event that has not happened yet (请…抛开, 下令…勾引) is `process`.
- A verb of spatial configuration (覆盖, 占据, 位于) is `state`, even with 了.

- A posture or location verb + 在 + place that says where someone is (聚集在X, 站在X, 坐在X) is `state`.
- An ongoing, unbounded undertaking (调查, 行动, buying in a progressive scene) is `activity`, not `process`. Treating or caring for people with no completion stated (救治, 照顾) is `endeavor`.
- An unrealized event that someone is willing to do (the complement of 愿意 / 打算) is `process`, and so is an activity reported as going ahead as planned (照常举行).
- The resulting condition of a causative verb (注意 in 引起…注意) is `state`.

- A bounded goal in a purpose clause (以满足X的条款, 为配合X, 以迎合X) is `performance`; only an unbounded, generic activity there is `process`.
- A station's or channel's broadcasting that is only permitted or forbidden (不被允许播放广告) is `process`, not `habitual`.


- Planning or attempting (计划, 打算 + VP) is `endeavor`; the planned events under it (and actions coordinated with them) are `process`, never `performance`.
- A station's or channel's broadcasting (播放, 播出, 广播, 播) is `habitual`: an ongoing regular activity, also after 开始 / 启 and in a relative clause.
- Being called or named (简称, 称为, 名为) is `state`.

- In the production notes of a film or episode, a statement of where its shots were filmed (X在Y取景 / 拍摄, 大部分镜头在Y取景) is `habitual`, and the subject 镜头 is never the ARG0 of 取景.






**modstr** — how certain the speaker presents the event: `full-affirmative`
(asserted as fact), `partial-affirmative` (*probably*, 很可能, 应该), `neutral-affirmative`
(*may*, *might*, 可能, 疑似, a question, a wish), `neutral-negative`, `partial-negative`
(*probably not*), `full-negative` (asserted not to happen: *did not*, *never*).

An event that is only the content of an ability (the VP of 有能力 / 能 + VP) is `neutral-affirmative`. But an event that is planned, applied for, requested or (not) permitted (the complement of 计划, 打算, 申请, 要求, 允许) keeps `full-affirmative`: the governing verb's view is added at the document level. A hedged classification (可算是, 可以说, 'can be counted as') is
`neutral-affirmative`.


**polarity** — `negative` when the clause negates its event: English *not*, *never*; Chinese 不 / 没(有) / 未 / 并未 / 并不 right before the verb (不知道, 没见过, 不继续, 并未受伤). A negated event gets **both** polarity `negative` and modstr `full-negative`. The negator is not part of the predicate: leave it out of the node's span and of `alignment` (不知道 → `知道-01`, aligned to 知道; 未经 → `经-01`, aligned to 经). A negated event keeps the aspect of the positive event (未经查证: `process`, not `state`). 从不 is one `temporal` placeholder for the whole word, with polarity `positive`. 无法 + V is not negation: give V a `manner` placeholder for 无法. 不太 / 不很 + V ('not very') is not plain negation either: polarity `positive`, modstr `partial-negative`; 太 / 很 there get no node and no `degree`.

## 5. Output

- `graph`: the fragment, a JSON object
  `{{"nodes": [...], "edges": [...], "attrs": [...]}}`:
  - `nodes`: `{{"var": "e", "concept": "taste-01", "span": [3, 3]}}`; the
    **first node is the event**, its span the predicate word(s). Add nodes for
    relation words (`after`, `between`, ...) with their spans.
  - `edges`: `[source, role, target]` between vars, e.g. `["e", "ARG0", "x1"]`.
  - `attrs`: `[var, role, value]` for constants; usually `[]` (aspect, modal
    strength and polarity are separate fields below).
  Variable names are yours (`e`, `a`, `x1`...); they are renamed later.

  Every var in `edges` is a node in `nodes` or a placeholder in `open`. A
  participant given in `outside` gets no var and no edge.

  Every abstract `-91` node you create besides the first node (an identity-91 under 能力, a have-quant-91) gets `[i, "aspect", "state"]` in `attrs`.

  When the first node is a connective (`and`, `or`, `consecutive`), it is not an event. Give each event under it its own aspect in `attrs` (`[e1, "aspect", ...]`) and set the `aspect` field to `none`: the connective gets no aspect and no modal strength. Its `alignment` and span are the coordinator word (和, 及, 分别), or, with no coordinator, the first event's word, never the whole clause.



- `open`: one placeholder per participant, `{{"var": "x1", "text": ..., "span":
  [first, last]}}`. Its var appears in `edges`. The text is the **whole
  phrase** (*the American businessman who was convicted*) minus a preposition or
  subordinator that only marks the role, without determiners for a bare noun
  and without punctuation (but keep the title marks 《 》 and 「 」 around a title
  inside the span). Spans lie inside the clause's span and do not include the
  predicate's own words.
- `outside`: as in section 3.
- `alignment`: the span of the predicate word(s) (for *was convicted*, both
  words). Leave out the Chinese passive 被 and the particles 了 / 着 / 过 (被称为 → 称为, 怀了 → 怀). Keep 所 in 所V (所言).
- `frame`: the roleset you chose, **copied from the lookup**
  (`{{"roleset": ..., "roles": {{...}}}}`); for an abstract concept its roles
  as in the table; `{{}}` if not in PropBank.
- `aspect`, `modstr`, `polarity`: always, as in section 4.

## Examples

To see how a case is annotated, call `search_annotations` with the language and a
few keywords: words of the text, concepts (`have-org-role-91`), roles (`:ARG1-of`). It
returns whole gold sentence annotations, and the worked examples of this procedure's
skills, that contain them. To check a rule, call `search_guidelines` with keywords: it
returns the matching sections of the UMR guidelines.

## Input

Sentence: {sent}
Tokens, each with its number: {token_sent}
Language: {lang}

The clause: "{text}"
Its tokens: span {span} (first and last token number, both included)
