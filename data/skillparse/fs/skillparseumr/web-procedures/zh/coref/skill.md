# Skill: coreference of one sentence

You annotate the **coreference** of the current sentence (the last one in the input) for a
Uniform Meaning Representation document. Modal dependencies are made by rule and temporal
dependencies by another step: write neither.

The input (under **Input** at the end) gives the language and the current sentence with up to
five sentences before it. Each sentence has its number, its text and a table of its nodes:
`node` (how you name it), `text` (the full span it covers), `concept`, `kind` (`event`,
`event (nominal)` or `entity`) and `step` (the step that built it; `stop` is a leaf, an entity).

## What to write

Each link is
`{{"group": "coref", "source": earlier mention, "relation": "same-entity" or "same-event", "target": current mention}}`.

- **Complete**: every mention in the current sentence of something already mentioned (in an
  earlier sentence of the input, or earlier in this sentence as a node of its own) is linked to
  its **closest** earlier mention. Each missed link leaves a mention outside its chain: link
  every new mention of a named person or organization already seen (full name, short name, title
  + name, pronoun), however far back in the input.
- **Only this sentence and its context**: the target is always a node of the current sentence;
  the source is a node of the current sentence or of an earlier sentence in the input. Name nodes
  exactly as the tables do (`"3:0.1"`, `"3:0.1/x"` for another node of that step's fragment).
- **Point at the entity**, never at its `name` node.
- `same-event` when either node is an event (a predicate's node, a concept with a sense such as
  爆炸-01, or a noun naming an occurrence: 演唱会, 比赛, 事件, X案, a named `show`); otherwise
  `same-entity` (people, things, places, organizations, works).

## What links

- A pronoun to its antecedent. A plural 他们 / 它们 for a group links to the group's node (an
  ethnic group, an organization, the `and` of people), never to one person; 他们 acting as a
  publication (他们报导, 他们的标语) joins the publication's chain, never its staff.
- A repeated name, also of a city or place; a definite description (该台 / 该公司 is the station or
  company, never one of its channels). With two earlier nodes of the same type (two companies),
  check the name before choosing.
- A full name and an alias joined by `identity-91` (X委员会（ABC）): the alias (identity-91's ARG2,
  named with `/var`) is the chain's mention; later mentions (ABC, 当局) link to it.
- In a document about one work (an episode, film, book), every later mention (这集, 本片, 该剧, its
  title) joins the work's named node (`show` / `book`), never a common noun 集 inside a
  description (第N集).
- A noun that sums up an earlier event (此事, 事件, X案, 此限制 after 不允许X): `same-event` with
  that event. The event inside an agent or patient noun (袭击 in 袭击者, 死 in 死者, with `/var`):
  `same-event` with the earlier mention of that occurrence, even with another verb (身亡).

## What does not link

Two different things of one kind (a newspaper, its parent company, its reports and the people
writing them); an event with an entity (报导-01 with 文); an abstract noun (目的, 内容) with a
publication; generic or kind mentions (外星人 meaning aliens in general); repeated background
states (临近尾声); the nominal 发行 of 发行量, or figures from different periods. `same-event` only
for the very same occurrence retold.

## Examples

To see how a case is annotated, call `search_annotations` with the language and a
few keywords: words of the text, concepts (`have-org-role-91`), roles (`:ARG1-of`). It
returns whole gold sentence annotations that contain them. To check a rule, call
`search_guidelines` with keywords: it returns the matching sections of the UMR guidelines.

## Input

Language: {lang}

{sentences}
