# Skill: one clause — its event, sense and participants

You are building a Uniform Meaning Representation (UMR) graph for one sentence.
You are given one clause (one event or state). Decide **its head concept and
PropBank sense**, then write **the graph fragment of the event**: the event
node, and one placeholder for each participant, which other skills annotate
later. Also give the event's aspect, modal strength and polarity.

The sentence and the clause are given under **Input** at the end.

## 1. The head concept

**Abstract concepts** for non-verbal predication (no lookup needed):

| the clause says | concept and roles |
|---|---|
| X is the president / an employee of an organization or country | `have-org-role-92`: ARG1 X, ARG2 the organization, ARG3 the title |
| X is a doctor, a teacher (a role with no organization) | `have-role-91`: ARG1 X, ARG3 the role |
| his mother, X's boss (kinship, social relation) | `have-rel-role-92`: ARG1 X, ARG2 the other person, ARG3 X's role |
| X is Y (equative, naming) | `identity-91`: ARG1 X, ARG2 Y |
| X is red, beautiful (property) | `have-mod-91`: ARG1 X, ARG2 the property |
| X has Y (ownership); a whole that has kinds, versions or parts (X存在多种Y, X有许多品种) | `have-91`: ARG1 owner / whole, ARG2 thing owned / its kinds; belonging `belong-91` |
| there is X, with no owner or whole (there are problems, 有人敲门) | `exist-91`: ARG1 the thing |
| X (和 Y) 有(adj)区别 / 差异 | `exist-91`: ARG1 X (an `and` placeholder for X和Y), ARG2 the noun 区别 / 差异 (a noun, not a verb), with its adjective as `mod` of that noun |
| LOC 有 X, where LOC is a part or side of an object being described (盒子侧面有一个把手) | `有-03`: ARG1 the object (often dropped: see section 3), ARG2 X, `place` LOC; not `exist-91` |
| X 有 / 仅有 number + classifier (how many X there are) | `have-quant-91`: ARG1 X, ARG2 the quantity phrase |
| LOC 是 X, saying what is on a part of an object (盒子背面是公司标志) | `identity-91`: ARG1 the object (often dropped), ARG2 X, `place` LOC |
| X 是为了 Y (X exists or was made for Y) | `identity-91`: ARG1 X, `purpose` Y; X is not an argument of Y's verb |
| X is at/in Y (location) | `have-place-91`: ARG1 thing, ARG2 place |
| X is like Y | `resemble-91` |

- Chinese stative verbs and adjectives (冷, 高兴, 重要) are verbs with a sense
  (`冷-01`), not `have-mod-91`.
- **是……的 is not identity.** In 这座桥是由他设计的 or 他是昨天来的 the
  copula only focuses a part; the head is the verb inside (`设计-01`, `来-01`).
  `identity-91` is only for X 是 Y where both are things (他是老师 →
  `have-role-91`; 这是桥 → `identity-91`).

- This holds also when 的 is followed by a classifier and a noun that only
  names X's kind: X 是 …V1，…V2，…V3 的(一种 / 一个) N. Do not use `identity-91`
  and do not create a node for N or for 一种. The head is the **first** verb V1,
  and X is its participant (a placeholder). Each other verb phrase is a
  placeholder hung on X's placeholder with the role X plays in it
  (`["x1", "ARG0-of", "x3"]`, `["x1", "ARG1-of", "x4"]`). The verb phrases are
  not coordinated: no `and`.


**Otherwise the lemma of the head verb.** Strip aspect particles 了 / 着 /
过; a passive is the active lemma (*was convicted* → `convict`). A light verb
(*make a decision*, 进行讨论, 作出决定) is not the head: the event noun is.
Verbs of getting or receiving (获得, 得到, 受到, 取得 + N: 获得批准) are not
light verbs: the verb is the head, and N is its ARG1 as a plain noun with no
sense. A phase verb
(*begin*, 开始) or a modal (*can*, 能) is not the head: the verb it governs is.
A verb of need (需要, 必须要 as *need to*) **is** the head: its subject is ARG0
and the whole governed verb phrase is one ARG1 placeholder; a 不 / 不再 before
it belongs to it, not to the governed verb. 没(有) or 不 right before a verb is
that verb's negation, never a separate `有-03`.

**Look the lemma up with `propbank_lookup` before choosing a sense** (give the
lemma and up to two alternates), then pick the sense whose argument
descriptions fit the participants of this clause. Never invent a sense
number; a lemma not in PropBank is `<lemma>-01`.

## 2. The participants

Use **the roles of the sense you chose**. A numbered argument the sense does
not list does not exist.

- ARG0 is the agent, not "the subject": in *the window broke* the window is
  ARG1. A passive's unexpressed agent is left out.
- A complement clause is one participant: *said that the package arrived* →
  ARG1 is "the package arrived".
- A role the clause does not express is left out.

- A thing and its part or side before the verb (盒子底部印有日期: the box's
  bottom) are two participants: the thing is the numbered argument and the
  part is `place`. Never give them as one placeholder.


Other roles:

| the piece says | role |
|---|---|
| a place: in Beijing, at the base | `place` |
| how long: for 20 years, 三天 | `duration` |
| how often: twice, 每天 | `frequency` |
| by train, with a knife | `instrument` |
| quickly, 认真地 | `manner` |

| a degree word on an adjective or stative verb (非常, 十分, 极其, 最, *very*); the plain 很 before an adjective is not annotated | `degree` |
| an adverb of amount, extent or restriction (大量, 大规模, 只能, 再也) | `mod`, the whole word |
| 特别是 / 尤其是 + clause(s) illustrating this clause | `example` |

| because ..., because of ..., 因 X 而 Y, 由于 | `reason` |
| to ..., in order to ..., 为了 | `purpose` |
| if ... | `condition` |
| although ... | `concession` |
| from X / to Y | `source` / `goal` |
| together with X | `companion` |
| a calendar date: in 1998, on 3 May 2001, 2001年3月 | `time` |
| any other time: yesterday, last week, 去年, 今后, when ... | `temporal` |

**Time expressions.** A bare time (*yesterday*, *when he left*) is
one `temporal` placeholder; a bare calendar date (*in 1998*, 2001年) is one
`time` placeholder. A time **relative to something** keeps its
relation word as a node, with the something as its `op1`:

| the piece says | in the fragment |
|---|---|
| after the war (English) | node `after` (the word's span), `[event, "temporal", a]`, `[a, "op1", x]` |
| before X, until X, since X (English) | node `before` / `until` / `since`, the same way |
| Chinese X后 / X以后 / X前 / X以来 / 战后 | the Chinese word itself as the node (`后`, `前`, `以来`), the same way; never `after` / `before`, never a `mod` of the verb |
| Chinese 在X时 / X的时候 | node `时` (its span), `[event, "temporal", t]`, `[t, "op1", x]`; x is the clause X without 在 and 时 |
| a year range: between 1920 and 1925, 1920至1925年间 | one node `date-interval` (span of the whole range), `[event, "time", d]`, the bare years as attributes `[d, "op1", 1920]`, `[d, "op2", 1925]`; no `between`, no date placeholders |
| during X | `temporal` placeholder for X |
| for three days | `duration` placeholder (a quantity) |

**Not participants:** negation and modals (they are `polarity` and `modstr`
below), the relative pronoun of a relative clause and the noun it modifies (the
noun phrase links to this clause itself), and the subordinator that only marks
a role (*because*, *if*, *when*; the role says it).

## 3. Participants outside the clause: `outside`

Some participants are written **outside** the clause's span:

- control and raising: in *Pope wanted to leave*, the clause *to leave* has
  ARG0 *Pope*;
- a subject shared by coordinated clauses: in *Pope denied it and left*, the
  clause *left* has ARG0 *Pope*;
- a pronoun in the clause that refers to someone **named elsewhere in this
  sentence**: in *Pope was ill when he was arrested*, the clause *he was
  arrested* has ARG1 *Pope*. Give Pope in `outside` and not *he* as a
  placeholder. A pronoun whose referent is not in this sentence stays an
  ordinary placeholder.

- Chinese often drops the subject or topic of later clauses: when a clause
  keeps describing a thing named in an earlier clause (…正面有X，背面是Y),
  that thing is its participant; give it in `outside`.
- Exceptions (Chinese): in a pivot construction (方便 / 让 / 使 / 帮助 + NP +
  VP) the NP is a participant of the governing verb only, and the subject of
  需要 is not repeated in the clause it governs. When you are that governed
  clause, do not list them in `outside`.


Each is `{{"text": ..., "span": [first, last], "role": ...}}`, with the span
of that participant **exactly as the main clause has it**, so the two can be
joined into one node. Return `outside: []` when there are none.

## 4. Aspect, modal strength, polarity (always required)

**aspect** — go down this list and stop at the first that applies:

1. usual, repeated, or a disposition (*he bakes pies*) → `habitual`
2. a state: the abstract concepts above, predicate adjectives, *know*,
   *believe*, *want*, *be in remission* → `state`
3. ongoing with no endpoint in view (*was walking*, a progressive) → `activity`
4. completed and reaching a result (*tasted*, *convicted*, *was flown*) →
   `performance`
5. ended without a result (*tried to*, *searched for*) → `endeavor`
6. a single instant (*knocked once*) → `semelfactive`
7. an event named by a noun, or nothing above fits → `process`

`have-org-role-92`, `have-role-91` and `have-rel-role-92` take `none`. A future
or hypothetical event still gets the aspect it would have.

More on aspect:

- A completed past event that went on over a stated period (*was built from
  1920 to 1925*, 于2002至2010年间颁发) is `performance`, not `activity`.
- A general description of what a place or group does, allows or refuses
  (只收现金, 不接受支票) is `state`; so is *ensure* / 确保 that something holds.
- An unbounded, generic activity inside a purpose clause (为了让学生多读书:
  the reading) is `process`.
- `none` for a verb used inside a noun phrase as a modifier of a noun rather
  than as its head (出口许可, 销售额度), and for a stative verb in a
  noun-modifying relative clause (戴着帽子的男孩, 由三部分组成的计划).


**modstr** — how certain the speaker presents the event: `full-affirmative`
(asserted as fact), `partial-affirmative` (*probably*), `neutral-affirmative`
(*may*, *might*, a question, a wish), `neutral-negative`, `partial-negative`
(*probably not*), `full-negative` (asserted not to happen: *did not*, *never*).

**polarity** — `negative` when the clause negates its event (*not*, *never*,
不, 没); otherwise `positive`.

## 5. Output

- `graph`: the fragment, a JSON object
  `{{"nodes": [...], "edges": [...], "attrs": [...]}}`:
  - `nodes`: `{{"var": "e", "concept": "taste-01", "span": [3, 3]}}`; the
    **first node is the event**, its span the predicate word(s). Add nodes for
    relation words (`after`, `between`, ...) with their spans.
  - `edges`: `[source, role, target]` between vars, e.g. `["e", "ARG0", "x1"]`.
  - `attrs`: `[var, role, value]` for constants; usually `[]` (aspect, modal
    strength and polarity are separate fields below).
  Variable names are yours (`e`, `a`, `x1`...); they are renamed later.

  Every var in `edges` is a node in `nodes` or a placeholder in `open`. A
  participant given in `outside` gets no var and no edge.

- `open`: one placeholder per participant, `{{"var": "x1", "text": ..., "span":
  [first, last]}}`. Its var appears in `edges`. The text is the **whole
  phrase** (*the American businessman who was convicted*) minus a preposition or
  subordinator that only marks the role, without determiners for a bare noun
  and without punctuation. Spans lie inside the clause's span and do not include the
  predicate's own words.
- `outside`: as in section 3.
- `alignment`: the span of the predicate word(s) (for *was convicted*, both
  words).
- `frame`: the roleset you chose, **copied from the lookup**
  (`{{"roleset": ..., "roles": {{...}}}}`); for an abstract concept its roles
  as in the table; `{{}}` if not in PropBank.
- `aspect`, `modstr`, `polarity`: always, as in section 4.

## Examples

Call the `get_example` tool before answering: it returns worked examples of
this skill's input and output.

## Input

Sentence: {sent}
Tokens, each with its number: {token_sent}
Language: {lang}

The clause: "{text}"
Its tokens: span {span} (first and last token number, both included)
