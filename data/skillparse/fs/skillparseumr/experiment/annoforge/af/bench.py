"""The three benchmarks behind one interface: what an annotating step sees, how its answer is read, how
documents are written out and scored.

    b = bench.get("umr-zh")            # umr-zh | umr-en | timeml
    doc = b.load(path)
    b.sentence(doc, i)                 the sentence as the annotator sees it
    b.parse(doc, i, text)              (parsed, problems); parsed is None when unusable
    b.show(doc, i, parsed)             parsed -> canonical text (what later steps and sentences see)
    b.gold(doc, i)                     the gold of sentence i, in the same form
    b.write(doc, preds, out, window)   write gold and predicted files -> (gold path, pred path)

The output-format contract (SYSTEM) is fixed by the benchmark, not by the harness: every condition, the
baselines included, gets the same one.
"""
import os

import tml
import umr

UMR_SYSTEM = """You annotate {language} text in Uniform Meaning Representation (UMR), one sentence at a time.

Output format. The annotation of sentence number N is written exactly as a .umr file writes one sentence, in three sections:

# sentence level graph:
(a PENMAN graph; every variable is sN followed by a letter and optional digits, e.g. s3x, s3p2 in sentence 3)

# alignment:
(one line per variable of the graph: `variable: start-end`, the 1-based positions of the words it is aligned to, as the words are numbered in the input; `0-0` when it is aligned to no word)

# document level annotation:
(sNs0 / sentence
    :temporal ((a :relation b) ...)
    :modal ((a :relation b) ...)
    :coref ((a :relation b) ...))

In the document level annotation, a and b are variables of this sentence or of earlier sentences, or constants; leave out a group that has no relation. Write nothing but the three sections."""

TIMEML_SYSTEM = """You annotate English news text in TimeML (TimeML 1.2.1, as in TimeBank 1.2 and TempEval-3), one sentence at a time.

Output format. The annotation of sentence number N is:
1. the sentence, unchanged character for character, with inline tags: <TIMEX3 tid="tN_1" type="..." value="...">...</TIMEX3> for time expressions and <EVENT eid="eN_1" class="..." tense="..." aspect="..." polarity="..." pos="..." modality="...">...</EVENT> for events (number the ids of sentence N tN_1, tN_2, ... and eN_1, eN_2, ..., e.g. e3_1 in sentence 3; leave out modality when there is none);
2. then the temporal links, one per line: <TLINK eventID="..." relatedToTime="..." relType="..."/>, with eventID or timeID for the first element and relatedToEvent or relatedToTime for the second. t0 is the document creation time; a link may point to an element of an earlier sentence by its id.
SIGNAL, SLINK and ALINK are not used here. Write nothing but the tagged sentence and the TLINK lines."""

TASKS = {
    "rewrite": "Return the complete annotation of sentence {i}, in the output format.",
    "check": "Do not rewrite the annotation. Return findings: each one a problem in the current annotation of "
             "sentence {i} and how to fix it. Return an empty list when you find nothing wrong.",
}


class UMR:
    scheme = "umr"
    context = 5

    def __init__(self, lang):
        self.lang = lang
        self.name = "umr-" + lang
        self.system = UMR_SYSTEM.format(language="Chinese" if lang == "zh" else "English")

    def load(self, path):
        return umr.load(path)

    def sentence(self, doc, i):
        s = doc["sents"][i - 1]
        return "Sentence %d, its words numbered:\n%s" % (i, umr.numbered(s))

    def text(self, doc, i):
        return doc["sents"][i - 1]["text"]

    def parse(self, doc, i, text):
        return umr.parse_annotation(i, text)

    def show(self, doc, i, parsed):
        return umr.as_text(parsed)

    def gold(self, doc, i):
        return umr.as_text(umr.normalise(i, doc["sents"][i - 1]["gold"]))

    def header(self, doc):
        return "Document %s." % doc["name"]

    def write(self, doc, preds, out, window=None):
        """window: (start, n) for a training window, else the whole document."""
        os.makedirs(out, exist_ok=True)
        if window:
            gold, pred = umr.window_files(doc, window[0], window[1], preds)
        else:
            gold, pred = umr.gold_umr(doc), umr.render_pred(doc, None, preds)
        gp, pp = os.path.join(out, doc["name"] + ".gold.umr"), os.path.join(out, doc["name"] + ".umr")
        for p, t in ((gp, gold), (pp, pred)):
            with open(p, "w", encoding="utf-8") as f:
                f.write(t)
        return gp, pp


class TimeML:
    scheme = "timeml"
    context = 5
    name = "timeml"
    lang = "en"
    system = TIMEML_SYSTEM

    def load(self, path):
        return tml.load(path)

    def sentence(self, doc, i):
        return "Sentence %d:\n%s" % (i, doc["sents"][i - 1]["text"])

    def text(self, doc, i):
        return doc["sents"][i - 1]["text"]

    def parse(self, doc, i, text):
        tx, ev, ln, problems = tml.parse_annotation(doc["sents"][i - 1], text)
        if not tx and not ev and not ln and "<" in text and problems:
            return None, problems
        bad = [x["id"] for x in tx if not x["id"].startswith("t%d_" % i)] + \
              [x["id"] for x in ev if not x["id"].startswith("e%d_" % i)]
        if bad:
            problems.append("ids not numbered for sentence %d: %s" % (i, ", ".join(bad[:6])))
        return (tx, ev, ln), problems

    def show(self, doc, i, parsed):
        return tml.display(doc, i, parsed)

    def gold(self, doc, i):
        return tml.gold_sentence(doc, i)

    def header(self, doc):
        d = doc["dct"] or {}
        return "Document %s. Document creation time t0: %s (value %s)." % (doc["name"], d.get("text", ""), d.get("value", ""))

    def write(self, doc, preds, out, window=None):
        os.makedirs(os.path.join(out, "gold"), exist_ok=True)
        os.makedirs(os.path.join(out, "pred"), exist_ok=True)
        if window:
            gold, pred = tml.window_files(doc, window[0], window[1], preds)
        else:
            with open(doc["path"], encoding="utf-8") as f:
                gold = f.read()         # the official key itself
            pred = tml.render_pred(doc, None, preds)
        gp = os.path.join(out, "gold", doc["name"] + ".tml")
        pp = os.path.join(out, "pred", doc["name"] + ".tml")
        for p, t in ((gp, gold), (pp, pred)):
            with open(p, "w", encoding="utf-8") as f:
                f.write(t)
        return gp, pp


def get(name):
    if name == "umr-zh":
        return UMR("zh")
    if name == "umr-en":
        return UMR("en")
    if name == "timeml":
        return TimeML()
    raise ValueError(name)
