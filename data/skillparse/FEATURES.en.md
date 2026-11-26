# SkillParse workbench: what it does

Step-by-step UMR annotation in the browser: SkillParseUMR's annotation procedure runs in the page itself, with no server. Your model API keys stay in this computer's browser.

## 0. Three ways to work (toolbar: Manual | Expert | Apprentice)

They are three views of the same annotation; switch at any time, and everything is still there.

- **Expert** (for speed): one button, "▶ Generate the document", writes the whole document (several sentences in one answer: graph, alignment, document-level annotation); then you correct it sentence by sentence. While it is written there is a progress bar, the time so far and about how long is left; the first 3 sentences come first, to start on; the model writing later sentences is given every earlier sentence as it is now (your corrections included).
  - The middle shows one sentence: its tool calls (folded), its UMR text (the graph, then the document-level annotation as the file writes it), its drawing (folded; open it to see), its document-level relations. Those are written with **words** (「Republicans」 snt 1 same-entity 「the party」), not variables; a relation's label can be changed, a relation deleted, one added (nodes are picked by their words).
  - **Where to look first**: above a sentence, the places of it that are likely to need a look; the list of sentences counts them (⚠). They come from two sources: what the model said it was least sure of when it generated the document, and rule checks (a sense PropBank lacks, a role its frame lacks, an event without aspect or temporal relation, a node aligned to no word, a placeholder not expanded). Clicking one names its node in the chat.
  - The right is a chat: say what is wrong, the model proposes changes, they are drawn in color on the graph, and Enter applies the ones ticked. The model is always given the whole document and the sentence you are looking at: a comment about this sentence changes only it, "everywhere …" changes every sentence it applies to; each change says its sentence, and a click goes there.
  - The drawing can be changed directly: open "Drawing", click a concept, the words it is aligned to (as 3-4: one concept can stand for several tokens), an attribute's value (aspect …) or a relation's label to change it, Enter keeps it, an attribute left empty goes; the steps underneath and the document-level relations follow.
  - Two nodes that are one concept (Uzbek `sovg'a qildi`): say in the chat "make X and Y one node, sovg'a-qil", and the model merges them (`merge_nodes`); the node is aligned to both words. The Uzbek procedure writes noun + qil-/et-/ber-/ol-/bo'l- as one node (`sovg'a-qil`) when it generates.
  - "Generate this sentence again" takes an optional hint; Enter = right, next sentence; Shift+Enter = previous. No step ids; tool calls stay closed.
- **Apprentice** (for understanding): nothing is generated ahead. One step is on screen: its piece of the sentence, what it decides, the skill's full instructions, what it looked up, its answer, what it hands on. Enter if it is right; otherwise correct it yourself, or Tab to run it again with a hint. The sentence graphs first, then the document level.
- **Manual**: the four panes described below, everything by hand.

## 0.5 Several annotators and moderation (GitHub ▾, and Moderate in the toolbar)

Annotations live in a GitHub repository, and moderation is done entirely with git. First put a GitHub token in ⚙ Settings (kept in this browser only, sent only to api.github.com; a fine-grained token for the one repository is best: Contents read and write, Pull requests read and write).

- **An annotator**: "GitHub ▾ → Open a file from GitHub", give the repository (`owner/name`, or paste the file's address), pick a `.txt` (the text) or `.umr` file, and annotate as usual (in any mode). Then "GitHub ▾ → Submit my annotation": the annotation is written to a branch of your own, `annotate/<your login>/<file>`, and a pull request to the base branch is opened. Without write access the repository is forked to your account first and the pull request comes from the fork. Submitting again updates the same pull request. The annotation of `a.txt` is kept as `a.umr` next to it.
- **The moderator**: switch to Moderate, give the repository and the file, "Find the annotations of this file" lists the open pull requests that annotate it; tick the ones to compare (at least two) and start.
  - **Agreement**: for every two annotators, the Smatch F of the sentence graphs, the F of the document-level relations, and how many sentences are identical. It is computed as Smatch does: the nodes of the two graphs are paired so that as many triples as possible are the same.
  - Sentences that are **identical in all annotations are taken as they are**; in the list ✓ is agreed, ○ is open (with the sentence's F), ● is decided (with whose it is).
  - A sentence that differs: **the two annotations side by side** (the variables of the one on the right renamed to the left one's by the pairing, so the lines can be compared), the lines that differ shaded; below, **the list of differences** (concept, attribute, role, alignment, a node or relation only one has, document-level relations). With more than two annotations, pick the two to compare above.
  - "Have a model explain these differences": the model picked in the toolbar reads both annotations and the list and says, for each difference, what it is, which side it prefers and on what grounds; it can also go through every sentence that differs at once. It advises; it decides nothing.
  - Deciding: "Use this one" on either annotation; or use one and then "✎ Change it myself", which opens the sentence in the expert mode (change it on the drawing or in the chat) — back in Moderate the sentence says "taken from …, then changed by hand". When sentence 3 is one annotator's and sentence 5 another's, document-level relations across sentences are rewritten to the corresponding variables by the pairing; the ones that have no counterpart are left out, and you are told.
  - "Merge into main": the version decided on is written to a new branch `adjudicate/…`, a pull request is opened (its description says which annotations were compared, the agreement table, and whose each sentence is) and merged into the base branch; then the annotators' pull requests are closed with a note (optional). When the base branch is protected and cannot be merged into from here, the pull request stays open to be merged on GitHub.
  - What was fetched and decided is kept in this browser; after a reload the work goes on.

## 1. Procedures and waves

- **Three languages**: Chinese (web-zh), English (web-en), Uzbek (web-uz), picked from the document's language.
- **Wave 1 · generate** (optional): a model writes a sentence's whole graph, alignment and document-level annotation at once, which are then taken apart into the steps of the next two waves.
- **Wave 2 · sentence**: the sentence graph built step by step, one skill per step.
- **Wave 3 · document**: the document level, in three steps side by side (1, 2, 3) that do not touch each other: modal, temporal, coref.
- A document opens on wave 1; it is optional: switch to wave 2 to annotate step by step from the start.

## 2. Documents

- Sample documents come with the page (Chinese, English, Uzbek).
- **Import…**:
  - plain text, one sentence per line or split into sentences automatically;
  - a .umr file, its sentences only (to annotate again) or with its annotation (every loaded step is confirmed, and can still be changed);
  - the language is detected, or you choose it (choose it for Uzbek).
- Imported documents and your progress are kept in this browser; after a reload the page offers to restore them.

## 3. Wave 1: whole sentences

- **umr_generate** writes the sentence's graph (penman), alignment and document-level annotation, looking at every sentence before it as it is now (corrections included). GPT-6.1 Sol by default, Opus 5.5 as an option.
- **convert** checks the result (does the graph parse, are the alignments inside the sentence, are the variables in the document-level annotation there) and, once confirmed, takes it apart into steps of waves 2 and 3, tagged "generated".
- **▶▶ Generate all** generates and converts every sentence in turn, and stops at a sentence that fails.
- **Uzbek is tokenized first**: the rule step tokenizer does more than split at spaces. Punctuation and quotes are split off, forms like 2023-yil, kecha-yu and kelasizmi? are split, and compounds and suffixes are not.
- For a step no model ran (generated in wave 1, or loaded from a .umr file), the page runs a PropBank lookup for each concept with a sense number; you can see them in the "Tool calls" tab.

## 4. Wave 2: step by step

- **The tree of steps**: sent_type decides what a piece is (asking Jev), and hands it to discourse, predicate, np_phrase or special_entity, down to the stop leaves.
- **Each finished step is confirmed** before the sentence's next step starts:
  - **Enter**: confirm and run the next step;
  - **Tab**: re-run with a hint (tell the model what is wrong);
  - **Edit**: change the output yourself. The steps below whose input did not change are kept, and document-level relations that point at this step follow it.
- **Tabs**:
  - Output (Penman);
  - Input & prompt (what the model got);
  - Q&A (Jev's questions and answers);
  - Tool calls (what the model looked up; you can call a tool with your own arguments);
  - Graph (click a node to go to the step that wrote it, hover to see its aligned words);
  - UMR text (the variables are links).
- **All sentences: next step** runs each sentence's next step.
- **Models**: the toolbar switches the model: Anthropic's Haiku, Sonnet, Opus, Fable and OpenAI's GPT-6 Luna, GPT-6.1 Terra, GPT-6.1 Sol, GPT-6 Astra, each from cheap to strong. On wave 1 it picks the model that writes whole sentences; on the other waves, the agent steps' model.
- **Timer**: per sentence and per wave.
- **The four panes fold**: context, skills, the work in the middle and AI; the ⟨ in a pane's title folds it to a strip, and the strip opens it again; the other panes widen.

## 5. Wave 3: the document level

- **modal** is written by a rule (following umr-tool's conversion), with no model call.
- **temporal and coref** are annotated by a model, for the sentence and its relations to the sentences before it.
- Nodes show as `<node: words / concept>`, next to a table of the nodes of this sentence and the ones before it.
- Editing one step leaves the others as they are; when a sentence's graph changes, the relations pointing into it follow.

## 6. The right pane

- **Change this sentence's graph**:
  1. Write a comment on what to change (by variable, by words of the sentence, or by step).
  2. A model reads the sentence's tree of steps and its table of variables, and proposes changes: add or delete a node, change a concept, add or delete a relation, set an attribute (aspect, modstr, …). It looks up skills, PropBank, gold annotations and the guidelines when it needs to.
  3. Look at them in color on the UMR text and the graph: **green** is added, **red struck through** is deleted, **orange** is changed.
  4. Pick the ones to keep and apply them. The steps are made again down to the leaves, so nothing has to be added by hand; untouched steps are kept as they were, and document-level relations follow.
- **Reflect on this step** (the selected step):
  - ① edit the skill yourself;
  - ② correct the output, and the AI finds what in the skill went wrong;
  - ③ say what is wrong, and the AI edits the skill.
  - Proposed edits are shown as diffs and applied only when picked; then you can re-run the step to check.
- Which skill each card uses, what the model is given and which model it uses are set in registry.yaml's `user_panel`.

## 7. Skills and tools

- **The skills column** lists every skill (the right pane's too) and its files: read, edit, save a new version, compare versions, restore the original. A saved version is used from the next run on.
- **The models' tools** (all answer in formatted Markdown):
  - propbank_lookup: every roleset and example of the Chinese and English PropBank;
  - search_annotations: gold annotations;
  - search_guidelines: the UMR guidelines.

## 8. Export

- **.umr**, with the alignment filled in or as produced.
- **Training data (JSONL)**: each step's input and output, for confirmed steps only or for all of them.
- **The work record (JSON)**, and **the skill files you edited**.

## 9. Settings (⚙)

The GitHub token (see 0.5) is here too, kept in this browser only.

Four parts, each of which folds:
- **API keys**: OpenRouter, Anthropic, OpenAI, TypeSafe (Jev), kept in this browser only.
- **Models**: nothing to choose here; models are picked in the toolbar. The service follows the keys: the maker's own key (Anthropic, OpenAI) directly when it is there, else OpenRouter. You see what each kind of call runs now, through which service, and which models can run.
- **Jev**: through TypeSafe directly or through OpenRouter.
- **Other**: how many model calls run at once.
- The interface language: the EN / 中文 button in the toolbar.
