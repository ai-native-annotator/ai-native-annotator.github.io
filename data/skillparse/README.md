# data/skillparse — what index.html runs

Everything under `fs/` is copied by `scripts/sync_skillparse.py` from two private repositories and
written into the browser's Python (Pyodide) file system under `/sp/`:

| here | from | what |
|---|---|---|
| `fs/skillparseumr/experiment/decision-orchestration/umr-zh-v11/versions/V12/` | sxndqc/SkillParseUMR @ 4534a9f | **the Chinese procedure**: `kind: jev` skills (rules list the options, Jev or Haiku answers closed questions, rules assemble), questions and options in each skill's `prompts.yaml`, after 12 rounds of measured reflection |
| `fs/skillparseumr/experiment/decision-orchestration/umr-en-v11/versions/V12/` | 〃 | **the English procedure**, the same way |
| `fs/skillparseumr/src/` | 〃 | `registry.py` (REGISTRY.md parser and expressions), the UMR input / output handlers (the output handler writes the `.umr` file and its alignment) |
| `fs/skillparseumr/skillsets/tools/propbank.py` | 〃 | the shared PropBank lookup |
| `fs/modular-parsing/resources/` | sxndqc/modular-parsing @ 54f1fa3 | UMR lists (CSV), English PropBank arg descriptions, and the PropBank frames: each folder of one XML file per lemma (24,521 Chinese, 5,618 English) merged into one JSON file, `chinese-propbank.json` and `english-propbank/propbank-amr-frames-xml-2018-01-25.json` |

Who answers the closed questions is set per skill (`js/skillparse/models.js`, the browser's
version of `src/jev.py`): `sent_type` and `discourse` ask Jev through OpenRouter
(`typesafe/jev-1.13`); `predicate`, `np_phrase`, `special_entity` and `document` ask Haiku
(`anthropic/claude-haiku-5.5`) directly, the same questions written out as `src/jev.py` writes them
for a language model. There is no cascade. The Skills pane switches a skill between the two.

One copied file is changed, and only to read the merged PropBank file (`overrides/`, copied over
the original by the sync script): `skillsets/tools/propbank.py`. Its answers are identical to the
original for every one of the 24,521 Chinese lemmas.

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
