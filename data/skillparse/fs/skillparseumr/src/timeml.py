"""Reading and writing TimeML (TempEval-3 style .tml files). No model, no skills.

    doc = parse("resources/te3/key/AP_20130322.tml")
    doc["text"]            the TEXT with the tags removed and the XML entities decoded
    doc["entities"]        EVENT / TIMEX3 / SIGNAL: {kind, id, start, end, attrs}; start, end are
                           character offsets into doc["text"]
    doc["instances"]       eiid -> {eid, attrs}  (MAKEINSTANCE)
    doc["links"]           TLINK / SLINK / ALINK: {kind, attrs}
    xml = render(doc["doc_id"], doc["dct"], doc["title"], doc["text"], timexes, events, links)

A document with no annotation (the TE3input files, or the TEXT of a gold file with the tags removed)
parses to the same text, so one function reads both.

render() writes the TEXT back with the tags put in at the character offsets, and the MAKEINSTANCE and
TLINK lines after it, ids numbered by position: t1, t2, ... (t0 is the DCT), e1, ..., ei1, ..., l1, ...
"""
import html
import re
from xml.sax.saxutils import escape

TAG = re.compile(r"<(/?)([A-Za-z0-9_]+)((?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:\"[^\"]*\"|'[^']*'))*)\s*(/?)>")
ATTR = re.compile(r"([A-Za-z_:][\w:.-]*)\s*=\s*(?:\"([^\"]*)\"|'([^']*)')")

INLINE = {"EVENT", "TIMEX3", "SIGNAL"}
LINKS = {"TLINK", "SLINK", "ALINK"}


def attrs_of(text):
    return {m.group(1): html.unescape(m.group(2) if m.group(2) is not None else m.group(3))
            for m in ATTR.finditer(text)}


def parse(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        raw = f.read()
    doc_id = re.search(r"<DOCID>(.*?)</DOCID>", raw, re.S)
    dct = None
    m = re.search(r"<DCT>\s*<TIMEX3([^>]*)>(.*?)</TIMEX3>\s*</DCT>", raw, re.S)
    if m:
        dct = {**attrs_of(m.group(1)), "text": html.unescape(m.group(2))}
    title = re.search(r"<TITLE>(.*?)</TITLE>", raw, re.S)
    body = re.search(r"<TEXT>(.*?)</TEXT>", raw, re.S)
    text, entities = strip(body.group(1) if body else "")
    instances = {}
    for m in re.finditer(r"<MAKEINSTANCE([^>]*?)/?>", raw):
        a = attrs_of(m.group(1))
        instances[a.get("eiid")] = {"eid": a.get("eventID"), "attrs": a}
    links = []
    for m in re.finditer(r"<(TLINK|SLINK|ALINK)([^>]*?)/?>", raw):
        links.append({"kind": m.group(1), "attrs": attrs_of(m.group(2))})
    return {"doc_id": doc_id.group(1).strip() if doc_id else "", "dct": dct,
            "title": html.unescape(title.group(1)).strip() if title else "",
            "text": text, "entities": entities, "instances": instances, "links": links}


def strip(body):
    """(text, entities) of a TEXT body: the tags removed, entities decoded, and where each tag was."""
    out, pos, entities, stack = [], 0, [], []
    length = 0
    for m in TAG.finditer(body):
        piece = html.unescape(body[pos:m.start()])
        out.append(piece)
        length += len(piece)
        pos = m.end()
        closing, name, attr_text, selfclosing = m.group(1), m.group(2), m.group(3), m.group(4)
        if name not in INLINE:
            continue
        if closing:
            for i in range(len(stack) - 1, -1, -1):
                if stack[i]["kind"] == name:
                    e = stack.pop(i)
                    e["end"] = length
                    entities.append(e)
                    break
        else:
            a = attrs_of(attr_text)
            e = {"kind": name, "id": a.get("eid") or a.get("tid") or a.get("sid"), "start": length, "attrs": a}
            if selfclosing:
                e["end"] = length
                entities.append(e)
            else:
                stack.append(e)
    tail = html.unescape(body[pos:])
    out.append(tail)
    entities.sort(key=lambda e: (e["start"], -e["end"]))
    return "".join(out), entities


# ---------------------------------------------------------------- writing

def _attr(attrs):
    return "".join(' %s="%s"' % (k, escape(str(v), {'"': "&quot;"})) for k, v in attrs.items()
                   if v is not None and v != "")


EVENT_ATTRS = ("tense", "aspect", "polarity", "pos", "modality")
# enumerations of the TimeML 1.2.1 schema: a value outside them makes the whole file invalid for the scorer,
# so render() drops it (or uses the default for a required attribute)
ENUM = {"type": {"DATE", "TIME", "DURATION", "SET"},
        "mod": {"BEFORE", "AFTER", "ON_OR_BEFORE", "ON_OR_AFTER", "LESS_THAN", "MORE_THAN", "EQUAL_OR_LESS",
                "EQUAL_OR_MORE", "START", "MID", "END", "APPROX"},
        "class": {"OCCURRENCE", "PERCEPTION", "REPORTING", "ASPECTUAL", "STATE", "I_STATE", "I_ACTION"},
        "tense": {"FUTURE", "INFINITIVE", "PAST", "PASTPART", "PRESENT", "PRESPART", "NONE"},
        "aspect": {"PROGRESSIVE", "PERFECTIVE", "PERFECTIVE_PROGRESSIVE", "NONE"},
        "polarity": {"NEG", "POS"},
        "pos": {"ADJECTIVE", "NOUN", "VERB", "PREPOSITION", "OTHER"}}


def _valid(name, value):
    return name not in ENUM or value in ENUM[name]


def render(doc_id, dct, title, text, timexes, events, links):
    """
    timexes: [{id, start, end, type, value, ...other TIMEX3 attributes}]
    events:  [{id, start, end, class, tense, aspect, polarity, pos, modality}]
    links:   [{source, target, rel}]  source, target: a timex id, an event id, or "dct"/"t0"
    Ids may be anything unique; they are renumbered. Returns the .tml text.
    """
    tid, eid, eiid = {"dct": "t0", "t0": "t0"}, {}, {}
    tags = []
    for k, t in enumerate(sorted(timexes, key=lambda x: (x["start"], x["end"])), 1):
        tid[t["id"]] = "t%d" % k
        extra = {a: t[a] for a in ("mod", "quant", "freq") if t.get(a) and _valid(a, t[a])}
        tags.append((t["start"], t["end"], "TIMEX3", {"tid": tid[t["id"]],
                                                       "type": t["type"] if _valid("type", t.get("type")) else "DATE",
                                                       "value": t.get("value", ""), **extra}))
    instances = []
    for k, e in enumerate(sorted(events, key=lambda x: (x["start"], x["end"])), 1):
        eid[e["id"]] = "e%d" % k
        eiid[e["id"]] = "ei%d" % k
        tags.append((e["start"], e["end"], "EVENT", {"eid": eid[e["id"]], "class": e["class"] if _valid("class", e.get("class")) else "OCCURRENCE"}))
        a = {"eventID": eid[e["id"]], "eiid": eiid[e["id"]]}
        for name in EVENT_ATTRS:
            if e.get(name) not in (None, "") and _valid(name, e[name]):
                a[name] = e[name]
        instances.append(a)
    out, pos, open_tags = [], 0, []          # open_tags: (end, kind), innermost last

    def close_until(limit):
        nonlocal pos
        while open_tags and open_tags[-1][0] <= limit:
            end, kind = open_tags.pop()
            out.append(escape(text[pos:end]))
            pos = end
            out.append("</%s>" % kind)

    # spans are token ranges and the output handler drops partial overlaps, so tags nest properly
    for start, end, kind, a in sorted(tags, key=lambda t: (t[0], -t[1])):
        close_until(start)
        out.append(escape(text[pos:start]))
        pos = start
        # TimeML requires a TIMEX3's value: one the steps could not normalise is written empty, not left out
        out.append("<%s%s%s>" % (kind, _attr(a), ' value=""' if kind == "TIMEX3" and not a.get("value") else ""))
        open_tags.append((end, kind))
    close_until(len(text))
    out.append(escape(text[pos:]))
    lines = ['<?xml version="1.0" ?>',
             '<TimeML xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
             'xsi:noNamespaceSchemaLocation="http://timeml.org/timeMLdocs/TimeML_1.2.1.xsd">', "",
             "<DOCID>%s</DOCID>" % escape(doc_id), ""]
    if dct:
        lines.append('<DCT><TIMEX3 tid="t0" type="%s" value="%s" temporalFunction="false" '
                     'functionInDocument="CREATION_TIME">%s</TIMEX3></DCT>'
                     % (dct.get("type", "DATE"), escape(dct.get("value", "")), escape(dct.get("text", ""))))
        lines.append("")
    if title:
        lines += ["<TITLE>%s</TITLE>" % escape(title), ""]
    lines += ["<TEXT>" + "".join(out) + "</TEXT>", ""]    # the text keeps its own line breaks
    for a in instances:
        lines.append("<MAKEINSTANCE%s/>" % _attr(a))
    lines.append("")
    n = 0
    for l in links:
        s, t = l["source"], l["target"]
        if s in eiid:
            first = ("eventInstanceID", eiid[s])
        elif s in tid:
            first = ("timeID", tid[s])
        else:
            continue
        if t in eiid:
            second = ("relatedToEventInstance", eiid[t])
        elif t in tid:
            second = ("relatedToTime", tid[t])
        else:
            continue
        if first[1] == second[1]:
            continue
        n += 1
        lines.append("<TLINK%s/>" % _attr({"lid": "l%d" % n, first[0]: first[1], second[0]: second[1],
                                           "relType": l["rel"]}))
    lines += ["", "</TimeML>", ""]
    return "\n".join(lines)
