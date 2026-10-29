# Skill: discourse relation between clauses

You are building a UMR graph for one sentence. You are given a piece that was
judged to contain several clauses. Decide **which discourse relation joins
them** and cut the piece into its parts. The relation becomes a node; each part
hangs off it with its role.

The sentence and the piece are given under **Input** at the end.

## relation (UMR guidelines 3-1-6)

Coordination of clauses of equal status; the parts are `op1`, `op2`, ... in
order:

| the clauses are joined by | relation |
|---|---|
| *and*, a comma between clauses, 并且, 、, *not only ... but also*, 不但/不仅……而且 — plain addition | `and` |
| one after another in time (*and then*, *then*, *the next year*, 然后, 随后, 之后, 第二年 / 次年 in the second clause) | `consecutive` |
| *moreover*, *besides*, 此外 — adds a separate point | `additive` |
| *and* with a contrast in it (*he came and yet said nothing*) | `and-but` |
| *and* where the second is unexpected given the first | `and-unexpected` |
| *and* joining two contrasting situations (*Tom is tall and Ann is short*) | `and-contrast` |
| *or*, 或者, 还是 — unspecified | `or` |
| *or*, *and/or* — both may hold | `inclusive-disj` |
| *either ... or*, one or the other but not both | `exclusive-disj` |

Contrast and concession, also with parts `op1`, `op2` in the order of the
sentence (never `ARG1` / `ARG2`):

| the clauses are joined by | relation |
|---|---|
| *but*, 但是, 但, 可是 — generic adversative | `but-91` |
| *although X, Y*, *even though*, 虽然X，但(是)Y — `op1` the conceded clause X, `op2` the main clause Y | `but-91` |
| *however*, *whereas*, *while*, 却 — pure contrast between the two | `contrast-91` |

Other reified relations, with parts `ARG1` and `ARG2`: `ARG1` is the main
clause and `ARG2` the conditioning, causing or purpose clause:

| the clauses are joined by | relation |
|---|---|
| the concession itself is what the sentence asserts (*although X, Y* where the sentence is about X being outweighed) | `have-concession-91` |
| *if X then Y* asserted as a conditional relation | `have-condition-91` (ARG1 Y, ARG2 X) |
| *X, so Y* / *X, because of which Y* asserted as the causal link | `have-cause-91` (ARG1 the effect, ARG2 the cause) |
| *X in order to Y* asserted as the purpose link | `have-purpose-91` (ARG1 X, ARG2 Y) |

`none` — the piece is **not** a coordination: a main clause with an ordinary
subordinate clause (*because*, *if*, *when*, *to*, *who*, *that*), a reported
clause (*X said that Y*), or a single clause with a long object. The whole
piece is then handled as one predicate, and the subordinate clause becomes one
of its roles (`:reason`, `:condition`, `:purpose`, `:temporal`, `:concession`,
`ARG1`, ...). Choose `none` unless the relation is clearly one of the above;
the reified `have-*-91` relations are for sentences whose point is the
relation itself, not for every *because* or *if*.

Also `none`:

- Several comma-separated verb phrases that all modify one noun before 的
  (她写的、去年出版的、很受欢迎的小说; X 是由…创立，…获得批准，…颁发的一种N):
  they are relative clauses of that noun, not coordinated clauses. No `and`:
  each hangs off the noun by itself.
- *X，特别是 / 尤其是 Y(，并且 Z)*: Y and Z illustrate X; they are not
  coordinated with it. Answer `none`: X is the head, and the 特别是 part becomes
  its `example` role (several clauses there are then joined by `and` inside
  that part).


## parts

One item per part: `{{"text": ..., "span": [first, last], "role": ...}}`, with the
roles named above; `parts: []` for `none`.

- `span` is the numbers of its first and last token as listed in Tokens, both
  included (one token: [4, 4]), and must lie inside the piece's span.
- `text` is exactly those tokens.
- Leave the connective itself (*and*, *but*, *although*) and sentence-final
  punctuation out of every part.
- A subject shared by two conjuncts (*Pope denied it and left*) goes in the
  first part only; the second part's predicate finds it as a participant
  outside its clause.

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

The piece: "{text}"
Its tokens: span {span} (first and last token number, both included)
