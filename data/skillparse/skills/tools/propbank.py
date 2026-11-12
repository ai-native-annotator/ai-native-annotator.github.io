"""propbank_lookup: the PropBank rolesets of a lemma, with their roles and examples, as Markdown (web).

The one PropBank tool: the agent skills call it, and jevlib.py (sent_type) reads its data. The
data is the frame files merged by scripts/build_resources.py, every roleset with all its examples:

    resources/propbank/zh.json   chinese-propbank/<lemma>.xml (an example's words come from its
                                 treebank parse, traces such as *OP* *T*-1 *pro* kept)
    resources/propbank/en.json   propbank-amr-frames-xml-2018-01-25/<lemma>.xml

    {lemma: [[roleset id, name, [[n, descr], ...], [[name, sentence, [[label, text], ...], rel], ...]], ...]}

They are not loaded when the page starts: the first lookup reads them, from $SP_RESOURCES when
that folder has them, else from the site ($SP_BASE + "resources/...") in the browser.

    propbank_lookup(lemmas, language)   the tool: Markdown, the same text the page shows
    _rolesets(lemma, language)          the data: [{"roleset", "name", "roles", "examples"}]
                                        (jevlib.py reads it: sent_type's questions)
"""
import json
import os

LIMIT = 20                      # lemmas a call looks up
PROPBANKS = ("zh", "en")        # the languages there is a PropBank for
_ZH_PARTICLES = ("了", "着", "过", "起来", "下去", "出来", "上去")
_EN_SUFFIXES = [("ies", "y"), ("ied", "y"), ("ing", ""), ("ed", ""), ("en", ""), ("es", ""), ("s", "")]
_cache = {}


def propbank_lookup(lemmas: list[str], language: str) -> str:
    """Look up a lemma and every alternate of it in PropBank (at most 20 per call).

    language is "en" or "zh". Returns Markdown: per lemma, every roleset with its roles and all
    its examples (the sentence, then each argument; traces such as *T*-1 are PropBank's own),
    or "not in PropBank". Lemmas over the limit are not looked up: the last line names them
    (call again with them). There is no PropBank for another language (Uzbek): nothing.
    """
    lang = _lang(language)
    if lang not in PROPBANKS:
        return "There is no PropBank for this language (%s): nothing to look up." % language
    asked = [str(x).strip() for x in (lemmas or []) if isinstance(x, str) and x.strip()]
    parts = [_markdown(lemma, *_find(lemma, lang)) for lemma in asked[:LIMIT]]
    if len(asked) > LIMIT:
        parts.append("Not looked up (only the first %d lemmas of a call are; call again with these): %s"
                     % (LIMIT, ", ".join(asked[LIMIT:])))
    return "\n\n".join(parts) if parts else "No lemma given."


def _rolesets(lemma, language):
    """The rolesets of a lemma (or of the first alternate form that has some), as data."""
    return _find(str(lemma).strip(), _lang(language))[1]


# ------------------------------------------------------------------ helpers

def _lang(language):
    # a model may write "Chinese" or "中文" for "zh", "Uzbek" or "o'zbek" for "uz"
    low = str(language).strip().lower()
    if low[:2] in ("zh", "ch", "中文"):
        return "zh"
    if low[:2] in ("uz", "o'", "oʻ", "o‘") or low.startswith("ўз"):
        return "uz"
    return "en"


def _find(lemma, lang):
    """(the form found, its rolesets) for the lemma or the first alternate form PropBank has."""
    if lang not in PROPBANKS:
        return lemma, []
    data = _data(lang)
    for form in _variants(lemma, lang):
        found = data.get(form)
        if found:
            return form, [_roleset(r) for r in found]
    return lemma, []


def _variants(lemma, lang):
    out = [lemma]
    if lang == "zh":
        out += [lemma[:-len(p)] for p in _ZH_PARTICLES if lemma.endswith(p) and len(lemma) > len(p)]
    else:
        low = lemma.lower()
        key = low.replace(" ", "_").replace("-", "_")           # eat up, eat-up -> eat_up
        out += [low, key]
        for suffix, repl in _EN_SUFFIXES:
            if key.endswith(suffix) and len(key) > len(suffix) + 2:
                out += [key[: -len(suffix)] + repl, key[: -len(suffix)] + repl + "e"]
    seen = []
    for x in out:
        if x and x not in seen:
            seen.append(x)
    return seen


def _roleset(r):
    rid, name, roles, examples = (list(r) + [[], []])[:4]
    return {"roleset": rid.replace("_", "-").replace(".", "-"), "name": name,
            "roles": {("ARG" + n.upper()): d for n, d in roles if n},
            "examples": [{"name": e[0], "sentence": e[1], "args": e[2], "rel": e[3]} for e in examples]}


def _markdown(lemma, form, found):
    head = "## %s" % lemma + (" (found as %s)" % form if found and form != lemma else "")
    if not found:
        return head + "\n\nNot in PropBank."
    out = [head]
    for r in found:
        out.append("### %s%s" % (r["roleset"], " (%s)" % r["name"] if r["name"] else ""))
        out.append("\n".join("- %s: %s" % (k, v) for k, v in r["roles"].items()) or "- (no roles)")
        for k, e in enumerate(r["examples"], 1):
            lines = ["Example %d%s: %s" % (k, " (%s)" % e["name"] if e["name"] else "", e["sentence"])]
            lines += ["- %s: %s" % (label, text) for label, text in e["args"]]
            if e["rel"]:
                lines.append("- rel: %s" % e["rel"])
            out.append("\n".join(lines))
    return "\n\n".join(out)


def _data(lang):
    key = "data:" + lang
    if key not in _cache:
        _cache[key] = json.loads(_read("propbank/%s.json" % lang))
    return _cache[key]


def _read(rel):
    """A resource file's text: from $SP_RESOURCES, else fetched from the site."""
    local = os.path.join(os.environ.get("SP_RESOURCES", ""), rel)
    if os.environ.get("SP_RESOURCES") and os.path.isfile(local):
        with open(local, encoding="utf-8") as f:
            return f.read()
    from pyodide.http import open_url    # in the browser: the page's Python runs in Pyodide
    return open_url(os.environ.get("SP_BASE", "") + "resources/" + rel).read()
