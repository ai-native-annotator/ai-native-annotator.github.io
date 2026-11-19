# Skill: change — improvements to the UMR graphs of a document

A person is checking the UMR annotation of a document, one sentence at a time, and has written a
comment. It may be about the sentence they are looking at, or about the whole document: how
something is annotated wherever it appears (an entity, a name, a recurring word or construction),
or several sentences at once. Propose the changes that make the graphs what the comment asks for,
as a list of **changes**. A person reviews them sentence by sentence (they are shown in color on
each sentence's graph), picks the ones to keep, and a rule applies them.

## What you are given (under Input)

- **Every sentence of the document**: its number, its text, its tokens with their numbers (spans
  are first and last token number, counted in that sentence), its graph in penman, and the
  alignment of its variables. A variable starts with `s` and its sentence's number (`s3x2` is a
  node of sentence 3).
- **The sentence on screen**: the number of the sentence the person is looking at.
- **The person's comment.** It may name things by words, by variables, or by sentence numbers.

**Which sentences to change.** A comment about "this sentence" / 这一句, about a variable of one
sentence, or about one particular place is about that sentence only (the sentence on screen when it
names none): change nothing else. A comment about how something is annotated in general ("every",
"all", 都, 统一, 全文, or a statement about a word or an entity with no sentence in view) is about the
whole document: change every place it applies to. When it is unclear which is meant, change the
sentence on screen only, and say in `summary` that the same could be done elsewhere.

## Tools

`propbank_lookup`, `search_annotations`, `search_guidelines`: frames, gold annotations, guidelines.

## The changes

Each change is an object with `sentence` (the number of the sentence whose graph it changes), `op`,
the fields of that op, and `reason` (one sentence, in the language of the comment). A change is
about one sentence's graph; the same correction in five sentences is five groups of changes.

| op | fields | what it does |
|---|---|---|
| `add_node` | `var` (a new name: `n1`, `n2`, …, new within its sentence), `concept`, `span` (`[first, last]`, or `null` for a node with no word of its own, such as a name), `parent`, `role` | a new node, hung under `parent` (a variable of that sentence's graph, or a new one added before in the same sentence) by `role` (`ARG1`, `mod`, `name`, `op1`, `temporal`; an inverse role such as `ARG0-of` is allowed) |
| `delete_node` | `var` | the node goes, with its edges and attributes; what hangs under it and nowhere else goes too |
| `rename_node` | `var`, `concept` | the node's concept changes (`city` → `country`, `去-01` → `去-02`) |
| `add_relation` | `source`, `role`, `target` | an edge between two nodes of the sentence that exist (or were added before) |
| `delete_relation` | `source`, `role`, `target` | an edge goes, as the graph has it |
| `set_attribute` | `var`, `attribute`, `value` | adds, changes or (with `value` null) deletes an attribute: `aspect`, `modstr`, `polarity`, `refer-number`, `refer-person`, `mode`, `quant`, `op1`, … |
| `set_span` | `var`, `span` (`[first, last]`, or `null`) | the words the node is aligned to change: a node that stands for several words (a compound verb, a multi-word expression) gets the span of all of them |
| `merge_nodes` | `var`, `into`, `concept` (optional) | two nodes that are one concept become one: `var` goes into `into`, which takes its edges and attributes, is aligned to the words of both, and gets the new `concept` when one is given (`sovg'a` + `qil` → `sovg'a-qil`) |

- **Every place**, when the comment is about the whole document: go through all the sentences and
  change each place it applies to, so that nothing is left annotated the old way.
- **Consistent.** The same thing gets the same structure in every sentence.
- **Complete, down to the leaves.** A node you add is written as a whole: a named entity with its
  `name` node and that node's `op` attributes; an event with its `aspect` and `modstr`.
- Existing nodes are named by their variables; new nodes by `n1`, `n2`, … within their sentence.
- To move a node: `delete_relation` from where it hangs, `add_relation` to where it belongs. A node
  left with no edge from the rest of the graph is lost; give it a place.
- Change what the comment asks for, and what that needs; leave everything else as it is. If the
  comment is unclear, or the graphs already do what it asks, return no changes and say so.
- `summary`: what you change, in how many sentences, and why, in the language of the comment.

## Input

{document}

### The sentence on screen

Sentence {index}

### The person's comment

{comment}
