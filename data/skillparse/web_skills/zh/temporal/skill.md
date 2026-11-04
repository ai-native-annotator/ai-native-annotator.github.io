# Skill: temporal relations of one sentence

You annotate the **temporal dependencies** of the current sentence (the last one in the input)
for a Uniform Meaning Representation document. Modal dependencies are made by rule and
coreference by another step: write neither.

The input (under **Input** at the end) gives the language and the current sentence with up to
five sentences before it. Each sentence has its number, its text and a table of its nodes:
`node` (how you name it), `text` (the full span it covers: an event's whole clause, an entity's
whole phrase), `concept`, `kind` (`event` with its aspect and `negative` when negated,
`event (nominal)` for an event built inside a noun phrase, or `entity`) and `step` (the step
that built it; `stop` is a leaf, an entity).

## What to write

Each relation is
`{{"group": "temporal", "source": parent, "relation": label, "target": child}}`, read as "the
child is <label> the parent": `before`, `after`, `overlap`, `contained`, `depends-on`. So
`(A :after B)` means B happened after A, and the earlier of two events is the source of `after`.

- **Complete**: every event and every time expression of the current sentence gets exactly one
  parent. Leaving one out is an error.
- **Only this sentence and its context**: the child is always a node of the current sentence;
  the parent is a node of the current sentence, a node of an earlier sentence in the input, or
  `document-creation-time`. Name nodes exactly as the tables do (`"3:0.1"`, `"3:0.1/x"` for
  another node of that step's fragment).

## Time expressions

- An absolute past date (2000, 1979年, 2007年7月): `document-creation-time` `before` it; a future
  date: `after`; a deictic one (today, last week, 上周): `depends-on`.
- Only the first absolute date of a sentence is anchored to `document-creation-time`; a later
  date of the same sentence (a second year, 同年秋季) is ordered from the events instead.
- An anaphoric 当年 / 当时 / 那时 is `overlap` the earlier date it refers to (that date the
  parent).
- 'Now' words (目前, 现在, 如今) are not anchors: the main event takes `document-creation-time`
  `depends-on` directly. Vague 近年来 / 多年来 get no parent.

## Events

- **The main event.** With an explicit date: `overlap` that date (the date the parent; never
  `contained`, also for 直到X仍…). Without one: a past event `document-creation-time` `before`;
  a state describing the present (包括, 有) `document-creation-time` `overlap`. In a sentence
  about a publication or institution, its main ongoing activity (发行, 出版) is the one anchored,
  and the sentence's other events (闻名, 报导, 停止) hang under it (`overlap` or `contained`).
- **A story told in order** (the plot of a film, an episode, a novel): the main event of each
  sentence takes the main action event of the previous sentence (`after` when it comes next,
  `overlap` for 同时 / 这时 / 此时), also after 然而 / 不料; never `document-creation-time`, never a
  state or an abstract `-91` node.
- **Across sentences**, outside a story: a report, claim, announcement or arrest about an earlier
  incident is `after` that incident (the content event, not the speech verb); a further statement
  by the same speaker is `overlap` the previous one; an event retelling an earlier one (刊载 →
  刊登) is `overlap` it. Anything else new (a finding, a suspicion, a separate past fact) is
  `document-creation-time` `before`. Relate to the current or the previous sentence, never to an
  unrelated event far back; an event that is the same event as an earlier mention gets no link
  to it.
- **The other events of the sentence chain**: each takes the event just before it (`overlap`
  unless the text orders them); only the first is anchored. Two events with different dates are
  ordered relative to each other.
- **Subordinate time clauses** (X后, X前, X时) are children of the main event, never of
  `document-creation-time`; for X后 the main event is the parent and the label is `before`.
- **Cause and result**: a result (deaths, injuries, damage) is `after` its cause (the cause the
  parent); a cause inside the result's clause (爆炸 in 在爆炸中身亡) is `before` the result.
  A background event setting the scene is `overlap` the main event; a state that results from or
  holds around a neighbouring event (成了特色) is `overlap` it.
- **Reported content**: its events take the reporting verb (`before` for past content), also the
  content of a news item or headline (X怀孕 in the news); coordinated actions announced by one
  verb (宣布收购A，并收购B) each take that verb (`overlap`), not the previous conjunct.
- **Planned, applied for, requested, permitted, intended** (the ARG1 of 计划, 申请, 要求, 允许) and
  purpose clauses: `overlap` the governing event, never `before` / `after`; so is a requested
  continuation or halt (要求X不再V).
- **An event in a relative clause** takes the governing main-clause event.
- **Events inside noun phrases** (a concept with a sense: 报导-01, 看守-01, 收费-01 in 收费电视) are
  events: chain them with `overlap` in surface order. The event of a verb + 量 compound (发行量)
  is `overlap` the main event.

Not events here, so no parent: an attributive adjective or a verb-like word inside a compound
noun (激进 in 激进分子), an apposition's `identity-91` (歌手X), a noun that only names a situation
as an argument (申请 as what was approved, 此限制), a manner modifier (集中 in 集中发展).

## Examples

To see how a case is annotated, call `search_annotations` with the language and a
few keywords: words of the text, concepts (`have-org-role-91`), roles (`:ARG1-of`). It
returns whole gold sentence annotations, and the worked examples of this procedure's
skills, that contain them. To check a rule, call `search_guidelines` with keywords: it
returns the matching sections of the UMR guidelines.

## Input

Language: {lang}

{sentences}
