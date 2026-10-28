"""The Python half of index.html: SkillParseUMR's decision-orchestration procedures, run one node
at a time.

Everything under /sp/skillparseumr and /sp/modular-parsing is the SkillParseUMR (and
modular-parsing) source as it is on disk, copied by scripts/sync_skillparse.py; only
propbank.py is swapped for one that reads the merged PropBank file. This file is the only new
Python. It does what src/runner.py does, split so the page drives it:

  - a node is made but not run until someone clicks it, and a finished step must be confirmed
    (or corrected) before the next step of its episode can start: an episode never runs on by
    itself, though different items can each run their next step at the same time;
  - a kind: jev node hands the page its closed questions (Jev or Haiku answers them, by skill)
    and is finished when the page sends the answers back;
  - any node's output can be replaced by a person, and everything below it is redone;
  - a wave's context windows (`range`) can be changed per wave before running.

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
sys.dont_write_bytecode = True

DO = SP + "/experiment/decision-orchestration"
# web-procedures/<lang>: composed by scripts/sync_skillparse.py (sent_type kind: jev, the other
# model skills kind: agent); see the header of each registry.yaml
SKILLSETS = {
    "web-zh": {"path": SP + "/web-procedures/zh/registry.yaml", "lang": "zh"},
    "web-en": {"path": SP + "/web-procedures/en/registry.yaml", "lang": "en"},
}
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
HINT_LABEL = {"zh": "human提示：", "en": "Human hint: "}


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


def _unconfirmed(n):
    return n["status"] in ("ok", "error") and not n.get("confirmed")


def node_key(node_id):
    return tuple(int(p) for p in str(node_id).split("."))


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
    """skillsets/tools/example.py types its first parameter as pydantic_ai.RunContext[dict]; the
    browser has no pydantic-ai, so a RunContext that only carries `deps` stands in for it."""
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


def _tools_in(directory, prefix):
    """skill_callable._tools_in: every public function of every <directory>/*.py not starting with _."""
    tools = []
    if not os.path.isdir(directory):
        return tools
    for filename in sorted(os.listdir(directory)):
        if not filename.endswith(".py") or filename.startswith("_"):
            continue
        name = "%s.%s" % (prefix, filename[:-3])
        module = _load_module(os.path.join(directory, filename), name)
        sys.modules[name] = module
        for fname, obj in inspect.getmembers(module, inspect.isfunction):
            if not fname.startswith("_") and obj.__module__ == name:
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
        words = U.tokenize(line, lang)
        blocks.append("\n".join([RULE80, "# :: snt%d" % n,
                                 "Index: " + " ".join(str(k + 1) for k in range(len(words))),
                                 "Words: " + " ".join(words), "", "# sentence level graph:", "",
                                 "# alignment:", "", "# document level annotation:", ""]))
    return "\n\n".join(blocks) + "\n", lang


def doc_lang(umr_text):
    """zh when the sentences (Words: lines, else the whole text) have Chinese characters."""
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
        self.doc = UMRInputHandler(lang=lang).read(doc_path)
        self.waves = {w.name: w for w in self.reg.waves}
        self.order = [w.name for w in self.reg.waves]
        self.eps = {w: {} for w in self.order}       # wave -> item index -> episode
        self.windows = {}                           # (wave, var) -> [start, stop]
        self.gens = {}                              # (wave, i, node id) -> a jev skill's generator
        self.modules = {}
        self.loading = False                        # umr_load: a person's tree, made without limits
        self.loaded = None                          # what umr_load reported

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
        return {"engine": self.kind, "skillset": self.sid, "waves": waves, "skills": skills,
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
        return {"nodes": [self._node_dict(n) for n in nodes]}

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
        self._make(w, ep, wave.start, inp, None, None, 0)
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
        nid = "%s.%d" % (parent["id"], position) if parent else str(position)
        ep["nodes"][nid] = {"id": nid, "skill": skill, "input": jsonable(inp), "parent": parent["id"] if parent else None,
                            "edge": jsonable(edge), "depth": depth, "status": "pending", "output": None,
                            "stored": {}, "error": None, "rounds": [], "prompt": None, "human": False,
                            "children": [], "dropped": [], "rules": [], "machine_output": None,
                            "confirmed": False, "hint": ""}
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
        return {**ep["context"], **node["input"]}

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
            with open(os.path.join(skill.path, "skill.md"), encoding="utf-8") as f:
                md = f.read()
            values = {k: v if isinstance(v, str) else json.dumps(jsonable(v), ensure_ascii=False)
                      for k, v in inputs.items()}
            fields = ", ".join('"%s"' % k for k in skill.emit)
            head = "# Output Format\nYou must produce a JSON object with exactly these fields: %s.\n\n" % fields
            cut = md.rfind("\n## Input\n")
            if cut < 0:
                instructions, user = head + md.format(**values), ""
            else:
                instructions, user = head + md[:cut].format(**values), md[cut:].format(**values)
            if node.get("hint"):
                user = user.rstrip("\n") + "\n\n" + self._hint_label() + node["hint"] + "\n"
            node["prompt"] = {"system": SYSTEM, "instructions": instructions, "input": user}
            node["tool_calls"] = []
            node["retried"] = False
            return self._llm_request(node, skill)
        except Exception as e:
            return self._fail(w, ep, node, e)

    def _ask(self, w, i, node, req):
        state = jsonable(req.get("state"))
        if node.get("hint"):
            key = self._hint_label().rstrip("： :")
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
                "retry": bool(retry)}

    def tool(self, w, i, nid, name, args):
        """Run one tool for an agent node; ctx.deps is {"skill_dir", "skill"} as SkillCallable gives it."""
        ep, node = self._node(w, i, nid)
        skill = self.reg.skills[node["skill"]]
        fns = {t.__name__: t for t in skill_tools(skill.path)}
        if name not in fns:
            res = "Unknown tool name: %r. Tools: %s" % (name, ", ".join(sorted(fns)))
        else:
            fn = fns[name]
            try:
                if _wants_ctx(fn):
                    ctx = sys.modules["pydantic_ai"].RunContext({"skill_dir": skill.path, "skill": skill.name})
                    res = fn(ctx, **(args or {}))
                else:
                    res = fn(**(args or {}))
            except Exception as e:
                res = "%s: %s" % (type(e).__name__, e)
        text = res if isinstance(res, str) else json.dumps(jsonable(res), ensure_ascii=False)
        node.setdefault("tool_calls", []).append({"tool": name, "args": args, "result": text[:4000]})
        return text

    def complete(self, w, i, nid, output):
        """A model's JSON answer for an agent node. An answer that does not fit emit is sent back
        once with what is wrong (agent.run's retries=1), then the node is in error."""
        ep, node = self._node(w, i, nid)
        skill = self.reg.skills[node["skill"]]
        try:
            self._check_emit(skill, output)
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
                node["children"].append("%s.%d" % (node["id"], position))
        self._mark_stale(w, ep["index"])
        return {"done": True, "node": node["id"], "status": "ok", "children": node["children"]}

    def _descendants(self, ep, nid):
        pre = nid + "."
        return [k for k in ep["nodes"] if k.startswith(pre)]

    def _drop_gens(self, w, i, nid=None):
        for key in list(self.gens):
            if key[0] == w and key[1] == int(i) and (nid is None or key[2] == nid or key[2].startswith(nid + ".")):
                del self.gens[key]

    def reset(self, w, i, nid):
        """Forget the node's output and everything under it; it is pending again."""
        ep, node = self._node(w, i, nid)
        for k in self._descendants(ep, nid):
            del ep["nodes"][k]
        self._drop_gens(w, i, nid)
        node.update(status="pending", output=None, stored={}, error=None, rounds=[], prompt=None, human=False,
                    children=[], dropped=[], rules=[], tool_calls=[], retried=False, problems=[],
                    confirmed=False, loaded=False)
        self._mark_stale(w, int(i))
        return self.episode(w, i)

    def set_output(self, w, i, nid, output):
        """A person's output for the node: it replaces the model's, and the subtree is remade from it."""
        ep, node = self._node(w, i, nid)
        machine = node.get("machine_output")
        for k in self._descendants(ep, nid):
            del ep["nodes"][k]
        self._drop_gens(w, i, nid)
        res = self._finish(w, ep, node, output, human=True)
        node["machine_output"] = machine
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
            nodes.append({"id": n["id"], "skill": n["skill"], "kind": skill.kind, "edge": n["edge"],
                          "depth": n["depth"], "status": n["status"], "human": n["human"],
                          "parent": n["parent"], "text": n["input"].get("text") if isinstance(n["input"], dict) else None,
                          "summary": self._summary(n), "waiting": (w, int(i), n["id"]) in self.gens,
                          "error": n["error"], "confirmed": bool(n.get("confirmed")), "hint": n.get("hint") or "",
                          "loaded": bool(n.get("loaded"))})
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
        if "merges" in o:
            return "%d merges" % len(o["merges"])
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
                "trace": n.get("trace"), "waiting": (w, int(i), nid) in self.gens}

    def set_window(self, w, var, rng):
        if rng is None:
            self.windows.pop((w, var), None)
        else:
            self.windows[(w, var)] = [int(rng[0]), int(rng[1])]
        return self.describe()

    # -- output

    def render(self, auto_align=True):
        from output_handler.umroutputhandler import UMROutputHandler, provenance
        wt = {w: [self._partial_tree(w, i) for i in range(len(self.doc.sents))] for w in self.order}
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
                                 "node": p.get("node"), "skill": p.get("skill")})
        res["edges"] = [{"src": a, "role": r.lstrip(":"), "tgt": b} for a, r, b in g.edges()]
        res["attrs"] = [{"var": a, "role": r.lstrip(":"), "value": str(b)} for a, r, b in g.attributes()]
        return res

    def export(self):
        return {"skillset": self.sid, "doc": self._doc(), "windows": [[w, v, r] for (w, v), r in self.windows.items()],
                "episodes": {w: {str(i): {k: v for k, v in ep.items() if k != "missing"}
                                 for i, ep in eps.items()} for w, eps in self.eps.items()}}

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
        return {"version": 2, "skillset": self.sid, "doc": self.doc.doc_id,
                "windows": [[w, v, r] for (w, v), r in self.windows.items()], "texts": texts, "eps": eps}

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
        self.gens.clear()
        self.eps = {w: {} for w in self.order}
        for w, eps in (state.get("eps") or {}).items():
            if w not in self.eps:
                continue
            for i, ep in eps.items():
                ep = unpack(ep)
                for n in ep.get("nodes", {}).values():
                    if n.get("status") == "running":
                        n["status"] = "pending"
                ep["missing"] = [tuple(x) for x in ep.get("missing") or []]
                self.eps[w][int(i)] = ep
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
        return True


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
