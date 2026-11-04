# Skill: one clause — its event and participants (Uzbek)

You are building a Uniform Meaning Representation (UMR) graph for one Uzbek sentence.
You are given one clause (one event or state). Decide **its head concept**, then write
**the graph fragment of the event**: the event node, and one placeholder for each
participant, which other skills annotate later. Also give the event's aspect, modal
strength and polarity.

Uzbek has **no PropBank frame files**. Following the UMR guidelines (Part 3-2-1-1,
Stage 0), a lexical event concept is the verb's dictionary stem with no sense number,
and its participants take the **general participant roles** (`actor`, `undergoer`,
`theme`, ...). The abstract concepts below keep their numbered roles.

The sentence and the clause are given under **Input** at the end. Tokens are words;
an Uzbek word carries its suffixes (case, possession, plural, tense, person): a span
counts whole words.

## 1. The head concept

**Abstract concepts** for non-verbal predication:

| the clause says | concept and roles |
|---|---|
| X is the president / an employee of an organization or country (X tashkilot rahbari) | `have-org-role-92`: ARG1 X, ARG2 the organization, ARG3 the title |
| X is a doctor, a teacher (X shifokor) | `have-role-91`: ARG1 X, ARG3 the role |
| X's mother, X's boss (kinship, social relation) | `have-rel-role-92`: ARG1 X, ARG2 the other person, ARG3 X's role |
| X is Y (equative, naming: X — Y, X Y hisoblanadi, X Ydir) | `identity-91`: ARG1 X, ARG2 Y |
| X is big, beautiful (a property: X katta, X chiroyli) | `have-mod-91`: ARG1 X, ARG2 the property |
| X has Y (X-ning Y-i bor, ownership; a whole and its parts or kinds) | `have-91`: ARG1 owner / whole, ARG2 the thing |
| there is X, with no owner (X bor, X mavjud) | `exist-91`: ARG1 the thing; with a place (xonada stol bor) `place` the place |
| X is at / in Y (X Y-da) | `have-place-91`: ARG1 thing, ARG2 place |
| there are N X, X numbers N | `have-quant-91`: ARG1 X, ARG2 the quantity |
| X is like Y (X Y kabi / singari) | `resemble-91` |

- `yo'q` ('there is not, has not') is `exist-91` or `have-91` with polarity negative;
  `emas` ('is not') negates the copular clause it closes.
- The copula (`-dir`, `edi`, `ekan`, `bo'ldi` as 'became' is a verb) is not a node.
- A focus construction that only highlights a part of a clause (`X Y tomonidan qurilgan`)
  is headed by the verb inside, never by `identity-91`.

**Otherwise the verb.** The concept is the verb's **stem**, the dictionary form without
`-moq` and without tense, person, negation or voice suffixes: `ochdi`, `ochilgan`,
`ochmoqchi` → `och`; `o'qiyapti` → `o'qi`; `suhbatlashdi` → `suhbatlash`. A passive
(`-il-`, `-in-`) is the active stem (*was built* `qurildi` → `qur`), with its subject as
`undergoer`; a causative (`-tir-`, `-dir-`, `-giz-`) keeps its suffix (`o'qit` 'teach').

- **Light verbs.** In noun + `qil-` / `et-` / `ber-` / `ol-` / `bo'l-` where the noun
  names the event (`qaror qabul qildi`, `yordam berdi`, `suhbat qildi`), the event noun
  is the head (`qaror`, `yordam`, `suhbat`) and the node's span and `alignment` cover the
  light verb too. A verb of getting (`oldi`, `qo'lga kiritdi`) is not light: it is the
  head and the thing got is its `theme`.
- **Auxiliaries are not the head**: the phase and ability auxiliaries after a converb
  (`o'qiy boshladi` 'began to read', `o'qiy oladi` 'can read', `yozib qo'ydi`, `ko'rib
  chiqdi`) leave the main verb as head (`o'qi`, `yoz`, `ko'r`); `boshla-` adds nothing,
  `ol-` (ability) and `mumkin` are modal strength (section 4).
- **Need and wanting are the head**: `kerak`, `lozim`, `shart` ('must, need') and `xohla-`,
  `ista-`, `-moqchi` ('want, intend') head the clause; the governed verb phrase is one
  placeholder (`theme`), and the one who needs or wants is `experiencer`. A negation on
  `kerak` (`kerak emas`) belongs to it.
- **Negation**: `-ma-` on the verb (`bormadi`), `emas`, `yo'q` are the event's polarity,
  never a separate node.

## 2. The participants

General participant roles (UMR guidelines, Table 9), by what the participant does, not
by its case:

| the participant | role |
|---|---|
| an animate one who starts the action (usually the subject of an action verb) | `actor` |
| what the action affects, changes or creates (often `-ni`, or a passive subject) | `undergoer` |
| what moves or is passed on, said, given or told (a gift, a story) | `theme` |
| who gets the theme (often `-ga`: `unga kitob berdi`) | `recipient` |
| who perceives, feels, knows, wants or needs | `experiencer` |
| what is perceived, felt or known | `stimulus` |
| an inanimate force that starts it (`shamol`, the wind) | `force` |
| who makes another act (a causative's subject) | `causer` |
| with whom, together with (`X bilan` for a person) | `companion` |
| with what tool (`X bilan` for a thing, `X orqali`) | `instrument` |
| for whose good or harm (`X uchun` for a person) | `affectee` |
| where (`-da`, `X ichida`) | `place` |
| from where (`-dan`) for motion | `start`; the thing something comes off: `source` |
| to where (`-ga`, `-gacha`) for motion | `goal` |
| what it is made of | `material` |
| because of a thing (`X sababli`, `X tufayli`) | `cause`; because of an event (`chunki`, `-gani uchun`) `reason` |
| in order to (`-ish uchun`, `-gani` 'to go and') | `purpose` |
| if (`-sa`, `agar ... -sa`) | `condition` |
| although (`-sa ham`, `garchi`) | `concession` |
| how (`tez`, `-cha`, `-ib` describing manner) | `manner` |
| how much, how far (`yetti kilometr`) | `extent` |
| how long (`uch kun`, `yigirma yil davomida`) | `duration` |
| how often (`har kuni`, `ikki marta`) | `frequency` |
| a calendar date (`2001-yilda`, `5-martda`) | `time` |
| any other time (`kecha`, `o'tgan yili`, `-ganda` 'when') | `temporal` |
| an adverb of degree (`juda`, `eng`, `nihoyatda`) | `degree` |
| when unsure | `other-role` |

- A complement clause is one participant: `u maktab ochilganini aytdi` 'he said the
  school opened' → `theme` "maktab ochilganini".
- A role the clause does not express is left out; a passive's unexpressed agent too.
- **Time relative to something** keeps its relation word as a node with the something
  as `op1`: `urushdan keyin` → node `keyin` (its span), `[e, "temporal", k]`,
  `[k, "op1", x]`; the same for `oldin`, `so'ng`, `beri`, `-gacha`, `-gach` 'after'
  (the converb word itself), `paytda` / `-ganda` 'when' (node of the word). A range of
  years (`1920–1925-yillarda`) is one `date-interval` node with the years as `op1`, `op2`.

**Not participants:** negation and modality (polarity and modstr below), the case
suffixes and postpositions that only mark a role (the role says it), and in a relative
clause the noun it modifies (the noun phrase links to this clause).

## 3. Participants outside the clause: `outside`

Some participants are written **outside** the clause's span:

- a subject shared by coordinated clauses or converbs: `U uyga keldi va dars qildi`
  (`dars qildi` has `actor` U); `kitobni olib, o'qidi`;
- control: `U ketmoqchi edi` — the clause `ketmoq` has `actor` U;
- Uzbek drops subjects and objects that the verb's person ending or the context gives:
  when a clause keeps talking about a participant named elsewhere in this sentence, that
  participant is its role; give it in `outside`;
- a pronoun (`u`, `ular`) in the clause for someone **named elsewhere in this sentence**:
  give the named one in `outside`, not the pronoun as a placeholder. A pronoun whose
  referent is not in this sentence stays an ordinary placeholder;
- **reported content**: when your clause is (part of) what a reporting verb outside it
  reports (`dedi`, `aytdi`, `xabar berdi`, `ta'kidladi`, `... deb`, `X-ning so'zlariga
  ko'ra`), give that verb in `outside` with role `quote`. The outermost reporting verb.
- Not in `outside`: an agent the sentence leaves implicit; in a causative (`X Y-ni
  o'qitdi`) Y is a participant of the governing verb only.

Each is `{{"role": ..., "node": ..., "text": ...}}`: `node` names the participant's node in
the table **Nodes of this sentence so far** at the end of the input (a placeholder whose
node is not built yet is listed too), and `text` is its words, for reading. The two are
joined into one node. Return `outside: []` when there are none.

## 4. Aspect, modal strength, polarity (always required)

**aspect** — go down this list and stop at the first that applies:

1. usual, repeated, a disposition (present-future `-adi` / `-a` for what happens
   regularly: `har kuni o'qiydi`) → `habitual`
2. a state: the abstract concepts above, `bil-` 'know', `xohla-` 'want', `kerak`,
   `yasha-` in the sense 'live (somewhere)' → `state`
3. ongoing with no endpoint (`-yap-`, `-moqda`, `-yotgan`) → `activity`
4. completed with a result (past `-di`, perfect `-gan`, `-ib qo'ydi`) → `performance`
5. ended without a result (`urinib ko'rdi` 'tried') → `endeavor`
6. a single instant (`bir marta taqilladi`) → `semelfactive`
7. an event named by a noun, or nothing above fits → `process`

`have-org-role-92`, `have-role-91`, `have-rel-role-92` take `none`. A future or
hypothetical event (`-adi` for the future, `-moqchi`, `-sa`) gets the aspect it would
have.

**modstr** — how certain the speaker presents the event: `full-affirmative` (asserted:
`keldi`), `partial-affirmative` (likely: `ehtimol`, `shekilli`, presumptive `-dir`, an
event others reported or inferred with `-ibdi`, `-ekan`, `-mish`), `neutral-affirmative`
(possible: `mumkin`, `-ishi mumkin`, ability `o'qiy oladi` for a not yet realised event,
a question, a wish, an intention `-moqchi`), `neutral-negative`, `partial-negative`
(probably not), `full-negative` (asserted not: `kelmadi`, `hech qachon`).

**polarity** — `negative` when the clause negates its event (`-ma-`, `emas`, `yo'q`,
`hech`); otherwise `positive`.

## 5. Output

- `graph`: the fragment, a JSON object `{{"nodes": [...], "edges": [...], "attrs": [...]}}`:
  - `nodes`: `{{"var": "e", "concept": "och", "span": [7, 7]}}`; the **first node is the
    event**, its span the predicate word(s). Add nodes for relation words (`keyin`, ...)
    with their spans.
  - `edges`: `[source, role, target]` between vars, e.g. `["e", "actor", "x1"]`.
  - `attrs`: `[var, role, value]` for constants; usually `[]`.
  Variable names are yours (`e`, `k`, `x1`...); they are renamed later. Each names one
  thing: never use one var for two nodes or placeholders.
- `open`: one placeholder per participant, `{{"var": "x1", "text": ..., "span": [first,
  last]}}`. The text is the **whole phrase** (`yangi maktabni`), its words as written
  (with their suffixes); spans lie inside the clause and leave out the predicate's own
  words and a postposition that only marks the role (`bilan`, `uchun`).
- `outside`: as in section 3.
- `alignment`: the span of the predicate word(s) (a light verb compound: both words).
- `frame`: `{{}}` (Uzbek has no PropBank); for an abstract concept its roles as in the
  table.
- `aspect`, `modstr`, `polarity`: always, as in section 4.

## Tools

There is no Uzbek PropBank and no Uzbek gold annotation: `propbank_lookup` and
`search_annotations` return nothing for Uzbek. To check a rule, call `search_guidelines`
with keywords (`general participant roles`, `light verb`): it returns the matching
sections of the UMR guidelines.

## Input

Sentence: {sent}
Tokens, each with its number: {token_sent}
Language: {lang}

The clause: "{text}"
Its tokens: span {span} (first and last token number, both included)
