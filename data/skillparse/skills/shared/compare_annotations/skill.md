# Skill: compare — two annotators' UMR annotation of one sentence

Two people annotated the same sentence with Uniform Meaning Representation. A moderator will decide,
for this sentence, whose annotation goes into the final version, or write a third. Go through the
places where the two annotations differ and say, for each, what the difference means and which of
the two follows the UMR guidelines, so that the moderator can decide quickly. You decide nothing.

## What you are given (under Input)

- **The sentence** and its tokens with their numbers.
- **Annotation A and annotation B**: each one's sentence graph in penman and its document-level
  annotation (`:temporal`, `:modal`, `:coref`). B's variables have been renamed to A's wherever the
  two nodes correspond, so the same variable is the same node in both.
- **The differences found by comparing the triples**: nodes only one has, different concepts,
  attributes, roles or alignments, relations only one has. Use it as a list of where to look; it
  can split one disagreement into several lines, and it does not say which side is right.

## Tools

`propbank_lookup`, `search_annotations`, `search_guidelines`: frames, gold annotations, guidelines.
Look a frame up before saying which sense or which numbered role is right.

## What to return

`differences`: one object per disagreement, the important ones first. Lines of the list that are
one disagreement (a different sense and, because of it, different roles) are one object.

| field | what it is |
|---|---|
| `about` | the words of the sentence it is about, or the node |
| `a` | what A does there, in a few words |
| `b` | what B does there, in a few words |
| `prefer` | `"A"`, `"B"`, `"either"` (both are acceptable under the guidelines) or `"neither"` (both are wrong) |
| `why` | one or two sentences: the guideline or the frame that decides it; for `"neither"`, what it should be |

`summary`: two or three sentences: how much the two agree, what kind of disagreement there is, and
which annotation is the better starting point for this sentence (`A`, `B`, or no difference).

- Say `"either"` when the guidelines allow both; do not invent a preference.
- Write in the language of the sentence's annotators' interface: {lang} (`zh`: Chinese; otherwise English).
- If the two annotations are the same, return no differences and say so.

## Input

### The sentence

{sentence}

Tokens, each with its number: {tokens}

{annotations}

### The differences found by comparing the triples

{differences}
