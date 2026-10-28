# Skill: document-level relations for one sentence

You are annotating the document level of a Uniform Meaning Representation:
temporal dependency, modal dependency and coreference. You are given the
current sentence (the **last** item of the lists below) and up to five
sentences before it, each with the tree its sentence graph was built from.

The input is under **Input** at the end: the language; the sentences (each
has `index`, its sentence number, and `text`), the last one being the current
sentence; and the trees, in the same order. Each tree is the
sentence's tree of steps (web: no reentrancy step), its nodes under `nodes`.
A node is `{{"id", "skill", "input": {{"text", "span"}}, "parent", "edge", "graph", ...}}`;
`graph` is the node's fragment (its first node is the node's own concept). A
node from `predicate` is an **event**; nodes from `np_phrase`,
`special_entity` and `sent_type` with type `stop` are **entities**.

## How to refer to a node

`"<sentence number>:<node id>"`, e.g. `"3:0.2.1"` is node `0.2.1` of sentence 3
(a node id is its path from the root): it stands for the first node of that
tree node's graph. To point at another node inside the graph, add its var:
`"3:0.2.1/r"`. Or one of
the constants `author`, `document-creation-time`.

Give relations **only for the current sentence's nodes** (one side of each
relation must be a node of the current sentence); the other side can be a
constant or a node of an earlier sentence.

## temporal

For every event of the current sentence give exactly one parent, as
`{{"group": "temporal", "source": parent, "relation": label, "target": event}}`:

- labels: `before`, `after`, `overlap`, `contained`, `depends-on`;
  read it as "the target is <label> the source".
- a time expression is anchored to `document-creation-time`: an absolute
  past date (*2000*, 1979年, 2007年7月) with `before`, a future date with
  `after`, and only a deictic one (*today*, *last week*) with
  `depends-on`. 'Now' words (目前, 现在, 如今) are not anchors: the sentence's main event takes `document-creation-time` `depends-on` directly, and the other events of the sentence chain to that event (`overlap`).
- an event located by an explicit time expression is `overlap` that
  expression's node (source the date, target the event), also when it holds up
  to that time (直到X仍…); do not use `contained`.
- a state or characteristic that results from a neighbouring event or holds
  around it (成了特色) is `overlap` with that event unless the text orders
  them.
- events built inside noun phrases (np_phrase nodes with a sense, such as
  报导-01 or 看守-01) are events too: give each one a temporal parent.
- a past event with no time expression: `document-creation-time` `before`
  it, or `after`/`overlap` an earlier event that locates it.

- an event scoped by X以前 / before X: the date is the source and the event the target, label `before`. Use `depends-on` only for deictic times and 'now' sentences; a past state or main event otherwise takes `document-creation-time` `before`.
- in a sentence describing a publication or institution, anchor its main ongoing activity (发行, 出版) to `document-creation-time`. Hang the sentence's other events (闻名, 报导, 停止) under that activity, with `overlap` or `contained`.
- an event inside the content of a news item, headline or report (the news says X怀孕) is `overlap` with the sentence's main event, not anchored to `document-creation-time`. The nominal event of a verb + 量 compound (发行量) is also `overlap` with the main event.
- an event that further describes an event already mentioned in an earlier sentence (the same publication: 刊载 → 刊登) is `overlap` with that earlier event.

- the main-clause event is the one anchored to `document-creation-time`. An event in a subordinate time clause (X后, X前, X时) is a child of the main event, never of `document-creation-time`. For X后, the source is the main event and the label is `before` (the X event is before it). A stative main predicate that describes the current situation (包括, 有) takes `document-creation-time` `overlap`.
- relate an event to events of its own sentence or the one just before, never to an unrelated event far back. An event that is `same-event` with an earlier mention gets no extra temporal link to it.

- when a clause has an explicit time expression, that date is the `overlap` parent of the clause's **main** event only. A background event that sets the scene (a meeting nearing its end when the fire broke out) is `overlap` with the main event (source the main event). Results the main event caused (deaths, injuries, damage) take the main event as parent with `after` (source the cause, target the result). A cause adjunct inside a result's clause (爆炸 in 在爆炸中身亡) is a child of that result with `before`. Events in reported content take the reporting verb as parent (`before` for past content).
- a narrative main event with no time expression is anchored to an earlier event only when the text marks that order: a report, claim, announcement or arrest about that incident is `after` the incident, and a further statement by the same speaker is `overlap` the previous reporting event. Use the content event, not the speech verb. Otherwise (a new finding, a suspicion, a separate past fact) anchor it to `document-creation-time` `before`.
- direction: `A :after B` means B happened after A. For 'he joined a gang, later became radical', the source is 加入, the relation `after`, the target 变成. An event that clearly came before the confirming or reporting event (left behind, then confirmed) is ordered, not `overlap`.
- an attributive adjective or a verb-like word inside a compound noun (激进 in 激进分子) gets no temporal parent. Neither does an `identity-91` built for an apposition inside a noun phrase (歌手X), nor a vague relative time phrase (近年来, 多年来): order the events relative to each other instead. In consecutive events the earlier one is the source and the later one the target of `after`. Two events of one sentence with different dates are also ordered relative to each other. A requested continuation or halt (要求X不再V) is `overlap` with the request.

- an event that is planned, applied for, requested, permitted or intended (the ARG1 of 计划, 申请, 允许) and the event of a purpose clause are `overlap` with the governing event (source the governing event), never `after` or `before`.
- in a sentence with no time expression, chain its events: only the first is anchored to `document-creation-time`; each next event takes the previous one as its parent (`overlap` unless the text orders them).

- in a story told in order (the plot of a film, episode or novel), the main event of each sentence takes the main event of the previous sentence as its parent (`after` when it comes next in the story, `overlap` for 同时 / 这时 / 此时), never `document-creation-time`; this holds also for a 然而 / 不料 sentence. The parent is that sentence's main action event, never a state or an abstract `-91` node inside it.
- a plural pronoun (他们, 它们) for a group links to the group's entity node (an ethnic-group, an organization, or the `and` of people), never to one person or to a name node.


- an anaphoric time word (当年, 当时, 那时) is `overlap` with the earlier date it refers to (source that date), not anchored to `document-creation-time` alone.
- only the first absolute date of a sentence is anchored to `document-creation-time`; a later date of the same sentence (a second year, 同年秋季) gets no `document-creation-time` link: order its event relative to the earlier events instead.
- coordinated actions that are the content of an announcing or reporting verb (宣布收购A，并收购B) each take that verb as parent (`overlap`), never the previous conjunct. Other coordinated clauses chain to the event just before them, not all to the first.
- an event inside a relative clause on an argument takes the governing main-clause event as parent, not `document-creation-time`.

- a noun that only names an application, a restriction or another situation as an argument (申请 as what was approved, 此限制), an event nominal inside an argument noun phrase, and a manner modifier (集中 in 集中发展) get no temporal parent and no modal relation. A verb-like modifier that is an event with a sense (收费-01 in 收费电视) does get one: chain it with `overlap` in surface order, like any other event.





## modal

The author's own view of each event is **not** yours to write: every event's
`modstr` (from the predicate step) becomes `author` `<modstr>` that event
automatically, and `root` `modal` `author` is added to every sentence. Write a
modal relation only when the event is presented through **someone else's**
view, as
`{{"group": "modal", "source": conceiver, "relation": label, "target": event}}`:

- a person or organization whose words, belief or report the event is (*X
  said*, *X believes*, *according to X*, 据X报道): the conceiver is that
  person's or organization's node; the relation from them replaces the
  author's for that event;
- the conceiver itself is a child of `author`: give
  `author` `full-affirmative` the conceiver's node (it is an entity, so nothing
  writes it for you);
- labels: `full-affirmative`, `partial-affirmative`, `neutral-affirmative`,
  `neutral-negative`, `partial-negative`, `full-negative`, as the conceiver
  presents the event (a negated event is `full-negative`).

If no event of the sentence is anybody else's view, write no modal relation.

The content of an organization's announcement of its own actions (X宣布收购A，并收购B) is the author's own assertion: write no conceiver relation for X and no `author` link to X.


A permission verb (允许, 准许) is the conceiver of the event it permits: source the permission verb, relation `unspecified`, target the permitted event; the one permitted (该台) takes `full-affirmative` the permission verb (source that entity, target the verb). A 'begin' verb (启-02) is not a conceiver: its inner event (播-01) is asserted by the author, so write no modal relation for it.

Exception: an event built inside a noun phrase (a node from `np_phrase` whose
concept has a sense number, e.g. 报导-01, 活动-01, 好事-00, and any `include-91` / `have-rel-role-91` it builds, which you point at with `/var`; but an `identity-91` that only joins an apposition gets no modal relation) has no modstr, so
nothing writes its author link. Give it yourself: `author` `full-affirmative`
that node (or its conceiver's relation, if it is reported).

 The event inside a verb + 量 compound (发行量, 销量) is not a clausal event: it gets no modal relation.

 An event named inside a noun for a procedure or kind (查证程序, 审批过程) is not asserted to have happened: give it `author` `partial-affirmative`.




## coref

Link an entity or event of the current sentence to the **same** entity or event
in an earlier sentence: a pronoun to its antecedent, a repeated name, a
definite description of something already mentioned:
`{{"group": "coref", "source": earlier node, "relation": "same-entity" or "same-event", "target": current node}}`.
Do not link two different things of the same kind.

 Link each mention to
the **closest** earlier mention of the same entity (not always the first one),
and point at the entity node (e.g. `newspaper`), never at its `name` node. Keep
chains for different entities apart: a newspaper, its parent company, its
reports and the people writing them are different things.

Before linking, check that the two nodes can be the same thing: an event never corefers with an entity (报导-01 with 文); an abstract noun (目的, 内容) is never `same-entity` with a publication. 他们 is `same-entity` with a publication when it is the publication acting (他们报导, 他们的标语): link it to the publication's chain, never to its editors or staff; a second newspaper node is linked only if it has the same name. One wrong link merges whole chains, so when in doubt leave it out. Also do not link repeated generic or kind mentions (外星人 meaning aliens in general). Repeated mentions of the same named city or place across sentences do form a `same-entity` chain. 该台 / 该公司 refers to the station or company, never to one of its channels. When an earlier tree has two nodes of the same type (two companies), check the name before pointing at one. Be conservative with `same-event`: link two events only when the text clearly retells the very same occurrence. Never link nominal events such as the 发行 of 发行量 across sentences, or figures from different periods.

 But do link every new mention of a named person or organization already seen (full name, short name, title + name, pronoun) to its closest earlier mention, however many sentences back: each missed link leaves a mention outside its chain. Choose the label from the nodes. Use `same-event` when either node is an event (a predicate node, or a concept with a sense: 爆炸-01, 袭击-01). Nouns that name an occurrence (演唱会, a named `show`, 比赛, 事件, X案) also corefer with `same-event`, with each other and with event nodes. `same-entity` is for people, things, places and organizations. A plain noun (事件, 此事, X案) that refers back to the incident links to the closest earlier mention of it. The event inside an agent or patient noun (袭击 in 袭击者, 死 in 死者) is linked `same-event` (point at it with `/var`) to the earlier mention of that occurrence, even when the verb differs (身亡). Do not link repeated background states (临近尾声) across sentences. In a document about one work (an episode, film, book), every later mention of it (这集, 本片, 该剧, its title) belongs to one `same-entity` chain with the work's named node (the `show` / `book`). Link each to the closest earlier mention, never to a common noun 集 built inside a description of the work (第N集 of a series).

 When an organization has a full name and an alias joined by `identity-91` (X委员会（ABC）), the alias node (identity-91's ARG2, pointed at with `/var`) is the chain's mention: link later mentions (ABC again, 当局 'the authorities') to it, and keep one chain for all of them. A noun with 此 / 该 that sums up an earlier event of the text (此限制 after 不允许X) is `same-event` with that event.





Return all of them in `relations`.

## Examples

If you are unsure what a good answer looks like, call the `get_example` tool: it
returns worked examples of this skill's input and output.

## Input

Language: {lang}

Sentences:
{sents}

Trees:
{trees}
