# data/skillparse — what index.html runs

Everything under `fs/` is copied by `scripts/sync_skillparse.py` from two private repositories and
written into the browser's Python (Pyodide) file system under `/sp/`:

| here | from | what |
|---|---|---|
| `fs/skillparseumr/web-procedures/zh/` | sxndqc/SkillParseUMR @ 4534a9f: `experiment/decision-orchestration/umr-zh-frag/versions/R42`, with `sent_type` from `umr-zh-v11/versions/V12` | **the Chinese procedure**: R42's registry, agent skills (`skill.md`, `reference/example.md`, `tools/`) and rules; `sent_type` is V12's `kind: jev` skill with the modules it imports (`jevlib.py`, `prompt_loader.py`, `event_modifiers.*`) |
| `fs/skillparseumr/web-procedures/en/` | 〃: `skillsets/umr-tree`, with `sent_type` from `umr-en-v11/versions/V12` | **the English procedure**, composed the same way (decision-orchestration has no English agent version) |
| `fs/skillparseumr/web-procedures/tools/` | 〃: `skillsets/tools/propbank.py`; this site: `web_tools/search.py` | `propbank_lookup`, `search_annotations`, `search_guidelines`: the general tools, found next to the procedures as `experiment/rsi-zh2/skills/tools` is found next to its versions (upstream's `get_example` is left out, and the skills' sentences that point to it now point to the two search tools) |
| `fs/skillparseumr/src/` | 〃 | `registry.py` (REGISTRY.md parser and expressions), the UMR input / output handlers (the output handler writes the `.umr` file and its alignment) |
| `fs/skillparseumr/skillsets/tools/propbank.py` | 〃 | the PropBank lookup `jevlib.py` loads |
| `fs/modular-parsing/resources/` | sxndqc/modular-parsing @ 54f1fa3 | UMR lists (CSV), English PropBank arg descriptions, and the PropBank frames: each folder of one XML file per lemma (24,521 Chinese, 5,618 English) merged into one JSON file, `chinese-propbank.json` and `english-propbank/propbank-amr-frames-xml-2018-01-25.json` |

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
two waves (sentence, document), and the document wave reads the sentence wave's trees (its
`skill.md` says so); and `jevlib.py` does not use jieba. There is no antecedent step either (the skill and the four dispatcher rules
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

Every copied `propbank.py` that reads the Chinese frame files is patched by the sync script to read
the merged file instead; the answers are identical to the original for every one of the 24,521
Chinese lemmas.

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

To refresh after the procedures change upstream:

```bash
python3 scripts/sync_skillparse.py ../skillparseumr ../modular-parsing <penman wheel>
```
