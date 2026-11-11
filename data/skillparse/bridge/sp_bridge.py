"""The Python half of index.html: SkillParseUMR's decision-orchestration procedures, run one node
at a time.

Everything under /sp/skillparseumr and /sp/modular-parsing is the SkillParseUMR (and
modular-parsing) source as composed by scripts/sync_skillparse.py (a few patches; the site's own
skills and tools from data/skillparse/web_skills and web_tools; propbank.py reads the merged
PropBank file). This file, with umr_load.py, is the page's Python. It does what src/runner.py
does, split so the page drives it:

  - a node is made but not run until someone clicks it, and a finished step must be confirmed
    (or corrected) before the next step of its episode can start: an episode never runs on by
    itself, though different items can each run their next step at the same time;
  - a kind: jev node hands the page its closed questions (Jev or Haiku answers them, by skill)
    and is finished when the page sends the answers back;
  - any node's output can be replaced by a person, and everything below it is redone;
  - a wave's context windows (`range`) can be changed per wave before running;
  - the right pane's skills (registry user_panel, not a wave) run outside the waves: local_change
    proposes changes to a sentence's graph, apply_change applies the ones a person picked, and the
    sentence's steps are made again from the new graph.

The page calls `call(method, json_args)` and gets JSON back; see `Session` for the methods.
"""
import dataclasses
import importlib.util
import inspect
import json
import os
import re
import sys
import traceback

FS = os.environ.get("SP_FS", "/sp")
SP = FS + "/skillparseumr"
MP = FS + "/modular-parsing"
DOCS = FS + "/docs"
for p in (SP + "/src", FS + "/vendor"):
    if p not in sys.path:
        sys.path.insert(0, p)
os.environ.setdefault("PROPBANK_DIR", MP + "/resources")
# what search_annotations / search_guidelines read: a local copy here, else (in the browser) the
# site's data/skillparse/resources/, from $SP_BASE, which the worker sets
os.environ.setdefault("SP_RESOURCES", FS + "/resources")
sys.dont_write_bytecode = True

DO = SP + "/experiment/decision-orchestration"
# web-procedures/<lang>: composed by scripts/sync_skillparse.py (sent_type kind: jev, the other
# model skills kind: agent); see the header of each registry.yaml
SKILLSETS = {
    "web-zh": {"path": SP + "/web-procedures/zh/registry.yaml", "lang": "zh"},
    "web-en": {"path": SP + "/web-procedures/en/registry.yaml", "lang": "en"},
    "web-uz": {"path": SP + "/web-procedures/uz/registry.yaml", "lang": "uz"},
}
# languages a document can say it is in (a `# :: lang <code>` line at the top of its .umr); one
# without the line is zh when it has Chinese characters, else en
LANGS = ("zh", "en", "uz")
# Uzbek words keep their apostrophes (o', g', ʻ) and hyphens (2023-yil); punctuation is a token
UZ_TOKEN = re.compile(r"[\w'ʻʼ‘’`-]+|[^\w\s]")
# scripts/run_experiment.py: the system prompt every agent skill call gets
SYSTEM = ("You are an expert annotator of Uniform Meaning Representation (UMR), following the "
          "UMR guidelines. Do exactly the one task you are given.")
# modules every version of the procedure has under the same name: a zh and an en version must
# not share them, and an edited file must be read again
SHARED_MODULES = ("jevlib", "prompt_loader", "event_modifiers")
TOOL_PREFIXES = ("skill_rules.", "skill_tools.", "skillset_tools.", "shared_tools")
RULE80 = "#" * 80
# a person's hint for re-running a step: written after the skill's input (agent skills), or put in
# the state Jev sees (sent_type)
SENSE = re.compile(r"-\d+$")          # a concept with a sense number (报导-01) names an event


def prompt_value(v):
    """An input value as skill.md gets it: a string as it is; numbered tokens (token_sent,
    [[1, "Edmund"], ...]) as `[1]Edmund [2]Pope …` (a token can be "·" or a number, so each number
    is bracketed); a span [1, 3] as it is; the document step's
    node tables (RegistryEngine._table) as Markdown, a section per sentence, the last one the
    current; anything else as JSON."""
    if isinstance(v, str):
        return v
    if isinstance(v, list) and v and all(isinstance(t, (list, tuple)) and len(t) == 2 and isinstance(t[0], int)
                                         and not isinstance(t[0], bool) for t in v):
        return " ".join("[%d]%s" % (n, tok) for n, tok in v)
    if isinstance(v, list) and all(isinstance(t, dict) and {"sentence", "graph", "document"} <= set(t) for t in v):
        if not v:
            return "(none: this is the first sentence)"
        return "\n\n".join("### Sentence %s\n\n%s\n\n```\n%s\n```\n\n```\n%s\n```" % (t["sentence"], t["text"], t["graph"],
                                                                              t["document"]) for t in v)
    if isinstance(v, list) and v and all(isinstance(t, dict) and {"sentence", "text", "nodes"} <= set(t) for t in v):
        cell = lambda x: str(x).replace("|", "\\|").replace("\n", " ")  # noqa: E731
        parts = []
        for k, t in enumerate(v):
            head = "### Sentence %s%s" % (t["sentence"], " (current sentence)" if k == len(v) - 1 else "")
            lines = [head, "", t["text"], "", "| node | text | concept | kind | step |", "|---|---|---|---|---|"]
            lines += ["| %s |" % " | ".join(cell(r[c]) for c in ("node", "text", "concept", "kind", "step"))
                      for r in t["nodes"]]
            parts.append("\n".join(lines))
        return "\n\n".join(parts)
    return json.dumps(jsonable(v), ensure_ascii=False)


# the roles of an event the modal rule reads: what it is the content of, its purpose and
# condition, its modal predicate, and who could be its conceiver
MODAL_ROLES = ("quote", "purpose", "condition", "modal-predicate", "modpred", "ARG0", "actor", "experiencer", "causer")
# wave 0 (web): umr_generate writes a sentence's whole graph and document-level annotation, and
# the rule `convert` checks it and loads it into the sentence and document waves (umr_load)
GENERATE, CONVERT = "umr_generate", "convert"
SENTENCE_WAVE = "sentence"
# which model role a skill's calls go to (the page's settings): wave 0's own, else the agent skills'
ROLE_OF = {GENERATE: "generate"}
# web-uz: wave 0's first step cuts the sentence into tokens; the sentence takes them
TOKENIZER = "tokenizer"
GENERATE_WAVE = "generate"
# a user_panel entry's keys that are not a skill's (registry.py builds the rest as skills)
PANEL_KEYS = ("title", "role", "review", "modes")
NOT_BUILT = "(not built yet)"
KNOWN_HEAD = ("Nodes of this sentence so far (an `outside` item names one of them by its `node`; "
              "a placeholder whose node is not built yet is listed too):")
HINT_LABEL = {"zh": "human提示：", "en": "Human hint: "}
# with a hint, the system prompt says it must be followed; in Jev's state the hint's key says so
HINT_RULE = ('If the input ends with a human hint ("human提示：…" or "Human hint: …"), it is a person\'s '
             "correction of this step: you must follow it. Where it disagrees with the instructions, the hint wins.")
HINT_KEY = {"zh": "human提示（务必遵循）", "en": "Human hint (must be followed)"}


# ------------------------------------------------------------------ setup

def jsonable(x):
    """Annotations, sentences, tuples, sets -> plain JSON values."""
    if dataclasses.is_dataclass(x) and not isinstance(x, type):
        return {k: jsonable(v) for k, v in dataclasses.asdict(x).items()}
    if isinstance(x, dict):
        return {str(k): jsonable(v) for k, v in x.items()}
    if isinstance(x, (list, tuple, set)):
        return [jsonable(v) for v in x]
    if isinstance(x, (str, int, float, bool)) or x is None:
        return x
    if hasattr(x, "to_dict"):
        return jsonable(x.to_dict())
    return str(x)


FRAGMENT_SKILLS = ("predicate", "np_phrase", "special_entity")


def _concept_key(c):
    """A concept as the output handler writes it (quotes and spaces made plain)."""
    c = re.sub(r"[\s()/:\"]+", "-", str(c).strip().strip('"')).strip("-")
    return c if re.search(r"\w", c) else "thing"


def _unconfirmed(n):
    return n["status"] in ("ok", "error") and not n.get("confirmed")


# Step ids (web): a sent_type step is "<n>B" and the step it decides on takes "<n>": the root
# sent_type is "0B", the predicate it starts "0", that predicate's placeholders "0.0B", "0.1B",
# the steps they start "0.0", "0.1". A sent_type leaf (type stop) is the node itself and is
# called "<n>" too (ref_id). An antecedent node of an `outside` item is "<step>.<k>A".
TYPER = "sent_type"
_ID_PART = re.compile(r"^(\d+)([AB]?)$")
_SUFFIX = {"B": 0, "": 1, "A": 2}


def node_key(node_id):
    """Sort key of a step id: "0B" < "0" < "0.0B" < "0.0" < "0.1B"; "0.10" after "0.9"."""
    out = []
    for p in str(node_id).split("."):
        m = _ID_PART.match(p)
        out += [int(m.group(1)), _SUFFIX[m.group(2)]] if m else [1 << 30, 0]
    return tuple(out)


def under(k, nid):
    """Whether step k is below step nid (a sent_type "0.1B" has "0.1" and "0.1.*" below it)."""
    base = nid[:-1] if nid.endswith("B") else nid
    return (nid.endswith("B") and k == base) or k.startswith(base + ".")


def new_id(parent_id, skill, position):
    """The id of the step a dispatcher rule makes at `position` under step parent_id."""
    if parent_id is None:
        base = str(position)
    elif parent_id.endswith("B"):
        # the step a sent_type decides on takes its number
        base = parent_id[:-1] if position == 0 else "%s.%d" % (parent_id[:-1], 100 + position)
    else:
        base = "%s.%d" % (parent_id, position)
    return base + ("B" if skill == TYPER else "")


def event_attr(out, role):
    """A predicate step's aspect or modstr: an attribute of its event node (the fragment's first
    node), or the field of that name (work from before)."""
    if not isinstance(out, dict):
        return None
    g = out.get("graph") if isinstance(out.get("graph"), dict) else {}
    first = (g.get("nodes") or [{}])[0]
    var = first.get("var") if isinstance(first, dict) else None
    roles = (role, "modal-strength") if role == "modstr" else (role,)
    for a in g.get("attrs") or []:
        if isinstance(a, (list, tuple)) and len(a) == 3 and a[0] == var and str(a[1]).lstrip(":") in roles:
            return str(a[2]).strip('"')
    v = out.get(role)
    return v if v not in (None, "", "none") else None


def ref_id(n):
    """How the node a step stands for is named: a sent_type step "0.1B" stands for "0.1" (its
    leaf when it is a stop, else the step it starts); any other step by its id."""
    return n["id"][:-1] if n["skill"] == TYPER and n["id"].endswith("B") else n["id"]


def step_of(nodes, ref):
    """The step a node name stands for, in an episode's nodes: "0.1" is step 0.1, else the sent_type
    leaf 0.1B."""
    n = nodes.get(ref)
    if n is None or n.get("status") == "dropped":
        n = nodes.get(ref + "B")
    return n if n is not None and n.get("status") != "dropped" else None


def _load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class StepError(Exception):
    pass


def purge_modules():
    for m in [m for m in sys.modules if m in SHARED_MODULES or m.startswith(TOOL_PREFIXES)]:
        del sys.modules[m]


def _pydantic_ai_stub():
    """web-procedures/tools/search.py types search_annotations' first parameter as
    pydantic_ai.RunContext[dict]; the browser has no pydantic-ai, so a RunContext that only
    carries `deps` stands in for it."""
    import types
    if "pydantic_ai" in sys.modules:
        return
    mod = types.ModuleType("pydantic_ai")

    class RunContext:
        def __init__(self, deps=None):
            self.deps = deps

        def __class_getitem__(cls, item):
            return cls
    mod.RunContext = RunContext
    sys.modules["pydantic_ai"] = mod


def _wants_ctx(fn):
    params = list(inspect.signature(fn).parameters.values())
    return bool(params) and getattr(params[0].annotation, "__name__", "") == "RunContext"


# a tool file, loaded once while it is unchanged: (real path, mtime, size) -> module. Tools are
# looked up for every agent step and every tool call; loading the file again each time would
# throw away what the module keeps (PropBank parsed by propbank.py's lru_cache, the gold data
# and guidelines search.py has read), and read it all again on every call
_TOOL_MODULES = {}


def _tools_in(directory, prefix):
    """skill_callable._tools_in: every public function of every <directory>/*.py not starting with _."""
    tools = []
    if not os.path.isdir(directory):
        return tools
    for filename in sorted(os.listdir(directory)):
        if not filename.endswith(".py") or filename.startswith("_"):
            continue
        path = os.path.join(directory, filename)
        st = os.stat(path)
        key = (os.path.realpath(path), st.st_mtime_ns, st.st_size)
        module = _TOOL_MODULES.get(key)
        if module is None:
            name = "%s.%s" % (prefix, filename[:-3])
            module = _load_module(path, name)
            sys.modules[name] = module
            _TOOL_MODULES[key] = module
        for fname, obj in inspect.getmembers(module, inspect.isfunction):
            if not fname.startswith("_") and obj.__module__ == module.__name__:
                tools.append(obj)
    return tools


def skill_tools(path):
    """skill_callable._load: the skill's own tools/, then its skillset's tools/, then the tools/
    next to the skillset; a name already taken is skipped."""
    _pydantic_ai_stub()
    slug = "".join(ch if ch.isalnum() else "_" for ch in path)
    tools = _tools_in(os.path.join(path, "tools"), "skill_tools.%s" % slug)
    skillset = os.path.dirname(os.path.abspath(path))
    tools += _tools_in(os.path.join(skillset, "tools"), "skillset_tools.%s" % slug)
    tools += _tools_in(os.path.join(os.path.dirname(skillset), "tools"), "shared_tools.%s" % slug)
    seen, unique = set(), []
    for t in tools:
        if t.__name__ not in seen:
            seen.add(t.__name__)
            unique.append(t)
    return unique


def skill_files(path):
    """A skill's editable files under /sp: its own files, then reference/ (examples) and tools/."""
    out = []
    for sub in ("", "reference", "tools"):
        d = os.path.join(path, sub)
        if os.path.isdir(d):
            out += [os.path.relpath(os.path.join(d, f), FS) for f in sorted(os.listdir(d))
                    if f.endswith((".py", ".md", ".yaml")) and not f.startswith("test_")]
    return out


JSON_TYPES = {str: {"type": "string"}, int: {"type": "integer"}, float: {"type": "number"},
              bool: {"type": "boolean"}, dict: {"type": "object"}}


def _json_type(ann):
    origin = getattr(ann, "__origin__", None)
    if origin is list:
        args = getattr(ann, "__args__", ()) or (str,)
        return {"type": "array", "items": _json_type(args[0])}
    if ann is list:
        return {"type": "array", "items": {"type": "string"}}
    return dict(JSON_TYPES.get(ann, {"type": "string"}))


def tool_spec(fn):
    """A tool as the model sees it: name, docstring, JSON schema of its parameters (without ctx)."""
    params = list(inspect.signature(fn).parameters.values())
    if _wants_ctx(fn):
        params = params[1:]
    props, required = {}, []
    for p in params:
        props[p.name] = _json_type(p.annotation)
        if p.default is inspect.Parameter.empty:
            required.append(p.name)
    return {"name": fn.__name__, "description": inspect.getdoc(fn) or "",
            "parameters": {"type": "object", "properties": props, "required": required}}


# ------------------------------------------------------------------ documents

def umr_from_text(text, lang=None):
    """A plain text (one sentence per line) as a header-only .umr. The Words: lines hold the
    input handler's own tokens (Chinese one character each, a run of Latin letters or digits
    one token; English on whitespace): it reads them back to the same sentence and tokens."""
    import input_handler.umrinputhandler as U
    lines = [U.clean(l) for l in text.splitlines()]
    lines = [l for l in lines if l]
    lang = lang or U.guess_lang(text)
    blocks = []
    for n, line in enumerate(lines, 1):
        words = UZ_TOKEN.findall(line) if lang == "uz" else U.tokenize(line, lang)
        blocks.append("\n".join([RULE80, "# :: snt%d" % n,
                                 "Index: " + " ".join(str(k + 1) for k in range(len(words))),
                                 "Words: " + " ".join(words), "", "# sentence level graph:", "",
                                 "# alignment:", "", "# document level annotation:", ""]))
    head = "# :: lang %s\n" % lang if lang not in ("zh", "en") else ""
    return head + "\n\n".join(blocks) + "\n", lang


def doc_lang(umr_text):
    """The language a document says it is in (`# :: lang uz`), else zh when the sentences (Words:
    lines, else the whole text) have Chinese characters, else en."""
    said = re.search(r"^#\s*::\s*lang\s+(\w+)\s*$", umr_text, re.M)
    if said and said.group(1) in LANGS:
        return said.group(1)
    words = "".join(re.findall(r"^Words:(.*)$", umr_text, re.M)) or umr_text
    return "zh" if re.search(r"[一-鿿]", words) else "en"


def strip_umr(text):
    """A .umr file's sentences, with every annotation dropped: one header-only block per
    `# :: sntN` (its Words: line kept as it is, so the words stay cut as in the file; a block
    without one takes the text after `# :: sntN`, split on whitespace)."""
    blocks = []
    for chunk in re.split(r"^#{20,}\s*$", text.replace("\r", ""), flags=re.M):
        m = re.search(r"^#\s*::\s*snt(\d+)[ \t]*(.*)$", chunk, re.M)
        if not m:
            continue
        w = re.search(r"^Words:[ \t]*(.*)$", chunk, re.M)
        words = (w.group(1) if w else m.group(2)).split()
        if not words:
            continue
        n = len(blocks) + 1
        blocks.append("\n".join([RULE80, "# :: snt%d" % n,
                                 "Index: " + " ".join(str(k + 1) for k in range(len(words))),
                                 "Words: " + " ".join(words), "", "# sentence level graph:", "",
                                 "# alignment:", "", "# document level annotation:", ""]))
    return "\n\n".join(blocks) + "\n" if blocks else ""


# ------------------------------------------------------------------ the registry engine

class RegistryEngine:
    kind = "registry"

    def __init__(self, sid, path, doc_path, lang):
        import registry as R
        from input_handler.umrinputhandler import UMRInputHandler
        self.R = R
        purge_modules()
        self.sid = sid
        self.path = path
        self.reg = R.Registry.load(path)
        self.panel = self._load_panel()                # registry user_panel: the right pane's skills
        self.panel_runs = {}                           # (panel skill, sentence) -> its last run
        self.doc = UMRInputHandler(lang=lang).read(doc_path)
        self.waves = {w.name: w for w in self.reg.waves}
        self.order = [w.name for w in self.reg.waves]
        self.eps = {w: {} for w in self.order}       # wave -> item index -> episode
        self.windows = {}                           # (wave, var) -> [start, stop]
        self.gens = {}                              # (wave, i, node id) -> a jev skill's generator
        self.modules = {}
        self.loading = False                        # umr_load: a person's tree, made without limits
        self.loaded = None                          # what umr_load reported
        self.refs = {}                              # sentence index -> {variable: node name} (umr_load)

    # -- description

    def describe(self):
        R = self.R

        def expr(e):
            if isinstance(e, R.Window):
                return {"window": str(e.source), "range": [e.start, e.stop], "pick": ".".join(e.pick) or None}
            return str(e)

        waves = []
        for w in self.reg.waves:
            waves.append({
                "name": w.name, "start": w.start, "parallel": w.parallel, "max_depth": w.max_depth,
                "max_nodes": w.max_nodes,
                "for_each": {k: str(v) for k, v in w.for_each.items()},
                "context": {k: expr(v) for k, v in w.context.items()},
                "input": {k: expr(v) for k, v in w.input.items()},
                "windows": [{"var": k, "where": where, "source": str(v.source), "range": [v.start, v.stop],
                             "override": self.windows.get((w.name, k))}
                            for where, d in (("context", w.context), ("input", w.input))
                            for k, v in d.items() if isinstance(v, R.Window)],
            })
        skills = []
        for s in self.reg.skills.values():
            files = skill_files(s.path)
            skills.append({"name": s.name, "kind": s.kind, "input": jsonable(s.input), "emit": jsonable(s.emit),
                           "store": s.store, "files": files,
                           "rules": [self._rule_text(r) for r in self.reg.rules(s.name)]})
        shared = [os.path.relpath(os.path.join(os.path.dirname(self.path), f), FS)
                  for f in sorted(os.listdir(os.path.dirname(self.path)))
                  if f.endswith((".py", ".yaml")) and f != "registry.yaml"]
        shared.append(os.path.relpath(self.path, FS))
        shared.append("skillparseumr/skillsets/tools/propbank.py")
        panel = [{"name": n, "title": e.get("title") or n, "kind": e["skill"].kind, "role": e.get("role"),
                  "review": e.get("review"), "modes": e.get("modes"), "input": jsonable(e["skill"].input),
                  "emit": jsonable(e["skill"].emit), "files": skill_files(e["skill"].path)} for n, e in self.panel.items()]
        return {"engine": self.kind, "skillset": self.sid, "waves": waves, "skills": skills, "user_panel": panel,
                "shared_files": shared, "doc": self._doc()}

    def _doc(self):
        return {"id": self.doc.doc_id, "lang": self.doc.lang,
                "sents": [{"index": s.index, "text": s.text, "tokens": s.tokenized_text} for s in self.doc.sents]}

    def _rule_text(self, r):
        when = " and ".join("%s %s %s" % (".".join(c.left.attrs) or str(c.left), "!=" if c.negate else "==", c.value)
                            for c in r.when)
        short = ("each %s: " % r.each[0] if r.each else "") + r.run + (" if " + when if when else "")
        parts = []
        if r.when:
            parts.append("when " + " and ".join("%s %s %r" % (c.left, "!=" if c.negate else "==", c.value)
                                                for c in r.when))
        if r.each:
            parts.append("each %s in %s" % (r.each[0], r.each[1]))
        parts.append("run " + r.run)
        parts.append("(" + ", ".join("%s=%s" % (k, v) for k, v in r.input.items()) + ")")
        if r.edge:
            parts.append("edge " + str(r.edge))
        return {"run": r.run, "text": " ".join(parts), "short": short}

    # -- worktree and expressions

    def worktree(self):
        wt = {}
        for w in self.order:
            n = len(self._items(w, quiet=True))
            wt[w] = [self._tree(w, i) for i in range(n)]
        return wt

    def _tree(self, w, i):
        ep = self.eps[w].get(i)
        if not ep or ep["error"]:
            return None
        if any(n["status"] in ("pending", "running") or _unconfirmed(n) for n in ep["nodes"].values()):
            return None
        nodes = sorted(ep["nodes"].values(), key=lambda n: node_key(n["id"]))
        tree = {"nodes": [self._node_dict(n) for n in nodes], "table": self._table(i, nodes)}
        made = next((n.get("output") for n in nodes if n["skill"] == CONVERT and n["status"] == "ok"), None)
        if isinstance(made, dict):
            sent = self.doc.sents[i]
            tree["generated"] = {"sentence": sent.index, "text": sent.text, "graph": made.get("graph", ""),
                                 "document": made.get("document", "")}
        return tree

    def _table(self, i, steps):
        """Sentence i's nodes as the document step reads them (registry: `pick: table`): its
        number and text, and a row per graph node with how a relation names it ("3:0.0", or
        "3:0.0/x" for another node of that step's fragment), the full span it covers (the step's
        own text for the step's first node), its concept, event or entity, and the step that
        built it ("stop" for a sent_type leaf). A name node is not a row: its words are in its entity's text."""
        sent = self.doc.sents[i]
        tokens = sent.tokenized_text
        joiner = " " if self.doc.lang != "zh" else ""
        rows = []
        by_id = {n["id"]: n for n in steps if n["status"] != "dropped"}
        for n in steps:
            out = n.get("output") if n["status"] == "ok" else None
            g = (out or {}).get("graph") if isinstance(out, dict) else None
            if not isinstance(g, dict) or not g.get("nodes"):
                continue
            names = {t for _, r, t in g.get("edges") or [] if str(r).lstrip(":") == "name"}
            negated = {v for v, r, x in g.get("attrs") or [] if str(r).lstrip(":") == "polarity" and str(x).strip('"') == "-"}
            for k, gn in enumerate(g["nodes"]):
                v = gn.get("var")
                if not v or v in names:
                    continue
                span = gn.get("span") or [0, 0]
                own = joiner.join(tokens[span[0] - 1:span[1]]) if span and span[0] >= 1 else ""
                text = str((n["input"] or {}).get("text") or "") if k == 0 else own
                concept = str(gn.get("concept", ""))
                if n["skill"] == "predicate" and k == 0:
                    kind = "event"
                    if event_attr(out, "aspect") not in (None, "none"):
                        kind += " (%s)" % event_attr(out, "aspect")
                    if out.get("polarity") == "negative" or v in negated:
                        kind += ", negative"
                elif SENSE.search(concept):
                    kind = "event" if n["skill"] == "predicate" else "event (nominal)"
                    if v in negated:
                        kind += ", negative"
                else:
                    kind = "entity"
                row = {"node": "%d:%s%s" % (sent.index, ref_id(n), "" if k == 0 else "/" + v),
                       "text": text or own, "concept": concept, "kind": kind,
                       # sent_type's graph is a leaf it built as it is (type stop): an entity
                       "step": "stop" if n["skill"] == "sent_type" else n["skill"]}
                if n["skill"] == "predicate" and k == 0:
                    # for the modal rule (modal/modal.py): the event's modal strength, and its
                    # quote, purpose, condition, modal predicate and participants
                    if event_attr(out, "modstr"):
                        row["modstr"] = event_attr(out, "modstr")
                    roles = self._roles(by_id, n, sent.index)
                    if roles:
                        row["roles"] = roles
                rows.append(row)
        return {"sentence": sent.index, "text": sent.text, "nodes": rows}

    @staticmethod
    def _roles(by_id, n, index):
        """The nodes a predicate step's event has in the roles the modal rule reads (MODAL_ROLES),
        as "<sentence>:<node>": a placeholder's node, a node inside its fragment, or an outside
        item's (its node, else the step with its span)."""
        out = {}
        o = n.get("output") or {}
        g = o.get("graph") or {}
        local = [x.get("var") for x in g.get("nodes") or [] if isinstance(x, dict)]
        top = local[0] if local else None
        for src, r, tgt in g.get("edges") or []:
            r = str(r).lstrip(":")
            if src != top or r not in MODAL_ROLES or r in out:
                continue
            kid = next((c for c in by_id.values() if c.get("parent") == n["id"] and c.get("edge") == tgt), None)
            if kid is not None:
                out[r] = "%d:%s" % (index, ref_id(kid))
            elif tgt in local:
                out[r] = "%d:%s/%s" % (index, ref_id(n), tgt)
        for x in o.get("outside") or []:
            r = str(x.get("role", "")).lstrip(":") if isinstance(x, dict) else ""
            if r not in MODAL_ROLES or r in out:
                continue
            ref = x.get("node")
            if isinstance(ref, str) and step_of(by_id, ref.strip()):
                out[r] = "%d:%s" % (index, ref.strip())
                continue
            out_r = None
            for c in by_id.values():
                co = c.get("output") or {} if c["status"] == "ok" else {}
                gn = ((co.get("graph") or {}).get("nodes") or [{}])[0] if isinstance(co.get("graph"), dict) else {}
                if not gn:
                    continue
                # the step with the item's span, or whose node is aligned there (a loaded file)
                if (c["input"] or {}).get("span") == x.get("span"):
                    out_r = ref_id(c)
                    break
                if out_r is None and x.get("span") in (gn.get("span"), co.get("alignment")) and x.get("span") != [0, 0]:
                    out_r = ref_id(c)
            if out_r is not None:
                out[r] = "%d:%s" % (index, out_r)
        return out


    def _partial_tree(self, w, i):
        ep = self.eps[w].get(i)
        if not ep:
            return None
        nodes = sorted(ep["nodes"].values(), key=lambda n: node_key(n["id"]))
        return {"nodes": [self._node_dict(n) for n in nodes if n["status"] != "dropped"]}

    @staticmethod
    def _node_dict(n):
        return {"id": n["id"], "skill": n["skill"], "input": n["input"], "parent": n["parent"], "edge": n["edge"],
                "depth": n["depth"], "status": n["status"], **(n["stored"] or {})}

    def _names(self):
        return {"annotation": self.doc, "worktree": self.worktree()}

    def _items(self, w, quiet=False):
        wave = self.waves[w]
        R = self.R
        names = {"annotation": self.doc, "worktree": None}
        if any(p.root == "worktree" for p in wave.for_each.values()):
            names["worktree"] = self.worktree() if not quiet else {x: [None] * len(self.doc.sents)
                                                                    for x in self.order}
        lists = {k: list(R.evaluate(p, names)) for k, p in wave.for_each.items()}
        n = len(next(iter(lists.values()))) if lists else 1
        return [{k: v[i] for k, v in lists.items()} for i in range(n)]

    def _expr(self, w, var, e):
        o = self.windows.get((w, var))
        if o is not None and isinstance(e, self.R.Window):
            return self.R.Window(e.source, int(o[0]), int(o[1]), e.pick)
        return e

    def _eval(self, w, var, e, names, position):
        e = self._expr(w, var, e)
        if isinstance(e, self.R.Window) and e.start >= e.stop:
            return []
        value = self.R.evaluate(e, names, position)
        return value

    def needs(self, w, i):
        """[(wave, item)] of earlier waves this episode reads that are not finished yet."""
        wave = self.waves[w]
        out = []
        n = len(self._items(w, quiet=True))
        for var, e in [*wave.context.items(), *wave.input.items(), *wave.for_each.items()]:
            e = self._expr(w, var, e)
            src = e.source if isinstance(e, self.R.Window) else e
            if src.root != "worktree" or not src.attrs:
                continue
            other = src.attrs[0]
            if isinstance(e, self.R.Window):
                idx = range(max(0, i + e.start), min(n, i + e.stop))
            else:
                idx = [i]
            out += [(other, k) for k in idx if (other != w or k != i) and self._tree(other, k) is None]
        return sorted(set(out), key=lambda x: (self.order.index(x[0]), x[1]))

    def _context(self, w, i):
        wave = self.waves[w]
        items = self._items(w)
        names = {**self._names(), **items[i]}
        pos = (i, len(items))
        ctx = {k: self._eval(w, k, e, names, pos) for k, e in wave.context.items()}
        inp = {k: self._eval(w, k, e, names, pos) for k, e in wave.input.items()}
        return ctx, inp

    # -- episodes and nodes

    def items(self, w):
        out = []
        for i, it in enumerate(self._items(w, quiet=True)):
            ep = self.eps[w].get(i)
            label = self.doc.sents[i].text if i < len(self.doc.sents) else str(i)
            st = "new"
            if ep:
                sts = [n["status"] for n in ep["nodes"].values()]
                st = ("error" if ep["error"] or "error" in sts else
                      "review" if any(_unconfirmed(n) for n in ep["nodes"].values()) else
                      "pending" if "pending" in sts or "running" in sts else "done")
                if ep.get("stale"):
                    st += "+stale"
            out.append({"index": i, "label": label, "status": st,
                        "nodes": len(ep["nodes"]) if ep else 0})
        return out

    def start(self, w, i):
        """(Re)make episode i of wave w from init_input; its root is pending."""
        wave = self.waves[w]
        missing = self.needs(w, i)
        ep = {"index": i, "context": {}, "nodes": {}, "error": None, "stale": False}
        self.eps[w][i] = ep
        self._drop_gens(w, i)
        if missing:
            ep["error"] = "needs " + ", ".join("%s #%d" % (a, b + 1) for a, b in missing[:8]) + \
                          (" ..." if len(missing) > 8 else "") + " first"
            ep["missing"] = missing
            return self.episode(w, i)
        try:
            ctx, inp = self._context(w, i)
        except Exception as e:
            ep["error"] = "%s: %s" % (type(e).__name__, e)
            return self.episode(w, i)
        ep["context"] = ctx
        # a wave may start with several skills side by side (document: modal, temporal, coref), each
        # the first step of its own tree: steps 1, 2, 3; one start is step 0
        starts = wave.start if isinstance(wave.start, list) else [wave.start]
        for k, s in enumerate(starts):
            self._make(w, ep, s, inp, None, None, k + 1 if len(starts) > 1 else 0)
        self._mark_stale(w, i)
        return self.episode(w, i)

    def _make(self, w, ep, skill, inp, parent, edge, position):
        wave = self.waves[w]
        depth = parent["depth"] + 1 if parent else 0
        if wave.max_depth is not None and depth > wave.max_depth:
            return "depth %d is over max_depth %d" % (depth, wave.max_depth)
        live = [n for n in ep["nodes"].values() if n["status"] != "dropped"]
        if wave.max_nodes is not None and len(live) >= wave.max_nodes:
            return "episode already has max_nodes %d" % wave.max_nodes
        a = None if self.loading else parent        # a loaded tree may repeat a part on purpose
        while a:
            if a["skill"] == skill and a["input"] == inp:
                return "same skill and input as node %s" % a["id"]
            a = ep["nodes"].get(a["parent"]) if a["parent"] is not None else None
        nid = new_id(parent["id"] if parent else None, skill, position)
        if nid in ep["nodes"]:
            return "step %s already exists" % nid
        ep["nodes"][nid] = {"id": nid, "skill": skill, "input": jsonable(inp), "parent": parent["id"] if parent else None,
                            "edge": jsonable(edge), "depth": depth, "status": "pending", "output": None,
                            "stored": {}, "error": None, "rounds": [], "prompt": None, "human": False,
                            "children": [], "dropped": [], "rules": [], "machine_output": None,
                            "confirmed": False, "hint": ""}
        self._made = nid
        return None

    def _ep(self, w, i):
        ep = self.eps[w].get(int(i))
        if not ep:
            raise StepError("episode %s #%d has not been started" % (w, int(i) + 1))
        return ep

    def _node(self, w, i, nid):
        ep = self._ep(w, i)
        if nid not in ep["nodes"]:
            raise StepError("no node %s" % nid)
        return ep, ep["nodes"][nid]

    def _inputs(self, ep, node):
        out = {**ep["context"], **node["input"]}
        if node["skill"] == CONVERT and isinstance(ep.get("index"), int):
            # convert checks the alignment against the sentence's tokens as they are now: web-uz cuts
            # them in its first step (tokenizer), and its wave's context has none of its own
            out["token_sent"] = [[k, t] for k, t in enumerate(self.doc.sents[ep["index"]].tokenized_text, 1)]
        return out

    def _skill_module(self, skill):
        path = os.path.join(skill.path, skill.name + ".py")
        mtime = os.stat(path).st_mtime_ns
        key = (path, mtime)
        if key not in self.modules:
            self.modules[key] = _load_module(path, "skill_rules.%s" % skill.name)
        return self.modules[key]

    def _hint_label(self):
        return HINT_LABEL.get(self.doc.lang, HINT_LABEL["en"])

    def step(self, w, i, nid, hint=None):
        """Start running a pending node (or run a finished one again). Returns what the page must
        do next: {"done": node} | {"need": "jev", ...} | {"need": "llm", ...}. A hint (a person's
        note on what the step got wrong) is kept on the node and goes into every later run of it;
        an empty hint removes it."""
        ep, node = self._node(w, i, nid)
        if hint is not None:
            node["hint"] = str(hint).strip()
        if node["status"] == "pending":
            busy = self.running(w, i)
            if busy:
                raise StepError("step %s is still running" % ", ".join(busy))
            wait = self.awaiting(w, i)
            if wait:
                raise StepError("confirm step %s first" % ", ".join(wait))
        else:
            self.reset(w, i, nid)
        skill = self.reg.skills[node["skill"]]
        inputs = self._inputs(ep, node)
        node["rounds"] = []
        node["error"] = None
        node["status"] = "running"     # until _finish or _fail: no other step of the episode starts
        try:
            if skill.kind == "rule":
                out = self._skill_module(skill).run(**inputs)
                return self._finish(w, ep, node, out)
            if skill.kind == "jev":
                gen = self._skill_module(skill).run(**inputs)
                self.gens[(w, int(i), nid)] = gen
                try:
                    req = next(gen)
                except StopIteration as done:
                    return self._finish(w, ep, node, done.value)
                return self._ask(w, i, node, req)
            # agent: skill.md as SkillCallable.prompt_parts builds it, the system prompt of
            # scripts/run_experiment.py, the tools skill_callable._load finds; the answer comes back
            # through the output tool (pydantic-ai's final_result), validated against emit
            node["known"] = self._known(ep, node) if "outside" in skill.emit else None
            node["prompt"] = self._agent_prompt(skill, inputs, node.get("hint"), node["known"])
            node["tool_calls"] = []
            node["retried"] = False
            return self._llm_request(node, skill)
        except Exception as e:
            return self._fail(w, ep, node, e)

    def _known(self, ep, node):
        """The nodes of the episode's sentence a step can point at in `outside` (web): every step
        but this one, by the name of the node it stands for, with its full span and its concept;
        a placeholder whose node is not built yet is there too."""
        rows = []
        for n in sorted(ep["nodes"].values(), key=lambda n: node_key(n["id"])):
            if n is node or n["status"] == "dropped":
                continue
            o = n.get("output") if n["status"] == "ok" else None
            o = o if isinstance(o, dict) else {}
            if n["skill"] == TYPER and n["status"] == "ok" and o.get("type") != "stop" and ref_id(n) in ep["nodes"]:
                continue                    # the step it started has the row
            g = (o.get("graph") or {}).get("nodes") or [] if isinstance(o.get("graph"), dict) else []
            if g and isinstance(g[0], dict):
                concept = str(g[0].get("concept", ""))
            elif o.get("relation") and o.get("relation") != "none":
                concept = str(o["relation"])
            else:
                concept = NOT_BUILT
            rows.append({"node": ref_id(n), "text": str((n["input"] or {}).get("text") or ""), "concept": concept})
        return rows

    def _agent_prompt(self, skill, inputs, hint=None, known=None):
        """{system, instructions, input}: skill.md filled in and cut at "## Input" behind the
        "# Output Format" line, then (web) the table of the sentence's nodes so far when the skill
        has an `outside`, then the hint."""
        with open(os.path.join(skill.path, "skill.md"), encoding="utf-8") as f:
            md = f.read()
        values = {k: prompt_value(v) for k, v in inputs.items()}
        fields = ", ".join('"%s"' % k for k in skill.emit)
        head = "# Output Format\nYou must produce a JSON object with exactly these fields: %s.\n\n" % fields
        cut = md.rfind("\n## Input\n")
        if cut < 0:
            instructions, user = head + md.format(**values), ""
        else:
            instructions, user = head + md[:cut].format(**values), md[cut:].format(**values)
        if known is not None:
            cell = lambda x: str(x).replace("|", "\\|").replace("\n", " ")  # noqa: E731
            table = ["| node | text | concept |", "|---|---|---|"] + [
                "| %s | %s | %s |" % (cell(r["node"]), cell(r["text"]), cell(r["concept"])) for r in known]
            user = user.rstrip("\n") + "\n\n" + KNOWN_HEAD + "\n\n" + ("\n".join(table) if known else "(none yet)") + "\n"
        system = SYSTEM
        if hint:
            user = user.rstrip("\n") + "\n\n" + self._hint_label() + hint + "\n"
            system = SYSTEM + " " + HINT_RULE
        return {"system": system, "instructions": instructions, "input": user}

    def input_markdown(self, w, i, nid):
        """A step's input as Markdown, for the page: an agent skill's "## Input" as the model gets
        it; for a jev or rule skill, each value written the same way."""
        ep, node = self._node(w, i, nid)
        skill = self.reg.skills[node["skill"]]
        inputs = self._inputs(ep, node)
        if skill.kind == "agent":
            known = (node.get("known") if node["status"] != "pending" and node.get("known") is not None
                     else self._known(ep, node)) if "outside" in skill.emit else None
            return self._agent_prompt(skill, inputs, node.get("hint"), known)["input"].strip("\n")
        lines = ["## Input", ""]
        for k, v in inputs.items():
            text = prompt_value(v)
            lines += ["**%s**:" % k, "", text, ""] if "\n" in text else ["**%s**: %s" % (k, text)]
        return "\n".join(lines).strip("\n")

    def _ask(self, w, i, node, req):
        state = jsonable(req.get("state"))
        if node.get("hint"):
            key = HINT_KEY.get(self.doc.lang, HINT_KEY["en"])
            state = {**state, key: node["hint"]} if isinstance(state, dict) else {"state": state, key: node["hint"]}
        node["rounds"].append({"state": state, "questions": jsonable(req.get("questions")), "answers": None})
        return {"need": "jev", "node": node["id"], "skill": node["skill"], "round": len(node["rounds"]),
                "state": node["rounds"][-1]["state"], "questions": node["rounds"][-1]["questions"]}

    def answer(self, w, i, nid, answers):
        """The answers to the node's latest Jev round."""
        ep, node = self._node(w, i, nid)
        gen = self.gens.get((w, int(i), nid))
        if gen is None:
            raise StepError("node %s is not waiting for Jev" % nid)
        node["rounds"][-1]["answers"] = answers
        try:
            req = gen.send(answers)
        except StopIteration as done:
            self.gens.pop((w, int(i), nid), None)
            return self._finish(w, ep, node, done.value)
        except Exception as e:
            self.gens.pop((w, int(i), nid), None)
            return self._fail(w, ep, node, e)
        return self._ask(w, i, node, req)

    def _llm_request(self, node, skill, retry=None):
        p = node["prompt"]
        return {"need": "llm", "node": node["id"], "skill": node["skill"], "system": p["system"],
                "instructions": p["instructions"], "input": p["input"] + (retry or ""),
                "emit": jsonable(skill.emit), "tools": [tool_spec(t) for t in skill_tools(skill.path)],
                "retry": bool(retry), "role": ROLE_OF.get(node["skill"], "haiku")}

    def tool(self, w, i, nid, name, args, manual=False):
        """Run one tool for an agent node; ctx.deps is {"skill_dir", "skill"} as SkillCallable gives it,
        and the sentences of the open document (search_annotations leaves them out)."""
        ep, node = self._node(w, i, nid)
        skill = self.reg.skills[node["skill"]]
        fns = {t.__name__: t for t in skill_tools(skill.path)}
        if name not in fns:
            res = "Unknown tool name: %r. Tools: %s" % (name, ", ".join(sorted(fns)))
        else:
            fn = fns[name]
            try:
                if _wants_ctx(fn):
                    ctx = sys.modules["pydantic_ai"].RunContext({"skill_dir": skill.path, "skill": skill.name, "engine": self,
                                                                 "doc_sentences": [s.text for s in self.doc.sents]})
                    res = fn(ctx, **(args or {}))
                else:
                    res = fn(**(args or {}))
            except Exception as e:
                res = "%s: %s" % (type(e).__name__, e)
        text = res if isinstance(res, str) else json.dumps(jsonable(res), ensure_ascii=False)
        # kept for the page as the model got it (a PropBank answer with every example is long)
        call = {"tool": name, "args": args, "result": text[:200000]}
        if manual:
            call["manual"] = True              # a person's own query, from the tool-calls tab
        node.setdefault("tool_calls", []).append(call)
        return text

    # -- the right pane (registry user_panel): not a wave

    def _load_panel(self):
        """registry.yaml's user_panel: {name: {"skill": Skill, "title", "role", "review", "modes"}},
        in the file's order. Each entry is written like a skill (path, kind, input, emit)."""
        import yaml
        with open(self.path, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        raw = data.get("user_panel") or {}
        if not isinstance(raw, dict):
            raise StepError("user_panel: must be a mapping")
        specs = {n: {k: v for k, v in s.items() if k not in PANEL_KEYS} for n, s in raw.items() if isinstance(s, dict)}
        errors = []
        skills = self.R._build_skills(specs, os.path.dirname(self.path), errors) if specs else {}
        if errors:
            raise StepError("user_panel: " + "; ".join(errors))
        return {n: dict({k: raw[n].get(k) for k in PANEL_KEYS}, skill=skills[n]) for n in skills}

    def _panel(self, name):
        entry = self.panel.get(name)
        if not entry:
            raise StepError("the registry's user_panel has no %s" % name)
        return entry

    def skill_guide(self, name):
        """call_skill: one skill of the procedure (or of the right pane) as the model may read it."""
        name = str(name or "").strip()
        skill = self.reg.skills.get(name) or (self.panel.get(name) or {}).get("skill")
        if not skill:
            return "No skill %r. The skills: %s" % (name, ", ".join(list(self.reg.skills)))
        head = ("# %s (kind: %s)\nIt is given: %s\nIt decides (its output): %s\n\n"
                % (name, skill.kind, json.dumps(jsonable(skill.input), ensure_ascii=False),
                   json.dumps(jsonable(skill.emit), ensure_ascii=False)))
        if skill.kind == "agent":
            with open(os.path.join(skill.path, "skill.md"), encoding="utf-8") as f:
                md = f.read()
            cut = md.rfind("\n## Input\n")
            body = (md[:cut] if cut >= 0 else md).replace("{{", "{").replace("}}", "}")
        else:
            body = ""
            path = os.path.join(skill.path, name + ".py")
            if os.path.exists(path):
                with open(path, encoding="utf-8") as f:
                    src = f.read()
                m = re.match(r'\s*(?:#[^\n]*\n\s*)*[rubRUB]*("""|\'\'\')(.*?)\1', src, re.S)
                body = m.group(2).strip() if m else ""
            body = body or "(its code says nothing about what it does)"
        return (head + body)[:30000]

    def _sentence_graph_text(self, g):
        block = g.get("text") or ""
        return block.split("# sentence level graph:", 1)[-1].split("# alignment:", 1)[0].strip()

    def _umr_names(self, g):
        """(step id, its variable) -> the graph's UMR variable."""
        return {(n.get("node"), n.get("local")): n["var"] for n in g["nodes"] if n.get("node")}

    def tree_markdown(self, i, g=None):
        """The sentence wave's tree of steps (built so far, or whole), one line per step: id, skill,
        status, its piece of the sentence, and what it wrote, with the graph's UMR variables."""
        i = int(i)
        ep = self.eps.get(SENTENCE_WAVE, {}).get(i)
        if not ep or not ep["nodes"]:
            return "(not started: the sentence has no steps yet)"
        g = g or self.graph(i, auto_align=False)
        umr = self._umr_names(g)
        steps = sorted((n for n in ep["nodes"].values() if n["status"] != "dropped"), key=lambda n: node_key(n["id"]))
        status = {"ok": "done", "pending": "not run", "running": "running", "error": "error"}
        lines = []
        for n in steps:
            nid, o = n["id"], (n.get("output") if n["status"] == "ok" else None) or {}
            u = lambda v: umr.get((nid, v), v)  # noqa: E731
            inp = n.get("input") or {}
            head = "%s- %s `%s` (%s)" % ("  " * n["depth"], nid, n["skill"], status.get(n["status"], n["status"]))
            if inp.get("text") is not None:
                head += ' "%s" %s' % (str(inp.get("text")).replace("\n", " "), json.dumps(inp.get("span")))
            parts = []
            if n["status"] == "error":
                parts.append("error: %s" % str(n.get("error") or "")[:200])
            if n["skill"] == TYPER and o:
                parts.append("type: %s" % o.get("type"))
            if o.get("relation") not in (None, "none") and n["skill"] == "discourse":
                parts.append("relation: %s (node %s)" % (o["relation"], u(o.get("var") or "")) if o.get("var")
                             else "relation: %s" % o["relation"])
            frag = o.get("graph") if isinstance(o.get("graph"), dict) else {}
            if frag.get("nodes"):
                parts.append("nodes: " + ", ".join("%s / %s%s" % (u(x.get("var")), x.get("concept"),
                                                                 " %s" % json.dumps(x["span"]) if x.get("span") and x["span"] != [0, 0] else "")
                                                   for x in frag["nodes"] if isinstance(x, dict)))
            edges = [e for e in frag.get("edges") or [] if isinstance(e, (list, tuple)) and len(e) == 3]
            if edges:
                parts.append("edges: " + ", ".join("%s :%s %s" % (u(a), str(r).lstrip(":"), u(b)) for a, r, b in edges))
            attrs = [a for a in frag.get("attrs") or [] if isinstance(a, (list, tuple)) and len(a) == 3]
            if attrs:
                parts.append("attributes: " + ", ".join("%s :%s %s" % (u(a), str(r).lstrip(":"), v) for a, r, v in attrs))
            fields = [(k, o.get(k)) for k in ("aspect", "modstr", "polarity") if o.get(k) not in (None, "", "none")]
            if fields:
                parts.append(", ".join("%s %s" % kv for kv in fields))
            kids = {c["edge"]: c["id"] for c in steps if c.get("parent") == nid}
            holes = [x for x in o.get("open") or [] if isinstance(x, dict)]
            if holes:
                parts.append("placeholders: " + ", ".join('%s "%s" %s → %s' % (x.get("var"), x.get("text"), json.dumps(x.get("span")),
                                                                             kids.get(x.get("var"), "no step"))
                                                         for x in holes))
            outs = [x for x in o.get("outside") or [] if isinstance(x, dict)]
            if outs:
                parts.append("outside: " + ", ".join("%s → %s (%s)" % (x.get("role") or x.get("var") or "", x.get("node") or json.dumps(x.get("span")),
                                                                       x.get("text", "")) for x in outs))
            lines.append(head + ("".join("\n%s  %s" % ("  " * n["depth"], p) for p in parts)))
        return "\n".join(lines)

    @staticmethod
    def variables_markdown(g):
        """The current graph's variables against the steps (nodes of the tree) that wrote them."""
        if not g["nodes"]:
            return "(the graph is empty)"
        rows = ["| UMR variable | concept | step | skill | its variable in the step | words |", "|---|---|---|---|---|---|"]
        for n in g["nodes"]:
            step = n.get("node") or ""
            if n.get("unfilled"):
                step = "%s (a placeholder of it; its step is not done)" % step
            rows.append("| %s | %s | %s | %s | %s | %s |" % (n["var"], n["concept"], step, n.get("skill") or "",
                                                             n.get("local") or "", n.get("words") or ""))
        return "\n".join(rows)

    def panel_values(self, i, comment=""):
        """Every value a user_panel skill may take as input (its registry `input` picks them)."""
        i = int(i)
        sent = self.doc.sents[i]
        g = self.graph(i, auto_align=False)
        return {"sentence": sent.text, "tokens": prompt_value([[k + 1, t] for k, t in enumerate(sent.tokenized_text)]),
                "tree": self.tree_markdown(i, g), "variables": self.variables_markdown(g),
                "graph": self._sentence_graph_text(g) or "(empty)", "comment": str(comment or "").strip(),
                "lang": self.doc.lang, "index": sent.index}

    def panel_start(self, name, i, comment=""):
        """Run an agent skill of the right pane on sentence i: what the page must ask the model."""
        entry = self._panel(name)
        skill = entry["skill"]
        if skill.kind != "agent":
            raise StepError("%s is not a model skill" % name)
        if not str(comment or "").strip():
            raise StepError("write a comment first")
        values = self.panel_values(i, comment)
        missing = [k for k in skill.input if k not in values]
        if missing:
            raise StepError("user_panel.%s.input: no value %s (there are: %s)" % (name, ", ".join(missing), ", ".join(values)))
        p = self._agent_prompt(skill, {k: values[k] for k in skill.input})
        self.panel_runs[(name, int(i))] = {"name": name, "i": int(i), "prompt": p, "tool_calls": [], "retried": False,
                                          "comment": str(comment).strip()}
        return self._panel_request(name, int(i))

    def _panel_request(self, name, i, retry=""):
        entry = self._panel(name)
        skill, run = entry["skill"], self.panel_runs[(name, i)]
        p = run["prompt"]
        return {"need": "llm", "skill": name, "system": p["system"], "instructions": p["instructions"],
                "input": p["input"] + retry, "emit": jsonable(skill.emit),
                "tools": [tool_spec(t) for t in skill_tools(skill.path)], "role": entry.get("role") or "haiku",
                "retry": bool(retry)}

    def panel_tool(self, name, i, tool, args):
        """A tool call of a right-pane skill (call_skill among them)."""
        skill = self._panel(name)["skill"]
        run = self.panel_runs.get((name, int(i)))
        fns = {t.__name__: t for t in skill_tools(skill.path)}
        if tool not in fns:
            res = "Unknown tool name: %r. Tools: %s" % (tool, ", ".join(sorted(fns)))
        else:
            fn = fns[tool]
            try:
                if _wants_ctx(fn):
                    ctx = sys.modules["pydantic_ai"].RunContext({"skill_dir": skill.path, "skill": skill.name, "engine": self,
                                                                 "doc_sentences": [s.text for s in self.doc.sents]})
                    res = fn(ctx, **(args or {}))
                else:
                    res = fn(**(args or {}))
            except Exception as e:
                res = "%s: %s" % (type(e).__name__, e)
        text = res if isinstance(res, str) else json.dumps(jsonable(res), ensure_ascii=False)
        if run is not None:
            run["tool_calls"].append({"tool": tool, "args": args, "result": text[:200000]})
        return text

    def panel_complete(self, name, i, output, model=None):
        """The model's answer for a right-pane skill. local_change: its changes, checked by the
        review skill (apply_change) on the current graph, for the person to look at."""
        i = int(i)
        entry = self._panel(name)
        skill, run = entry["skill"], self.panel_runs.get((name, i))
        if run is None:
            raise StepError("%s has not been started for sentence %d" % (name, i + 1))
        try:
            self._check_emit(skill, output)
            changes = output.get("changes") if isinstance(output, dict) else None
            if "changes" in skill.emit and not all(isinstance(c, dict) and c.get("op") for c in changes or []):
                raise StepError("each change is an object with an op")
        except Exception as e:
            if not run["retried"]:
                run["retried"] = True
                retry = ("\n\n## Your previous answer was not valid\n%s\n%s\n\nFix the errors and answer again."
                         % (e, json.dumps(jsonable(output), ensure_ascii=False)[:3000]))
                return self._panel_request(name, i, retry)
            raise
        run["output"], run["model"] = output, model
        res = {"done": True, "skill": name, "output": output, "prompt": run["prompt"], "tool_calls": run["tool_calls"],
               "model": model}
        if entry.get("review") and isinstance(output, dict) and "changes" in output:
            res["preview"] = self.preview_changes(i, output["changes"], name)
        return res

    def _review_skill(self, name):
        review = self._panel(name).get("review")
        if not review:
            raise StepError("user_panel.%s has no review skill" % name)
        skill = self._panel(review)["skill"]
        if skill.kind != "rule":
            raise StepError("user_panel.%s: review %s must be a rule" % (name, review))
        return skill

    def _working_graph(self, i):
        """Sentence i's graph as apply_change takes it: penman with each event's modal strength as
        :modstr (from its predicate step), and the alignment {var: [first, last]}."""
        import penman
        g = self.graph(i, auto_align=False)
        text = self._sentence_graph_text(g)
        if not g["nodes"] or not text:
            raise StepError("sentence %d has no graph yet" % (int(i) + 1))
        ep = self.eps.get(SENTENCE_WAVE, {}).get(int(i)) or {"nodes": {}}
        align = {}
        for n in g["nodes"]:
            lo, hi = (int(x) for x in str(n.get("align") or "0-0").split("-"))
            if lo > 0:
                align[n["var"]] = [lo, hi]
        extra = []
        for n in g["nodes"]:
            step = ep["nodes"].get(n.get("node") or "")
            if not step or step["skill"] != "predicate" or step["status"] != "ok":
                continue
            o = step.get("output") or {}
            first = ((o.get("graph") or {}).get("nodes") or [{}])[0]
            if isinstance(first, dict) and first.get("var") == n.get("local") and event_attr(o, "modstr"):
                extra.append((n["var"], ":modstr", event_attr(o, "modstr")))
        if extra:
            pg = penman.decode(text)
            have = {(a, r) for a, r, _ in pg.attributes()}
            pg = penman.Graph(pg.triples + [t for t in extra if (t[0], t[1]) not in have], top=pg.top,
                              epidata=pg.epidata)
            text = penman.encode(pg, indent=4)
        return text, align, g

    def _apply_rule(self, i, changes, name):
        skill = self._review_skill(name)
        work, align, g = self._working_graph(i)
        sent = self.doc.sents[int(i)]
        inputs = {"graph": work, "alignment": align, "changes": jsonable(changes or []), "index": sent.index}
        out = self._skill_module(skill).run(**{k: v for k, v in inputs.items() if k in skill.input})
        self._check_emit(skill, out)
        return work, align, g, out

    def preview_changes(self, i, changes, name="local_change"):
        """What the changes would do, without doing it: the review skill on the current graph, and
        the graph with the changes marked (added, deleted, changed) for the penman text and the
        drawing."""
        work, align, g, out = self._apply_rule(int(i), changes, name)
        marks = out.get("marks") or {}
        return {"applied": out.get("applied") or [], "problems": out.get("problems") or [], "marks": marks,
                "lines": marked_penman(work, out["graph"], marks), "graph": marked_graph(g, out, marks),
                "after": out["graph"]}

    def apply_changes(self, i, changes, name="local_change"):
        """The changes a person picked: the review skill (apply_change) makes the new graph, and the
        sentence's steps are made again from it as a .umr is loaded (down to the stop leaves). A
        step the changes did not touch is kept as it was (its prompt, answers, confirmation, and a
        step not run yet stays not run); the document-level relations that named a node follow it
        to its new step, and go with a node that is gone."""
        import copy
        import umr_load
        i = int(i)
        if self.running(SENTENCE_WAVE, i):
            raise StepError("a step of this sentence is running")
        work, align, g, out = self._apply_rule(i, changes, name)
        if not any(a.get("ok") for a in out.get("applied") or []):
            raise StepError("no change could be applied: " + "; ".join(out.get("problems") or []))
        sent = self.doc.sents[i]
        old_ep = copy.deepcopy(self.eps[SENTENCE_WAVE][i])
        old_ref = {}
        for n in g["nodes"]:
            step = old_ep["nodes"].get(n.get("node") or "")
            if step and n.get("local") and not n.get("unfilled"):
                # as the document wave names it, and the long form ("<step>/<var>") work from before used
                old_ref[self._ref_of(sent.index, step, n["local"])] = n["var"]
                old_ref.setdefault("%d:%s/%s" % (sent.index, ref_id(step), n["local"]), n["var"])

        def load(graph, alignment):
            ld = umr_load.Loader(self, origin="changed")
            ld.prepare()
            block = {"words": list(sent.tokenized_text), "graph": graph, "doc": "",
                     "align": {str(v): (int(a[0]), int(a[1])) for v, a in (alignment or {}).items()}}
            with ld.loading():
                refs = ld.sentence(i, block) or {}
            return ld, refs

        def signature(ep):
            return {nid: json.dumps(jsonable([n["skill"], n.get("input"), n.get("output")]), sort_keys=True, ensure_ascii=False)
                    for nid, n in ep["nodes"].items()}
        load(work, align)                  # the graph as it is, the way the loader takes it apart
        before = signature(self.eps[SENTENCE_WAVE][i])
        ld, refs = load(out["graph"], out.get("alignment") or {})
        ep = self.eps[SENTENCE_WAVE][i]
        after = signature(ep)
        kept, changed = [], []
        for nid, node in ep["nodes"].items():
            orig = old_ep["nodes"].get(nid)
            same = (before.get(nid) == after[nid] and orig and orig["skill"] == node["skill"]
                    and orig.get("input") == node.get("input")
                    and [(c, old_ep["nodes"][c].get("edge")) for c in orig.get("children") or [] if c in old_ep["nodes"]]
                    == [(c, ep["nodes"][c].get("edge")) for c in node.get("children") or []])
            if same:
                for k, v in orig.items():
                    if k not in ("id", "parent", "children", "edge", "depth"):
                        node[k] = v
                kept.append(nid)
            else:
                node["changed"] = True
                changed.append(nid)
        self.refs[i] = refs
        followed = self._follow_vars(sent.index, old_ref, refs)
        self._mark_stale(SENTENCE_WAVE, i)
        return {"applied": out.get("applied") or [], "problems": (out.get("problems") or []) + ld.problems,
                "kept": len(kept), "changed": sorted(changed, key=node_key), "doc_followed": followed,
                "graph": out["graph"]}

    @staticmethod
    def _ref_of(index, step, local):
        """How the document wave names a node of a step (as its table does): the step's first node
        (or a node of a step with no fragment) "<sentence>:<step>", another node of its fragment
        "<sentence>:<step>/<var>"."""
        o = step.get("output") if isinstance(step.get("output"), dict) else {}
        g = o.get("graph") if isinstance(o.get("graph"), dict) else {}
        nodes = [x for x in g.get("nodes") or [] if isinstance(x, dict)]
        if not nodes or nodes[0].get("var") == local:
            return "%d:%s" % (index, ref_id(step))
        return "%d:%s/%s" % (index, ref_id(step), local)

    def node_refs(self, upto):
        """{UMR variable: how the document wave names its node} for sentences 0..upto, from their
        graphs as they are now: loaded, generated or annotated step by step."""
        prov = self.render(False)["provenance"]
        out = {}
        for i in range(int(upto) + 1):
            sent = self.doc.sents[i]
            ep = self.eps.get(SENTENCE_WAVE, {}).get(i)
            if not ep:
                continue
            for var, x in (prov.get(str(sent.index)) or prov.get(sent.index) or {}).items():
                step = ep["nodes"].get(x.get("node") or "")
                if step and not x.get("unfilled"):
                    out[var] = self._ref_of(sent.index, step, x.get("var"))
        return out

    def _follow_vars(self, index, old_ref, refs):
        """Document-level relations that named a node of sentence `index` ("<index>:<step>/<var>")
        name it by its new step; a relation with a node that is gone goes."""
        changed = dropped = 0

        def fix(x):
            m = re.fullmatch(r"(\d+):([\d.]+[AB]?)(?:/(\S+))?", str(x))
            if not m or int(m.group(1)) != index or str(x) not in old_ref:
                return x, False
            var = old_ref[str(x)]
            return refs.get(var), refs.get(var) != str(x)
        for dep in (self.eps.get("document") or {}).values():
            for d in dep["nodes"].values():
                for field in ("output", "machine_output", "stored"):
                    o = d.get(field)
                    if not (isinstance(o, dict) and isinstance(o.get("relations"), list)):
                        continue
                    kept = []
                    for r in o["relations"]:
                        if not isinstance(r, dict):
                            kept.append(r)
                            continue
                        src, a = fix(r.get("source"))
                        tgt, b = fix(r.get("target"))
                        if src is None or tgt is None:
                            dropped += field == "output"
                            continue
                        if a or b:
                            changed += field == "output"
                            r = dict(r, source=src, target=tgt)
                        kept.append(r)
                    o["relations"] = kept
        return {"changed": changed, "dropped": dropped}

    def follow_doc_refs(self, i, step, old, new):
        """After a step of sentence i changed its output (a local change, a person's edit), the
        document-level relations that name a node inside it ("<sentence>:<step>/<var>") follow it:
        a variable the step still has stays; one it no longer has goes to the new node with the same
        concept and span, else the same concept, else (its first node) the new first node; a node
        that is gone takes its relations with it. Returns {"changed", "dropped"}."""
        def nodes(o):
            g = (o or {}).get("graph") if isinstance(o, dict) else None
            return [x for x in (g or {}).get("nodes") or [] if isinstance(x, dict) and x.get("var")]
        before, after = nodes(old), nodes(new)
        have = {x["var"] for x in after}
        moved, used = {}, set()
        for k, x in enumerate(before):
            v = x["var"]
            if v in have:
                continue
            pick = [y["var"] for y in after if y["var"] not in used and y.get("concept") == x.get("concept")
                    and y.get("span") == x.get("span")]
            pick = pick or [y["var"] for y in after if y["var"] not in used and y.get("concept") == x.get("concept")]
            if len(pick) >= 1:
                moved[v] = pick[0]
            elif k == 0 and after:
                moved[v] = after[0]["var"]
            else:
                moved[v] = None
            if moved[v]:
                used.add(moved[v])
        if not moved:
            return {"changed": 0, "dropped": 0}
        name = "%d:%s" % (self.doc.sents[int(i)].index, ref_id(step))
        changed = dropped = 0

        def fix(x):
            m = re.fullmatch(r"(\d+:[\d.]+)/(\S+)", str(x))
            if not m or m.group(1) != name or m.group(2) not in moved:
                return x, False
            return (None if moved[m.group(2)] is None else "%s/%s" % (name, moved[m.group(2)])), True
        for dep in (self.eps.get("document") or {}).values():
            for d in dep["nodes"].values():
                for field in ("output", "machine_output", "stored"):
                    o = d.get(field)
                    if not (isinstance(o, dict) and isinstance(o.get("relations"), list)):
                        continue
                    kept = []
                    for r in o["relations"]:
                        if not isinstance(r, dict):
                            kept.append(r)
                            continue
                        src, a = fix(r.get("source"))
                        tgt, b = fix(r.get("target"))
                        if src is None or tgt is None:
                            dropped += field == "output"
                            continue
                        if a or b:
                            changed += field == "output"
                            r = dict(r, source=src, target=tgt)
                        kept.append(r)
                    o["relations"] = kept
        return {"changed": changed, "dropped": dropped}

    def complete(self, w, i, nid, output, model=None):
        """A model's JSON answer for an agent node (and which model gave it). An answer that does
        not fit emit is sent back once with what is wrong (agent.run's retries=1), then the node
        is in error."""
        ep, node = self._node(w, i, nid)
        if model:
            node["model"] = str(model)
        skill = self.reg.skills[node["skill"]]
        try:
            self._check_emit(skill, output)
            self._check_fragment(output)
            self._check_outside(node, output)
            self._check_event_attrs(output)
        except Exception as e:
            if not node.get("retried"):
                node["retried"] = True
                node["problems"] = [str(e)]
                retry = ("\n\n## Your previous answer was not valid\n%s\n%s\n\nFix the errors and answer again."
                         % (e, json.dumps(jsonable(output), ensure_ascii=False)[:3000]))
                return self._llm_request(node, skill, retry)
        try:
            return self._finish(w, ep, node, output)
        except Exception as e:
            return self._fail(w, ep, node, e)

    def fail(self, w, i, nid, error):
        """The page could not get an answer (no key, network, refused): the node is in error."""
        ep, node = self._node(w, i, nid)
        self._drop_gens(w, i, nid)
        node["status"] = "error"
        node["error"] = str(error)
        return self.episode(w, i)

    def _fail(self, w, ep, node, e):
        node["status"] = "error"
        node["error"] = "%s: %s" % (type(e).__name__, e)
        node["trace"] = traceback.format_exc()[-3000:]
        return {"done": True, "node": node["id"], "status": "error", "error": node["error"]}

    @staticmethod
    def _check_event_attrs(out):
        """An aspect or modstr attribute (predicate: on the event node) has one of UMR's values."""
        from umr_load import ASPECTS, MODSTRS
        g = out.get("graph") if isinstance(out, dict) and isinstance(out.get("graph"), dict) else {}
        bad = []
        for a in g.get("attrs") or []:
            if not (isinstance(a, (list, tuple)) and len(a) == 3):
                continue
            role, value = str(a[1]).lstrip(":"), str(a[2]).strip('"')
            if role == "aspect" and value not in ASPECTS:
                bad.append("aspect %r (one of: %s)" % (value, ", ".join(ASPECTS)))
            elif role in ("modstr", "modal-strength") and value not in MODSTRS:
                bad.append("modstr %r (one of: %s)" % (value, ", ".join(MODSTRS)))
        if bad:
            raise StepError("attrs: " + "; ".join(bad))

    @staticmethod
    def _check_fragment(out):
        """A fragment's variables are its own names for its nodes, placeholders and outside items:
        each names one thing. (They are renamed when the .umr is written; a document relation
        names one as "<sentence>:<step>/<var>", so it is told apart from other steps' by the step.)"""
        if not isinstance(out, dict) or not isinstance(out.get("graph"), dict):
            return
        names = [x.get("var") for x in out["graph"].get("nodes") or [] if isinstance(x, dict)]
        names += [x.get("var") for k in ("open", "outside") for x in out.get(k) or [] if isinstance(x, dict) and x.get("var")]
        twice = sorted({v for v in names if names.count(v) > 1})
        if twice:
            raise StepError("each variable names one node, placeholder or outside item; used more than once: %s"
                            % ", ".join(map(str, twice)))

    @staticmethod
    def _check_outside(node, out):
        """Each `outside` item names a node of the table the step was given (web)."""
        known = node.get("known")
        if known is None or not isinstance(out, dict) or not isinstance(out.get("outside"), list):
            return
        names = {r["node"] for r in known}
        bad = [x for x in out["outside"] if not (isinstance(x, dict) and str(x.get("node", "")).strip() in names)]
        if bad:
            raise StepError("each outside item must name a node of the table \"Nodes of this sentence so far\" "
                            "by its `node` (one of: %s); not %s" % (", ".join(sorted(names, key=node_key)) or "none",
                                                                  json.dumps(jsonable(bad), ensure_ascii=False)[:300]))

    def _check_emit(self, skill, out):
        if not isinstance(out, dict):
            raise StepError("the output is not an object")
        missing = [k for k in skill.emit if k not in out]
        if missing:
            raise StepError("the output has no " + ", ".join(missing))
        clean = {}
        for k, t in skill.emit.items():
            v = out[k]
            if isinstance(t, list):
                if self.loading and v == "none":
                    pass            # a loaded file can leave a choice empty (umr_load: modstr)
                elif v not in t:
                    raise StepError("%s = %r is not one of %s" % (k, v, ", ".join(map(str, t))))
            elif t in ("list[str]", "list[int]", "list[float]", "list[dict]") and not isinstance(v, list):
                raise StepError("%s must be a list" % k)
            elif t == "dict" and not isinstance(v, dict):
                raise StepError("%s must be an object" % k)
            elif t == "str" and not isinstance(v, str):
                raise StepError("%s must be a string" % k)
            clean[k] = v
        return jsonable(clean)

    def _finish(self, w, ep, node, out, human=False):
        """Store the output and make the children the dispatcher asks for (runner._dispatch)."""
        R = self.R
        skill = self.reg.skills[node["skill"]]
        try:
            out = self._check_emit(skill, out)
        except Exception as e:
            return self._fail(w, ep, node, e)
        if not human:
            node["machine_output"] = out
        node["output"] = out
        node["human"] = human
        node["confirmed"] = human      # a person's output is confirmed by being written
        node["stored"] = {k: out[k] for k in skill.store}
        names = {**ep["context"], **node["input"], self.reg.emit_name(node["skill"]): out}
        children = []
        node["rules"] = []
        try:
            for n, rule in enumerate(self.reg.rules(node["skill"])):
                if not R.holds(rule, names):
                    continue
                node["rules"].append(n)
                items = [{rule.each[0]: x} for x in R.evaluate(rule.each[1], names)] if rule.each else [{}]
                for item in items:
                    scope = {**names, **item}
                    inp = {k: R.evaluate(e, scope) for k, e in rule.input.items()}
                    edge = R.evaluate(rule.edge, scope) if rule.edge else None
                    children.append((rule.run, inp, edge))
        except R.ExpressionError as e:
            return self._fail(w, ep, node, e)
        node["status"] = "ok"
        node["children"], node["dropped"] = [], []
        for position, (s, inp, edge) in enumerate(children):
            why = self._make(w, ep, s, inp, node, edge, position)
            if why:
                node["dropped"].append({"skill": s, "input": jsonable(inp), "reason": why})
            else:
                node["children"].append(self._made)
        self._mark_stale(w, ep["index"])
        if node["skill"] == TOKENIZER and not self.loading:
            try:
                self._set_tokens(ep["index"], out.get("tokens"))
            except StepError as e:
                return self._fail(w, ep, node, e)
        if node["skill"] == CONVERT and not self.loading:
            node["applied"] = self._apply_generated(ep["index"], out)
        return {"done": True, "node": node["id"], "status": "ok", "children": node["children"]}

    def _set_tokens(self, i, tokens, mark=True):
        """The tokenizer's tokens (web-uz, wave 0) become sentence i's: every span after counts them.
        They must hold every character of the sentence but its spaces, in order."""
        sent = self.doc.sents[int(i)]
        tokens = [str(t) for t in tokens or [] if str(t).strip()]
        if not tokens or any(re.search(r"\s", t) for t in tokens):
            raise StepError("the tokens are empty or have spaces in them")
        if "".join(tokens) != re.sub(r"\s+", "", sent.text):
            raise StepError("the tokens are not the sentence (%s)" % " | ".join(tokens)[:300])
        if list(sent.tokenized_text) != tokens:
            sent.tokenized_text = tokens
            for w in (self.order if mark else []):
                if w != GENERATE_WAVE:
                    self._mark_stale(w, int(i))

    def _side_by_side(self):
        """Work kept from before: a wave that now starts with several skills (document: modal,
        temporal, coref) kept them as one tree (modal 0, temporal 0.0, coref 0.1). They become the
        wave's steps 1, 2, 3, side by side, as they are."""
        for w in self.order:
            starts = self.waves[w].start
            if not isinstance(starts, list) or len(starts) < 2:
                continue
            for ep in self.eps[w].values():
                nodes = ep["nodes"]
                if "0" not in nodes or any(k != "0" and not re.fullmatch(r"0\.\d+", k) for k in nodes):
                    continue
                if sorted(n["skill"] for n in nodes.values()) != sorted(starts):
                    continue
                new = {}
                for n in nodes.values():
                    nid = str(starts.index(n["skill"]) + 1)
                    new[nid] = dict(n, id=nid, parent=None, edge=None, depth=0, children=[])
                ep["nodes"] = new

    def _tokens_from_steps(self):
        """After a restore: each sentence takes the tokens its tokenizer step gave (the document file
        has the first ones)."""
        for i, ep in (self.eps.get(GENERATE_WAVE) or {}).items():
            for n in ep["nodes"].values():
                if n["skill"] == TOKENIZER and n["status"] == "ok" and isinstance(n.get("output"), dict):
                    try:
                        self._set_tokens(i, n["output"].get("tokens"), mark=False)
                    except StepError:
                        pass

    def _apply_generated(self, i, out):
        """Wave 0: sentence i's checked graph into the sentence and document waves (their episodes
        for the sentence are made again), each step tagged "generated", with the tool calls its
        skill would make done for it (_simulate_tools)."""
        import umr_load
        try:
            rep = umr_load.load_generated(self, i, out.get("graph", ""), out.get("alignment") or {},
                                          out.get("document", ""))
        except Exception as e:
            return {"steps": 0, "problems": ["%s: %s" % (type(e).__name__, e)]}
        for w in ("sentence", "document"):
            if w in self.eps and i in self.eps[w]:
                self._simulate_tools(w, i)
        return {"steps": rep["steps"], "problems": rep["problems"][:20]}

    def _simulate_tools(self, w, i):
        """The tool calls a loaded or generated step's skill would have made, made for it, so that a
        person checking the step sees them: propbank_lookup for every concept with a sense."""
        ep = self.eps[w].get(i)
        if not ep:
            return
        for n in ep["nodes"].values():
            o = n.get("output") if n["status"] == "ok" else None
            g = (o or {}).get("graph") if isinstance(o, dict) else None
            if not isinstance(g, dict) or n.get("tool_calls"):
                continue
            lemmas = []
            for x in g.get("nodes") or []:
                c = str((x or {}).get("concept", ""))
                if SENSE.search(c) and not re.search(r"-9\d$", c):
                    lemma = SENSE.sub("", c)
                    if lemma not in lemmas:
                        lemmas.append(lemma)
            if not lemmas:
                continue
            skill = self.reg.skills.get(n["skill"])
            fns = {t.__name__: t for t in skill_tools(skill.path)} if skill else {}
            if "propbank_lookup" not in fns:
                continue
            args = {"lemmas": lemmas, "language": self.doc.lang}
            try:
                res = fns["propbank_lookup"](**args)
            except Exception as e:
                res = "%s: %s" % (type(e).__name__, e)
            text = res if isinstance(res, str) else json.dumps(jsonable(res), ensure_ascii=False)
            n["tool_calls"] = [{"tool": "propbank_lookup", "args": args, "result": text[:200000], "simulated": True}]

    def _descendants(self, ep, nid):
        return [k for k in ep["nodes"] if under(k, nid)]

    def _drop_gens(self, w, i, nid=None):
        for key in list(self.gens):
            if key[0] == w and key[1] == int(i) and (nid is None or key[2] == nid or under(key[2], nid)):
                del self.gens[key]

    def reset(self, w, i, nid):
        """Forget the node's output and everything under it; it is pending again."""
        ep, node = self._node(w, i, nid)
        for k in self._descendants(ep, nid):
            del ep["nodes"][k]
        self._drop_gens(w, i, nid)
        node.update(status="pending", output=None, stored={}, error=None, rounds=[], prompt=None, human=False,
                    children=[], dropped=[], rules=[], tool_calls=[], retried=False, problems=[],
                    confirmed=False, loaded=False, model=None)
        self._mark_stale(w, int(i))
        return self.episode(w, i)

    def set_output(self, w, i, nid, output):
        """A person's output for the node: it replaces the model's, and the steps under it are made
        again from it. A step under it that is made again with the same skill, input and edge (the
        edit did not change what it gets: document's temporal and coref under modal, a placeholder
        whose text stayed) is kept as it was, with everything under it."""
        ep, node = self._node(w, i, nid)
        machine = node.get("machine_output")
        old = node.get("output")
        before = {k: ep["nodes"].pop(k) for k in self._descendants(ep, nid)}
        self._drop_gens(w, i, nid)
        res = self._finish(w, ep, node, output, human=True)
        node["machine_output"] = machine
        kept = []
        for c in list(node.get("children") or []):
            was, now = before.get(c), ep["nodes"].get(c)
            if was and now and was["status"] != "running" and all(
                    jsonable(was.get(k)) == jsonable(now.get(k)) for k in ("skill", "input", "edge")):
                ep["nodes"][c] = was
                for k, n in before.items():
                    if under(k, c):
                        ep["nodes"][k] = n
                kept.append(c)
        if kept:
            node["kept_children"] = kept
        if w == SENTENCE_WAVE and not self.loading and node["status"] == "ok":
            node["doc_followed"] = self.follow_doc_refs(i, node, old, node.get("output"))
        return res

    def _mark_stale(self, w, i):
        later = self.order[self.order.index(w) + 1:]
        for o in later:
            for k, ep in self.eps[o].items():
                if k >= i:
                    ep["stale"] = True

    def confirm(self, w, i, nid):
        """A person says the node's output is right: the episode's next step may run."""
        ep, node = self._node(w, i, nid)
        if node["status"] != "ok":
            raise StepError("step %s has no output to confirm" % nid)
        node["confirmed"] = True
        return self.episode(w, i)

    def awaiting(self, w, i):
        """Finished steps of the episode that nobody has confirmed (an error counts: it must be
        re-run or corrected)."""
        ep = self.eps[w].get(int(i))
        if not ep:
            return []
        return [n["id"] for n in sorted(ep["nodes"].values(), key=lambda n: node_key(n["id"])) if _unconfirmed(n)]

    def running(self, w, i):
        ep = self.eps[w].get(int(i))
        return [n["id"] for n in ep["nodes"].values() if n["status"] == "running"] if ep else []

    def next_step(self, w, i):
        """What runs next in the episode: {"node": id}, {"running": [ids]}, {"awaiting": [ids]} or
        {"done": True}."""
        busy = self.running(w, i)
        if busy:
            return {"running": busy}
        wait = self.awaiting(w, i)
        if wait:
            return {"awaiting": wait}
        nid = self.next_pending(w, i)
        return {"node": nid} if nid else {"done": True}

    def pending(self, w, i):
        """Pending nodes not already waiting for an answer, breadth first."""
        ep = self.eps[w].get(int(i))
        if not ep:
            return []
        pend = [n for n in ep["nodes"].values() if n["status"] == "pending"
                and (w, int(i), n["id"]) not in self.gens]
        pend.sort(key=lambda n: (n["depth"], node_key(n["id"])))
        return [n["id"] for n in pend]

    def next_pending(self, w, i):
        p = self.pending(w, i)
        return p[0] if p else None

    def episode(self, w, i):
        ep = self.eps[w].get(int(i))
        items = self._items(w, quiet=True)
        label = self.doc.sents[int(i)].text if int(i) < len(self.doc.sents) else ""
        if not ep:
            return {"wave": w, "index": int(i), "label": label, "started": False, "nodes": [],
                    "needs": [list(x) for x in self.needs(w, int(i))]}
        nodes = []
        for n in sorted(ep["nodes"].values(), key=lambda n: node_key(n["id"])):
            skill = self.reg.skills[n["skill"]]
            stop = n["skill"] == TYPER and n["status"] == "ok" and (n.get("output") or {}).get("type") == "stop"
            nodes.append({"id": n["id"], "shown": ref_id(n) if stop else n["id"], "skill": n["skill"],
                          "kind": skill.kind, "edge": n["edge"],
                          "depth": n["depth"], "status": n["status"], "human": n["human"],
                          "parent": n["parent"], "text": n["input"].get("text") if isinstance(n["input"], dict) else None,
                          "summary": self._summary(n), "waiting": (w, int(i), n["id"]) in self.gens,
                          "error": n["error"], "confirmed": bool(n.get("confirmed")), "hint": n.get("hint") or "",
                          "loaded": bool(n.get("loaded")), "origin": n.get("origin") or ""})
        return {"wave": w, "index": int(i), "label": label, "started": True, "error": ep["error"],
                "stale": ep.get("stale", False), "context": jsonable(ep["context"]), "nodes": nodes,
                "needs": [list(x) for x in ep.get("missing", [])], "count": len(items),
                "awaiting": self.awaiting(w, i)}

    @staticmethod
    def _summary(n):
        o = n["output"]
        if not o:
            return ""
        if "type" in o:
            return str(o["type"])
        if "relation" in o:
            return str(o["relation"])
        g = o.get("graph")
        if isinstance(g, dict) and g.get("nodes"):
            return " ".join(str(x.get("concept")) for x in g["nodes"][:4])
        if "relations" in o:
            return "%d relations" % len(o["relations"])
        if "span" in o:
            return str(o["span"])
        return ""

    def node(self, w, i, nid):
        ep, n = self._node(w, i, nid)
        skill = self.reg.skills[n["skill"]]
        files = skill_files(skill.path)
        return {**jsonable({k: v for k, v in n.items() if k != "trace"}), "kind": skill.kind,
                "emit": jsonable(skill.emit), "files": files, "context_keys": list(ep["context"]),
                "trace": n.get("trace"), "waiting": (w, int(i), nid) in self.gens,
                "input_md": self._input_md(w, i, nid),
                "tool_specs": [tool_spec(t) for t in skill_tools(skill.path)]}

    def _input_md(self, w, i, nid):
        try:
            return self.input_markdown(w, i, nid)
        except Exception:             # a skill.md being edited may not format: show the JSON
            return None

    def set_window(self, w, var, rng):
        if rng is None:
            self.windows.pop((w, var), None)
        else:
            self.windows[(w, var)] = [int(rng[0]), int(rng[1])]
        return self.describe()

    # -- output

    def _sentence_out(self, i):
        """Sentence i's tree as the output handler reads it, with one antecedent node for each item
        of a step's `outside` (there is no antecedent step: the participant stays in the step that
        found it). Such a node has the item's span and text, hangs under that step with the item's
        role (predicate) or var (the others) as its edge, and is joined to a node by merges().
        Each node keeps its step's output as `_output`, and an antecedent its item as `_item`."""
        ep = self.eps["sentence"].get(i)
        if not ep:
            return None
        nodes = sorted((n for n in ep["nodes"].values() if n["status"] != "dropped"), key=lambda n: node_key(n["id"]))
        out = [dict(self._node_dict(n), _output=n.get("output") or {}) for n in nodes]
        for n in nodes:
            # an item names the node it stands for (web: "node", from the table in the input), or
            # gives its span (a loaded file, or work from before)
            items = [x for x in ((n.get("output") or {}).get("outside") or []) if n["status"] == "ok"
                     and isinstance(x, dict) and (isinstance(x.get("node"), str)
                                                  or (isinstance(x.get("span"), list) and len(x["span"]) == 2))]
            for k, item in enumerate(items):
                span = item.get("span")
                if not (isinstance(span, list) and len(span) == 2):
                    target = step_of(ep["nodes"], item["node"])
                    span = list((target or {}).get("input", {}).get("span") or [0, 0])
                out.append({"id": "%s.%dA" % (n["id"], k), "skill": "antecedent", "parent": n["id"],
                            "input": {"text": item.get("text", ""), "span": list(span)},
                            "edge": item.get("role") if n["skill"] == "predicate" else item.get("var"),
                            "depth": n["depth"] + 1, "status": "ok", "span": list(span),
                            "_output": {}, "_item": item})
        out.sort(key=lambda x: node_key(x["id"]))
        return out

    def merges(self, i, nodes=None):
        """Which nodes of sentence i's tree are one. There is no reentrancy wave (nor its rule,
        reentrancy/reentrancy.py, which merged by type and span) and no antecedent step: this is
        done when the .umr is written, by span and concept:
          - two nodes with the same span and the same concept are one (the later is merged into
            the first that is not its ancestor); a node is a step that writes a concept
            (predicate, np_phrase, special_entity, a sent_type leaf), its span is its input's;
          - a participant written outside a piece (an item of a step's `outside`) is the node
            the item names (web: its "node", from the table of the sentence's nodes in the
            step's input); an item with no node (a loaded file, earlier work) is the first
            node with its span, else the first whose head (its alignment, or a leaf's node) has
            it, never one it is inside of; when the item names the concept it stands for (one
            loaded from a file does), the node's concept must be that one too, and it may be one
            it is inside of (a relative clause's participant is the noun it describes)."""
        nodes = nodes if nodes is not None else self._sentence_out(i)
        if not nodes:
            return []
        parent = {n["id"]: n["parent"] for n in nodes}
        ok = [n for n in nodes if n["status"] == "ok"]

        def ancestors(nid):
            out = set()
            while parent.get(nid) is not None:
                nid = parent[nid]
                out.add(nid)
            return out

        def concept_of(n):
            o = n["_output"]
            if n["skill"] not in FRAGMENT_SKILLS and not (n["skill"] == "sent_type" and o.get("type") == "stop"):
                return None
            g = (o.get("graph") or {}).get("nodes") or []
            return _concept_key(g[0].get("concept")) if g and isinstance(g[0], dict) else None

        def head_of(n):
            o = n["_output"]
            head = o.get("alignment")
            if not head and n["skill"] == "sent_type":
                g = (o.get("graph") or {}).get("nodes") or []
                head = g[0].get("span") if g and isinstance(g[0], dict) else None
            return tuple(head) if isinstance(head, (list, tuple)) and len(head) == 2 else None

        kept, by_span, by_head, out = {}, {}, {}, []
        for n in ok:
            c, span = concept_of(n), n["input"].get("span")
            if c is None or not span:
                continue
            key = (tuple(span), c)
            into = next((k for k in kept.get(key, []) if k not in ancestors(n["id"])), None)
            if into is not None:
                out.append({"node": n["id"], "into": into})
                continue
            kept.setdefault(key, []).append(n["id"])
            by_span.setdefault(tuple(span), []).append((n["id"], c))
            if head_of(n):
                by_head.setdefault(head_of(n), []).append((n["id"], c))
        by_id = {n["id"]: n for n in ok}
        for n in ok:
            if n["skill"] != "antecedent":
                continue
            ref = n["_item"].get("node")
            if isinstance(ref, str) and ref.strip():
                # named by its node: that node, whatever its span (web)
                target = step_of(by_id, ref.strip())
                if target is not None and target["skill"] != "antecedent" and target["id"] != n["parent"]:
                    out.append({"node": n["id"], "into": target["id"]})
                    continue
            if not n["input"].get("span") or list(n["input"]["span"]) == [0, 0]:
                continue
            span = tuple(n["input"]["span"])
            want = _concept_key(n["_item"]["concept"]) if n["_item"].get("concept") else None
            # without a concept, never a node it is inside of; with one, span and concept say which
            up = ancestors(n["id"]) if want is None else set()
            into = next((k for k, c in by_span.get(span, []) + by_head.get(span, [])
                         if k not in up and (want is None or c == want)), None)
            if into is not None:
                out.append({"node": n["id"], "into": into})
        return out

    def _worktree_out(self):
        """The worktree the output handler reads: the sentence trees with their outside
        participants as antecedent nodes, the merges (by span and concept) where its reentrancy
        wave would be, and the other waves as they are."""
        wt = {w: [self._partial_tree(w, i) for i in range(len(self.doc.sents))] for w in self.order}
        sentence, merges = [], []
        for i in range(len(self.doc.sents)):
            nodes = self._sentence_out(i)
            merges.append({"nodes": [{"id": "0", "merges": self.merges(i, nodes)}]} if nodes else None)
            sentence.append({"nodes": [{k: v for k, v in n.items() if not k.startswith("_")} for n in nodes]}
                            if nodes else None)
        wt["sentence"], wt["reentrancy"] = sentence, merges
        # a document relation names a sentence leaf "3:0.1" (ref_id); its step is 0.1B
        ids = [{n["id"] for n in (t or {}).get("nodes") or []} for t in sentence]

        def step_ref(x):
            m = re.fullmatch(r"\s*(\d+)\s*:\s*([\d.]+)(/\S+)?\s*", str(x))
            if not m or not 0 < int(m.group(1)) <= len(ids):
                return x
            have = ids[int(m.group(1)) - 1]
            if m.group(2) not in have and m.group(2) + "B" in have:
                return "%s:%sB%s" % (m.group(1), m.group(2), m.group(3) or "")
            return x
        for t in wt.get("document") or []:
            for n in (t or {}).get("nodes") or []:
                rels = n.get("relations")
                if isinstance(rels, list):
                    n["relations"] = [dict(r, source=step_ref(r.get("source")), target=step_ref(r.get("target")))
                                      if isinstance(r, dict) else r for r in rels]
            # web: modal, temporal and coref are three steps; the output handler reads the root's
            if t and t.get("nodes"):
                t["nodes"][0] = dict(t["nodes"][0], relations=[r for n in t["nodes"] if n.get("status") == "ok"
                                                              for r in n.get("relations") or []])
        return wt

    def render(self, auto_align=True):
        from output_handler.umroutputhandler import UMROutputHandler, provenance
        wt = self._worktree_out()
        text = UMROutputHandler().render(self.doc, wt)
        added = []
        if auto_align:
            text, added = auto_align_umr(text, self.doc.lang)
        try:
            prov = provenance(self.doc, wt)
        except Exception:
            prov = {}
        return {"text": text, "added": added, "provenance": jsonable(prov),
                "sentences": split_umr(text)}

    def graph(self, i, auto_align=True):
        """Sentence i's assembled graph as nodes and edges, for drawing: every variable with its
        concept, alignment (and the words there) and the tree node that made it; the edges between
        variables; the attributes (constants); and the sentence's document-level relations."""
        import penman
        out = self.render(auto_align)
        sent = self.doc.sents[int(i)]
        block = next((b["text"] for b in out["sentences"] if b["index"] == sent.index), "")
        graph = block.split("# sentence level graph:", 1)[-1].split("# alignment:", 1)[0].strip()
        align_text = block.split("# alignment:", 1)[-1].split("# document level annotation:", 1)[0]
        doc_text = block.split("# document level annotation:", 1)[-1]
        align = dict(re.findall(r"^\s*(\S+):\s*(\d+-\d+)\s*$", align_text, re.M))
        added = {v for n, v, _ in out["added"] if n == sent.index}
        prov = out["provenance"].get(str(sent.index)) or out["provenance"].get(sent.index) or {}
        tokens = sent.tokenized_text
        res = {"index": sent.index, "tokens": tokens, "text": block, "top": None, "nodes": [], "edges": [],
               "attrs": [], "doc": read_doc(doc_text), "error": None}
        if not graph or graph.startswith("(s%dx0 / empty" % sent.index):
            return res
        try:
            g = penman.decode(graph)
        except Exception as e:
            res["error"] = "%s: %s" % (type(e).__name__, e)
            return res
        res["top"] = g.top
        for v, _, concept in g.instances():
            a = align.get(v, "0-0")
            lo, hi = (int(x) for x in a.split("-"))
            p = prov.get(v) or {}
            res["nodes"].append({"var": v, "concept": concept, "align": a, "auto": v in added,
                                 "words": " ".join(tokens[lo - 1:hi]) if lo > 0 else "",
                                 "node": p.get("node"), "skill": p.get("skill"), "local": p.get("var"),
                                 "unfilled": bool(p.get("unfilled"))})
        res["edges"] = [{"src": a, "role": r.lstrip(":"), "tgt": b} for a, r, b in g.edges()]
        res["attrs"] = [{"var": a, "role": r.lstrip(":"), "value": str(b)} for a, r, b in g.attributes()]
        return res

    def export(self):
        return {"skillset": self.sid, "doc": self._doc(), "windows": [[w, v, r] for (w, v), r in self.windows.items()],
                "episodes": {w: {str(i): {k: v for k, v in ep.items() if k != "missing"}
                                 for i, ep in eps.items()} for w, eps in self.eps.items()}}

    def training(self, unconfirmed=False):
        """One training example per finished step, for every wave: what the step was given (the
        episode's context and the step's input) and what it gave back (its output; a person's
        when they edited it). No skill.md, prompt or tool calls: only the step's name says which
        task it is. Steps not confirmed yet are left out unless `unconfirmed`; a step from a
        loaded file counts as confirmed."""
        records, left = [], 0
        for w in self.order:
            for i in sorted(self.eps[w]):
                ep = self.eps[w][i]
                for nid in sorted(ep["nodes"], key=node_key):
                    n = ep["nodes"][nid]
                    if n["status"] != "ok" or n["output"] is None:
                        continue
                    if not n.get("confirmed") and not unconfirmed:
                        left += 1
                        continue
                    rec = {"doc": self.doc.doc_id, "lang": self.doc.lang, "wave": w, "item": int(i) + 1,
                           "step": nid, "skill": n["skill"], "context": ep["context"], "input": n["input"],
                           "output": n["output"],
                           "source": "loaded" if n.get("loaded") else "human" if n["human"] else "model",
                           "confirmed": bool(n.get("confirmed"))}
                    if n.get("model"):
                        rec["model"] = n["model"]
                    if n.get("hint"):
                        rec["hint"] = n["hint"]
                    if n.get("known") is not None:
                        rec["sentence_nodes"] = n["known"]   # the table of the sentence's nodes it was given
                    machine = n.get("machine_output")
                    if n["human"] and machine is not None and machine != n["output"]:
                        rec["model_output"] = machine      # what the model wrote before the person's edit
                    records.append(jsonable(rec))
        return {"records": records, "left_out": left}

    def snapshot(self):
        """The work so far, to keep and restore: every wave's episodes (their steps with outputs,
        confirmations, hints, Jev rounds, prompts, tool calls) and the window settings. Kept small:
        an episode's first step has the wave's init input, made again on restore (a document
        step's is whole trees), and a long text that recurs (a skill.md prompt, a question) is
        written once, in `texts`."""
        texts, seen = [], {}

        def pack(x):
            if isinstance(x, str) and len(x) >= 300:
                if x not in seen:
                    seen[x] = len(texts)
                    texts.append(x)
                return {"$t": seen[x]}
            if isinstance(x, dict):
                return {k: pack(v) for k, v in x.items()}
            if isinstance(x, list):
                return [pack(v) for v in x]
            return x

        eps = {}
        for w, by_i in self.eps.items():
            eps[w] = {}
            for i, ep in by_i.items():
                ep = jsonable(ep)
                for n in ep["nodes"].values():
                    if n["parent"] is None:
                        n["input"] = None
                eps[w][str(i)] = pack(ep)
        return {"version": 3, "skillset": self.sid, "doc": self.doc.doc_id,
                "windows": [[w, v, r] for (w, v), r in self.windows.items()], "texts": texts, "eps": eps,
                "refs": {str(k): v for k, v in self.refs.items()}}

    def _renumber_old(self):
        """Work kept before the step ids changed (version < 3: "0", "0.0", "0.0.0", ...): every
        step gets its id as _make gives it now ("0B", "0", "0.0B", ...), and the document
        relations name the new nodes."""
        names = {}                      # (sentence number, old id) -> the node's name now
        for w in self.order:
            for i, ep in self.eps[w].items():
                old = ep.get("nodes") or {}
                ids, new = {}, {}
                for oid in sorted(old, key=node_key):
                    n = old[oid]
                    pid = ids.get(n["parent"]) if n.get("parent") is not None else None
                    nid = new_id(pid, n["skill"], int(str(oid).rsplit(".", 1)[-1]))
                    ids[oid] = nid
                    new[nid] = dict(n, id=nid, parent=pid)
                for n in new.values():
                    n["children"] = [ids[c] for c in n.get("children") or [] if c in ids]
                ep["nodes"] = new
                if w == "sentence" and i < len(self.doc.sents):
                    for oid, nid in ids.items():
                        names[(self.doc.sents[i].index, oid)] = ref_id(new[nid])

        def fix(x):
            m = re.fullmatch(r"\s*(\d+)\s*:\s*([\d.]+)(/\S+)?\s*", str(x))
            key = (int(m.group(1)), m.group(2)) if m else None
            return "%s:%s%s" % (m.group(1), names[key], m.group(3) or "") if key in names else x
        for ep in self.eps.get("document", {}).values():
            for n in ep["nodes"].values():
                for field in ("output", "machine_output", "stored"):
                    o = n.get(field)
                    if isinstance(o, dict) and isinstance(o.get("relations"), list):
                        o["relations"] = [dict(r, source=fix(r.get("source")), target=fix(r.get("target")))
                                          if isinstance(r, dict) else r for r in o["relations"]]

    def restore(self, state):
        """Put a snapshot back. A step that was running when it was taken is pending again (the
        model's answer never came); each episode's context and first input are made again from
        the restored work, earlier waves first."""
        texts = state.get("texts") or []

        def unpack(x):
            if isinstance(x, dict):
                if set(x) == {"$t"}:
                    return texts[x["$t"]]
                return {k: unpack(v) for k, v in x.items()}
            if isinstance(x, list):
                return [unpack(v) for v in x]
            return x

        self.windows = {(w, v): [int(r[0]), int(r[1])] for w, v, r in state.get("windows") or []}
        self.refs = {int(k): v for k, v in (state.get("refs") or {}).items()}
        self.gens.clear()
        self.eps = {w: {} for w in self.order}
        for w, eps in (state.get("eps") or {}).items():
            if w not in self.eps:
                continue
            for i, ep in eps.items():
                ep = unpack(ep)
                # a step of a skill the procedure no longer has (antecedent) goes, with what is under it
                gone = [k for k, n in ep.get("nodes", {}).items() if n.get("skill") not in self.reg.skills]
                for k in gone:
                    for j in [j for j in ep["nodes"] if j == k or under(j, k)]:
                        ep["nodes"].pop(j, None)
                for n in ep.get("nodes", {}).values():
                    n["children"] = [c for c in n.get("children") or [] if c in ep["nodes"]]
                    if n.get("status") == "running":
                        n["status"] = "pending"
                ep["missing"] = [tuple(x) for x in ep.get("missing") or []]
                self.eps[w][int(i)] = ep
        if int(state.get("version") or 0) < 3:
            self._renumber_old()
        self._side_by_side()
        self._tokens_from_steps()          # before the contexts: they read the tokens
        for w in self.order:
            for i, ep in self.eps[w].items():
                if ep.get("error"):
                    continue
                try:
                    ctx, inp = self._context(w, i)
                except Exception as e:
                    ep["error"] = "could not be restored (%s: %s); restart it" % (type(e).__name__, e)
                    continue
                ep["context"] = ctx
                for n in ep["nodes"].values():
                    if n["parent"] is None and n["input"] is None:
                        n["input"] = jsonable(inp)
        return self.describe()

    def reload(self):
        """After a skill file changed: forget loaded modules (jevlib included); started
        episodes keep their outputs until they are re-run."""
        self.modules.clear()
        purge_modules()
        import registry as R
        self.reg = R.Registry.load(self.path)
        self.panel = self._load_panel()
        return True


# ------------------------------------------------------------------ the changes, marked

def _norm_edge(source, role, target):
    role = str(role).lstrip(":")
    return (target, role[:-3], source) if role.endswith("-of") else (source, role, target)


def marked_penman(old_text, new_text, marks):
    """The new graph as penman lines, each a list of {"t": text, "m": mark}: "add" (new), "del"
    (gone: shown where it was, struck through), "chg" (changed: a concept or a value, after the
    old one struck through). A predicate's :modstr shows only where it changed."""
    import penman
    old_t, new_t = penman.parse(old_text).node, penman.parse(new_text).node
    old_br, old_vars, new_vars = {}, set(), set()

    def index(node, into, names):
        var, br = node
        names.add(var)
        if into is not None:
            into.setdefault(var, br)
        for _, t in br:
            if isinstance(t, tuple):
                index(t, into, names)
    index(old_t, old_br, old_vars)
    index(new_t, None, new_vars)
    added, deleted = set(marks.get("added_nodes") or []), set(marks.get("deleted_nodes") or [])
    renamed = marks.get("renamed") or {}
    add_e = {tuple(e) for e in marks.get("added_edges") or []}
    del_e = {tuple(e) for e in marks.get("deleted_edges") or []}
    attr = {(a["var"], a["role"]): a for a in marks.get("attrs") or []}
    lines = []

    def seg(t, m=""):
        return {"t": t, "m": m}

    def node(n, depth, role=None, rmark="", whole=""):
        var, br = n
        concept = next((str(t) for r, t in br if r == "/"), "")
        head = [seg("    " * depth)]
        if role:
            head.append(seg(":%s " % role, rmark or whole))
        if var in renamed and not whole:
            head += [seg("(%s / " % var), seg(renamed[var][0], "del"), seg(" "), seg(concept, "chg")]
        else:
            head.append(seg("(%s / %s" % (var, concept), whole))
        lines.append(head)
        ind = "    " * (depth + 1)
        for r, t in br:
            if r == "/":
                continue
            r = r.lstrip(":")
            if isinstance(t, tuple):
                if whole == "del" and t[0] not in deleted:      # it is still there, elsewhere
                    lines.append([seg(ind), seg(":%s %s" % (r, t[0]), "del")])
                    continue
                e = _norm_edge(var, r, t[0])
                node(t, depth + 1, r, "" if whole else ("add" if e in add_e else ""),
                     whole or ("add" if t[0] in added else ""))
                continue
            t = str(t)
            if t in (old_vars if whole == "del" else new_vars):  # a second mention of a node
                m = whole or ("add" if _norm_edge(var, r, t) in add_e else "")
                lines.append([seg(ind), seg(":%s %s" % (r, t), m)])
                continue
            a = attr.get((var, r))
            if r == "modstr" and not a and not whole:
                continue
            if whole:
                lines.append([seg(ind), seg(":%s %s" % (r, t), whole)])
            elif a and a["old"] is not None:
                lines.append([seg(ind), seg(":%s " % r), seg(str(a["old"]), "del"), seg(" "), seg(t, "chg")])
            else:
                lines.append([seg(ind), seg(":%s %s" % (r, t), "add" if a else "")])
        # what the old graph had under this node and the new one has not
        if not whole and var in old_br:
            for r, t in old_br[var]:
                if r == "/":
                    continue
                r = r.lstrip(":")
                if isinstance(t, tuple):
                    if _norm_edge(var, r, t[0]) in del_e:
                        if t[0] in deleted:
                            node(t, depth + 1, r, "del", "del")
                        else:
                            lines.append([seg(ind), seg(":%s %s" % (r, t[0]), "del")])
                    continue
                t = str(t)
                if t in old_vars:
                    if _norm_edge(var, r, t) in del_e:
                        lines.append([seg(ind), seg(":%s %s" % (r, t), "del")])
                    continue
                a = attr.get((var, r))
                if a and a["new"] is None:
                    lines.append([seg(ind), seg(":%s %s" % (r, t), "del")])
        lines[-1].append(seg(")", whole))
    node(new_t, 0)
    return lines


def marked_graph(g, out, marks):
    """The new graph in graph()'s shape for the drawing, with the nodes, edges and attributes that
    are gone put back, and each one's "mark" ("add", "del", "chg", or "")."""
    import penman
    ng = penman.decode(out["graph"])
    tokens = g.get("tokens") or []
    old = {n["var"]: n for n in g["nodes"]}
    align = out.get("alignment") or {}
    added, deleted = set(marks.get("added_nodes") or []), set(marks.get("deleted_nodes") or [])
    renamed = marks.get("renamed") or {}
    add_e = {tuple(e) for e in marks.get("added_edges") or []}
    attr = {(a["var"], a["role"]): a for a in marks.get("attrs") or []}
    nodes = []
    for v, _, c in ng.instances():
        a = align.get(v)
        n = dict(old.get(v) or {}, var=v, concept=str(c), mark="add" if v in added else "chg" if v in renamed else "",
                 align="%d-%d" % (a[0], a[1]) if a else "0-0",
                 words=" ".join(tokens[a[0] - 1:a[1]]) if a and a[0] > 0 else "")
        if v in renamed:
            n["concept"] = "%s → %s" % (renamed[v][0], c)
        nodes.append(n)
    nodes += [dict(old[v], mark="del") for v in deleted if v in old]
    edges = [{"src": s, "role": r.lstrip(":"), "tgt": t, "mark": "add" if (s, r.lstrip(":"), t) in add_e else ""}
             for s, r, t in ng.edges()]
    edges += [{"src": s, "role": r, "tgt": t, "mark": "del"} for s, r, t in marks.get("deleted_edges") or []]
    attrs = []
    for v, r, x in ng.attributes():
        r = r.lstrip(":")
        a = attr.get((v, r))
        if r == "modstr" and not a:
            continue
        if a and a["old"] is not None:
            attrs.append({"var": v, "role": r, "value": "%s → %s" % (a["old"], a["new"]), "mark": "chg"})
        else:
            attrs.append({"var": v, "role": r, "value": str(x), "mark": "add" if a else ""})
    attrs += [{"var": a["var"], "role": a["role"], "value": str(a["old"]), "mark": "del"}
              for a in marks.get("attrs") or [] if a["new"] is None and a["var"] not in deleted]
    attrs += [dict(a, mark="del") for a in g.get("attrs") or [] if a["var"] in deleted]
    return {"index": g.get("index"), "tokens": tokens, "text": "", "top": ng.top, "nodes": nodes, "edges": edges,
            "attrs": attrs, "doc": g.get("doc"), "error": None}


# ------------------------------------------------------------------ alignment

ABSTRACT = re.compile(r"^(and|or|but|person|thing|name|sentence|have-.*-9\d|.*-9\d|date-entity|temporal-quantity|"
                      r"monetary-quantity|ordinal-entity|percentage-entity|.*-quantity|.*-entity|identity-91|"
                      r"consecutive|contrast-91|multi-sentence|empty)$")
INSTANCE = re.compile(r"\(\s*([^\s/()]+)\s*/\s*([^\s()]+)")


def auto_align_umr(text, lang):
    """Give every variable aligned 0-0 whose concept is written in the sentence the position of
    those words (the first such place no other variable already has). Abstract concepts, names and
    entity types stay 0-0. Returns (text, [(sentence, var, alignment)])."""
    out, added = [], []
    for block in text.split(RULE80):
        if "# alignment:" not in block:
            out.append(block)
            continue
        m = re.search(r"^Words:\s*(.*)$", block, re.M)
        words = m.group(1).split() if m else []
        sm = re.search(r"#\s*::\s*snt(\d+)", block)
        snt = int(sm.group(1)) if sm else 0
        g = block.split("# sentence level graph:", 1)[-1].split("# alignment:", 1)[0]
        concepts = {v: c for v, c in INSTANCE.findall(g)}
        head, rest = block.split("# alignment:", 1)
        if "# document level annotation:" in rest:
            align, tail = rest.split("# document level annotation:", 1)
            tail = "# document level annotation:" + tail
        else:
            align, tail = rest, ""
        lines = align.split("\n")
        used = set()
        for ln in lines:
            mm = re.match(r"^\s*(\S+):\s*(\d+)-(\d+)\s*$", ln)
            if mm and mm.group(2) != "0":
                used.update(range(int(mm.group(2)), int(mm.group(3)) + 1))
        new = []
        for ln in lines:
            mm = re.match(r"^(\s*)(\S+):\s*0-0\s*$", ln)
            if mm and mm.group(2) in concepts:
                lemma = re.sub(r"-\d+$", "", concepts[mm.group(2)].strip('"'))
                if lemma and not ABSTRACT.match(concepts[mm.group(2)]):
                    span = _find(words, lemma, used, lang)
                    if span:
                        used.update(range(span[0], span[1] + 1))
                        ln = "%s%s: %d-%d" % (mm.group(1), mm.group(2), span[0], span[1])
                        added.append([snt, mm.group(2), "%d-%d" % span])
            new.append(ln)
        out.append(head + "# alignment:" + "\n".join(new) + tail)
    return RULE80.join(out), added


def _find(words, lemma, used, lang):
    """1-based (first, last) of the words that spell lemma (one word, or several run together in
    Chinese), preferring a place nobody has."""
    low = [w.lower() for w in words]
    target = lemma.lower()
    hits = []
    for a in range(len(words)):
        s = ""
        for b in range(a, min(len(words), a + 16)):
            s = s + low[b] if lang == "zh" else (s + " " + low[b]).strip()
            if s == target or (lang != "zh" and b == a and (_stem(low[a]) == _stem(target) or
                                                             (len(target) >= 4 and low[a].startswith(target)))):
                hits.append((a + 1, b + 1))
                break
            if not target.startswith(s.replace(" ", "-") if lang != "zh" else s) and s != target:
                break
    free = [h for h in hits if not any(k in used for k in range(h[0], h[1] + 1))]
    return (free or hits or [None])[0]


def _stem(w):
    for suf in ("ing", "ed", "es", "s", "e"):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            return w[:-len(suf)]
    return w


DOC_GROUP = re.compile(r":(temporal|modal|coref)\b")
DOC_TRIPLE = re.compile(r"\(\s*([^\s()]+)\s+:([\w-]+)\s+([^\s()]+)\s*\)")


def read_doc(text):
    """[{group, a, rel, b}]: the (a :rel b) triples of a document-level annotation, by group."""
    marks = [(m.start(), m.group(1)) for m in DOC_GROUP.finditer(text)]
    out = []
    for k, (start, group) in enumerate(marks):
        end = marks[k + 1][0] if k + 1 < len(marks) else len(text)
        for a, r, b in DOC_TRIPLE.findall(text[start:end]):
            out.append({"group": group, "a": a, "rel": r, "b": b.rstrip(")")})
    return out


def split_umr(text):
    out = []
    for block in text.split(RULE80):
        sm = re.search(r"#\s*::\s*snt(\d+)", block)
        if sm:
            out.append({"index": int(sm.group(1)), "text": RULE80 + block.rstrip() + "\n"})
    return out


# ------------------------------------------------------------------ session

class Session:
    """What the page calls. One engine at a time."""

    def __init__(self):
        self.engine = None

    def boot(self):
        return {"python": sys.version.split()[0]}

    def docs(self):
        out = []
        for f in sorted(os.listdir(DOCS)):
            if f.endswith(".umr"):
                with open(os.path.join(DOCS, f), encoding="utf-8") as fh:
                    text = fh.read()
                out.append({"id": f[:-4], "sentences": len(re.findall(r"#\s*::\s*snt\d+", text)),
                            "lang": doc_lang(text)})
        return out

    def import_doc(self, name, text, fmt="txt-lines", lang=None):
        """A document from a file, as a header-only .umr under /sp/docs.

        fmt "txt-lines": one sentence per line (as every file under olddata/ is written);
            "txt-split": running text, cut into sentences by the input handler's split_sentences;
            "umr":       a .umr file to annotate again: only its sentences are kept (each block's
                         Words: line, else the text after `# :: sntN`); its annotation is dropped.
            "umr-load":  a .umr file with its annotation: the sentences as for "umr", and the
                         file kept as <name>.annotation, which open() loads into the steps.
        """
        import input_handler.umrinputhandler as U
        name = re.sub(r"[^\w.-]+", "_", name or "imported")[:60] or "imported"
        annotation = os.path.join(DOCS, name + ".annotation")
        for old in (annotation, os.path.join(DOCS, name + ".txt")):
            if os.path.exists(old):
                os.remove(old)
        if fmt in ("umr", "umr-load"):
            out = strip_umr(text)
            if not out:
                raise StepError("no sentences found: a .umr file has `# :: snt1` lines (and Words: lines)")
            said = lang if lang in LANGS else doc_lang(text)
            if said not in ("zh", "en"):
                out = "# :: lang %s\n" % said + out
        else:
            if fmt == "txt-split":
                lang = lang or U.guess_lang(text)
                sents = []
                for line in text.splitlines():
                    line = U.clean(line)
                    if line:
                        sents += U.split_sentences(line, lang)
                text = "\n".join(sents)
            out, lang = umr_from_text(text, lang)
        if not re.search(r"#\s*::\s*snt\d+", out):
            raise StepError("the document has no sentences")
        with open(os.path.join(DOCS, name + ".umr"), "w", encoding="utf-8") as f:
            f.write(out)
        if fmt == "umr-load":
            with open(annotation, "w", encoding="utf-8") as f:
                f.write(text)
        return {"id": name, "sentences": len(re.findall(r"#\s*::\s*snt\d+", out)), "lang": doc_lang(out)}

    def open(self, skillset, doc):
        """Open a document with a procedure. A document imported as "umr-load" comes with the
        annotation it had (<doc>.annotation), which is loaded into the steps (umr_load)."""
        s = SKILLSETS[skillset]
        doc_path = os.path.join(DOCS, doc + ".umr")
        with open(doc_path, encoding="utf-8") as fh:
            umr = fh.read()
        lang = doc_lang(umr)
        # the input handler reads the .umr's Words: lines when there is no .txt, joined without
        # spaces (between letters or digits only), which is the Chinese text; an English
        # document gets a .txt of its words joined by spaces, so its tokens are the words
        txt = os.path.join(DOCS, doc + ".txt")
        if lang != "zh" and not os.path.exists(txt):
            with open(txt, "w", encoding="utf-8") as fh:
                fh.write("".join(" ".join(re.search(r"^Words:[ \t]*(.*)$", b, re.M).group(1).split()) + "\n"
                                 for b in umr.split(RULE80) if re.search(r"^Words:", b, re.M)))
        self.engine = RegistryEngine(skillset, s["path"], os.path.join(DOCS, doc + ".txt"), lang)
        annotation = os.path.join(DOCS, doc + ".annotation")
        desc = self.engine.describe()
        if os.path.exists(annotation):
            import umr_load
            with open(annotation, encoding="utf-8") as fh:
                desc["loaded"] = self.engine.loaded = umr_load.load(self.engine, fh.read())
        return desc

    def read_file(self, path):
        full = os.path.normpath(os.path.join(FS, path))
        if not full.startswith(FS + "/"):
            raise StepError("outside the skill files")
        with open(full, encoding="utf-8") as f:
            return f.read()

    def write_file(self, path, content):
        full = os.path.normpath(os.path.join(FS, path))
        if not full.startswith(FS + "/"):
            raise StepError("outside the skill files")
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(content)
        problem = None
        if full.endswith(".py"):
            try:
                compile(content, full, "exec")
            except SyntaxError as e:
                problem = "SyntaxError: %s (line %s)" % (e.msg, e.lineno)
        if self.engine:
            try:
                self.engine.reload()
            except Exception as e:
                problem = problem or "%s: %s" % (type(e).__name__, e)
        return {"ok": problem is None, "problem": problem}

    def __getattr__(self, name):
        eng = self.__dict__.get("engine")
        if eng is not None and hasattr(eng, name):
            return getattr(eng, name)
        raise AttributeError(name)


SESSION = Session()


def call(method, args_json):
    """The page's single entry point: JSON in, JSON out, errors as {"error": ...}."""
    args = json.loads(args_json or "{}")
    try:
        fn = getattr(SESSION, method)
        res = fn(**args)
        return json.dumps({"ok": jsonable(res)}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": "%s: %s" % (type(e).__name__, e),
                           "trace": traceback.format_exc()[-4000:]}, ensure_ascii=False)
