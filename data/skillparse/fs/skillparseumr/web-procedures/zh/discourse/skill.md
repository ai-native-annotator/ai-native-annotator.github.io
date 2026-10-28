# Skill: discourse relation between clauses

You are building a UMR graph for one sentence. You are given a piece that was
judged to contain several clauses. Decide **which discourse relation joins
them** and cut the piece into its parts. The relation becomes a node; each part
hangs off it with its role.

The sentence and the piece are given under **Input** at the end.

## relation (UMR guidelines 3-1-6)

**`have-cause-91` is never an answer.** Every reason or result connective (因为, 由于, 因而, 因此, 于是, 所以, 以致(于)) gives `have-reason-91`: ARG1 the result, ARG2 the reason.


Coordination of clauses of equal status; the parts are `op1`, `op2`, ... in
order:

| the clauses are joined by | relation |
|---|---|
| *and*, a comma between clauses, 并且, 、, *not only ... but also*, 不但/不仅……而且 — plain addition | `and` |
| English: one after another in time (*and then*, *then*, *the next year*), or events a narrative tells in the order they happened (found the parcel, called the squad). Chinese: 然后 / 接着 between clauses; and, in a story narrative (the plot of a film, episode, novel or legend told step by step), a chain of physical actions by the same agent where each step follows the previous one (went back to X and told Y; seized them and then converted them; said goodbye, went back, boarded, left) — joined by a comma, 并, 便, 再, or 于是 as pure sequence. Even in a story, use plain `and` when a clause agrees or refuses (同意，并协助…), when 并 joins two facts that were found or reported, when the clauses have different subjects and no connective (A已完成，B正在等待，C发现…), and for 并 / 非但…反而 chains | `consecutive`: one flat node, one op per event in text order (a chain of verb phrases of one subject, 舍身V1，V2, gives one op per verb phrase). In news reports and factual accounts, Chinese clauses joined by a comma, 并, 再, 遂, 亦, or with a time word inside the later clause (随后, 后来, 之后, 第二年, 同年), are plain `and`, even when the events come in order: the order is left to the document-level temporal relations, and the time word stays inside its clause |
| *moreover*, *besides* — adds a separate point (English) | `additive`; Chinese 此外 / 另外 between clauses is plain `and`, and so is 并, also when the clause after 并 is a later act of the same subject (except in a story narrative, where a later act after 并 is `consecutive`, above) |
| *and* with a contrast in it (*he came and yet said nothing*) | `and-but` |
| *and* where the second is unexpected given the first | `and-unexpected` |
| *and* joining two contrasting situations (*Tom is tall and Ann is short*) | `and-contrast` |
| *or*, 或者, 还是 — unspecified | `or`; but 是否 A 还是 B (whether A or B), embedded under a verb such as 确定 / 调查, is `umr-choice` |
| *or*, *and/or* — both may hold | `inclusive-disj` |
| *either ... or*, one or the other but not both | `exclusive-disj` |

Contrast and concession are `-91` predicates. Their parts are `ARG1` and `ARG2`
(never `op1` / `op2`; only `and`, `or` and the other coordinations above take
`opN`). `ARG1` is the first clause in the sentence (the conceded one) and
`ARG2` the second (the contrasting or main) clause. but-91 covers only the two
clauses it actually contrasts: an earlier clause that is not part of the
contrast is coordinated with the but-91 under `and`.

| the clauses are joined by | relation |
|---|---|
| *but*, 但是, 但, 可是, 不过, 然而 — generic adversative | `but-91` |
| *although X, Y*, *even though*, 虽然X，但(是)/不过/可是Y, 尽管X，(仍)Y — `ARG1` the conceded clause X, `ARG2` the main clause Y; 尽管, 虽然, 仍 get no node | `but-91` |
| *however*, *whereas*, *while*, 却 — pure contrast between the two | `contrast-91` |

Other reified relations, with parts `ARG1` and `ARG2`: `ARG1` is the main
clause and `ARG2` the conditioning, causing or purpose clause:

| the clauses are joined by | relation |
|---|---|
| the concession itself is what the sentence asserts (*although X, Y* where the sentence is about X being outweighed) | `have-concession-91` |
| *if X then Y* asserted as a conditional relation | `have-condition-91` (ARG1 Y, ARG2 X) |
| *X, so Y*; Chinese 因为/由于 X，(于是/所以) Y; X，因而/因此/于是/所以 Y; 有见于 / 鉴于 X，Y… (the reason covers every following clause: ARG1 is one part spanning all of them) | `have-reason-91` (ARG1 the result Y, ARG2 the reason X); never `have-cause-91`, and never `consecutive` for 因而, nor for 于是 after a reason (a belief, a need, a judgement: 深信X，于是Y). 于是 after a mere preceding action in a story (明白了X，于是前往Y) is `consecutive` |
| *X in order to Y* asserted as the purpose link | `have-purpose-91` (ARG1 X, ARG2 Y) |

| Chinese 为了/为 X，Y (a purpose clause before the main clause) | not reified. When Y is one clause, answer `none` (X becomes the `purpose` of Y's verb). When Y is several clauses, answer their relation and put the 为 clause inside the span of the first part, so that it becomes the first conjunct's `purpose`. Never `have-purpose-91` |
| Chinese 在X的同时，Y / X的时候，Y given as two clauses | `have-temporal-91` (ARG1 the main clause Y, ARG2 X); 同时 gets no node |


`none` — the piece is **not** a coordination: a main clause with an ordinary
subordinate clause (*because*, *if*, *when*, *to*, *who*, *that*), a reported
clause (*X said that Y*), or a single clause with a long object. The whole
piece is then handled as one predicate, and the subordinate clause becomes one
of its roles (`:reason`, `:condition`, `:purpose`, `:temporal`, `:concession`,
`ARG1`, ...). Choose `none` unless the relation is clearly one of the above;
the reified `have-*-91` relations are for sentences whose point is the
relation itself, not for every *because* or *if*. In Chinese, the explicit
clause pairs in the tables (因为/由于…(于是), 因而, 尽管/虽然…, 在…的同时)
always take them.

 They take them also when the pair sits inside a longer span (reported content, a quoted story, a clause after a comma: X，因为Y; X到Y，以致于Z，因为W), and 以致(于) / 于是 / 因此 alone between two clauses also gives `have-reason-91`. A span with such a connective between clauses is never `none`. The concept for every reason or result link (因为, 由于, 因而, 于是, 以致) is `have-reason-91`; `have-cause-91` is never used.


Also `none`:

- Several comma-separated verb phrases that all modify one noun before 的
  (她写的、去年出版的、很受欢迎的小说; X 是由…创立，…获得批准，…颁发的一种N):
  they are relative clauses of that noun, not coordinated clauses. No `and`:
  each hangs off the noun by itself.
- *X，特别是 / 尤其是 Y(，并且 Z)*: Y and Z illustrate X; they are not
  coordinated with it. Answer `none`: X is the head, and the 特别是 part becomes
  its `example` role (several clauses there are then joined by `and` inside
  that part).

- A sentence that opens with a reporting frame (X报导，…；X引用报导，…；
  据X说/据X报导，…；X称/X指…) whose content is all the following clauses:
  answer `none`. The reporting verb is the head and all the reported clauses
  form its content argument; the coordination of those clauses is cut later,
  inside that argument. Never leave the frame inside the first conjunct only.

  The same holds when the subject comes before the frame verb (X被指A，后来还B; X称A，B): the frame scopes over every following clause. But clauses that say what happened **to** the report (the news was put on the front page, other media followed it up) are not its content: then the piece is `and` with one op per clause, the reporting clause first.

 Likewise, a clause in which the citing outlet does something itself (X引用报导，以大篇幅刊载了一张照片) is not content: `and`, op1 the X引用报导 clause, op2 that clause.

- A comma-joined clause with no subject of its own, or whose only subject is a pronoun (他 / 她 / 它) for that noun, that only goes on describing a noun of the previous clause — its subject or predicate nominal (X是一家Y，以…而闻名), the thing just created or printed (创办了Z，专门刊登…; 登出一幅画，画中有…), or what an object contains (采用统一格式，有日期、署名等栏目): answer `none`. That clause hangs on the noun as `ARGn-of`; no `and`, and a repeated noun gets no second node. But a clause that tells a new event of the subject itself, with its own time, place or agent (X是某剧的一集，于某年在某台播出), is a conjunct: `and`.

- X，致使 / 导致 / 造成 Y: `none`. X's event is the head and Y is its `cause-of`; never `have-cause-91`, and a scene-setting clause before X is not part of the cause.
- A first clause that only sets the time or situation of the main event (比赛接近尾声，场馆突然停电): `none`. It becomes the `temporal` of the main event.
- A clause without a connective that says why the previous action was done (戴上白花，表示悼念): `none`. It is the `purpose` of the previous verb.
- A clause whose subject 这 / 此 refers back to the event of the previous clause (…资料外泄，这影响了调查): not a new conjunct. It hangs on that event (`ARG0-of`), and 这 gets no node.

- A subjectless clause headed by 暗示 / 表明 / 说明 / 显示 that comments on the clauses before it (A，B，表明C，D): answer `and` with one op per clause before the verb, plus one more part spanning the verb and everything after it (表明C，D) with role `ARG0-of`. The clauses after the verb form its ARG1, which is cut into its own `and` later.

- X怀疑 / 涉嫌 followed by several coordinated VPs: `none`. 怀疑 is the head over all of them, never only the first conjunct.

- A clause that spells out what a noun just introduced is (…是X的问题，<clause>; 还有N难题，<clause>): `none`. The clause hangs on the noun through identity-91 and is not a conjunct.
- X称 / X指 A，并认为 / 并表示 B: a new speech or belief verb after 并 starts a new conjunct, and the first verb's content ends before it. Answer `and` (one op per clause), never `none` with the first verb over everything.


- One subject + a speech or plan verb (宣布, 表示, 计划, 打算, 决定) followed by several coordinated actions that are all what is announced or planned (X宣布收购A，并同时收购B; X计划将A改为B，并加入C): `none`. The verb is the head, and the coordination of the actions is cut later inside its ARG1. Never coordinate the later action with the speech or plan verb.






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

- The parts together cover **every** clause of the piece except the
  connectives. A main clause before a concession pair is its own part (`and`
  over it and the but-91 part), never dropped.
- Adverbs of the clause such as 甚至, 也, 还, 都, 亦, 同时 (in 并同时V only 并 is the connective) are not connectives: keep them
  inside the span of the clause they precede.

- When you answer `and` and a later clause opens with 后 / 之后 / 后来, keep that word inside the clause's span (it becomes the clause's `temporal`). Never drop it.


- A reified relation always has parts: never return a relation other than `none` with empty `parts`; every argument clause goes in its own part so that it is parsed.
- A piece that opens with 然而 / 但是 / 但 / 不过 / 可是 contrasts with the earlier sentences: `but-91` with one part, role `ARG2` (ARG1 is the earlier discourse and is left out). But when the text after the connective itself holds a reason or other relation (然而，X改变主意，因此计划取消), the connective gets no node: answer that inner relation for the text after the connective. With one clause after the connective, the part is that clause; with several, it spans them all and is cut again later. Never leave the connective inside a conjunct.
- A clause followed by a parenthetical clause in （ ） that adds information: `and`, op1 the main clause, op2 the parenthetical (without the brackets).

- A piece that opens with 原来 ('it turns out'), 此外 / 另外 / 然后 / 其次 / 首先 / 还有, or 比如 / 例如: answer `none`, however many clauses follow. The predicate step builds the wrapper (have-reason-91 with an implicit ARG1; `and` with an implicit first op; implicit-argument with `example`) and hands the rest on as one placeholder, which is cut again. Never drop the connective by starting the parts after it.
- A piece that opens with a scene-switching contrast marker (另一边厢, 另一方面, marking the other story line): `contrast-91` with one part, role `ARG2`, spanning the rest (cut again later); the marker gets no node and is never a `temporal`.

- A subject written before the first connective (X因为A，于是B; X虽然A，但B) is shared by both clauses: start the first part at the subject, so that it is built once; the other part's verb takes it from outside.

- A main clause followed by 不但A，(还/也/而且)B with the same subject: one flat `and`, op1 the main clause, op2 A, op3 B. A and B are never hung on a noun of the main clause.
- A，因为B，而C: the 而 clause continues the reason. The answer is `have-reason-91` with ARG1 A and ARG2 one part spanning B…C, which is later cut into `and`.

- Several clauses before 因此 / 所以 (A，B认为C，因此D…) are all the reason: ARG2 is one part spanning every clause before the connective (cut into `and` later), and ARG1 is one part spanning everything after it. Never cut at the first comma. Inside a result span, A，B，令 / 使 C (C follows from A and B) is `have-reason-91` with ARG1 C (without 令) and ARG2 one part spanning A，B.
- A clause 分别是 A 和 B (or 即 A、B) that says what a noun of the previous clause is, is not its own part: keep it inside that clause's span (it becomes `ARG1-of identity-91` on the noun).
- 为X，Y where Y's clause also has its own 以-purpose (为配合A，B每天播出两次以迎合C): `none`. Y's verb is the head and both purposes are its `purpose`.


- Never nest `and` inside `and`, and never wrap `and` parts in another discourse node. Clauses joined by commas, 并, 且, 此外, 而 in one sentence are all ops of **one** flat `and`: cut at every clause boundary at once, so that no part is itself a coordination. A fronted 与X不同 / 与X相同 clause with its own predicate is one of those ops, never a modifier of the next clause. When one clause of such a list opens with 但 / 但(是)同时 / 但也 (the last one, one in the middle, or the second of only two clauses A，但也B), keep the list flat: that clause, with 但 inside its span, is its own op and is cut again later into a one-part `but-91`.

- 而 that only carries a narrative forward (X发了一条帖子，称…，而不少人认为…，引来批评) is not `contrast-91`: one flat `and`, one op per verb phrase. So is 而 / 则 joining two parallel statements of the same kind (A的执照改为X，而B的执照则改为Y; A时段在早上，B则在晚上): ops of the flat `and`, never `contrast-91`. Comma-joined VPs of one subject (发帖，称…) are separate ops; a later verb is never a relative clause on an object of an earlier one. Use `contrast-91` only for a real opposition.
- Several contrast connectives in one sentence (虽然A，不过B，但C): a top `and` with one `but-91` part per contrast clause, not one nested binary `but-91`.

- 和 / 与 joining two clauses that each have their own verb (A企图V1和把X设在Y, the object of a verb such as 欣赏) is `and` at this level, with each subject kept inside its own op; never `none`.







## Examples

If you are unsure what a good answer looks like, call the `get_example` tool: it
returns worked examples of this skill's input and output.

## Input

Sentence: {sent}
Tokens, each with its number: {token_sent}
Language: {lang}

The piece: "{text}"
Its tokens: span {span} (first and last token number, both included)
