# Skill: the whole UMR of several sentences at once

You write the **complete Uniform Meaning Representation** of every sentence listed under **Input**,
in one answer: for each sentence its sentence-level graph in penman, the alignment of every node to
the sentence's tokens, and its document-level annotation (temporal, modal, coreference). A rule
then checks each sentence and turns it into the step-by-step annotation, which a person corrects
sentence by sentence.

Writing them together is what lets you keep the document consistent: the same thing is annotated
the same way every time it is mentioned (the same concept, the same name structure, the same
entity type), and every later mention is linked to the earlier one.

## Each sentence

Each sentence is written exactly as this procedure writes one sentence alone. Its rules:

{sentence_skill}

## The answer

`sentences`: one object per sentence under Input, in order, each with

- `index`: the sentence's number;
- `graph`: its penman graph; every variable starts with `s` and that sentence's number (`s3x`);
- `alignment`: `{{variable: [first token, last token]}}`, counted in that sentence's own tokens;
- `document`: its document-level annotation, `(s<index>s0 / sentence :temporal (...) :modal (...)
  :coref (...))`.

A document-level relation between two sentences is written **with the later sentence** (the one
whose node is the second mention), and names the earlier sentence's node by its variable there: a
node of one of the sentences before these (given under Input), or of a sentence earlier in your own
answer.

## Tools

`propbank_lookup` for the senses of a word (give all the words of all the sentences you need in as
few calls as you can); `search_annotations` (language, keywords) for whole gold annotations of
sentences with a construction; `search_guidelines` (keywords) for the UMR guidelines.

## Input

Language: {lang}

The sentences to annotate:

{sentences}

The sentences before them, as they were annotated:

{before}
