# data/skillparse — what index.html runs

Everything under `fs/` is copied by `scripts/sync_skillparse.py` from two private repositories and
written into the browser's Python (Pyodide) file system under `/sp/`:

| here | from | what |
|---|---|---|
| `fs/skillparseumr/web-procedures/zh/` | sxndqc/SkillParseUMR @ 4534a9f: `experiment/decision-orchestration/umr-zh-frag/versions/R42`, with `sent_type` from `umr-zh-v11/versions/V12` | **the Chinese procedure**: R42's registry, agent skills (`skill.md`, `reference/example.md`, `tools/`) and rules; `sent_type` is V12's `kind: jev` skill with the modules it imports (`jevlib.py`, `prompt_loader.py`, `event_modifiers.*`) |
| `fs/skillparseumr/web-procedures/en/` | 〃: `skillsets/umr-tree`, with `sent_type` from `umr-en-v11/versions/V12` | **the English procedure**, composed the same way (decision-orchestration has no English agent version) |
| `fs/skillparseumr/web-procedures/tools/` | 〃: `skillsets/tools` | `get_example`, `propbank_lookup`: the general tools, found next to the procedures as `experiment/rsi-zh2/skills/tools` is found next to its versions |
| `fs/skillparseumr/src/` | 〃 | `registry.py` (REGISTRY.md parser and expressions), the UMR input / output handlers (the output handler writes the `.umr` file and its alignment) |
| `fs/skillparseumr/skillsets/tools/propbank.py` | 〃 | the PropBank lookup `jevlib.py` loads |
| `fs/modular-parsing/resources/` | sxndqc/modular-parsing @ 54f1fa3 | UMR lists (CSV), English PropBank arg descriptions, and the PropBank frames: each folder of one XML file per lemma (24,521 Chinese, 5,618 English) merged into one JSON file, `chinese-propbank.json` and `english-propbank/propbank-amr-frames-xml-2018-01-25.json` |

The composition is the only change to the procedures: `registry.yaml` gets `kind: jev` on `sent_type`
and a header saying where everything came from. Each skill then runs as `src/skill_callable.py` runs
it (`js/skillparse/models.js`, `data/skillparse/bridge/sp_bridge.py`):

- `kind: jev` (`sent_type`): its closed questions go to Jev through OpenRouter (`typesafe/jev-1.13`).
- `kind: agent` (every other model skill): `skill.md` filled in and split at `## Input` behind the
  "# Output Format" line, the system prompt of `scripts/run_experiment.py`, the tools found as
  `skill_callable._load` finds them (the skill's `tools/`, its skillset's, the folder's next to it),
  sent to Haiku (`anthropic/claude-haiku-5.5`); the answer comes back through the `final_result`
  output tool and is checked against `emit`, with one retry (`agent.run`'s `retries=1`).
- `kind: rule`: Python, no model.

Every copied `propbank.py` that reads the Chinese frame files is patched by the sync script to read
the merged file instead; the answers are identical to the original for every one of the 24,521
Chinese lemmas. (`get_example` imports `pydantic_ai.RunContext` for its type; the browser has no
pydantic-ai, so the bridge supplies a `RunContext` that carries `deps`, as the Runner passes them.)

The reflection code (`rsi-batch/`) is not copied: the page's own reflection is per step and
human-driven (see `js/skillparse/reflect.js`).

- `bridge/sp_bridge.py` — the only new Python: runs a registry one node at a time for the page,
  draws nothing itself but hands the page each sentence's graph as nodes and edges, and fills in
  alignments the output left at `0-0` on export.
- `docs/` — two sample documents from the experiment's test sets, sentences only (`# :: sntN`,
  `Index:`, `Words:`; no gold).
- `vendor/` — jieba 0.42.1 (MIT; trimmed to the dictionary, `finalseg`, `posseg`) and penman
  1.3.1 (MIT), unpacked into the Python path at boot.

To refresh after the procedures change upstream:

```bash
python3 scripts/sync_skillparse.py ../skillparseumr ../modular-parsing <jieba-0.42.1 dir> <penman wheel>
```
