# Skill: local change — improvements to one sentence's UMR graph

A person is checking the UMR graph of one sentence and has written a comment on it. Propose the
changes that make the graph what the comment asks for, as a list of **changes** applied in order. A
person reviews them (they are shown in color on the graph), picks the ones to keep, and a rule
applies them; the steps of the sentence are then made again from the new graph.

## What you are given (under Input)

- **The sentence**, and its tokens with their numbers (spans are first and last token number).
- **The tree of steps**: how the graph is being built. Each step has an id (`0`, `0.1`, `0.1.0B`),
  the skill it uses, its piece of the sentence, its status and, when it is done, its output: the
  nodes it wrote (by their UMR variables), their edges and attributes, and its placeholders, each
  handed on to the step under it. A placeholder whose step is not done yet shows in the graph as a
  leaf whose concept is its text.
- **The graph's variables**: every variable of the current graph (penman), with its concept, the
  step (node of the tree) that wrote it, that step's skill, its variable in the step, and its words.
- **The person's comment.** It may name nodes by their variables (`s1x2`), by words of the sentence,
  or by steps (`0.1`); it may be about a node deep in a subgraph (a name, an op, a modifier).

## Tools

- `call_skill(skill)`: the instructions of one skill of this procedure, as the tree names it
  (`predicate`, `np_phrase`, `special_entity`, `discourse`, `sent_type`, …): how that skill
  annotates its kind of node. Call it for the kind of node you add or change before you write the
  change, so the new part follows the same conventions (senses and roles, aspect, modal strength,
  names, dates, quantities, modifiers).
- `propbank_lookup`, `search_annotations`, `search_guidelines`: frames, gold annotations, guidelines.

## The changes

Each change is an object with `op`, the fields of that op, and `reason` (one sentence, in the
language of the comment).

| op | fields | what it does |
|---|---|---|
| `add_node` | `var` (a new name: `n1`, `n2`, …), `concept`, `span` (`[first, last]`, or `null` for a node with no word of its own, such as a name), `parent`, `role` | a new node, hung under `parent` (a variable of the graph, or a new one added before) by `role` (`ARG1`, `mod`, `name`, `op1`, `temporal`; an inverse role such as `ARG0-of` is allowed) |
| `delete_node` | `var` | the node goes, with its edges and attributes; what hangs under it and nowhere else goes too |
| `rename_node` | `var`, `concept` | the node's concept changes (`city` → `country`, `去-01` → `去-02`) |
| `add_relation` | `source`, `role`, `target` | an edge between two nodes that exist (or were added before): a re-entrancy, or the second half of a move |
| `delete_relation` | `source`, `role`, `target` | an edge goes, as the graph has it |
| `set_attribute` | `var`, `attribute`, `value` | adds, changes or (with `value` null) deletes an attribute: `aspect`, `modstr`, `polarity`, `refer-number`, `refer-person`, `mode`, `quant`, `op1`, … |

- **Complete, down to the leaves.** A node you add is written as a whole: a named entity with its
  `name` node and that node's `op` attributes; an event with its `aspect` and `modstr` and the
  participants the sentence gives it; a date with its parts. Nothing is left for a later step.
- Existing nodes are named by the variables of the table; new nodes by `n1`, `n2`, … (the page
  gives them their UMR names). A change may use a node added by an earlier change.
- To move a node: `delete_relation` from where it hangs, `add_relation` to where it belongs. A node
  left with no edge from the rest of the graph is lost; give it a place.
- `aspect` (events): none, habitual, generic, imperfective, state, reversible-state,
  irreversible-state, inherent-state, point-state, process, atelic-process, perfective, activity,
  undirected-activity, directed-activity, iterative, endeavor, semelfactive, undirected-endeavor,
  directed-endeavor, performance, incremental-accomplishment, nonincremental-accomplishment,
  directed-achievement, reversible-directed-achievement, irreversible-directed-achievement,
  inceptive. `modstr` (the author's strength for an event): full-affirmative, partial-affirmative,
  neutral-affirmative, neutral-negative, partial-negative, full-negative. `polarity`: `-`.
- Change what the comment asks for, and what that needs; leave everything else as it is. If the
  comment is unclear, or the graph already does what it asks, return no changes and say so.
- `summary`: what you change and why, in the language of the comment.

## Example

Comment: "s1x2 的 ARG0 应该是 s1p；明天不是一个普通名词"

```json
{{"changes": [
  {{"op": "add_relation", "source": "s1x2", "role": "ARG0", "target": "s1p", "reason": "去北京的是张三（他），即 s1p"}},
  {{"op": "delete_node", "var": "s1t", "reason": "明天是时间，写成 date-entity"}},
  {{"op": "add_node", "var": "n1", "concept": "date-entity", "span": [5, 6], "parent": "s1x2", "role": "temporal", "reason": "明天是时间，写成 date-entity"}},
  {{"op": "set_attribute", "var": "n1", "attribute": "relative-day", "value": "1", "reason": "明天：相对于今天的第二天"}}
 ],
 "summary": "去北京的人是 s1p；明天改成 date-entity。"}}
```

## Input

Sentence: {sentence}
Tokens, each with its number: {tokens}

### The tree of steps

{tree}

### The graph's variables

{variables}

### The person's comment

{comment}
