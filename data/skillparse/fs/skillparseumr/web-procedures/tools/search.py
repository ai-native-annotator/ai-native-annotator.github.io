"""search_annotations and search_guidelines: two tools every agent skill has (web).

    search_annotations(language, keywords)  gold UMR annotations of whole sentences that contain the
                                            keywords, and the worked examples (reference/example.md)
                                            of the procedure's skills that contain them
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
LANGS = {"zh": "zh", "chinese": "zh", "中文": "zh", "汉语": "zh", "en": "en", "english": "en", "英文": "en", "英语": "en"}
_cache = {}


def search_annotations(ctx: RunContext[dict], language: str, keywords: list[str], max_results: int = 3) -> dict:
    """Find how a case is annotated: gold UMR annotations, and this procedure's worked examples.

    language: "zh" (Chinese) or "en" (English).
    keywords: words or pieces to look for, matched anywhere in a sentence or its annotation:
    words of the text (e.g. "发生", "wanted to"), concepts ("have-org-role-91", "identity-91"),
    roles (":ARG1-of", ":manner"), attribute values (":aspect state"). Sentences with more of the
    keywords come first.
    max_results: how many gold sentences and how many example sections to return (at most 10).

    Returns {"gold": [{"doc", "sentence_number", "sentence", "annotation"}], where annotation is
    the sentence's whole annotation (words, sentence-level graph, alignment, document-level
    annotation); "examples": [{"skill", "section", "text"}] from the skills' reference/example.md;
    "found": how many gold sentences and example sections matched in all}.
    """
    lang = _lang(language)
    if lang is None:
        return {"gold": [], "examples": [], "error": f"language must be zh or en, not {language!r}"}
    words = _keywords(keywords)
    if not words:
        return {"gold": [], "examples": [], "error": "give at least one keyword"}
    n = _count(max_results, 3)
    skip = {_plain(s) for s in ((getattr(ctx, "deps", None) or {}).get("doc_sentences") or [])}
    gold, left_out = [], 0
    for rec in _gold(lang):
        hits = _hits(rec["text"] + "\n" + rec["annotation"], words)
        if not hits[0]:
            continue
        if _plain(rec["text"]) in skip:
            left_out += 1
            continue
        gold.append((hits, len(rec["annotation"]), rec))
    gold.sort(key=lambda x: (-x[0][0], -x[0][1], x[1]))
    examples = []
    for skill, section, text in _examples(lang):
        hits = _hits(text, words)
        if hits[0]:
            examples.append((hits, len(text), skill, section, text))
    examples.sort(key=lambda x: (-x[0][0], -x[0][1], x[1]))
    out = {
        "gold": [{"doc": r["doc"], "sentence_number": r["snt"], "sentence": r["text"],
                  "annotation": _clip(r["annotation"])} for _, _, r in gold[:n]],
        "examples": [{"skill": s, "section": h, "text": _clip(t)} for _, _, s, h, t in examples[:n]],
        "found": {"gold": len(gold), "examples": len(examples)},
    }
    if left_out:
        out["left_out"] = f"{left_out} matching sentences of the document being annotated are not shown"
    return out


def search_guidelines(keywords: list[str], max_results: int = 3) -> dict:
    """Look a rule up in the UMR guidelines (umr4nlp/umr-guidelines, guidelines.md).

    keywords: terms to look for, e.g. "aspect", "modal strength", "have-rel-role-92", ":quant",
    "reentrancy". Passages with more of the keywords come first, then those whose heading has
    them, then those that mention them most.
    max_results: how many passages to return (at most 10).

    Returns {"sections": [{"heading": the passage's place in the guidelines ("Part 3. ... > Part
    3-3-1. Aspect"), "text": the passage (a section, or a part of a long one)}], "found": how
    many passages matched}.
    """
    words = _keywords(keywords)
    if not words:
        return {"sections": [], "error": "give at least one keyword"}
    n = _count(max_results, 3)
    found = []
    for path, text in _guideline_sections():
        hits = _hits(path + "\n" + text, words)
        if hits[0]:
            in_head = _hits(path, words)[0]
            found.append(((hits[0], in_head, hits[1] * 1000 // max(1, len(text))), len(text), path, text))
    found.sort(key=lambda x: (-x[0][0], -x[0][1], -x[0][2], x[1]))
    return {"sections": [{"heading": p, "text": _clip(t)} for _, _, p, t in found[:n]], "found": len(found)}


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


def _hits(text, words):
    """(how many of the keywords occur, how many times in all)."""
    low = text.lower()
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
    key = "gold:" + lang
    if key not in _cache:
        _cache[key] = json.loads(_read("gold/%s/gold.json" % lang))
    return _cache[key]


def _examples(lang):
    """(skill, section heading, text) of every `## ` section of the procedure's reference/example.md files."""
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", lang)
    out = []
    if not os.path.isdir(root):
        return out
    for skill in sorted(os.listdir(root)):
        path = os.path.join(root, skill, "reference", "example.md")
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8") as f:
            text = f.read()
        parts = re.split(r"(?m)^(?=## )", text)
        for part in parts:
            head = part.split("\n", 1)[0].lstrip("# ").strip()
            if part.strip():
                out.append((skill, head, part.strip()))
    return out


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
