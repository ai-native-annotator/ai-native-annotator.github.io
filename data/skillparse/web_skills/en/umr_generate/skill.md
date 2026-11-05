# Skill: the whole UMR of one sentence (wave 0)

You write the **complete Uniform Meaning Representation** of one sentence at once: its
sentence-level graph in penman, the alignment of every node to the sentence's tokens, and its
document-level annotation (temporal, modal, coreference). A rule then checks your answer and
turns it into the step-by-step annotation (sentence types, predicates, noun phrases, names,
document relations), which a person checks step by step.

The sentence, its tokens and the sentences annotated before it are under **Input** at the end.

## 1. The sentence-level graph (`graph`)

One penman graph, rooted at the sentence's main event (or its discourse relation):

    (s3x / convict-01
        :ARG1 (s3p / person :name (s3n / name :op1 "Edmund" :op2 "Pope"))
        :ARG2 (s3x2 / spy-02 :ARG0 s3p)
        :aspect performance
        :modal-strength full-affirmative)

- **Variables** start with `s` and the sentence number, then a letter and a counter, all
  different: `s3x`, `s3p`, `s3x2`. A node mentioned twice (a reentrancy) is written once and
  then named by its variable (`:ARG0 s3p`).
- **Events**: the PropBank roleset of the lemma (`convict-01`), found with `propbank_lookup`
  (give the lemma and every alternate form in one call); a lemma not in PropBank is
  `<lemma>-01`. Numbered roles as the roleset lists them; other roles as UMR names them
  (`:time`, `:temporal`, `:place`, `:manner`, `:purpose`, `:condition`, `:mod`, ...).
- Every event gets `:aspect` (`habitual`, `state`, `activity`, `performance`, `endeavor`,
  `process`, ...), and `:modal-strength` (`full-affirmative`, `partial-affirmative`,
  `neutral-affirmative`, ..., `full-negative`); a negated event also `:polarity -`.
- **Non-verbal predication** uses the abstract concepts: `identity-91`, `have-mod-91`,
  `have-place-91`, `have-org-role-92`, `have-role-91`, `have-rel-role-92`, `have-91`, `exist-91`.
- **Clause combining**: `and`, `but-91`, `contrast-91`, `consecutive`, `have-cause-91`, ... with
  `:op1` / `:op2` (or `:ARG1` / `:ARG2` for the reified `-91` relations).
- **Entities**: a noun's lemma; a name is a type concept with `:name (n / name :op1 ...)`; a date
  `date-entity` (`:year 2006 :month 2`); a quantity `temporal-quantity`, `monetary-quantity`
  (`:quant`, `:unit`); a pronoun `person` / `thing` with `:refer-person` and `:refer-number`;
  a plural noun `:refer-number plural`.
- Reported content takes the reporting event as its `:quote`.

## 2. The alignment (`alignment`)

`{{"s3x": [4, 4], "s3p": [1, 2], ...}}`: for every node, the numbers of its first and last token
as listed in Tokens (both included). A `name` node needs none (its entity has the span); a node
with no word in the sentence (an implicit `person`, an abstract concept) is left out.

## 3. The document-level annotation (`document`)

    (s3s0 / sentence
        :temporal ((document-creation-time :before s3x)
                   (s3x :after s3x2))
        :modal ((root :modal author)
                (author :full-affirmative s3x))
        :coref ((s1p :same-entity s3p)))

- **temporal**: every event and time expression of this sentence gets one parent
  (`document-creation-time` or an event or time of this or an earlier sentence), with `before`,
  `after`, `overlap`, `contained` or `depends-on` ("the child is <label> the parent").
- **modal**: `(root :modal author)`, then each event's conceiver and strength: the author's
  `(author :full-affirmative e)`, or, for reported content, the speaker's: `(author
  :full-affirmative speaker)` `(speaker :<strength> e)`.
- **coref**: each mention in this sentence of something mentioned before links to its closest
  earlier mention, `same-entity` or `same-event`, from the earlier to the current one.
- Name earlier sentences' nodes by the variables their graphs use (under **Input**), and only
  write relations with at least one node of this sentence.

## Tools

`propbank_lookup` for the senses of a lemma; `search_annotations` (language, keywords) for whole
gold annotations of sentences with a construction; `search_guidelines` (keywords) for the UMR
guidelines.

## Input

Sentence number: {index}
Sentence: {sent}
Tokens, each with its number: {token_sent}
Language: {lang}

The sentences before it, as they were annotated:

{before}
