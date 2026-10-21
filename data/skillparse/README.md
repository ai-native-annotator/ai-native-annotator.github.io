# data/skillparse — what skillparse.html runs

Everything under `fs/` is copied, unchanged, by `scripts/sync_skillparse.py` from two private
repositories, and is written into the browser's Python (Pyodide) file system under `/sp/`:

| here | from | what |
|---|---|---|
| `fs/skillparseumr/src/` | sxndqc/SkillParseUMR @ 4534a9f | `registry.py` (REGISTRY.md parser and expressions), the UMR input / output handlers (the output handler writes the `.umr` file and its alignment) |
| `fs/skillparseumr/experiment/rsi-jev2/skills/K4/` | 〃 | **the Jev skills**: `kind: jev` Python skills (local candidates → Jev closed questions → rule), after RSI round 4 |
| `fs/skillparseumr/experiment/annoforge/harness/umr-{zh,en}/HH/H10/` | 〃 | **the Haiku harness** after 10 RSI rounds: `generate` / `critique` / `finalize` skills, rule steps, lookup tools |
| `fs/skillparseumr/experiment/annoforge/af/` | 〃 | `umr.py`, `bench.py` (+ `tml.py`, `resources.py`): what a harness step sees and how its answer is read |
| `fs/skillparseumr/skillsets/tools/propbank.py` | 〃 | the shared PropBank lookup |
| `fs/modular-parsing/resources/` | sxndqc/modular-parsing @ 54f1fa3 | UMR lists (CSV), English PropBank arg descriptions, and the PropBank frames: each folder of one XML file per lemma (24,521 Chinese, 5,618 English) merged into one JSON file, `chinese-propbank.json` and `english-propbank/propbank-amr-frames-xml-2018-01-25.json` |

Two copied files are changed, and only to read the merged PropBank files (`overrides/`, copied over
the originals by the sync script): `skillsets/tools/propbank.py` (`propbank_lookup`) and
`experiment/annoforge/af/resources.py` (what the harness tools `lookup_frame` / `roleset_lookup` read;
a `propbank-zh/<lemma>.xml` path is served out of the merged file as the same XML text, so the
tools themselves are unchanged). Their answers are identical to the originals for every Chinese
lemma and for samples of 3,000 / 1,500 lemmas through the two harness tools.

The RSI code (reflection rounds, judges, scoring) is not copied: the page's own reflection is
per step and human-driven (see `js/skillparse/reflect.js`).

- `bridge/sp_bridge.py` — the only new Python: runs a registry (or a harness) one node at a time
  for the page, and fills in alignments the output left at `0-0` on export.
- `docs/` — two sample documents, sentences only (`# :: sntN`, `Index:`, `Words:`; no gold).
- `vendor/` — jieba 0.42.1 (MIT; trimmed to the dictionary, `finalseg`, `posseg`) and penman
  1.3.1 (MIT), unpacked into the Python path at boot.

To refresh after the skills change upstream:

```bash
python3 scripts/sync_skillparse.py ../skillparseumr ../modular-parsing <jieba-0.42.1 dir> <penman wheel>
```
