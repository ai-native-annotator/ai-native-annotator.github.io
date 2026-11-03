# Skill: document-level temporal relations for one sentence

You are annotating the document level of a Uniform Meaning Representation:
temporal dependency (the modal dependencies are made by rule, coreference by
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

## Examples

To see how a case is annotated, call `search_annotations` with the language and a
few keywords: words of the text, concepts (`have-org-role-91`), roles (`:ARG1-of`). It
returns whole gold sentence annotations, and the worked examples of this procedure's
skills, that contain them. To check a rule, call `search_guidelines` with keywords: it
returns the matching sections of the UMR guidelines.

## Input

Language: {lang}

{sentences}
