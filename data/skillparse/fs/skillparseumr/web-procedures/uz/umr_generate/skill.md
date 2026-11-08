# Skill: the whole UMR of one sentence (wave 0, Uzbek)

You write the **complete Uniform Meaning Representation** of one Uzbek sentence at once: its
sentence-level graph in penman, the alignment of every node to the sentence's tokens (words
with their suffixes), and its document-level annotation (temporal, modal, coreference). A rule
then checks your answer and turns it into the step-by-step annotation, which a person checks
step by step.

Uzbek has **no PropBank** (UMR guidelines Part 3-2-1-1, Stage 0): an event is its verb's stem
with no sense number (`ochdi` → `och`), with the **general participant roles** (`:actor`,
`:undergoer`, `:theme`, `:recipient`, `:experiencer`, `:stimulus`, `:place`, `:goal`,
`:start`, ...). The abstract concepts keep their numbered roles.

The sentence, its tokens and the sentences annotated before it are under **Input** at the end.

## 1. The sentence-level graph (`graph`)

One penman graph, rooted at the sentence's main event (or its discourse relation):

    (s3x / och
        :actor (s3p / prezident)
        :undergoer (s3m / maktab :mod (s3y / yangi))
        :place (s3s / shahar)
        :temporal (s3k / kecha)
        :aspect performance
        :modal-strength full-affirmative)

- **Variables** start with `s` and the sentence number, then a letter and a counter, all
  different: `s3x`, `s3p`, `s3x2`. A node mentioned twice (a reentrancy) is written once and
  then named by its variable.
- **Concepts** are stems without case, possessive, plural or tense suffixes (`maktabni` →
  `maktab`); a light verb compound (`qaror qabul qildi`) is headed by its event noun; auxiliaries
  (`boshla-`, ability `ol-`) are not the head; `kerak` (need) and `xohla-` (want) are.
- Every event gets `:aspect` (`-di` / `-gan` `performance`, `-yap-` / `-moqda` `activity`,
  regular `-adi` `habitual`, states `state`, ...) and `:modal-strength`; `-ma-`, `emas`, `yo'q`
  are `:polarity -`.
- **Non-verbal predication**: `identity-91` (X — Y, X hisoblanadi), `have-mod-91`, `have-place-91`,
  `have-org-role-92`, `have-role-91`, `have-rel-role-92`, `have-91` (X-ning Y-i bor), `exist-91`
  (X bor).
- **Clause combining**: `and` (va), `but-91` (lekin, ammo), `contrast-91` (esa), `consecutive`, ...
- **Entities**: a name with its type and `:name`, its words without case suffixes (`Toshkentda`
  → `"Toshkent"`); dates `date-entity`; quantities `:quant` (`uchta kitob` → `kitob :quant 3`);
  pronouns `person` with `:refer-person` / `:refer-number`; a possessive suffix with no written
  possessor is a pronoun node as `:possessor`; a plural (`-lar`) `:refer-number plural`.
- Reported content (`dedi`, `... deb`, `aytishicha`) takes the reporting event as its `:quote`.

## 2. The alignment (`alignment`)

`{{"s3x": [6, 6], "s3p": [2, 2], ...}}`: for every node, the numbers of its first and last token
as listed in Tokens, both included. A `name` node needs none; a node with no word in the
sentence is left out.

## 3. The document-level annotation (`document`)

    (s3s0 / sentence
        :temporal ((document-creation-time :depends-on s3k)
                   (s3k :overlap s3x))
        :modal ((root :modal author)
                (author :full-affirmative s3x))
        :coref ((s2s :same-entity s3s)))

- **temporal**: every event and time expression of this sentence gets one parent
  (`document-creation-time`, or an event or time of this or an earlier sentence), with `before`,
  `after`, `overlap`, `contained` or `depends-on` ("the child is <label> the parent"); a deictic
  time (`kecha`, `bugun`) `depends-on`.
- **modal**: `(root :modal author)`, then each event's conceiver and strength (the author's, or
  for reported content the speaker's).
- **coref**: each mention in this sentence of something mentioned before links to its closest
  earlier mention (`same-entity`, `same-event`), from the earlier to the current one.
- Name earlier sentences' nodes by the variables their graphs use (under **Input**).

## Tools

There is no Uzbek PropBank and no Uzbek gold annotation: `propbank_lookup` and
`search_annotations` return nothing for Uzbek. `search_guidelines` (keywords) gives the UMR
guidelines.

## Input

Sentence number: {index}
Sentence: {sent}
Tokens, each with its number: {tokens}
Language: {lang}

The sentences before it, as they were annotated:

{before}
