"""search_annotations and search_guidelines: two tools every agent skill has (web). Both answer
in Markdown, as the model and the page's tool-calls tab read them.

    search_annotations(language, keywords)  gold UMR annotations of whole sentences that contain the
                                            keywords
    search_guidelines(keywords)             the sections of the UMR guidelines that contain them

The data is under data/skillparse/resources/ (built by scripts/sync_skillparse.py):
gold/zh/gold.json, gold/en/gold.json and guidelines/umr_guidelines.md. It is not loaded when the
page starts (the English gold is 27 MB): the first search reads it, from $SP_RESOURCES when that
folder has it, else from the site ($SP_BASE + "resources/...") in the browser.

The sentences of the document being annotated (the run's deps "doc_sentences") are never
returned: the sample documents are gold documents too, and their answers must not leak.
"""
import json
import os
import re

from pydantic_ai import RunContext

MAX_RESULTS = 10
MAX_TEXT = 6000                 # characters of one returned annotation or section
CHUNK = 3000                    # a guideline section longer than this is returned in passages
LANGS = {"zh": "zh", "chinese": "zh", "中文": "zh", "汉语": "zh", "en": "en", "english": "en", "英文": "en", "英语": "en",
         "uz": "uz", "uzbek": "uz", "o'zbek": "uz", "oʻzbek": "uz", "o'zbekcha": "uz"}
GOLD = ("zh", "en")             # the languages there is gold data for
_cache = {}


def search_annotations(ctx: RunContext[dict], language: str, keywords: list[str], max_results: int = 3) -> str:
    """Find how a case is annotated: gold UMR annotations of whole sentences.

    language: "zh" (Chinese) or "en" (English); there is no gold data for "uz" (Uzbek).
    keywords: words or pieces to look for, matched anywhere in a sentence or its annotation:
    words of the text (e.g. "发生", "wanted to"), concepts ("have-org-role-91", "identity-91"),
    roles (":ARG1-of", ":manner"), attribute values (":aspect state"). Sentences with more of the
    keywords come first.
    max_results: how many gold sentences to return (at most 10).

    Returns Markdown: how many gold sentences matched, then for each one shown its document and
    number, the sentence, and its whole annotation (words, sentence-level graph, alignment,
    document-level annotation) in a code block.
    """
    lang = _lang(language)
    if lang is None:
        return f"Language must be zh, en or uz, not {language!r}."
    if lang not in GOLD:
        return f"There is no gold data for {language!r}: no annotation found."
    words = _keywords(keywords)
    if not words:
        return "Give at least one keyword."
    n = _count(max_results, 3)
    skip = {_plain(s) for s in ((getattr(ctx, "deps", None) or {}).get("doc_sentences") or [])}
    gold, left_out = [], 0
    for rec, low in _gold(lang):
        hits = _hits(low, words, lowered=True)
        if not hits[0]:
            continue
        if _plain(rec["text"]) in skip:
            left_out += 1
            continue
        gold.append((hits, len(rec["annotation"]), rec))
    gold.sort(key=lambda x: (-x[0][0], -x[0][1], x[1]))
    shown = gold[:n]
    out = ["# Gold annotations with %s" % ", ".join("`%s`" % w for w in words), "",
           "%d of %d matching sentences (those with more of the keywords first)." % (len(shown), len(gold))
           if gold else "No gold sentence has these keywords."]
    if left_out:
        out.append("%d matching sentences of the document being annotated are not shown." % left_out)
    for k, (_, _, r) in enumerate(shown, 1):
        out += ["", "## %d. %s, sentence %s" % (k, r["doc"], r["snt"]), "", r["text"], "", "```", _clip(r["annotation"]).strip("\n"), "```"]
    return "\n".join(out) + "\n"


def search_guidelines(keywords: list[str], max_results: int = 3) -> str:
    """Look a rule up in the UMR guidelines (umr4nlp/umr-guidelines, guidelines.md).

    keywords: terms to look for, e.g. "aspect", "modal strength", "have-rel-role-92", ":quant",
    "reentrancy". Passages with more of the keywords come first, then those whose heading has
    them, then those that mention them most.
    max_results: how many passages to return (at most 10).

    Returns Markdown: how many passages matched, then each passage shown under its place in the
    guidelines ("Part 3. ... > Part 3-3-1. Aspect"), as the guidelines write it.
    """
    words = _keywords(keywords)
    if not words:
        return "Give at least one keyword."
    n = _count(max_results, 3)
    found = []
    for path, text in _guideline_sections():
        hits = _hits(path + "\n" + text, words)
        if hits[0]:
            in_head = _hits(path, words)[0]
            found.append(((hits[0], in_head, hits[1] * 1000 // max(1, len(text))), len(text), path, text))
    found.sort(key=lambda x: (-x[0][0], -x[0][1], -x[0][2], x[1]))
    shown = found[:n]
    out = ["# UMR guidelines on %s" % ", ".join("`%s`" % w for w in words), "",
           "%d of %d matching passages." % (len(shown), len(found)) if found else "No passage of the guidelines has these keywords."]
    for k, (_, _, path, text) in enumerate(shown, 1):
        out += ["", "## %d. %s" % (k, re.sub(r"^Uniform Meaning Representation \(UMR\)[^>]*> ", "", path)), "", _passage(_clip(text))]
    return "\n".join(out) + "\n"


def _passage(text):
    """A passage under its own heading: its first line (the section's heading) is dropped, and its
    other headings become bold lines, so they do not compete with the answer's. The guidelines'
    HTML anchors become plain example numbers, and ```x``` inside a line is `x`."""
    text = re.sub(r'<span[^>]*>([^<]*)</span>', lambda m: "**%s**" % m.group(1).strip() if m.group(1).strip() else "", text)
    text = re.sub(r'<a [^>]*>([^<]*)</a>', r"\1", text)
    text = re.sub(r"```([^`\n]+?)```", r"`\1`", text)
    lines = text.split("\n")
    if lines and re.match(r"^#{1,6}\s", lines[0]):
        lines = lines[1:]
    lines = ["**%s**" % m.group(1) if (m := re.match(r"^#{1,6}\s+(.*?)\s*#*\s*$", ln)) else ln for ln in lines]
    return "\n".join(lines).strip("\n")


# ------------------------------------------------------------------ helpers

def _lang(language):
    return LANGS.get(str(language or "").strip().lower())


def _keywords(keywords):
    if isinstance(keywords, str):
        keywords = re.split(r"[,，;；\s]+", keywords)
    return [k.strip().lower() for k in (keywords or []) if isinstance(k, str) and k.strip()]


def _count(n, default):
    try:
        return max(1, min(MAX_RESULTS, int(n)))
    except (TypeError, ValueError):
        return default


def _hits(text, words, lowered=False):
    """(how many of the keywords occur, how many times in all)."""
    low = text if lowered else text.lower()
    counts = [low.count(w) for w in words]
    return sum(1 for c in counts if c), sum(counts)


def _plain(text):
    return re.sub(r"\s+", "", str(text))


def _clip(text):
    return text if len(text) <= MAX_TEXT else text[:MAX_TEXT] + "\n… (%d more characters)" % (len(text) - MAX_TEXT)


def _read(rel):
    """A resource file's text: from $SP_RESOURCES, else fetched from the site (and kept)."""
    if rel in _cache:
        return _cache[rel]
    local = os.path.join(os.environ.get("SP_RESOURCES", ""), rel)
    if os.environ.get("SP_RESOURCES") and os.path.isfile(local):
        with open(local, encoding="utf-8") as f:
            text = f.read()
    else:
        from pyodide.http import open_url    # in the browser: the page's Python runs in Pyodide
        text = open_url(os.environ.get("SP_BASE", "") + "resources/" + rel).read()
    _cache[rel] = text
    return text


def _gold(lang):
    """[(record, its sentence and annotation in lower case)], made once: a search runs through
    every sentence (31,147 in English)."""
    key = "gold:" + lang
    if key not in _cache:
        recs = json.loads(_read("gold/%s/gold.json" % lang))
        _cache[key] = [(r, (r["text"] + "\n" + r["annotation"]).lower()) for r in recs]
    return _cache[key]



def _guideline_sections():
    key = "guidelines"
    if key not in _cache:
        text = _read("guidelines/umr_guidelines.md")
        sections, path, body = [], [], []
        title = ""

        def close():
            # a long section is cut at paragraphs into passages of about CHUNK characters
            text = "\n".join(body).strip()
            if not text:
                return
            head = " > ".join(path) or title
            parts, cur = [], ""
            for para in re.split(r"\n\s*\n", text):
                if cur and len(cur) + len(para) > CHUNK:
                    parts.append(cur)
                    cur = ""
                cur = cur + "\n\n" + para if cur else para
            if cur:
                parts.append(cur)
            for k, part in enumerate(parts):
                sections.append((head + (" (%d/%d)" % (k + 1, len(parts)) if len(parts) > 1 else ""), part))
        for line in text.split("\n"):
            m = re.match(r"^(#{1,6})\s+(.*?)\s*#*\s*$", line)
            if m:
                close()
                level = len(m.group(1))
                path = path[:level - 1] + [m.group(2)]
                body = [line]
            else:
                body.append(line)
        close()
        _cache[key] = sections
    return _cache[key]
