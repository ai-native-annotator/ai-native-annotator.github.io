# Skill: discourse relation between clauses (Uzbek)

You are building a UMR graph for one Uzbek sentence. You are given a piece that was
judged to contain several clauses. Decide **which discourse relation joins them** and
cut the piece into its parts. The relation becomes a node; each part hangs off it with
its role.

The sentence and the piece are given under **Input** at the end. Tokens are words with
their suffixes; a span counts whole words.

## relation (UMR guidelines 3-1-6)

Coordination of clauses of equal status; the parts are `op1`, `op2`, ... in order:

| the clauses are joined by | relation |
|---|---|
| `va`, `hamda`, a comma between clauses, `-di, -di`; `nafaqat ... balki ... ham` — plain addition | `and` |
| one after another in time (`so'ng`, `keyin`, `undan keyin`, `keyinroq`, `ertasi kuni` in the second clause) | `consecutive` |
| `bundan tashqari`, `shuningdek` — adds a separate point | `additive` |
| `va` with a contrast in it | `and-but` |
| `va` where the second is unexpected given the first | `and-unexpected` |
| two contrasting situations side by side (`Ali baland, Vali esa past`) | `and-contrast` |
| `yoki`, `yo ... yo` (unspecified) | `or` |
| `yoki ... yoki`, one or the other but not both | `exclusive-disj` |

Contrast and concession, parts `op1`, `op2` in the order of the sentence:

| the clauses are joined by | relation |
|---|---|
| `lekin`, `ammo`, `biroq`, `-u` / `-yu` (but) — generic adversative | `but-91` |
| `garchi X bo'lsa ham, Y`, `X-sa ham, Y` (although) — `op1` the conceded clause X, `op2` Y | `but-91` |
| `esa`, `aksincha` — pure contrast between the two | `contrast-91` |

Other reified relations, parts `ARG1` and `ARG2`: `ARG1` the main clause, `ARG2` the
conditioning, causing or purpose clause:

| the clauses are joined by | relation |
|---|---|
| the concession itself is what the sentence asserts | `have-concession-91` |
| `agar X-sa, Y` asserted as a conditional relation | `have-condition-91` (ARG1 Y, ARG2 X) |
| `X, shuning uchun Y` / `X, shu sababli Y` asserted as the causal link | `have-cause-91` (ARG1 the effect, ARG2 the cause) |
| `X, toki Y` asserted as the purpose link | `have-purpose-91` (ARG1 X, ARG2 Y) |

`none` — the piece is **not** a coordination: a main clause with an ordinary subordinate
clause (`chunki`, `-gani uchun`, `-sa`, `-ganda`, `-gach`, `-ish uchun`, a converb `-ib`
that only says how or in what order the same actor acts), a reported clause (`... deb
aytdi`, `-ganini aytdi`), or one clause with a long object. The whole piece is then one
predicate, and the subordinate clause becomes one of its roles (`reason`, `condition`,
`temporal`, `purpose`, `manner`, `theme`, ...). Choose `none` unless the relation is
clearly one of the above; the reified `have-*-91` relations are for sentences whose
point is the relation itself.

Also `none`: several participle clauses that all modify one noun (`kecha kelgan, ko'p
gapirgan odam`): they are relative clauses of that noun, not coordinated clauses.

## parts

One item per part: `{{"text": ..., "span": [first, last], "role": ...}}`, with the roles
named above; `parts: []` for `none`.

- `span` is the numbers of its first and last token as listed in Tokens, both included,
  and must lie inside the piece's span.
- `text` is exactly those tokens.
- Leave the connective itself (`va`, `lekin`, `ammo`) and sentence-final punctuation out
  of every part.
- A subject shared by two conjuncts goes in the first part only; the second part's
  predicate finds it as a participant outside its clause.

## Tools

There is no Uzbek gold annotation: `search_annotations` returns nothing for Uzbek. To
check a rule, call `search_guidelines` with keywords: it returns the matching sections
of the UMR guidelines.

## Input

Sentence: {sent}
Tokens, each with its number: {token_sent}
Language: {lang}

The piece: "{text}"
Its tokens: span {span} (first and last token number, both included)
