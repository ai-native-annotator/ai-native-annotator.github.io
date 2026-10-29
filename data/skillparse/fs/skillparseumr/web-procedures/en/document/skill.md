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
- a time expression (*today*, *last week*, *2000*) is anchored as
  `document-creation-time` `depends-on` it; an event with an explicit time
  expression is `contained` in that expression's node.
- a past event with no time expression: `document-creation-time` `before`
  it, or `after`/`overlap` an earlier event that locates it.

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

## coref

Link an entity or event of the current sentence to the **same** entity or event
in an earlier sentence: a pronoun to its antecedent, a repeated name, a
definite description of something already mentioned:
`{{"group": "coref", "source": earlier node, "relation": "same-entity" or "same-event", "target": current node}}`.
Do not link two different things of the same kind.

Return all of them in `relations`.

## Examples

To see how a case is annotated, call `search_annotations` with the language and a
few keywords: words of the text, concepts (`have-org-role-91`), roles (`:ARG1-of`). It
returns whole gold sentence annotations, and the worked examples of this procedure's
skills, that contain them. To check a rule, call `search_guidelines` with keywords: it
returns the matching sections of the UMR guidelines.

## Input

Language: {lang}

Sentences:
{sents}

Trees:
{trees}
