# data/skillparse — what index.html runs

The page's Python (Pyodide) runs from a file system under `/sp/`, which the worker fills at boot
with the files `MANIFEST.json` lists, at the same paths as here:

```
skills/            every skill, in one place
  zh/ en/ uz/        a language: its skill.md files, and whatever else it has of its own (zh: sent_type's
                     prompts.yaml; uz: registry.yaml with a tokenizer first, and the tokenizer)
  shared/            what every language uses unless it has its own: registry.yaml (the procedure),
                     the rules convert, apply_change, modal; local_change, reflect; sent_type with
                     jevlib.py and prompt_loader.py
  tools/             the tools any skill may call: propbank.py, search.py
  REGISTRY.md        the syntax of registry.yaml
engine/            registry.py (the registry parser and its expressions), umrinputhandler.py (a document's
                   sentences and tokens), umroutputhandler.py (the .umr text)
bridge/            the page's own Python (below)
umr/               UMR's list of discourse relations
docs/              sample documents, sentences only
resources/         what the tools search; not loaded at boot (below)
vendor/            penman 1.3.1 (MIT), unpacked into the Python path at boot
```

**A procedure is `skills/<lang>/` laid over `skills/shared/`.** In `/sp/` each procedure is one
whole folder: a file of `shared/` is written into every procedure that has no file of its own at
that path, so a skill all languages use is edited in one place, and a language that needs its own
version puts a file at the same path in its folder. `python3 scripts/build_manifest.py` writes
`MANIFEST.json` by that rule; run it after adding, moving or deleting a file here
(`test/repository-integrity.test.mjs` fails when it was not).

To add a skill: make its folder under `skills/<lang>/` (or `skills/shared/`), name it in
`skills/shared/registry.yaml` (and in a language's own registry.yaml, if it has one), and write the
manifest again.

The procedures began as SkillParseUMR's (the Chinese one from decision-orchestration's
`umr-zh-frag` R42, the English one from `skillsets/umr-tree`, `sent_type` from V12) and are this
site's files now: nothing here is built from another repository. What was changed since is listed
in `docs/SKILLPARSE.md`, section 14.

## How a skill runs

Each skill runs as SkillParseUMR's `src/skill_callable.py` runs it (`js/skillparse/models.js`, `data/skillparse/bridge/sp_bridge.py`):

- `kind: jev` (`sent_type`): its closed questions go to Jev through OpenRouter (`typesafe/jev-1.13`).
- `kind: agent` (every other model skill): `skill.md` filled in and split at `## Input` behind the
  "# Output Format" line, the system prompt of `scripts/run_experiment.py`, the tools found as
  `skill_callable._load` finds them (the skill's `tools/`, its skillset's, the folder's next to it),
  sent to Haiku; the answer comes back through the `final_result` output tool and is checked
  against `emit`, with one retry (`agent.run`'s `retries=1`). Haiku goes through the OpenRouter key
  (`anthropic/claude-haiku-5.5`) or straight to the Anthropic API with an Anthropic key
  (`claude-haiku-5-5`), as chosen in ⚙.
- `kind: rule`: Python, no model.

pydantic-ai does not run in the browser, and nothing here needs it. Upstream, `src/agent.py` uses it
for two things: the loop that sends the prompt, runs the tool calls the model asks for and takes the
answer from the `final_result` output tool; and validating that answer against `emit`. The browser
does the first in `js/skillparse/models.js` (the same loop over the Anthropic Messages API or an
OpenAI-style chat API; the tools themselves run in Python in the bridge) and the second in the bridge
(`_check_emit`: every `emit` field present, enum values from the list, lists and objects where
declared). A tool whose first parameter is `ctx` is handed the run's context (`ctx.deps`: the
engine and the open document's sentences); the model does not see that parameter.

## bridge/

- `sp_bridge.py` runs a registry one node at a time for the page, hands the page each sentence's
  graph as nodes and edges, and fills in alignments the output left at `0-0` on export.
- `umr_load.py` turns a whole graph into the steps the registry would have built (sent_type, then
  the step of the node's kind with one placeholder per child), so every step can be run again. A
  `.umr` file's annotation, wave 0's generated sentence and a sentence after a local change all
  go through it (`Loader`), and their steps are treated alike from then on. Word alignments are
  converted to characters; a file aligned by characters is read as it is.

## resources/

Not written into the Python file system when the page starts; a tool fetches a file the first
time it needs it (`SP_BASE` + `resources/…`, through Pyodide's `open_url`) and keeps it. Each
folder's `SOURCE.md` says what it was built from; `scripts/build_resources.py` builds them again
from the two upstream repositories when their data changes.

| file | what |
|---|---|
| `resources/gold/zh/gold.json` | 2,278 Chinese gold sentences: `{doc, snt, text, annotation}`, the annotation being the sentence's whole block of the `.umr` file, 3.3 MB (`search_annotations`) |
| `resources/gold/en/gold.json` | 31,147 English gold sentences, the same way, 24.7 MB |
| `resources/guidelines/umr_guidelines.md` | the UMR guidelines, searched by `search_guidelines` in passages |
| `resources/propbank/zh.json`, `en.json` | PropBank: every roleset with its roles and all its examples (`propbank_lookup`) |

`search_annotations` never returns a sentence of the document being annotated (the sample
documents are gold documents too). Uzbek has no PropBank and no gold: both tools answer nothing
for it.
