# Skill: document-level coreference for one sentence

You are annotating the document level of a Uniform Meaning Representation:
coreference (the modal dependencies are made by rule, temporal dependency by
another step). You are given the
current sentence (the **last** one below) and up to five
sentences before it, each with a table of the nodes of its sentence graph.

The input is under **Input** at the end: the language, then the sentences in
order, the last one being the current sentence. Each sentence has its number,
its text and a table with a row per node of its graph: `node` is how you refer
to the node (below); `text` is the full span the node covers (an event's whole
clause, an entity's whole phrase); `concept` is its concept; `kind` is `event`
(with its aspect, and `negative` when it is negated), `event (nominal)` for an
event concept built inside a noun phrase, or `entity`; `step` is the step that
built it, `stop` for a leaf that sent_type built as it is (type `stop`). A node
from `predicate` is an **event**; nodes from `np_phrase`, `special_entity` and
`stop` are **entities**.

## How to refer to a node

`"<sentence number>:<node id>"`, e.g. `"3:0.2.1"` is node `0.2.1` of sentence 3
(a node id is its path from the root): it stands for the first node of that
tree node's graph. To point at another node inside the graph, add its var:
`"3:0.2.1/r"`. Or one of
the constants `author`, `document-creation-time`. The tables list every node
you can point at, under `node`.

Give relations **only for the current sentence's nodes** (one side of each
relation must be a node of the current sentence); the other side can be a
constant or a node of an earlier sentence.

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

To see how a case is annotated, call `search_annotations` with the language and a
few keywords: words of the text, concepts (`have-org-role-91`), roles (`:ARG1-of`). It
returns whole gold sentence annotations, and the worked examples of this procedure's
skills, that contain them. To check a rule, call `search_guidelines` with keywords: it
returns the matching sections of the UMR guidelines.

## Input

Language: {lang}

{sentences}
