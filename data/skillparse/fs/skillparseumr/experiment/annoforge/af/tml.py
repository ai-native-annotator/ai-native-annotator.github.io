"""TimeML documents as sentences, for a harness that annotates one sentence at a time.

    doc = load("resources/te3/key/AP_20130322.tml")
    doc["sents"]        [{index, start, end, text}], character offsets into doc["text"]
    gold_tml(doc, n)    the gold of the first n sentences as a .tml text (all of them when n is None)
    parse_annotation(sentence, text)  a model's annotation of one sentence -> (timexes, events, links, problems)
    render_pred(doc, n, per_sentence)  the predictions of the first n sentences as a .tml text

The TEXT has no sentence tags. Sentences are split at a full stop, question or exclamation mark followed by
white space and an upper-case letter, digit or quote, and at blank lines; a split that would cut a gold tag
is undone. Abbreviations that end with a full stop (Mr., U.S., Jan.) do not end a sentence.
"""
import html
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, os.path.join(ROOT, "src"))
import timeml  # noqa: E402

ABBREV = {"mr", "mrs", "ms", "dr", "prof", "sen", "rep", "gov", "gen", "col", "lt", "sgt", "st", "jr", "sr",
          "inc", "corp", "co", "ltd", "no", "vs", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep",
          "sept", "oct", "nov", "dec", "u.s", "u.n", "u.k", "a.m", "p.m", "e.g", "i.e", "etc", "mt", "ft",
          "calif", "conn", "fla", "ga", "ill", "mass", "mich", "minn", "n.y", "n.j", "pa", "tenn", "tex",
          "va", "wash", "wis", "ariz", "colo", "del", "ind", "kan", "ky", "la", "md", "mo", "nev", "okla",
          "ore", "d.c", "s.a", "n.v", "bros", "dept", "est", "fig", "approx", "messrs"}
END = re.compile(r"[.!?][\"')\]]*\s+(?=[\"'(\[]?[A-Z0-9\"'])")


def split(text):
    """[(start, end)] of the sentences of text; white space between them belongs to no sentence."""
    cuts = set()
    for m in re.finditer(r"\n\s*\n", text):
        cuts.add(m.start())
    for m in END.finditer(text):
        word = re.search(r"([A-Za-z.]+)[.!?][\"')\]]*$", text[max(0, m.start() - 12):m.start() + 1])
        if text[m.start()] == "." and word:
            w = word.group(1).lower().rstrip(".")
            if w in ABBREV or (len(w) == 1 and w.isalpha()):
                continue
        cuts.add(m.start() + 1 + len(re.match(r"[\"')\]]*", text[m.start() + 1:]).group(0)))
    spans, start = [], 0
    for c in sorted(cuts) + [len(text)]:
        piece = text[start:c]
        if piece.strip():
            lead = len(piece) - len(piece.lstrip())
            spans.append((start + lead, start + len(piece.rstrip())))
        start = c
    return spans


def load(path):
    doc = timeml.parse(path)
    doc["name"] = os.path.basename(path)[:-4]
    doc["path"] = path
    spans = split(doc["text"])
    # a gold tag must not cross a sentence boundary: merge the sentences it touches
    for e in doc["entities"]:
        while True:
            i = next((k for k, (s, t) in enumerate(spans) if s <= e["start"] < t), None)
            if i is None or e["end"] <= spans[i][1] or i + 1 >= len(spans):
                break
            spans[i:i + 2] = [(spans[i][0], spans[i + 1][1])]
    doc["sents"] = [{"index": k + 1, "start": s, "end": t, "text": doc["text"][s:t]} for k, (s, t) in enumerate(spans)]
    return doc


def _kept(doc, n):
    limit = doc["sents"][n - 1]["end"] if n else len(doc["text"])
    return limit, [e for e in doc["entities"] if e["end"] <= limit]


def gold_items(doc, n=None, lo=0):
    """(timexes, events, links) of the gold in the first n sentences (from character lo on), in render()'s form."""
    limit, ents = _kept(doc, n)
    ents = [e for e in ents if e["start"] >= lo]
    timexes, events, ids = [], [], set()
    inst = {}           # eid -> instance attrs (the first instance; TE3 docs have one per event)
    eiid_to_eid = {}
    for k, v in doc["instances"].items():
        eiid_to_eid[k] = v["eid"]
        inst.setdefault(v["eid"], v["attrs"])
    for e in ents:
        if e["kind"] == "TIMEX3":
            a = e["attrs"]
            timexes.append({"id": e["id"], "start": e["start"], "end": e["end"], "type": a.get("type"),
                            "value": a.get("value", ""), **{x: a[x] for x in ("mod", "quant", "freq") if a.get(x)}})
            ids.add(e["id"])
        elif e["kind"] == "EVENT":
            a = {**e["attrs"], **inst.get(e["id"], {})}
            events.append({"id": e["id"], "start": e["start"], "end": e["end"], "class": a.get("class"),
                           **{x: a.get(x) for x in timeml.EVENT_ATTRS}})
            ids.add(e["id"])
    links = []
    for l in doc["links"]:
        if l["kind"] != "TLINK":
            continue
        a = l["attrs"]
        s = a.get("timeID") or eiid_to_eid.get(a.get("eventInstanceID"))
        t = a.get("relatedToTime") or eiid_to_eid.get(a.get("relatedToEventInstance"))
        s = "dct" if s == "t0" else s
        t = "dct" if t == "t0" else t
        if (s == "dct" or s in ids) and (t == "dct" or t in ids):
            links.append({"source": s, "target": t, "rel": a.get("relType")})
    return timexes, events, links


def gold_tml(doc, n=None):
    limit, _ = _kept(doc, n)
    timexes, events, links = gold_items(doc, n)
    return timeml.render(doc["doc_id"] or doc["name"], doc["dct"], doc["title"], doc["text"][:limit],
                         timexes, events, links)


def gold_sentence(doc, i):
    """The gold of sentence i in the form a model writes it (tagged sentence + TLINK lines), for reflection."""
    timexes, events, links = gold_items(doc, i)
    s = doc["sents"][i - 1]
    idmap = {}
    for kind, items in (("t", timexes), ("e", events)):
        for it in items:
            sent = next(x["index"] for x in doc["sents"] if x["start"] <= it["start"] < x["end"] + 1)
            k = sum(1 for v in idmap.values() if v.startswith("%s%d_" % (kind, sent))) + 1
            idmap[it["id"]] = "%s%d_%d" % (kind, sent, k)
    tags = []
    for t in timexes:
        if s["start"] <= t["start"] < s["end"]:
            a = {"tid": idmap[t["id"]], "type": t["type"], "value": t["value"],
                 **{x: t[x] for x in ("mod", "quant", "freq") if t.get(x)}}
            tags.append((t["start"], t["end"], "TIMEX3", a))
    for e in events:
        if s["start"] <= e["start"] < s["end"]:
            a = {"eid": idmap[e["id"]], "class": e["class"],
                 **{x: e[x] for x in timeml.EVENT_ATTRS if e.get(x)}}
            tags.append((e["start"], e["end"], "EVENT", a))
    text = tag_text(doc["text"], s["start"], s["end"], tags)
    own = {idmap[x["id"]] for x in timexes + events if s["start"] <= x["start"] < s["end"]}
    lines = []
    for l in links:
        a, b = idmap.get(l["source"], "t0"), idmap.get(l["target"], "t0")
        if a in own or b in own:
            lines.append(link_line(a, b, l["rel"]))
    return text + "\n" + "\n".join(lines)


def display(doc, i, parsed):
    """A parsed annotation of sentence i (timexes, events, links) as a model writes it."""
    tx, ev, ln = parsed
    s = doc["sents"][i - 1]
    tags = []
    for t in tx:
        tags.append((t["start"], t["end"], "TIMEX3", {"tid": t["id"], "type": t.get("type"), "value": t.get("value"),
                                                      **{x: t[x] for x in ("mod", "quant", "freq") if t.get(x)}}))
    for e in ev:
        tags.append((e["start"], e["end"], "EVENT", {"eid": e["id"], "class": e.get("class"),
                                                     **{x: e.get(x) for x in timeml.EVENT_ATTRS if e.get(x)}}))
    tags = [t for t in tags if s["start"] <= t[0] and t[1] <= s["end"]]
    lines = [link_line("t0" if l["source"] == "dct" else l["source"], "t0" if l["target"] == "dct" else l["target"],
                       l["rel"]) for l in ln]
    return tag_text(doc["text"], s["start"], s["end"], _nest(tags)) + ("\n" + "\n".join(lines) if lines else "")


def _nest(tags):
    """Drop tags that partly overlap an earlier one (they cannot be written inline)."""
    out = []
    for t in sorted(tags, key=lambda x: (x[0], -x[1])):
        if any(t[0] < o[1] and o[0] < t[1] and not (o[0] <= t[0] and t[1] <= o[1]) for o in out):
            continue
        out.append(t)
    return out


def link_line(a, b, rel):
    first = 'eventID="%s"' % a if a.startswith("e") else 'timeID="%s"' % a
    second = 'relatedToEvent="%s"' % b if b.startswith("e") else 'relatedToTime="%s"' % b
    return '<TLINK %s %s relType="%s"/>' % (first, second, rel)


def tag_text(text, start, end, tags):
    out, pos, stack = [], start, []
    for s, t, kind, a in sorted(tags, key=lambda x: (x[0], -x[1])):
        while stack and stack[-1][0] <= s:
            e, k = stack.pop()
            out.append(html.escape(text[pos:e], quote=False) + "</%s>" % k)
            pos = e
        out.append(html.escape(text[pos:s], quote=False))
        pos = s
        out.append("<%s%s>" % (kind, "".join(' %s="%s"' % (k, html.escape(str(v))) for k, v in a.items() if v)))
        stack.append((t, kind))
    while stack:
        e, k = stack.pop()
        out.append(html.escape(text[pos:e], quote=False) + "</%s>" % k)
        pos = e
    out.append(html.escape(text[pos:end], quote=False))
    return "".join(out)


# ---------------------------------------------------------------- a model's annotation

TLINK = re.compile(r"<TLINK\b([^>]*?)/?>", re.S)
RELS = {"BEFORE", "AFTER", "INCLUDES", "IS_INCLUDED", "DURING", "DURING_INV", "SIMULTANEOUS", "IAFTER",
        "IBEFORE", "IDENTITY", "BEGINS", "ENDS", "BEGUN_BY", "ENDED_BY"}


def parse_annotation(sentence, text):
    """A model's annotation of one sentence: the sentence with inline TIMEX3 / EVENT tags, then TLINK
    lines. Returns (timexes, events, links, problems); offsets are into the document text, ids are the
    model's own (e3_1, t3_1; t0 is the document creation time)."""
    problems = []
    body = TLINK.sub("", text)
    body = re.sub(r"^\s*#.*$", "", body, flags=re.M)
    lines = [l for l in body.splitlines() if l.strip()]
    tagged = " ".join(l.strip() for l in lines)
    plain, ents = timeml.strip(tagged)
    want = sentence["text"]
    # map the model's plain text onto the sentence: equal up to white space
    squeeze = lambda s: re.sub(r"\s+", "", s)
    pos_map = _whitespace_map(plain, want)
    if pos_map is None:
        problems.append("the text inside the tags is not the sentence; tags were placed by searching")
    timexes, events = [], []
    cursor = 0
    for e in ents:
        if e["kind"] not in ("TIMEX3", "EVENT"):
            continue
        if pos_map is not None:
            s, t = pos_map(e["start"], e["end"])
        else:
            span = plain[e["start"]:e["end"]]
            k = want.find(span, cursor) if span else -1
            if k < 0:
                k = want.find(span)
            if k < 0 or not span.strip():
                problems.append("tag text not in the sentence: %r" % span)
                continue
            s, t = k, k + len(span)
            cursor = t
        if s is None or t <= s:
            continue
        s, t = s + sentence["start"], t + sentence["start"]
        a = e["attrs"]
        if e["kind"] == "TIMEX3":
            timexes.append({"id": a.get("tid") or "t?%d" % len(timexes), "start": s, "end": t,
                            "type": a.get("type", "DATE"), "value": a.get("value", ""),
                            **{x: a[x] for x in ("mod", "quant", "freq") if a.get(x)}})
        else:
            events.append({"id": a.get("eid") or "e?%d" % len(events), "start": s, "end": t,
                           "class": a.get("class", "OCCURRENCE"), **{x: a.get(x) for x in timeml.EVENT_ATTRS}})
    links = []
    for m in TLINK.finditer(text):
        a = timeml.attrs_of(m.group(1))
        src = a.get("eventID") or a.get("eventInstanceID") or a.get("timeID")
        tgt = a.get("relatedToEvent") or a.get("relatedToEventInstance") or a.get("relatedToTime")
        rel = (a.get("relType") or "").upper()
        if not src or not tgt or rel not in RELS:
            problems.append("bad TLINK: %s" % m.group(0)[:120])
            continue
        links.append({"source": _norm_id(src), "target": _norm_id(tgt), "rel": rel})
    del squeeze
    return timexes, events, links, problems


def _norm_id(x):
    x = x.strip()
    if x.startswith("ei"):
        x = "e" + x[2:]
    return "dct" if x in ("t0", "dct") else x


def _whitespace_map(plain, want):
    """A function (start, end) in plain -> (start, end) in want, when the two differ only in white space."""
    a = [i for i, c in enumerate(plain) if not c.isspace()]
    b = [i for i, c in enumerate(want) if not c.isspace()]
    if len(a) != len(b) or any(plain[i] != want[j] for i, j in zip(a, b)):
        return None
    to_b = {}
    for k, i in enumerate(a):
        to_b[i] = b[k]

    def f(s, t):
        ks = [i for i in range(s, t) if i in to_b]
        if not ks:
            return None, None
        return to_b[ks[0]], to_b[ks[-1]] + 1
    return f


def render_pred(doc, n, per_sentence):
    """per_sentence: {sentence index: (timexes, events, links)} -> .tml text of the first n sentences.
    Ids are made unique per sentence; a link to an id that does not exist is dropped."""
    limit = doc["sents"][n - 1]["end"] if n else len(doc["text"])
    timexes, events, links = [], [], []
    taken = []
    for i in sorted(per_sentence):
        tx, ev, ln = per_sentence[i]
        for x in tx + ev:
            # overlapping tags cannot both be written: keep the first
            if any(not (x["end"] <= s or x["start"] >= t) and k == x.get("_k", None) for s, t, k in taken):
                continue
            if any(x["start"] < t and s < x["end"] and not (s <= x["start"] and x["end"] <= t)
                   and not (x["start"] <= s and t <= x["end"]) for s, t, _ in taken):
                continue
            taken.append((x["start"], x["end"], None))
            (timexes if x in tx else events).append(x)
        links += ln
    ids = {x["id"] for x in timexes + events} | {"dct"}
    # same-kind overlap (two EVENTs on one token) is not valid TimeML
    events = _no_overlap(events)
    timexes = _no_overlap(timexes)
    ids = {x["id"] for x in timexes + events} | {"dct"}
    seen, out = set(), []
    for l in links:
        key = (l["source"], l["target"])
        if l["source"] in ids and l["target"] in ids and l["source"] != l["target"] and key not in seen:
            seen.add(key)
            out.append(l)
    return timeml.render(doc["doc_id"] or doc["name"], doc["dct"], doc["title"], doc["text"][:limit],
                         timexes, events, out)


def _no_overlap(items):
    out = []
    for x in sorted(items, key=lambda x: (x["start"], -(x["end"] - x["start"]))):
        if any(x["start"] < y["end"] and y["start"] < x["end"] for y in out):
            continue
        if any(y["id"] == x["id"] for y in out):
            x = {**x, "id": x["id"] + "_dup%d" % len(out)}
        out.append(x)
    return out


def _shift(items, lo):
    return [{**x, "start": x["start"] - lo, "end": x["end"] - lo} for x in items]


def window_files(doc, start, n, per_sentence):
    """(gold .tml, predicted .tml) of sentences start..start+n-1 alone: the text from the window's first
    character to its last, the tags inside it, and the TLINKs between them or to the DCT."""
    lo, hi = doc["sents"][start - 1]["start"], doc["sents"][start + n - 2]["end"]
    timexes, events, links = gold_items(doc, start + n - 1, lo)
    name = doc["doc_id"] or doc["name"]
    gold = timeml.render(name, doc["dct"], doc["title"], doc["text"][lo:hi], _shift(timexes, lo), _shift(events, lo), links)
    keep = {i: per_sentence[i] for i in per_sentence if start <= i < start + n}
    tx, ev, ln = [], [], []
    for i in sorted(keep):
        a, b, c = keep[i]
        tx += a
        ev += b
        ln += c
    ids = {x["id"] for x in tx + ev} | {"dct"}
    ln = [l for l in ln if l["source"] in ids and l["target"] in ids]
    window = {**doc, "text": doc["text"][lo:hi], "sents": [{**s, "start": s["start"] - lo, "end": s["end"] - lo}
                                                          for s in doc["sents"][start - 1:start + n - 1]]}
    pred = render_pred(window, None, {0: (_shift(tx, lo), _shift(ev, lo), ln)})
    return gold, pred
