# Skill: one noun phrase — its head and modifiers

You are building a Uniform Meaning Representation (UMR) graph for one sentence.
You are given one noun phrase. Write **the graph fragment of its head**, and
one placeholder for each modifier, which other skills annotate later.

The sentence and the phrase are given under **Input** at the end.

## 1. The head: often more than one node

| the head noun is | fragment |
|---|---|
| an ordinary noun | one node, its lemma: *businessmen* → `businessman`; Chinese: the noun as written |
| someone who does an event (*rescuer*, *survivor*, *spokesman*, *buyer*) | `person` with `ARG0-of` the event: `(p / person :ARG0-of (r / rescue-01))` |
| Chinese agent nouns ending in 人 or 者 (守门人, 创办人, 旁观者) | the suffix itself, exactly as written (人 or 者), is the head, never `person` and never 人 for a 者 noun: `(r / 人 :ARG0-of (v / 守门-01))`, `(z / 者 :ARG0-of (v / 袭击-01))`; the event gets a sense (-00 if the lookup has none). The suffix takes the role it plays in the event: `ARG0-of` for a doer (袭击者), `ARG1-of` for one who undergoes it (受害者). 死者 / 伤者 take `ARG0-of` (死-01, 伤-01). A lexicalized compound before 者 (轻伤者, 重伤者) stays one event (`轻伤-01`), never 伤-01 + a `mod`. A place before an agent noun (寺里的礼拜者, 工厂的守夜人) is the `place` of the event, not of 者. Lexicalized nouns in 员 / 家 / 师 (飞行员, 画家), 领导人, and the everyday nouns 作者, 读者, 记者, 学者 stay one node (the whole word, no event); 工作人员 is `(r / 人员 :ARG0-of (w / 工作-01))` with 工作-01 `habitual` and the workplace as `place` of 工作-01 |
| someone an event is done to (*employee*, *nominee*), or defined by a state (*expert*) | `person` with `ARG1-of` the event: `(p / person :ARG1-of (e / employ-01))`, `(p / person :ARG1-of (e / expert-01))` |
| a role or title in an organization, with no name (*the president of X*, *the bank's chairman*, *official*, 该报编辑) | English: `(p / person :ARG1-of (h / have-org-role-91 :ARG2 <organization> :ARG3 (t / <title>)))`; with no organization `have-role-91 :ARG3 (t / <title>)`. Chinese: the role noun is the head, `(t / 编辑 :ARG3-of (h / have-org-role-91 :ARG2 <organization>))`, with no `person` node. With no organization named it is the plain noun (一位编辑 → 编辑 with `quant` and `unit`), with no `have-role-91`. Never `have-org-role-92` |
| a title (with its organization or country) followed by the person's name (美国总统某某, 该厂工程师王强, 研究院院士李某) | the head is `individual-person` with the name: `(i / individual-person :name (n / name :op1 "王强") :ARG1-of (h / have-org-role-91 :ARG2 <organization or country> :ARG3 (t / 工程师)))`. A modifier of the title (前, 副, 高级) is `mod` on t; titles joined by 、 are several `have-org-role-91` on the same person; an agent title (创办人) is ARG3 `人 :ARG0-of` the event. The title is never the head, and the country is never `poss` |

| a profession or descriptive noun, not an office in a named organization, before a name (一位法国画家某某; 叛军头目某某 with no organization; but an agent title in 人 such as 创始人X / 创办人X always takes `have-org-role-91` with ARG3 `人 :ARG0-of` the event, even with no organization, and 作者 of X before a name is `(i / individual-person :name ... :ARG0-of (p / implicit-predicate :ARG1 <X>))` with no identity-91, no 者 node, no invented verb and no aspect) | `individual-person` with the name `:ARG1-of (i / identity-91 :ARG2 <noun>)`; a number + classifier and a nationality before the noun go on that noun (`quant`, `unit`, `place`), not on the person |
| a name followed by a title (某某博士, 某某牧师) | the title is one more `:op` of the name; no role node |
| a kind of being followed by its name (外星人某某, 机器人某某) | that noun is the concept with `:name` directly on it; no `individual-person`, no `identity-91`; name ops follow the tokens. But a named race or people + 人 followed by a name (某星人某某, where 某星 is the race's proper name) is an apposition: `individual-person` with the name `:ARG1-of (i / identity-91 :ARG2 (r / 人 :mod (e / ethnic-group :name ...)))`, aspect `state` on i |
| a role or kin noun whose only possessor is a pronoun (其编辑, 他们的经理, 他的哥哥, 她们的母亲) | the noun with `poss` the referent (in `outside` when the referent is written in the sentence; a plural 他们 refers to the whole coordinated group); no `have-org-role-91` and no `have-rel-role-91`. An occupation word right before it (司机父亲 'the father, who is a driver') is `[n, "ARG1-of", i]`, where i is an `identity-91` with ARG2 the occupation and aspect `state` |
| a role noun that is the object of 当 / 担任 / 成为 (当总统) | the plain noun; no `have-role-91` |
| any named single person | `individual-person` with `:name`, never `person` |

| a descriptor noun followed by a proper name in apposition (母公司某某集团, 其盟友某国) | the named entity (with its type) is the head, `:ARG1-of (i / identity-91 :ARG2 <descriptor>)`; the descriptor is split into head + `mod` (公司 :mod 母) |

| two noun phrases joined by a dash X—Y, Y saying who or what X is (第一位访客—一名老渔夫, 一种新感受—恐惧) | X is the head, `:ARG1-of (i / identity-91 :ARG0 <Y>)` with aspect `state`; later references point to X |
| a headless relative 'VP的' standing for a participant (演反派的, 留下来的) | the head is `individual-person` for one person (`person` for several, `thing` for a thing), with the role it plays in VP: `(i / individual-person :ARG0-of <VP>)`, the VP a placeholder |
| 其余(的) N / 剩下的 N 'the rest of N' | 其余 is the head with N as `part`: `(r / 其余 :part <N>)`; never N with `mod` 其余 |
| an organization or outlet + 的 + a person who writes or works for it (某杂志的某某) | the person `:ARG0-of (h / have-org-role-91 :ARG1 <organization>)`, never `poss`; the outlet's name has its words only, never the 《 》 marks |
| a deverbal noun whose relative clause only has a light verb (他给她的指示, 委员会作出的决定) | the noun's event frame is the head (指示-02, 决定-01), with the light verb's agent as its ARG0 and the light verb's time and place as its `temporal` / `place`; the light verb (给, 作出) gets no node |
| 《Series》 + 集 / 剧集 naming an episode of the series (《某剧》的一集, 首部以X为背景的《某剧》剧集) | the common noun (剧集, 集) is the head, with the series as `part-of` (a `show` with its name); the series' own modifiers (ordinal, relative clause) stay on the show; no `identity-91`. A series or season number between them (《某剧》系列2的第4集, 第2季第4集) is its own link in the chain: 集 `part-of` 系列 (or 季) `part-of` the show, and each level has its own `ord` (ordinal-entity :value N). The number after 系列 / 季 is never `quant`. A genre word before the series' class noun (科幻电视剧, 历史小说) is `topic` of that noun |

| a role held in a group or people (部落首领, 某族公主) | the role noun as head: `(r / 首领 :ARG1-of (h / have-rel-role-91 :ARG2 <group>))` |
| a kinship or social role (*his mother*, *her boss*, X的父亲) | English: `(p / person :ARG1-of (h / have-rel-role-92 :ARG2 <the other> :ARG3 (m / mother)))`. Chinese: the kin noun is the head, `(f / 父亲 :ARG3-of (h / have-rel-role-91 :ARG2 <X>))`, with no `person` node. Followed by a name (X的姐姐某某), the head is the `individual-person` with `:ARG1-of (i / identity-91 :ARG2 <kin noun>)` |
| an age before a noun (30岁的N) | the attr `[n, "age", 30]` on that noun: no placeholder, no temporal-quantity, no 岁 |
| a number of things (*200 people*, *three books*, 三本书) | the thing with `:quant`: `(p / person :quant 200)`; a number is an attribute, not a node; a Chinese classifier after it is a `unit` node: 三本书 → `(b / 书 :quant 3 :unit (u / 本))` |
| an amount with a unit used as a denomination or label of the noun (10元纸币, 5欧元硬币, 2角邮票) | `:quant` and `:unit` **directly on the noun**: `(z / 纸币 :quant 10 :unit (u / 元))`; no `monetary-quantity`, no placeholder for the amount |
| a quantity word + classifier (多种颜色, 几类产品) | `quant` the quantity word as a node (`多`, `几`), `unit` the classifier: `(c / 颜色 :quant (q / 多) :unit (u / 种))` |
| a number + classifier with no noun (两张, 一份) | the span as written is the concept, with `:quant` and `:unit`: `(x / 两张 :quant 2 :unit (u / 张))`; never invent the missing noun. But when the word after the number is itself the noun meaning the thing (两台 'two stations', 台 = TV station), the concept is that noun with `:quant` N and no `unit` |
| 超过 / 多于 / 不到 + number + classifier on a noun | the noun `:ARG1-of` a node for the comparative word, which carries `:quant` and `:unit` (the classifier); the classifier is never the head |
| a nominalised event (*the destruction of the city*, *his arrival*) | the event with its sense: `destroy-01`, `arrive-01` |

| a result noun naming what an event found or produced (他的发现 'his discovery') | `(t / thing :ARG1-of (e / 发现-01 :ARG0 <agent>))`; an evaluative adjective on it (惊人的) is `ARG0-of` its own event with aspect `state`, not `mod` |
| a topic or genre term in a list of subjects (时间旅行, 星际航行) | an entity, not an event: the head noun with no sense and no aspect, its first part `mod`: `(l / 旅行 :mod (t / 时间))` |

| a genre or type label before a noun (恶搞新闻, 都市传说) | `mod`, a plain concept with no sense and no aspect |
| a predicative adjective right before a noun **without** 的 (真实新闻, 显著位置) | a stative event: the noun is `ARG0-of` the adjective's event (sense -01, aspect `state`), not `mod`. A plain describing adjective with 的 (奇怪的新闻) stays `mod` |
| a spouse-type title (第一夫人) of a person | `have-rel-role-91`: ARG1 the person, ARG3 the title; the country goes on the title as `place`, 前 as `mod` of the title; never `have-org-role-91` |
| an ethnicity + 人 (犹太人) | the head is `人`, with `mod` the ethnic-group whose name lacks 人; number and classifier go on 人. A country + 人 (日本人, 法国人) is `人` with `place` the country |

| one event noun shared by coordinated agents (A与B的报导) | one event per agent: `(a / and :op1 (r1 / 报导-01 :ARG0 A) :op2 (r2 / 报导-01 :ARG0 B))`; never one event with an `and` ARG0. When more conjuncts follow (A与B的报导与C的转寄), all the events are ops of **one** flat `and`: give each as its own placeholder, never a nested `and`. Specific past events like these are `performance` |
| a procedure or process named by an event (新闻查证程序, 审批过程) | `(c / 程序 :ARG0-of (i / identity-91 :ARG1 (v / 查证-01)))`, the event with aspect `process`; never `topic` |
| an approximate number with a classifier (数百篇, 数千人) | `quant` a node `数` with `:op1` the magnitude (100, 1000): `(n / 新闻 :quant (s / 数 :op1 100) :unit (u / 篇))` |
| a localizer phrase X上 / X中 / X里 / X下方 / X旁边 / X以内 / X以外, or a time phrase X来 / X以来 (头骨上, 历史上, 洞穴中, 桥下方, 某省以内, 多年来) | the localizer is the head with X as `op1`: `(s / 上 :op1 <X>)`; over coordinated nouns it is repeated for each conjunct: `(a / and :op1 (s1 / 上 :op1 A) :op2 (s2 / 上 :op1 B))` |


| a word that is one lexical item even though its parts could be split (新手, 大规模, 网络版, 纸本, 卫星云图, 右下角, 左上方, 一面 'side', 姊妹台, 华裔, 省内) | one node, the word as written; do not split it into head + `mod`. But a compositional compound is split: size or colour + noun (大标题 → 标题 :mod 大), a kind word + noun (有线电视 → 电视 :mod 有线), subject matter + noun (新闻事件 → 事件 :topic 新闻), a verb-like modifier + noun (人造卫星 → 卫星 with 人造-01, aspect `state`), a relative-position morpheme + noun (上集, 下周, 前任 → the noun :mod 上 / 下 / 前), and an ordinal morpheme + noun (初稿 → 稿 :ord (ordinal-entity :value 1)) |
| verb + 量, the amount of an event (发行量, 销量, 产量) | `(l / 量 :quant-of (e / 发行-01 :ARG1 <thing>))`: the thing published or sold is the event's ARG1, never `poss` of 量 |
| a quoted title of an article or work, with or without 一篇 / 一本 (一篇「…」, 《…》) | `publication` (a news outlet: `newspaper`) with a `name` whose ops are the title's words, **including** the marks 「 」 / 《 》 as their own first and last ops (only for an article or a news outlet; a book is `book`, named with its words only, with 书 / 一书 absorbed into the type and a parenthesized original-language title as a second `book` linked `:ARG1-of identity-91 :ARG2`; a TV show, series or episode is `show`, with its words only); a number and classifier before it go on it as `:quant` and `:unit`. The title is never parsed: no placeholder for it. This is only for a title that is published or cited; quoted words that tell what a story says (「…」的新闻) are content (next row), and quote marks around a common noun are simply dropped. A quoted headline right after a noun (一篇新闻「…」) is such a title: `(n / 新闻 :ARG1-of (i / identity-91 :ARG2 (p / publication :name ...)))`, with `[i, "aspect", "state"]`; only 「…」的新闻 is content |
| a noun followed by its content (消息, 新闻, 警语, 标语 + ：「…」 or 「…」的新闻) | `(n / 新闻 :ARG1-of (i / identity-91 :ARG2 <content>))`, the content a placeholder; never `mod`. When N：content stands as a clause of its own (a parenthetical, not the argument of a verb), identity-91 is the head: `(i / identity-91 :ARG1 N :ARG2 <content>)` with `[i, "aspect", "state"]` |

| a pronoun | `person` or `thing` with `refer-person` and `refer-number` (below) |
| a coordination of nouns (*Tom and Mary*) | `and`, with the conjuncts as placeholders `op1`, `op2` |

| a modifier or quantifier before coordinated nouns (各种奇怪的书和杂志, 许多老师和学生) | the modifier belongs to **each** conjunct, never to `and`. Make it one placeholder of your fragment (各种奇怪的, 许多), let each conjunct placeholder span only its noun, and add an edge to the modifier from **every** conjunct (`["x1", "mod", "m"]`, `["x2", "mod", "m"]`; `quant` for 许多 / 一些) |
| a list ending in 等 (A、B、C等) | `and` with A, B, C, and 等 as a last op node (concept 等). When the list stands before a class noun (A、B等人物, A、B、C等语言), the noun is the head and the list is its member set: `(n / 语言 :ARG2-of (i / include-91 :ARG1 (a / and :op1 A :op2 B :op3 等)))`, the `and` aligned to 等; never `example` or `identity-91`. But a single person + 等人 (X等人 'X and the others') is `(r / 人 :example (a / and :op1 X :op2 等))`, with no include-91 |

| a titled performance, tour or show (“X”巡回演唱会, 《X》音乐会) | one `show` with a `name` whose ops cover the whole title: the quote marks, the title words and the common-noun tail (“ / X / ” / 巡回 / 演唱会). The performer before it (某歌手的…演唱会) is `:ARG1-of (p / implicit-predicate :ARG0 <performer>)`, not `poss` |
| X之一 'one of the X' (参赛队伍之一的N) | `include-91`: the member `:ARG1-of (i / include-91 :ARG2 <X>)` with `refer-number plural` on X; no `quant 1` and no aspect. A team or participant classified by its event (决赛球队) takes the event as `mod` |
| an event noun + 行为 / 行动 (欺诈行为) | 行为 is the head, with `mod` the event (欺诈-01) |
| a ministry + its head, with 部 written (外交部长, 某国财政部长); a domain word + title without 部 (内政大臣, 农业大臣) is not split: the title is ARG3 with the domain word as its `mod`, and there is no organization. Otherwise | split: the ministry is a `government-organization` named with the country and ministry words (某国 / 财政 / 部), as ARG2 of `have-org-role-91`; ARG3 is only the head word (部长) |
| a demonstrative or 另 + the numeral 一 with no classifier (这一观点, 另一选手) | `mod` 这 / 另 and `[n, "quant", 1]` on the noun. With a classifier (另一条, 另一个) it is one `mod` node with the whole word, no `quant` and no `unit`; 同一 'the same' is one `mod` node 同一 |
| a fixed determiner compound (各大) | one `mod` node, the word as written |
| a non-predicative attributive (小型, 手动, 私人), an adjective in a 分子 / 人士 compound (极端分子), or a four-character idiom describing the noun | `mod`, a plain concept with no sense |
| X的 + a force, effect or kind (地震的威力) | `mod`, not `poss` |
| a day + part of the day (次日上午) | the day is the head, with the part of the day as its `temporal`. A relative day word (第二天, 次日, 翌日) is one node, the word as written; never 天 with an `ord` |



For every event concept (`rescue-01`, `employ-01`, `destroy-01`) **look the
lemma up with `propbank_lookup`** and use a sense it returned.

## 2. Pronouns and number

- A pronoun is `person` (people) or `thing`, with `:refer-person` `1st` /
  `2nd` / `3rd` and `:refer-number` `singular` / `plural`: *they* (people) →
  `(p / person :refer-person 3rd :refer-number plural)`; *I* → `1st singular`;
  *it* → `(t / thing :refer-person 3rd :refer-number singular)`. A possessive
  pronoun (*his*) is the same, used as `poss`.
- An English common noun in the plural (*horses*, *officials*) gets
  `:refer-number plural` on its head. A singular common noun, a name, and any
  Chinese noun get no `refer-number`, except a Chinese noun with 这些 / 那些, which gets `:refer-number plural` as well as its `mod`. A noun with 们 (科学家们) also gets `:refer-number plural`, and its node is aligned to the noun without 们.

## 3. Modifiers: placeholders

| the modifier is | role |
|---|---|
| an adjective, a modifying noun (*American*, *government*) | `mod` |
| a possessive (*his*, *the city's*, 我的; X的N where X has N: 文章的字数) | `poss` |
| a person noun before a thing they own or wear (国王王冠 — the king's crown) | `poss` |
| a material word (木制, 铁质, 银制, *wooden*) | `material` |
| a quantifier word that is not a number (*many*, *several*, 一些) | `quant`; but 部分 (*some*, *part of*), 各式各样 / 各种 (*all kinds of*), 全 (*whole*) and 任何 (*any*) are `mod` |
| an approximate count N到M + classifier (三到四个) | the amount is a node `or` with attrs `op1` N and `op2` M; 到 gets no node |
| an ordinal (*the first*) | `ord` |
| a relative clause (*who was convicted*, *that she bought*) | `ARGn-of`: **the role the head noun plays in that clause** — *the man who left* `ARG0-of`, *the book that she bought* `ARG1-of`, *the city where he lived* `place-of` |
| a reduced relative (*the man arrested*, *the house built in 1900*) | `ARG1-of` (passive) or `ARG0-of` (*the people living here*) |
| a place (*the base at Ramstein*) | `place` |

| a country or place before a noun that says where it comes from or where it is (美国小报, 美国历史, 山区居民, 前苏联科学家, 议会记者团), and a location word before a person, group or institution (现场观众, 当地医院, 本地警察) | `place`; never `mod` or `poss` |
| a country that only classifies a side, family, team or leaders (美方, 中方, 某国家庭, 多国领导人, 各国政府), a place before 移民 (X地移民), a region before an edition or version (东部版), or a country written before a city (country + city) | `mod`, not `place` |

| an origin, ethnicity or nationality word on a person (X裔, X籍) | `mod`: 裔 / 籍 is its own node with the named entity as its `mod`; never `place`. A one-word form with no named entity (华裔) is one `mod` node with the whole word |
| several modifiers in a row before a noun, each describing the head (某国穆斯林家庭, 年轻女性作家) | one placeholder each, all `mod` (or their own role) of the head. But when a modifier describes the **next** noun rather than the head (经济杂志编辑: an editor of an economics magazine; 环境保护组织; 国家安全会议), give the pair as one placeholder (经济杂志) so that the modifier hangs on that noun (with `topic` for subject matter). Never repeat it on the head |
| a named country or region before 当局 / 警方 giving its jurisdiction (某国当局) | `place` |
| a noun naming the kind of an activity, body or group (足球比赛, 情报机构, 决赛队伍) | `mod`, not `topic` or `part-of` |
| a generic role-holder noun of an organization (X机构的官员, 成员, 职员) | `(g / 官员 :ARG1-of (h / have-org-role-91 :ARG2 <organization>))` |
| 包括X在内的N | N `ARG0-of` 包括-01, X its ARG1 |
| 疑似 / 像 / 类似 X 的 Y | Y `ARG0-of` 疑似-01, X its ARG1 |
| an event + 小组 / 队 / 中心 naming who does it (X控制小组) | the noun `ARG0-of` the event |
| N + 队 + a person noun (两队球员) | the person noun `part-of` 队, which has `quant` N; 队 is a noun, not a `unit` |
| a verb-like type word or a descriptive idiom before a noun (遥控炸药, 免费交通, 我行我素的N) | `mod`, a plain concept with no sense and no aspect; before coordinated nouns it is shared by every conjunct |

| 收费 / 付费 before a service or medium noun (收费电视, 收费频道) | the noun is `ARG0-of` 收费-01 (aspect `state`), never a plain `mod` |

| a content noun after a clause stating it (声称X的情报, 说X的消息) | `(n / 情报 :ARG1-of (i / identity-91 :ARG2 <clause>))` with `[i, "aspect", "state"]`; never `ARG0-of` the speech verb |

| an adjective or noun before an event head that says how it is done (黑白印刷, 手工制作) | `manner`, not `mod` |

| an event before 仪式 / 活动 that says how it is held (悼念仪式, 义卖活动), or a goal event before an event noun (欢庆游行) | the event has a sense and an aspect; 仪式 / 活动 take it as `manner`; on an event head (游行-01) a goal event is `purpose` |
| a verb + noun compound naming a means or plan (治疗方案, 应对措施) | split: the noun is the head, `ARG0-of` the verb's event (sense, aspect `process`) |
| an event noun followed by a general noun for the same occurrence (枪击事件, 火灾事故) | the general noun is the head, `[n, "ARG1-of", i]` with i an `identity-91` whose ARG2 is the first noun |

| 其中 'among them' | `mod` (concept 其中); never `part-of` an antecedent |
| an edition, component or section of a whole (报纸的网络版, 文章的标题, 飞机的机身 / 机翼 / 有些地方) | `part-of` on the component, pointing to the whole; never `poss`. Only when the whole is written inside the phrase: never fetch it from elsewhere in the sentence through `outside` |
| nested part–whole modifiers (A的B内容) | a chain: 内容 `part-of` B, and B `part-of` A |
| a body part or the remains of a being (X的脸, X头骨, X的遗骸) | the body part is the head. A face, the body or a visible feature (X的脸庞, X的身躯) takes its owner as `part` (`(f / 脸庞 :part X)`); bones and remains (X头骨, X的遗骸) take `part-of`; never `poss` |

| genes, DNA, organs or cells of a being or kind (X的基因) | `part-of` X, never `poss` |
| X的 + a plan, plot, order or instruction noun, with no verb in the 的-phrase (敌人的阴谋, 将军的命令) | the plain noun with no sense and no aspect, X as `poss`; never an event with ARG0 |

| a noun naming the subject area or content (外交政策, 经济问题, 新闻事件 → 事件 :topic 新闻; 爱的呼唤 → 呼唤-01 :topic 爱) | `topic` |

| a noun before an event noun that is what the event acts on (新闻报导, 信件转寄) | that event's `ARG1`, not `topic` and not ARG0 |
| a format, way or method of an event (报导格式, 写作方式) | the noun is `manner-of` the event |
| a classifying noun before 问题 / 现象 (道德问题) | `mod`; `topic` only for what it is about (X的…问题) |
| a superlative relative clause on the head (X上最A的N, 最受欢迎的N) | N is `ARG1-of` the clause (the domain of have-degree-91), never `ARG0-of`. A frame X上 / X历史上 before 最 is its own placeholder, `temporal` of N, not inside the clause. When the clause names its own domain (X伤亡最重的N: the casualties are the most severe), N is `place-of` that domain event instead. A 自X以来 'since X' before the superlative stays inside the clause's placeholder (it becomes have-degree-91's `range`) and is never `temporal` of N. A place before it is `place` of N |

| a medium or type noun before a noun (电视节目, 电视牌照, 电视市场, 收费电视频道) | `mod`: `(j / 节目 :mod (d / 电视))`; `medium` is only for a language |

| a language that a programme, text, broadcast, service or group of people is in (韩语节目, 中文报纸, 粤语移民, 三种语言的节目; 服务语言 → 语言 `medium-of` 服务-01) | `medium`, never `mod` and never `ARG0-of` |
| a scope adjective in -性 (地区性, 全国性, 国际性) | `mod`, never `place` |
| a location word on a thing or a group (本地节目, 不同地区的观众) | `place` |
| X的历史 'the history of X' | `mod`, not `poss` |

| a channel or station in a relative clause about how it broadcasts (以X播放的频道) | the channel is `ARG0-of` 播放-01 (it does the broadcasting) |
| the channels of a station (X的两条频道) | `part-of` the station, never `poss` |
| X旗下的Y (Y owned by X) | Y takes `poss` X and `mod` 旗下; 旗下 is never inside X's placeholder |
| X的总部 / 旧址 / 分部 (an organization's site) | `poss` X, never `part-of`; a location of the site (某市某街的旧址) is `place` |
| X的 + event + 范围 / 领域 (X的广播范围) | the light noun gets no node: the event is the head, with X as its ARG0 |
| an event + 阶段 / 时期 (起步阶段) | the period is `temporal-of` the event |
| 小部分 / 大部分 before a noun | `quant`: (n / 节目 :quant (b / 部分 :mod (s / 小))) |
| a language inside a stacked phrase (中文收费电视牌照, 全普通话频道) | `medium` on the noun it describes (电视, 频道, 节目), never on the outer head; the language is always (language :name ...); 全 'all-' is `mod` of the head noun |
| an anaphoric noun with 此 / 该 that sums up an earlier event (此限制, 该决定) | the plain noun with no sense and no aspect, with 此 as `mod` |

| X时段 'the time slot of X' (节目时段) | `mod`, like any noun–noun compound (时段 :mod 节目) |
| X长度 'the running length of X' (节目长度) | 长度 is `duration-of` X |
| 介乎 / 介于 X和Y 'between X and Y' | `range` with op1 X and op2 Y, not `and` |
| alternative means of receiving or watching (可以A、B和C收看, 可于X以A、B和C接收; also when the piece is given without 可) | `or`, even when the text has 和 |
| coordinated modifiers that make separate items of one head (A语及B语节目时段; A和B的新闻节目, each owner having its own) | `and` of copies of the head, one per conjunct; each copy takes its own conjunct (`medium`, `poss`, ...) and its own copy of the shared modifiers |

| what a photo, image or chart shows (城市照, 某人的照片, 地球的云图) | `topic` on the photo; not `identity-91` |
| a country or place before a part of it (法国南部, 该岛北岸) | `part-of` on the part: `(b / 北岸 :part-of <country>)` |
| X的中间 / 上面 / 边缘 (a position or part of X) | X is the **head** and the position noun its `part`: `(s / 屏幕 :part (m / 中间))` |
| X画像 / X雕像 (a picture or likeness of X) | `(h / 画像 :ARG1-of (i / identity-91 :ARG2 <X>))` |
| a method or measure noun followed by the goal it serves (措施保证安全) | `purpose` |
| a parenthetical equivalent in another language, （英语：X） | the head's `name`: a `name` node whose ops are the foreign words; the language label is not annotated, and the foreign phrase is not analysed |

| a parenthetical alias （简称X） after a noun phrase | the noun phrase `:ARG1-of (j / 简称-01 :ARG2 (n / name :op1 ...))`, with 简称-01 aspect `state` and a bare `name` node (ops the words of X, no quote marks); no new entity node |
| a kin apposition X（即Y之父 / 之母） | X `:ARG1-of (h / have-rel-role-91 :ARG2 Y :ARG3 (f / 父))`; no `identity-91` and no head node for 父 |
| a parenthetical label after a noun (频道（1台）) | the noun `:ARG1-of (i / identity-91 :ARG2 <label>)`; a numeral in the label is `ord` (ordinal-entity :value N) on the label's noun, never a name string |
| a name used with 名义 (以「X」的名义) | 名义 is the head with `:name` directly on it (ops the name's words, no 「 」); no separate entity and no `poss` |
| a TV or radio programme with its title (节目《X》, 《X》节目) | the head is `show` with the name (the title words only; 《 and 》 are never ops), `:ARG1-of (i / identity-91 :ARG2 <the common noun>)` |


| a time (*yesterday's meeting*) | `temporal` |

| a Chinese time modifier with 的 (旧时的, 当时的, 过去的 + noun) | `temporal`, never `mod` |

| an argument of a nominalised event (*of the city*) | `ARG0`, `ARG1`, ... |
| a conjunct of `and` / `or` | `op1`, `op2`, ... |

A modifier that belongs to a node inside the head (the organization of
`have-org-role-92`, the object of *rescue*) is joined to **that** node:
`["h", "ARG2", "x1"]`, not to the head.

In `relative clause + N1 N2`, when the clause describes N1 rather than the
head N2 (戴着王冠的国王画像: the king wears the crown), hang the clause on N1.

A relative clause always hangs on the noun with an inverse role (`ARG0-of`,
`ARG1-of`, ...), never with `mod` or `poss`; a passive one (被X植入的芯片) is
`ARG1-of` the clause, and the whole clause is one placeholder.

 Choose the role the clause leaves open: if its verb already has an object inside the clause (封闭顶棚的比赛, 疑似X的Y), the head noun is not that object again (it is usually `ARG0-of`).
 属 / 属于 X 的 N is such a clause too (N `ARG1-of` 属-02 with ARG0 X, the owner), never `poss`. In 已经停止 / 开始 V 的 N, build the two events yourself: N hangs on the inner event V with the role it plays there, and the phase verb hangs on V as `ARG1-of` with aspect `state`: `(x / 刊物 :ARG1-of (v / 发行-01 :ARG1-of (s / 停止-01)))`.

A name you write yourself follows the special_entity rules, including its type (a name ending in 公司 → `company`; a TV station named X电视 / X电视台 → `company`, with the whole name as ops, never 电视 as head with X as `mod`; a named channel (X台 naming a channel, X频道) → `broadcast-program`; a city or place before an organization with 的 (某市的X电视) is `mod` of it; a sports club or team (…俱乐部) → `sports-organization`, never `sports-team` or `organization`; a stadium or ground (…球场) → `sports-facility`, never `stadium`; 地球, 月球 → `planet` with `:name`, also inside a phrase such as 半颗地球): one `:op` per word as a standard segmenter cuts it (新时代 → 新 / 时代, 有限公司 → 有限 / 公司), never one per character (a given name and a regnal number such as 三世 are one op each); a country or city written right before a venue's name stays in that name as its first ops, with no separate `place` node;
a middle dot (· or ．) as its own op, and the 《 》 marks only around a newspaper or a published article's title (a show, series, episode, book or film takes only its words) as the first
and last op.

**Events inside the phrase.** Every event node you write (a concept with a
sense: 报导-01, 看守-01, 印刷-01; but 活动, 仪式, 演唱会, 事件 as a head noun are plain nouns with no sense) also gets its aspect as an attribute
`[v, "aspect", ...]`: `habitual` for a routine or occupational activity (看守人,
a newspaper's 报导, its black-and-white 印刷), `performance` for one completed
event, `habitual` also for a periodical's routine that a phase verb stops or starts. In 已经停止发行的报纸, 发行-01 is habitual and 停止-01 is state, and an adverb before the phase verb (已经) is a `mod` node on 停止-01, not on the noun. `process` is for an event that names a procedure (查证程序), `activity` for an ongoing general activity, `state` for a property or a disposition (好事者, 爱好者). The event inside a verb + 量 compound (发行量, 销量) gets **no** aspect. Its
implicit core arguments that are named elsewhere in the sentence go in
`outside` (the publisher of 发行 is the subject that stops it).

 An `identity-91` that links a noun to its content (消息：「…」) gets `[i, "aspect", "state"]`. One that only joins an apposition inside the phrase (descriptor + name, a parenthetical label, a programme title) gets no aspect.




English determiners (*the*, *a*) are not modifiers: leave them out of every
node and span. A Chinese demonstrative with a classifier (这种手机, 这起事故, 那本书) is
kept as **one** `mod` node whose concept is the whole word (`这种`, `这起`,
`那本`), with no `unit` node. A demonstrative **without** a classifier (该刊,
此新闻, 该文) is still a `mod` node with the demonstrative as concept (`该`,
`此`); but 该台 'this station' is one node, concept `该台`, with no `mod`. 这个 / 那个 / 这些, with the generic classifier 个 / 些, is one `mod`
node with the whole word (`这个`) and no `unit`. A numeral is an attribute (section 1), not a
placeholder. Never make a node for:
- an anaphor that only repeats a name just given (某大学该校, 某公司该公司):
  the phrase is the named entity alone;
- a possessive 其 whose referent is already in this sentence: give the
  referent in `outside` instead (section 4).

## 4. Participants written outside the phrase: `outside`

Sometimes a node of your fragment needs a participant that is written
**elsewhere in the sentence**, outside the phrase's span. Do not make a new node for it
and do not make it a placeholder: list it in `outside`, and it is joined to
the node that already stands for it (a reentrancy).

- a possessive pronoun whose referent is in this sentence (这家公司把旧工厂改造成其仓库:
  the owner of 仓库 is 公司; 张伟写信请编辑出版他的小说: the owner of 小说 is
  张伟). The referent is the `poss`; the pronoun gets no node;
- a node inside the head that takes a participant the phrase does not repeat
  but the sentence names elsewhere (the `ARG2` of `identity-91`, the `ARG2` of
  `have-org-role-92`);
- a conjunct or modifier written outside the phrase but meant for it.

- the same referent mentioned again in this sentence (看守人…看守人的孩子): the second mention is not rebuilt. Give its head word, with the span of the first mention, in `outside`.


A pronoun whose referent is not in this sentence stays a pronoun node
(section 2). Each item is `{{"var": "y1", "text": ..., "span": [first, last],
"at": [first, last]}}`:

- `var`: your own variable, used in `edges` like a placeholder:
  `["t", "poss", "y1"]`. It can hang on any node of the fragment;
- `text`, `span`: the participant's **head word only**, where it is written
  outside the phrase: for 新成立的那家公司 just 公司, for 作家张伟 just 张伟;
- `at`: the span of the pronoun inside the phrase that stands for it (其,
  他的); leave it out when nothing in the phrase stands for it.

`outside: []` when there are none.

## 5. Output

- `graph`: `{{"nodes": [...], "edges": [...], "attrs": [...]}}`:
  - `nodes`: `{{"var": "p", "concept": "person", "span": [3, 3]}}`; the **first
    node is the head**. Give a node the span of the word it comes from (*rescuers*
    gives both `person` and `rescue-01` its span). When one Chinese word gives several nodes (发行量 → 量 and 发行-01), every node gets the span of the whole word; a unit node gets the span of its numeral and classifier together (一个, 一份); a demonstrative + noun word (该文) gives both nodes its whole span.
  - `edges`: `[source, role, target]`, e.g. `["p", "ARG0-of", "r"]`,
    `["p", "mod", "x1"]`.
  - `attrs`: `[var, role, value]` for constants: `["p", "quant", "200"]`,
    `["p", "refer-number", "plural"]`.
  Variable names are yours; they are renamed later.
- `open`: one placeholder per modifier, `{{"var": "x1", "text": ..., "span":
  [first, last]}}`, its var used in `edges`. Spans lie inside the phrase's span, never
  include the head word, and drop a preposition that only marks the role (*of*,
  *at*). `open: []` if there are none.
- `outside`: participants written elsewhere in the sentence (section 4), or
  `[]`.
- `alignment`: the span of the head word(s).

## Examples

Call the `get_example` tool before answering: it returns worked examples of
this skill's input and output.

## Input

Sentence: {sent}
Tokens, each with its number: {token_sent}
Language: {lang}

The phrase: "{text}"
Its tokens: span {span} (first and last token number, both included)
