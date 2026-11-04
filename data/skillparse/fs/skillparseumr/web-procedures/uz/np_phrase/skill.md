# Skill: one noun phrase — its head and modifiers (Uzbek)

You are building a Uniform Meaning Representation (UMR) graph for one Uzbek sentence.
You are given one noun phrase. Write **the graph fragment of its head**, and one
placeholder for each modifier, which other skills annotate later.

Uzbek has no PropBank: an event concept is the verb's stem with no sense number (as
the predicate skill does), and its participants take the general roles (`actor`,
`undergoer`, ...); abstract concepts keep their numbered roles.

The sentence and the phrase are given under **Input** at the end. Tokens are words with
their suffixes; a span counts whole words.

## 1. The head: often more than one node

The head noun is the **last noun** of the phrase (Uzbek modifiers come first). Its
concept is its stem without case, possessive or plural suffixes: `maktabni`,
`maktabimiz`, `maktablarda` → `maktab`.

| the head noun is | fragment |
|---|---|
| an ordinary noun | one node, its stem |
| someone who does an event (`-chi`, `-uvchi`: `o'quvchi`, `quruvchi`, `sotuvchi`) | `person` with `actor-of` the event: `(p / person :actor-of (o / o'qi))`; a lexicalised profession (`o'qituvchi` 'teacher', `shifokor`) is one node, the word's stem |
| a role or title in an organization (`kompaniya rahbari`, `vazir`) | `(p / person :ARG1-of (h / have-org-role-92 :ARG2 <organization> :ARG3 (t / <title>)))`; with no organization `have-role-91 :ARG3 (t / <title>)` |
| a title followed by the person's name (`prezident Shavkat Mirziyoyev`, `professor Karimov`) | `person` with the name, and the title through `have-org-role-92` / `have-role-91` as above |
| a kinship or social role (`uning onasi`, `akasi`) | `(p / person :ARG1-of (h / have-rel-role-92 :ARG2 <the other> :ARG3 (o / ona)))` |
| a number of things (`uchta kitob`, `ikki nafar talaba`, `200 kishi`) | the thing with `:quant`: `(k / kitob :quant 3)`; the counting suffix `-ta` and counters `nafar`, `dona` get no node |
| a nominalised event (`-ish`, `-v`, `-uv`, `-lik`: `shaharning vayron bo'lishi`, `uning kelishi`) | the event: its verb stem (`kel`), with its participants as general roles |
| a word that is one lexical item (`ishlab chiqarish` 'production', `kitob do'koni` as a shop name) | one node; do not split it |
| a pronoun | `person` or `thing` with `refer-person` and `refer-number` (below) |
| a coordination (`Ali va Vali`, `kitob hamda daftar`) | `and` (`yoki` → `or`), the conjuncts as placeholders `op1`, `op2` |

## 2. Pronouns, possession and number

- A pronoun is `person` (people) or `thing`, with `:refer-person` `1st` / `2nd` / `3rd`
  and `:refer-number` `singular` / `plural`: `men` 1st singular, `sen` 2nd singular,
  `u` 3rd singular, `biz` 1st plural, `siz` 2nd (plural or polite), `ular` 3rd plural.
  The demonstratives `bu`, `shu`, `o'sha` as a pronoun ('this one') are `thing` (or
  `person`) 3rd singular.
- **A possessive suffix** (`kitobim` 'my book', `uyimiz`, `onasi`) with no possessor
  word written: the possessor is a pronoun node (`(p / person :refer-person 1st
  :refer-number singular)`) as `possessor`. When the possessor is written (`mening
  kitobim`, `Alining kitobi`), it is the `possessor` placeholder and the suffix gets no
  node. When the possessor is someone named elsewhere in this sentence, give it in
  `outside` (section 4).
- A plural noun (`-lar`: `kitoblar`, `talabalar`) gets `:refer-number plural` on its
  head; a singular noun and a name get no `refer-number`.

## 3. Modifiers: placeholders

| the modifier is | role |
|---|---|
| an adjective, a modifying noun (`yangi`, `davlat` in `davlat maktabi`) | `mod` |
| a genitive (`-ning`) or possessor noun (`O'zbekistonning poytaxti`) | `possessor` |
| a material word (`yog'och`, `temir`, `oltin`) | `material` |
| a quantifier that is not a number (`ko'p`, `bir necha`, `ba'zi`, `barcha`) | `quant` |
| an ordinal (`birinchi`, `-inchi`) | `ord` |
| a relative participle clause (`-gan`, `-yotgan`, `-adigan`, `-ajak`: `kecha kelgan odam`, `u o'qigan kitob`) | `<role>-of`: **the role the head noun plays in that clause**: `kelgan odam` `actor-of`, `u o'qigan kitob` `undergoer-of`, `u yashagan shahar` `place-of` |
| a place (`-dagi`: `Toshkentdagi universitet`) | `place` |
| a place before a part of it (`shaharning shimoli`) | `part-of` on the part |
| a time (`kechagi yig'ilish`, `-gi`) | `temporal` |
| an argument of a nominalised event (`shaharning`) | its general role |
| a conjunct of `and` / `or` | `op1`, `op2`, ... |
| a parenthetical equivalent in another language | the head's `name` |

A modifier that belongs to a node inside the head (the organization of
`have-org-role-92`, the object of a nominalised event) is joined to **that** node, not
to the head.

A demonstrative (`bu`, `shu`, `o'sha`, `ushbu`) before the noun is a `mod` node (`bu`);
`bir` as an indefinite article ('a') is not annotated. A number is an attribute, not a
placeholder. Never make a node for an anaphor that only repeats a name just given
(`... universiteti, ushbu universitet`): the phrase is the named entity alone.

## 4. Participants written outside the phrase: `outside`

Sometimes a node of your fragment needs a participant that is written **elsewhere in the
sentence**, outside the phrase's span. Do not make a new node for it and do not make it a
placeholder: list it in `outside`, and it is joined to the node that already stands for
it (a reentrancy):

- a possessive suffix or pronoun whose possessor is named in this sentence (`Ali
  ukasining kitobini oldi`: the possessor of `kitob` is the brother, not a new pronoun);
- a node inside the head that takes a participant the phrase does not repeat but the
  sentence names elsewhere;
- the same referent mentioned again in this sentence: the second mention is not rebuilt.

Each item is `{{"var": "y1", "node": ..., "text": ...}}`:

- `var`: your own variable, used in `edges` like a placeholder: `["k", "possessor",
  "y1"]`;
- `node`: the participant's node in the table **Nodes of this sentence so far** at the
  end of the input (a placeholder whose node is not built yet is listed too);
- `text`: its words, for reading.

`outside: []` when there are none.

## 5. Output

- `graph`: `{{"nodes": [...], "edges": [...], "attrs": [...]}}`:
  - `nodes`: `{{"var": "m", "concept": "maktab", "span": [3, 3]}}`; the **first node is
    the head**. Give a node the span of the word it comes from (`o'quvchi` gives both
    `person` and `o'qi` its span).
  - `edges`: `[source, role, target]`, e.g. `["m", "mod", "x1"]`.
  - `attrs`: `[var, role, value]` for constants: `["k", "quant", "3"]`,
    `["m", "refer-number", "plural"]`.
  Variable names are yours; they are renamed later. Each names one thing.
- `open`: one placeholder per modifier, `{{"var": "x1", "text": ..., "span": [first,
  last]}}`, its var used in `edges`. Spans lie inside the phrase's span and never
  include the head word. `open: []` if there are none.
- `outside`: participants written elsewhere in the sentence (section 4), or `[]`.
- `alignment`: the span of the head word(s).

## Tools

There is no Uzbek PropBank and no Uzbek gold annotation: `propbank_lookup` and
`search_annotations` return nothing for Uzbek. To check a rule, call `search_guidelines`
with keywords: it returns the matching sections of the UMR guidelines.

## Input

Sentence: {sent}
Tokens, each with its number: {token_sent}
Language: {lang}

The phrase: "{text}"
Its tokens: span {span} (first and last token number, both included)
