# data/skillparse — what index.html runs

The page's Python (Pyodide) runs from a file system under `/sp/`, which the worker fills at boot
from `MANIFEST.json`: `{path under /sp: the file here that holds it}`. Three folders hold those
files, each file once:

- `fs/`: what `scripts/sync_skillparse.py` copies from two private repositories (and patches);
- `web_skills/`, `web_tools/`: the site's own skills and tools, which the manifest puts into
  every procedure that uses them;
- `bridge/`, `docs/`: the page's Python and the sample documents, at the same paths under `/sp/`.

A file several procedures share (`prompt_loader.py`, the site's `convert.py`, …) is not copied
into each: the manifest points their paths at the one file, so an edit is made in one place.
After adding or removing a file, `python3 scripts/sync_skillparse.py --manifest` writes the
manifest again (and deletes a copy under `fs/` of a file kept elsewhere);
`test/repository-integrity.test.mjs` fails on a copy or a path with no file.

What is under `/sp/`, and where it came from:

| under `/sp/` | from | what |
|---|---|---|
| `skillparseumr/web-procedures/zh/` | sxndqc/SkillParseUMR @ 4534a9f: `experiment/decision-orchestration/umr-zh-frag/versions/R42`, with `sent_type` from `umr-zh-v11/versions/V12` | **the Chinese procedure**: R42's registry, agent skills (`skill.md`, `tools/`; their `reference/example.md` is left out) and rules; `sent_type` is V12's `kind: jev` skill with the modules it imports (`jevlib.py`, `prompt_loader.py`, `event_modifiers.*`) |
| `skillparseumr/web-procedures/en/` | 〃: `skillsets/umr-tree`, with `sent_type` from `umr-en-v11/versions/V12` | **the English procedure**, composed the same way (decision-orchestration has no English agent version) |
| `skillparseumr/web-procedures/*/umr_generate/`, `convert/` | this site: `web_skills/<lang>/umr_generate`, `web_skills/convert` | **wave 0** (`generate`, added to every procedure): `umr_generate` writes a sentence's whole graph, alignment and document-level annotation at once (its own model, GPT-6.1 Sol by default); the rule `convert` checks it, and the bridge loads it into the sentence and document waves as a `.umr` file is loaded |
| `skillparseumr/web-procedures/*/local_change/`, `apply_change/`, `reflect/` | this site: `web_skills/local_change`, `web_skills/apply_change`, `web_skills/reflect` | **the right pane** (registry `user_panel`, not a wave; registry.py is patched to allow the key): `local_change` proposes changes to one sentence's graph from a person's comment (its tool `call_skill` reads a skill of the procedure), `apply_change` (a rule) applies the ones the person picked and the bridge makes the sentence's steps again from the new graph, `reflect` is the reflection on one step |
| `skillparseumr/web-procedures/uz/` | the English procedure above, composed again | **the Uzbek procedure**: the English registry, sent_type and jevlib (told about Uzbek: its function words and pronouns), with this site's Uzbek skill files (`web_skills/uz/`); wave 0 starts with the rule `tokenizer` (`web_skills/tokenizer`), whose tokens become the sentence's. Uzbek has no PropBank (an event is its verb stem, with the general participant roles) and no gold: `propbank_lookup` and `search_annotations` answer nothing for it |
| `skillparseumr/web-procedures/tools/` | this site: `web_tools/propbank.py`, `web_tools/search.py` | `propbank_lookup`, `search_annotations`, `search_guidelines`: the general tools, found next to the procedures as `experiment/rsi-zh2/skills/tools` is found next to its versions (upstream's `get_example` is left out, and the skills' sentences that point to it now point to the two search tools) |
| `skillparseumr/src/` | 〃 | `registry.py` (REGISTRY.md parser and expressions), the UMR input / output handlers (the output handler writes the `.umr` file and its alignment) |
| `skillparseumr/skillsets/tools/propbank.py` | this site: `web_tools/propbank.py` | the PropBank lookup `jevlib.py` loads (its `_rolesets`) |
| `modular-parsing/resources/` | sxndqc/modular-parsing @ 54f1fa3 | UMR lists (CSV) |
| `resources/propbank/zh.json`, `en.json` (here, not under `/sp/`) | 〃: `resources/chinese-propbank/*.xml`, `resources/english-propbank/propbank-amr-frames-xml-2018-01-25/*.xml` | PropBank, each folder of one XML file per lemma merged into one file: every roleset with its roles and all its examples (a Chinese example's words from its treebank parse, traces kept); fetched by `propbank_lookup` on its first call, which answers in Markdown |

`resources/` is not written into the Python file system when the page starts; the search tools
fetch a file the first time they need it (`SP_BASE` + `resources/…`, through Pyodide's
`open_url`) and keep it:

| here | from | what |
|---|---|---|
| `resources/gold/zh/gold.json` | SkillParseUMR `newdata/` (31 documents), modular-parsing `resources/real-umr-data/chinese/umr_data/` (4) | 2,278 Chinese gold sentences: `{doc, snt, text, annotation}`, the annotation being the sentence's whole block of the `.umr` file (words, sentence-level graph, alignment, document-level annotation), 3.3 MB |
| `resources/gold/en/gold.json` | SkillParseUMR `newdata/umr_en_normalized/` (580 documents) | 31,147 English gold sentences, the same way, 24.7 MB |
| `resources/guidelines/umr_guidelines.md` | SkillParseUMR `experiment/annoforge/guidelines/umr_guidelines.md` (umr4nlp/umr-guidelines `guidelines.md`, sha256-checked) | the UMR guidelines, searched by `search_guidelines` in passages (a section, or about 3,000 characters of a long one, with its heading path) |

`search_annotations` never returns a sentence of the document being annotated (the sample
documents are gold documents too).

The composition makes these changes to the procedures: `registry.yaml` gets `kind: jev` on
`sent_type` and a header saying where everything came from; the `coverage` rule is left out (its
registry entry and the dispatcher rules that ran it); discourse's `relation` is any string (it is not checked against a list of
values); the reentrancy wave is left out, so there are
two waves (sentence, document), and the document wave reads, for this sentence and the five
before it, a table of each sentence's nodes made from the sentence wave's tree (`sentences`,
`pick: table`, `RegistryEngine._table`: each node's id, full span, concept, event or entity, and
the step that built it) instead of the trees (its `skill.md` says so); and `jevlib.py` does not use jieba. There is no antecedent step either (the skill and the four dispatcher rules
that started it are left out): a participant written outside a piece stays in its step's
`outside`. Re-entrancy is merged when the `.umr` is written (`RegistryEngine.merges`): nodes with
the same span and the same concept are one node, and an `outside` participant joins the node with
its span (and its concept, when the item names it: one loaded from a file does). The reentrancy
and antecedent rules (`reentrancy/`, `antecedent/`) are not copied. sent_type
needs no words, so a Chinese piece is cut only at punctuation (a run of characters between
punctuation marks is one word) and English keeps its tokens. Each skill then runs as `src/skill_callable.py` runs
it (`js/skillparse/models.js`, `data/skillparse/bridge/sp_bridge.py`):

- `kind: jev` (`sent_type`): its closed questions go to Jev through OpenRouter (`typesafe/jev-1.13`).
- `kind: agent` (every other model skill): `skill.md` filled in and split at `## Input` behind the
  "# Output Format" line, the system prompt of `scripts/run_experiment.py`, the tools found as
  `skill_callable._load` finds them (the skill's `tools/`, its skillset's, the folder's next to it),
  sent to Haiku; the answer comes back through the `final_result` output tool and is checked
  against `emit`, with one retry (`agent.run`'s `retries=1`). Haiku goes through the OpenRouter key
  (`anthropic/claude-haiku-5.5`) or straight to the Anthropic API with an Anthropic key
  (`claude-haiku-5-5`), as chosen in ⚙.
- `kind: rule`: Python, no model.

SkillParseUMR's `propbank.py` (in `skillsets/tools/` and R42's predicate and np_phrase `tools/`) is replaced by the site's `web_tools/propbank.py`; the Chinese rolesets and roles are the same as the original's for every one of the 24,521 lemmas, and every English roleset of `propbank-amr-frame-arg-descr.txt` (8,733) is there.

pydantic-ai does not run in the browser, and nothing here needs it. Upstream, `src/agent.py` uses it
for two things: the loop that sends the prompt, runs the tool calls the model asks for and takes the
answer from the `final_result` output tool; and validating that answer against `emit`. The browser
does the first in `js/skillparse/models.js` (the same loop over the Anthropic Messages API or an
OpenAI-style chat API; the tools themselves run in Python in the bridge) and the second in the bridge
(`_check_emit`: every `emit` field present, enum values from the list, lists and objects where
declared). The one import of pydantic-ai left is `search_annotations`' type annotation
(`ctx: RunContext[dict]` in `web_tools/search.py`); the bridge registers a small `pydantic_ai`
module whose `RunContext` only carries `deps`, which is all the tool reads.

The reflection code (`rsi-batch/`) is not copied: the page's own reflection is per step and
human-driven (see `js/skillparse/reflect.js`).

- `bridge/sp_bridge.py` — the new Python that runs a registry one node at a time for the page,
  draws nothing itself but hands the page each sentence's graph as nodes and edges, and fills in
  alignments the output left at `0-0` on export.
- `bridge/umr_load.py` — loads an existing `.umr` file's annotation into the steps, as the registry
  would have built them (sent_type, then the step of the node's kind with one placeholder per
  child), so every step can be run again. Word alignments are converted to characters; a file
  aligned by characters is read as it is. A re-entrancy is an antecedent step merged into its
  node; the document-level relations are the document step's output.
- `docs/` — two sample documents from the experiment's test sets, sentences only (`# :: sntN`,
  `Index:`, `Words:`; no gold).
- `vendor/` — penman 1.3.1 (MIT), unpacked into the Python path at boot. There is no word
  segmenter: the input handler numbers Chinese one character per token, and nothing cuts words.

To refresh after the procedures change upstream (this writes `fs/`, `resources/`, `docs/` and the
manifest again):

```bash
python3 scripts/sync_skillparse.py ../skillparseumr ../modular-parsing <penman wheel>
```
