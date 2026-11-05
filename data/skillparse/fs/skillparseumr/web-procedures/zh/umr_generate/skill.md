# Skill: the whole UMR of one sentence (wave 0)

You write the **complete Uniform Meaning Representation** of one Chinese sentence at once: its
sentence-level graph in penman, the alignment of every node to the sentence's tokens (one token
per character), and its document-level annotation (temporal, modal, coreference). A rule then
checks your answer and turns it into the step-by-step annotation (sentence types, predicates,
noun phrases, names, document relations), which a person checks step by step.

The sentence, its tokens and the sentences annotated before it are under **Input** at the end.

## 1. The sentence-level graph (`graph`)

One penman graph, rooted at the sentence's main event (or its discourse relation):

    (s3x / 拥有-01
        :ARG0 (s3x2 / 周报 :mod (s3x3 / 该))
        :ARG1 (s3x4 / 节目 :mod (s3x5 / 电视))
        :aspect state
        :modal-strength full-affirmative)

- **Variables** start with `s` and the sentence number, then a letter and a counter, all
  different: `s3x`, `s3p`, `s3x2`. A node mentioned twice (a reentrancy) is written once and
  then named by its variable.
- **Concepts are Chinese words as written** (`周报`, `节目`); an event is the word with its
  Chinese PropBank sense (`拥有-01`), found with `propbank_lookup` (give the word and every
  alternate form in one call); a word not in PropBank is `<word>-00`. Numbered roles as the
  roleset lists them; other roles as UMR names them (`:time`, `:temporal`, `:place`, `:manner`,
  `:purpose`, `:condition`, `:mod`, `:quant`, `:unit` for a classifier, ...).
- 了 / 着 / 过 are aspect, not nodes; a light verb (进行, 作出) is not the head, its event noun is;
  是……的 focuses a part (the head is the verb inside); 没 / 不 is `:polarity -`.
- Every event gets `:aspect` (`habitual`, `state`, `activity`, `performance`, `endeavor`,
  `process`, ...), and `:modal-strength` (`full-affirmative`, `partial-affirmative`,
  `neutral-affirmative`, ..., `full-negative`).
- **Non-verbal predication** uses the abstract concepts: `identity-91`, `have-mod-91`,
  `have-place-91`, `have-org-role-92`, `have-role-91`, `have-rel-role-92`, `have-91`, `exist-91`.
- **Clause combining**: `and`, `but-91`, `contrast-91`, `consecutive`, `have-cause-91`, ...
- **Entities**: a name is a type concept with `:name (n / name :op1 ...)`, split into words, not
  characters (欧洲议会 → `:op1 "欧洲" :op2 "议会"`); a date `date-entity`; a quantity with
  `:quant` and `:unit`; a pronoun `person` / `thing` with `:refer-person` and `:refer-number`.
- Reported content takes the reporting event as its `:quote`.

## 2. The alignment (`alignment`)

`{{"s3x": [10, 11], "s3x2": [2, 3], ...}}`: for every node, the numbers of its first and last
token (character) as listed in Tokens, both included. A `name` node needs none (its entity has
the span); a node with no word in the sentence is left out.

## 3. The document-level annotation (`document`)

    (s3s0 / sentence
        :temporal ((document-creation-time :before s3x))
        :modal ((root :modal author)
                (author :full-affirmative s3x))
        :coref ((s2x5 :same-entity s3x2)))

- **temporal**: every event and time expression of this sentence gets one parent
  (`document-creation-time`, or an event or time of this or an earlier sentence), with `before`,
  `after`, `overlap`, `contained` or `depends-on` ("the child is <label> the parent"): an
  absolute past date `document-creation-time` `before`; an event with a date `overlap` the date;
  the other events chain to the event before them.
- **modal**: `(root :modal author)`, then each event's conceiver and strength: the author's
  `(author :full-affirmative e)`, or, for reported content, the speaker's: `(author
  :full-affirmative speaker)` `(speaker :<strength> e)`.
- **coref**: each mention in this sentence of something mentioned before links to its closest
  earlier mention (`same-entity`, `same-event`), from the earlier to the current one; point at
  the entity, never at its name node.
- Name earlier sentences' nodes by the variables their graphs use (under **Input**), and only
  write relations with at least one node of this sentence.

## Tools

`propbank_lookup` for the senses of a word; `search_annotations` (language, keywords) for whole
gold annotations of sentences with a construction; `search_guidelines` (keywords) for the UMR
guidelines.

## Input

Sentence number: {index}
Sentence: {sent}
Tokens, each with its number: {token_sent}
Language: {lang}

The sentences before it, as they were annotated:

{before}
