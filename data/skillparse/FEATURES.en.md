# SkillParse workbench: what it does

Step-by-step UMR annotation in the browser: SkillParseUMR's annotation procedure runs in the page itself, with no server. Your model API keys stay in this computer's browser.

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

- **umr_generate** writes the sentence's graph (penman), alignment and document-level annotation, looking at the five sentences before it. GPT-6.1 Sol by default, Opus 5.5 as an option.
- **convert** checks the result (does the graph parse, are the alignments inside the sentence, are the variables in the document-level annotation there) and, once confirmed, takes it apart into steps of waves 2 and 3, tagged "generated".
- **▶▶ Generate all** generates and converts every sentence in turn, and stops at a sentence that fails.
- **Uzbek is tokenized first**: the rule step tokenizer does more than split at spaces. Punctuation and quotes are split off, forms like 2023-yil, kecha-yu and kelasizmi? are split, and compounds and suffixes are not.
- On conversion, the page runs a PropBank lookup for each concept with a sense number; you can see them in the "Tool calls" tab.

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
- **Models**: the toolbar switches the model each kind of step uses.
- **Timer**: per sentence and per wave.

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

- The service and model for each kind of call (the agent steps, wave 1 generation, reflection), and its API key (kept in this browser only).
- How many model calls run at once.
- The interface language: the EN / 中文 button in the toolbar.
