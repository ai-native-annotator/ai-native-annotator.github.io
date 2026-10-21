"""AnCast++ per document, next to Chun & Xue (2024) Table 7.

    python scripts/compare_ancast.py results/umr-tree results/umr-refine

For every <doc>.umr in each results directory, scores it against
its gold .umr (src/gold.py: newdata/, else olddata/gold/<lang>/) with AnCast++ (`python -m ancast -s doc -df umr`),
twice: against the gold as released, and against the gold after the cleanup
Chun & Xue describe (section 2): :modal-strength / :modstr shorthand in a
sentence graph is moved to that sentence's document-level :modal block, and
:AFF becomes :full-affirmative. The same cleanup is applied to the prediction.
A moved relation that the :modal block already has is not added twice.

Writes results/ancast/scores.json and results/ancast/table.md.

Files are first rewritten into the block shape AnCast parses (one blank line
between sections, two between sentences), as umr-skill-parsing's
scripts/run_ancast.py does; the graphs themselves are not changed.
"""
import json
import os
import re
import subprocess
import sys

import penman

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))
import gold as gold_files  # noqa: E402
OUT = os.path.join(ROOT, "results", "ancast")
SECTIONS = ("# sentence level graph:", "# alignment:", "# document level annotation:")
METRICS = ["Sentence", "Modal", "Temporal", "Coref", "Comprehensive"]

# Chun & Xue (2024), Table 7: AnCast++ F1, after their cleanup (and without it)
CHUN = {
    "english_umr-0001": [(69.2, 66.2), (51.4, 40.2), (15.6, 16.2), (8.2, 8.2), (57.9, 55.5)],
    "english_umr-0002": [(90.0, 90.0), (60.0, 60.0), (100.0, 100.0), (0.0, 0.0), (86.2, 86.2)],
    "english_umr-0003": [(75.3, 71.8), (70.0, 53.9), (16.9, 18.2), (58.3, 40.0), (68.6, 63.4)],
    "english_umr-0004": [(61.2, 60.7), (64.5, 65.3), (22.8, 22.8), (26.7, 26.7), (52.1, 51.9)],
    "english_umr-0005": [(55.3, 55.0), (13.8, 12.3), (6.3, 7.3), (19.5, 20.4), (42.8, 42.9)],
    "Macro F1": [(70.2, 68.8), (52.0, 46.3), (32.3, 32.9), (22.5, 19.1), (61.5, 60.0)],
}


def blocks(text):
    out = []
    for chunk in text.split("#" * 80):
        if not chunk.strip():
            continue
        head, sections, current = [], {}, None
        for line in chunk.splitlines():
            marker = next((m for m in SECTIONS if line.strip().startswith(m)), None)
            if marker:
                current = marker
                sections[current] = ""
                continue
            if current:
                sections[current] += line + "\n"
            elif line.strip():
                head.append(line)
        out.append(["\n".join(head), sections])
    return out


def clean(bs):
    """Chun & Xue's cleanup: sentence-graph modal strength moves to the document level."""
    for _, sections in bs:
        graph = sections.get(SECTIONS[0], "").strip()
        doc = sections.get(SECTIONS[2], "")
        doc = re.sub(r":AFF\b", ":full-affirmative", doc)
        moved = []
        if graph:
            try:
                g = penman.decode(graph)
                keep = []
                present = set(re.findall(r"\(\s*author\s+:[\w-]+\s+[^\s()]+\s*\)", doc))
                present = {" ".join(p.split()) for p in present}
                for s, r, t in g.triples:
                    if r in (":modal-strength", ":modstr"):
                        rel = "(author :%s %s)" % (str(t).strip('"'), s)
                        if rel not in present and rel not in moved:    # already there: once is enough
                            moved.append(rel)
                    else:
                        keep.append((s, r, t))
                # the modal strength leaves the sentence graph even when the :modal block
                # already had every relation (then nothing is added to it)
                if len(keep) < len(g.triples):
                    graph = penman.encode(penman.Graph(keep, top=g.top), indent=4)
            except Exception:
                pass
        if moved:
            if ":modal" in doc:
                doc = re.sub(r":modal\s*\(", ":modal (" + " ".join(moved) + " ", doc, count=1)
            elif doc.strip().endswith(")"):
                doc = doc.rstrip()[:-1] + "\n    :modal (" + " ".join(moved) + "))\n"
        sections[SECTIONS[0]] = graph + "\n"
        sections[SECTIONS[2]] = doc
    return bs


def render(bs, heads=None):
    out = []
    for i, (head, sections) in enumerate(bs):
        if heads and i < len(heads):
            head = heads[i]
        pieces = [head.strip()] + ["%s\n%s" % (m, sections.get(m, "").strip()) for m in SECTIONS]
        out.append(re.sub(r"\n{3,}", "\n\n", "\n\n".join(pieces)))
    return "\n\n\n".join(out) + "\n"


AGG = re.compile(r"(Sent Micro|Modality|Temporal|Coref):\s*Precision:\s*([0-9.]+)%\s*Recall:\s*([0-9.]+)%\s*Fscore:\s*([0-9.]+)%")
COMP = re.compile(r"Comprehensive Score:\s*([0-9.]+)%")


def ancast(pred, gold):
    # -o: some AnCast versions fail in doc scope without an output path
    proc = subprocess.run([sys.executable, "-m", "ancast", "-p", pred, "-g", gold, "-s", "doc", "-df", "umr",
                           "-o", os.path.splitext(pred)[0] + ".ancast.csv"],
                          capture_output=True, text=True, timeout=1800, cwd=os.path.dirname(pred))
    text = proc.stdout + proc.stderr
    found = AGG.findall(text)
    f = {m: float(fs) for m, _, _, fs in found}
    prf = [x[1:] for x in found if x[0] == "Sent Micro"]
    comp = COMP.findall(text)
    return {"Sentence": f.get("Sent Micro"), "Modal": f.get("Modality"), "Temporal": f.get("Temporal"),
            "Coref": f.get("Coref"), "Comprehensive": float(comp[-1]) if comp else None,
            "sent_prf": prf[-1] if prf else None,
            "prf": {m: (float(p), float(r)) for m, p, r, _ in found},
            "returncode": proc.returncode, "tail": text[-1500:]}


def main(dirs):
    os.makedirs(OUT, exist_ok=True)
    results = {}
    for d in dirs:
        name = os.path.basename(os.path.normpath(d))
        for doc in sorted(f[:-4] for f in os.listdir(d) if f.endswith(".umr")):
            lang = "zh" if doc.startswith("chinese") else "en"
            gold_path = gold_files.path(doc, lang, ".umr")
            if not os.path.exists(gold_path):
                continue
            with open(gold_path, encoding="utf-8") as f:
                gold_text = f.read()
            with open(os.path.join(d, doc + ".umr"), encoding="utf-8") as f:
                pred_text = f.read()
            heads = [h for h, _ in blocks(gold_text)]
            for variant in ("cleaned", "raw"):
                work = os.path.join(OUT, "input", name, variant)
                os.makedirs(work, exist_ok=True)
                g, p = blocks(gold_text), blocks(pred_text)
                if variant == "cleaned":
                    g, p = clean(g), clean(p)
                gp, pp = os.path.join(work, doc + ".gold.umr"), os.path.join(work, doc + ".pred.umr")
                with open(gp, "w", encoding="utf-8") as f:
                    f.write(render(g))
                with open(pp, "w", encoding="utf-8") as f:
                    f.write(render(p, heads))
                results.setdefault(name, {}).setdefault(variant, {})[doc] = ancast(pp, gp)
                print(name, variant, doc, {k: results[name][variant][doc][k] for k in METRICS}, flush=True)
    with open(os.path.join(OUT, "scores.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    write_table(results)


def write_table(results):
    lines = ["# AnCast++ F1 per document", "",
             "Cleaned gold (Chun & Xue's preprocessing); the raw-gold score is in parentheses.",
             "Chun & Xue (2024) numbers are their Table 7.", ""]
    for metric_i, metric in enumerate(METRICS):
        lines += ["## " + metric, "", "| document | Chun & Xue 2024 | " + " | ".join(results) + " |",
                  "|---|---|" + "---|" * len(results)]
        docs = sorted({d for r in results.values() for v in r.values() for d in v})
        for doc in docs + ["Macro F1"]:
            row = ["%.1f (%.1f)" % CHUN[doc][metric_i] if doc in CHUN else "-"]
            for name, r in results.items():
                if doc == "Macro F1":
                    vals = {}
                    for variant in ("cleaned", "raw"):
                        xs = [v[metric] for v in r.get(variant, {}).values() if v.get(metric) is not None]
                        vals[variant] = sum(xs) / len(xs) if xs else None
                else:
                    vals = {variant: r.get(variant, {}).get(doc, {}).get(metric) for variant in ("cleaned", "raw")}
                row.append("-" if vals["cleaned"] is None else "%.1f (%s)" % (
                    vals["cleaned"], "-" if vals["raw"] is None else "%.1f" % vals["raw"]))
            lines.append("| %s | %s |" % (doc, " | ".join(row)))
        lines.append("")
    with open(os.path.join(OUT, "table.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


if __name__ == "__main__":
    main(sys.argv[1:])
