"""The Python half of skillparse.html: SkillParseUMR's skills, run one node at a time.

Everything under /sp/skillparseumr and /sp/modular-parsing is the SkillParseUMR (and
modular-parsing) source as it is on disk, copied by scripts/sync_skillparse.py and not
changed. This file is the only new Python. It does what src/runner.py and
experiment/annoforge/af/harness.py do, but split so the page drives it:

  - a node is made but not run until someone clicks it (or presses "run all");
  - a node that needs a model hands the page a request (Jev questions, or a prompt
    with tools) and is finished when the page sends the answer back;
  - any node's output can be replaced by a person, and everything below it is redone;
  - a wave's context windows (`range`) can be changed per wave before running.

Two engines, one shape (waves -> for_each items = episodes -> nodes):

  RegistryEngine   a registry.yaml (REGISTRY.md): kind rule / jev / agent skills,
                   the dispatcher, worktree, output handler. Used for the Jev skills.
  HarnessEngine    an AnnoForge harness version (harness.yaml): per sentence a chain of
                   steps generate -> critique -> finalize -> rules. Used for Haiku H10.
                   Shown as a registry with one wave, whose context is a window over the
                   earlier sentences' final annotations.

The page calls `call(method, json_args)` and gets JSON back; see `Session` for the methods.
"""
import dataclasses
import html
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
for p in (SP + "/src", SP + "/experiment/annoforge/af", FS + "/vendor"):
    if p not in sys.path:
        sys.path.insert(0, p)
os.environ.setdefault("PROPBANK_DIR", MP + "/resources")
os.environ.setdefault("AF_SCHEME", "umr")
sys.dont_write_bytecode = True

SKILLSETS = {
    "jev-k4": {"engine": "registry", "path": SP + "/experiment/rsi-jev2/skills/K4/registry.yaml",
               "lang": "zh"},
    "haiku-h10-zh": {"engine": "harness", "path": SP + "/experiment/annoforge/harness/umr-zh/HH/H10",
                     "bench": "umr-zh", "lang": "zh"},
    "haiku-h10-en": {"engine": "harness", "path": SP + "/experiment/annoforge/harness/umr-en/HH/H10",
                     "bench": "umr-en", "lang": "en"},
}
RULE80 = "#" * 80


# ------------------------------------------------------------------ setup

def materialize_propbank():
    """Write the PropBank JSON back out as one small XML file per lemma, where
    propbank.py and the harness tools look for them (they read files, not JSON)."""
    done = []
    for name, folder in (("propbank-zh.json", "chinese-propbank"),
                         ("propbank-en.json", "english-propbank/propbank-amr-frames-xml-2018-01-25")):
        src = os.path.join(MP, "resources", name)
        dst = os.path.join(MP, "resources", folder)
        if os.path.isdir(dst) or not os.path.exists(src):
            continue
        os.makedirs(dst)
        with open(src, encoding="utf-8") as f:
            data = json.load(f)
        for lemma, rolesets in data.items():
            parts = ['<frameset>']
            for rid, rname, roles in rolesets:
                parts.append('<roleset id="%s" name="%s">' % (html.escape(rid), html.escape(rname)))
                parts += ['<role n="%s" descr="%s"/>' % (html.escape(n), html.escape(d)) for n, d in roles]
                parts.append('</roleset>')
            parts.append('</frameset>')
            with open(os.path.join(dst, lemma + ".xml"), "w", encoding="utf-8") as f:
                f.write("".join(parts))
        done.append((folder, len(data)))
    return done


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


def node_key(node_id):
    return tuple(int(p) for p in str(node_id).split("."))


def _load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class StepError(Exception):
    pass


# ------------------------------------------------------------------ documents

def umr_from_text(text, lang=None):
    """A plain text (one sentence per line) as a header-only .umr, so both engines read it
    the way they read the gold files: Chinese words cut with jieba (as the gold's Words: lines
    are cut into words), English on whitespace."""
    import input_handler.umrinputhandler as U
    lines = [U.clean(l) for l in text.splitlines()]
    lines = [l for l in lines if l]
    lang = lang or U.guess_lang(text)
    blocks = []
    for n, line in enumerate(lines, 1):
        if lang == "zh":
            import jieba
            words = [w for w in jieba.cut(line, HMM=False) if w.strip()]
        else:
            words = line.split()
        blocks.append("\n".join([RULE80, "# :: snt%d" % n,
                                 "Index: " + " ".join(str(k + 1) for k in range(len(words))),
                                 "Words: " + " ".join(words), "", "# sentence level graph:", "",
                                 "# alignment:", "", "# document level annotation:", ""]))
    return "\n\n".join(blocks) + "\n", lang


# ------------------------------------------------------------------ the registry engine

class RegistryEngine:
    kind = "registry"

    def __init__(self, sid, path, doc_path, lang):
        import registry as R
        from input_handler.umrinputhandler import UMRInputHandler
        self.R = R
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
            files = []
            base = os.path.dirname(os.path.abspath(self.path))
            for f in sorted(os.listdir(s.path)):
                if f.endswith((".py", ".md")) and not f.startswith("test_"):
                    files.append(os.path.relpath(os.path.join(s.path, f), FS))
            skills.append({"name": s.name, "kind": s.kind, "input": jsonable(s.input), "emit": jsonable(s.emit),
                           "store": s.store, "files": files,
                           "rules": [self._rule_text(r) for r in self.reg.rules(s.name)]})
        shared = [os.path.relpath(os.path.join(os.path.dirname(self.path), f), FS)
                  for f in sorted(os.listdir(os.path.dirname(self.path))) if f.endswith(".py")]
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
        if any(n["status"] in ("pending",) for n in ep["nodes"].values()):
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
                st = ("error" if ep["error"] else "pending" if "pending" in sts else
                      "error" if "error" in sts else "done")
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
        a = parent
        while a:
            if a["skill"] == skill and a["input"] == inp:
                return "same skill and input as node %s" % a["id"]
            a = ep["nodes"].get(a["parent"]) if a["parent"] is not None else None
        nid = "%s.%d" % (parent["id"], position) if parent else str(position)
        ep["nodes"][nid] = {"id": nid, "skill": skill, "input": jsonable(inp), "parent": parent["id"] if parent else None,
                            "edge": jsonable(edge), "depth": depth, "status": "pending", "output": None,
                            "stored": {}, "error": None, "rounds": [], "prompt": None, "human": False,
                            "children": [], "dropped": [], "rules": [], "machine_output": None}
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

    def step(self, w, i, nid):
        """Start running a pending node. Returns what the page must do next:
        {"done": node} | {"need": "jev", ...} | {"need": "llm", ...}."""
        ep, node = self._node(w, i, nid)
        if node["status"] != "pending":
            self.reset(w, i, nid)
        skill = self.reg.skills[node["skill"]]
        inputs = self._inputs(ep, node)
        node["rounds"] = []
        node["error"] = None
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
            # agent: skill.md as SkillCallable.prompt_parts builds it
            md = open(os.path.join(skill.path, "skill.md"), encoding="utf-8").read()
            values = {k: v if isinstance(v, str) else json.dumps(jsonable(v), ensure_ascii=False)
                      for k, v in inputs.items()}
            fields = ", ".join('"%s"' % k for k in skill.emit)
            head = "# Output Format\nYou must produce a JSON object with exactly these fields: %s.\n\n" % fields
            cut = md.rfind("\n## Input\n")
            if cut < 0:
                instructions, user = head + md.format(**values), ""
            else:
                instructions, user = head + md[:cut].format(**values), md[cut:].format(**values)
            node["prompt"] = {"system": "", "instructions": instructions, "input": user}
            return {"need": "llm", "mode": "json", "node": nid, "system": "", "instructions": instructions,
                    "input": user, "emit": jsonable(skill.emit), "tools": [], "role": "G"}
        except Exception as e:
            return self._fail(w, ep, node, e)

    def _ask(self, w, i, node, req):
        node["rounds"].append({"state": jsonable(req.get("state")), "questions": jsonable(req.get("questions")),
                               "answers": None})
        return {"need": "jev", "node": node["id"], "round": len(node["rounds"]),
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

    def complete(self, w, i, nid, output):
        """A model's JSON answer for an agent node."""
        ep, node = self._node(w, i, nid)
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
                if v not in t:
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
                    children=[], dropped=[], rules=[])
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
                          "error": n["error"]})
        return {"wave": w, "index": int(i), "label": label, "started": True, "error": ep["error"],
                "stale": ep.get("stale", False), "context": jsonable(ep["context"]), "nodes": nodes,
                "needs": [list(x) for x in ep.get("missing", [])], "count": len(items)}

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
        if "gaps" in o:
            return "%d gaps" % len(o["gaps"])
        if "relations" in o:
            return "%d relations" % len(o["relations"])
        if "span" in o:
            return str(o["span"])
        return ""

    def node(self, w, i, nid):
        ep, n = self._node(w, i, nid)
        skill = self.reg.skills[n["skill"]]
        files = [os.path.relpath(os.path.join(skill.path, f), FS) for f in sorted(os.listdir(skill.path))
                 if f.endswith((".py", ".md"))]
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

    def export(self):
        return {"skillset": self.sid, "doc": self._doc(), "windows": [[w, v, r] for (w, v), r in self.windows.items()],
                "episodes": {w: {str(i): {k: v for k, v in ep.items() if k != "missing"}
                                 for i, ep in eps.items()} for w, eps in self.eps.items()}}

    def reload(self):
        """After a skill file changed: forget loaded modules (jevlib included); started
        episodes keep their outputs until they are re-run."""
        self.modules.clear()
        for m in [m for m in sys.modules if m == "jevlib" or m.startswith("skill_rules.")]:
            del sys.modules[m]
        import registry as R
        self.reg = R.Registry.load(self.path)
        return True


# ------------------------------------------------------------------ the harness engine

def render_input(b, doc, i, context, current, current_from, findings, kind):
    """experiment/annoforge/af/harness.py render_input, unchanged (harness.py itself imports
    the agent layer, which does not run in a browser)."""
    import bench as benches
    parts = ["## Document", b.header(doc)]
    if context:
        parts.append("## Earlier sentences and their annotations")
        for j, text, ann in context:
            parts.append("### Sentence %d\n%s\n\n%s" % (j, text, ann))
    parts += ["## The sentence to annotate", b.sentence(doc, i)]
    if current is not None:
        parts += ["## Current annotation (written by step `%s`)" % current_from, current]
    if findings:
        parts.append("## Findings to address")
        parts += ["- [%s] %s -> %s" % (src, f["problem"], f["fix"]) for src, f in findings]
    parts += ["## Your task", benches.TASKS[kind].format(i=i)]
    return "\n\n".join(parts)


def _tool_spec(fn):
    sig = inspect.signature(fn)
    props, req = {}, []
    for name, p in sig.parameters.items():
        ann = p.annotation
        t = {str: "string", int: "integer", float: "number", bool: "boolean", list: "array", dict: "object"}.get(ann, "string")
        props[name] = {"type": t}
        if t == "array":
            props[name]["items"] = {"type": "string"}
        if p.default is inspect.Parameter.empty:
            req.append(name)
    return {"name": fn.__name__, "description": (fn.__doc__ or "").strip(),
            "parameters": {"type": "object", "properties": props, "required": req}}


class HarnessEngine:
    kind = "harness"
    WAVE = "sentence"

    def __init__(self, sid, path, bench, doc_path):
        import yaml
        import bench as benches
        self.sid = sid
        self.path = path
        self.b = benches.get(bench)
        self.doc = self.b.load(doc_path)
        with open(os.path.join(path, "harness.yaml"), encoding="utf-8") as f:
            self.spec = yaml.safe_load(f)
        self.steps = self.spec["steps"]
        self.context_n = self.spec.get("context", self.b.context)
        self.eps = {}
        self.window = None          # [start, stop] over the earlier sentences, default [-context, 0]

    def _rel(self, *p):
        return os.path.relpath(os.path.join(self.path, *p), FS)

    def describe(self):
        rng = self.window or [-self.context_n, 0]
        skills = []
        for k, s in enumerate(self.steps):
            files = []
            if s["kind"] == "rule":
                files.append(self._rel("rules", s["name"] + ".py"))
                t = os.path.join(self.path, "rules", "test_%s.txt" % s["name"])
                if os.path.exists(t):
                    files.append(self._rel("rules", "test_%s.txt" % s["name"]))
            else:
                files.append(self._rel("skills", s["name"] + ".md"))
                files += [self._rel("tools", t + ".py") for t in s.get("tools", [])]
            nxt = self.steps[k + 1]["name"] if k + 1 < len(self.steps) else None
            skills.append({"name": s["name"], "kind": s["kind"], "model": s.get("model"), "tools": s.get("tools", []),
                           "input": {"annotation": "str", "findings": "list[dict]"} if s["kind"] != "rule"
                           else {"annotation": "str", "sentence": "dict"},
                           "emit": {"findings": "list[dict]"} if s["kind"] == "check" else {"annotation": "str"},
                           "store": [], "files": files,
                           "rules": [{"run": nxt, "text": "run %s (the next step)" % nxt}] if nxt else []})
        wave = {"name": self.WAVE, "start": self.steps[0]["name"], "parallel": 1, "max_depth": None, "max_nodes": None,
                "for_each": {"sentence": "annotation.sents"},
                "context": {"earlier": {"window": "worktree.sentence", "range": rng, "pick": "final"},
                            "header": "annotation.header"},
                "input": {"sentence": "sentence"},
                "windows": [{"var": "earlier", "where": "context", "source": "worktree.sentence",
                             "range": [-self.context_n, 0], "override": self.window}]}
        shared = [self._rel("harness.yaml"), self._rel("CHANGES.md"),
                  "skillparseumr/experiment/annoforge/af/bench.py", "skillparseumr/experiment/annoforge/af/umr.py"]
        return {"engine": self.kind, "skillset": self.sid, "waves": [wave], "skills": skills, "shared_files": shared,
                "doc": self._doc(), "system": self.b.system}

    def _doc(self):
        return {"id": self.doc["name"], "lang": self.doc["lang"],
                "sents": [{"index": s["index"], "text": s["text"], "tokens": s["words"]} for s in self.doc["sents"]]}

    def worktree(self):
        return {self.WAVE: [self._final(i) for i in range(len(self.doc["sents"]))]}

    def items(self, w):
        out = []
        for i, s in enumerate(self.doc["sents"]):
            ep = self.eps.get(i)
            st = "new"
            if ep:
                sts = [n["status"] for n in ep["nodes"]]
                st = "pending" if "pending" in sts else "error" if "error" in sts else "done"
                if ep.get("stale"):
                    st += "+stale"
            out.append({"index": i, "label": s["text"], "status": st, "nodes": len(ep["nodes"]) if ep else 0})
        return out

    def _final(self, i):
        ep = self.eps.get(i)
        if not ep:
            return None
        cur = None
        for n in ep["nodes"]:
            if n["status"] == "ok" and n.get("after_text") is not None:
                cur = n
        return cur

    def needs(self, w, i):
        rng = self.window or [-self.context_n, 0]
        lo, hi = max(0, i + rng[0]), min(i, i + rng[1])
        return [(self.WAVE, k) for k in range(lo, hi) if self._final(k) is None]

    def _context(self, i):
        rng = self.window or [-self.context_n, 0]
        lo, hi = max(0, i + rng[0]), min(i, i + rng[1])
        out = []
        for k in range(lo, hi):
            f = self._final(k)
            if f is not None:
                idx = self.doc["sents"][k]["index"]
                out.append((idx, self.b.text(self.doc, idx), f["after_text"]))
        return out

    def start(self, w, i):
        i = int(i)
        ctx = self._context(i)
        nodes = []
        nid = None
        for k, s in enumerate(self.steps):
            nid = "0" if nid is None else nid + ".0"
            nodes.append({"id": nid, "k": k, "skill": s["name"], "kind": s["kind"], "model": s.get("model", "G"),
                          "status": "pending", "output": None, "human": False, "error": None,
                          "after_text": None, "after_parsed": None, "after_from": None, "findings_after": None,
                          "problems": [], "request": None, "machine_output": None, "retried": False,
                          "tool_calls": []})
        self.eps[i] = {"index": i, "context": ctx, "nodes": nodes, "stale": False,
                       "missing": self.needs(w, i)}
        self._mark_stale(i)
        return self.episode(w, i)

    def _mark_stale(self, i):
        for k, ep in self.eps.items():
            if k > i:
                ep["stale"] = True

    def _ep(self, i):
        ep = self.eps.get(int(i))
        if not ep:
            raise StepError("sentence #%d has not been started" % (int(i) + 1))
        return ep

    def _node(self, i, nid):
        ep = self._ep(i)
        for n in ep["nodes"]:
            if n["id"] == nid:
                return ep, n
        raise StepError("no node %s" % nid)

    def _before(self, ep, n):
        """(current, parsed, from, findings) as the step before n left them."""
        cur, parsed, frm, findings = None, None, None, []
        for m in ep["nodes"][:n["k"]]:
            if m["status"] != "ok":
                if m["status"] == "skipped":
                    continue
                raise StepError("run step %s first" % m["skill"])
            if m["after_text"] is not None:
                cur, parsed, frm = m["after_text"], m["after_parsed"], m["after_from"]
            findings = m["findings_after"] if m["findings_after"] is not None else findings
        return cur, parsed, frm, findings

    def _index(self, i):
        return self.doc["sents"][int(i)]["index"]

    def _load_fn(self, path, name):
        return _load_module(path, "af_%s_%d" % (name, os.stat(path).st_mtime_ns)).__dict__[name]

    def _tools(self, step):
        out = []
        for t in step.get("tools", []):
            p = os.path.join(self.path, "tools", t + ".py")
            if os.path.exists(p):
                out.append(self._load_fn(p, t))
        return out

    def step(self, w, i, nid):
        ep, n = self._node(i, nid)
        if n["status"] != "pending":
            self.reset(w, i, nid)
        step = self.steps[n["k"]]
        idx = self._index(i)
        try:
            cur, parsed, frm, findings = self._before(ep, n)
        except StepError as e:
            return {"done": True, "node": nid, "status": "blocked", "error": str(e)}
        n["error"], n["problems"], n["retried"], n["tool_calls"] = None, [], False, []
        try:
            if step["kind"] == "rule":
                if cur is None:
                    n["status"] = "skipped"
                    n["after_text"] = None
                    return {"done": True, "node": nid, "status": "skipped"}
                item = {"index": idx, "text": self.b.text(self.doc, idx)}
                rule = self._load_fn(os.path.join(self.path, "rules", step["name"] + ".py"), "run")
                out = rule(cur, item)
                return self._finish_text(ep, n, out, findings, machine=True)
            ctx = self._context(int(i))
            ep["context"] = ctx
            text = render_input(self.b, self.doc, idx, ctx, cur, frm, findings, step["kind"])
            md = open(os.path.join(self.path, "skills", step["name"] + ".md"), encoding="utf-8").read()
            n["request"] = {"system": self.b.system, "instructions": md, "input": text}
            return {"need": "llm", "mode": "findings" if step["kind"] == "check" else "annotation",
                    "node": nid, "system": self.b.system, "instructions": md, "input": text,
                    "tools": [_tool_spec(t) for t in self._tools(step)], "role": step.get("model", "G")}
        except Exception as e:
            return self._fail(n, e)

    def tool(self, w, i, nid, name, args):
        ep, n = self._node(i, nid)
        step = self.steps[n["k"]]
        fns = {f.__name__: f for f in self._tools(step)}
        if name not in fns:
            return "no tool %s" % name
        try:
            res = fns[name](**(args or {}))
        except Exception as e:
            res = "tool error: %s: %s" % (type(e).__name__, e)
        res = res if isinstance(res, str) else json.dumps(jsonable(res), ensure_ascii=False)
        n["tool_calls"].append({"tool": name, "args": args, "result": res[:4000]})
        return res

    def complete(self, w, i, nid, output):
        ep, n = self._node(i, nid)
        step = self.steps[n["k"]]
        try:
            cur, parsed, frm, findings = self._before(ep, n)
            if step["kind"] == "check":
                fs = output.get("findings", []) if isinstance(output, dict) else output
                fs = [{"problem": str(f.get("problem", "")), "fix": str(f.get("fix", ""))} for f in fs or []]
                n["output"] = {"findings": fs}
                n["machine_output"] = n["output"]
                n["findings_after"] = findings + [(step["name"], f) for f in fs]
                n["after_text"] = None
                n["status"] = "ok"
                return {"done": True, "node": nid, "status": "ok"}
            ann = output.get("annotation", "") if isinstance(output, dict) else str(output)
            idx = self._index(i)
            got, problems = self.b.parse(self.doc, idx, ann)
            if got is None and not n["retried"]:
                n["retried"] = True
                n["problems"] = problems
                req = n["request"]
                retry = req["input"] + ("\n\n## Your previous answer could not be read\n%s\n\n%s\n\n"
                                        "Write it again in the output format." % ("; ".join(problems), ann[:4000]))
                return {"need": "llm", "mode": "annotation", "node": nid, "system": req["system"],
                        "instructions": req["instructions"], "input": retry,
                        "tools": [_tool_spec(t) for t in self._tools(step)], "role": step.get("model", "G"),
                        "retry": True}
            return self._finish_text(ep, n, ann, [], machine=True, prior=n["problems"])
        except Exception as e:
            return self._fail(n, e)

    def _finish_text(self, ep, n, out, findings, machine, prior=None):
        idx = self._index(ep["index"])
        parsed, problems = self.b.parse(self.doc, idx, out)
        n["output"] = {"annotation": out}
        if machine:
            n["machine_output"] = n["output"]
        n["problems"] = (prior or []) + problems
        step = self.steps[n["k"]]
        if parsed is not None:
            n["after_text"] = self.b.show(self.doc, idx, parsed)
            n["after_parsed"] = parsed
            n["after_from"] = step["name"]
            n["findings_after"] = [] if step["kind"] == "rewrite" else None
        else:
            # unreadable: the annotation before this step stays the current one
            cur, cparsed, frm, f = self._before(ep, n)
            n["after_text"], n["after_parsed"], n["after_from"] = cur, cparsed, frm
            n["findings_after"] = None
        n["status"] = "ok"
        self._mark_stale(ep["index"])
        return {"done": True, "node": n["id"], "status": "ok", "problems": n["problems"]}

    def _fail(self, n, e):
        n["status"] = "error"
        n["error"] = "%s: %s" % (type(e).__name__, e)
        n["trace"] = traceback.format_exc()[-3000:]
        return {"done": True, "node": n["id"], "status": "error", "error": n["error"]}

    def answer(self, w, i, nid, answers):
        raise StepError("a harness step does not ask Jev")

    def fail(self, w, i, nid, error):
        ep, n = self._node(i, nid)
        n["status"] = "error"
        n["error"] = str(error)
        return self.episode(w, i)

    def reset(self, w, i, nid):
        ep, n = self._node(i, nid)
        for m in ep["nodes"][n["k"]:]:
            m.update(status="pending", output=None, human=False, error=None, after_text=None, after_parsed=None,
                     after_from=None, findings_after=None, problems=[], request=None, retried=False, tool_calls=[])
        self._mark_stale(int(i))
        return self.episode(w, i)

    def set_output(self, w, i, nid, output):
        ep, n = self._node(i, nid)
        machine = n.get("machine_output")
        for m in ep["nodes"][n["k"] + 1:]:
            m.update(status="pending", output=None, human=False, error=None, after_text=None, after_parsed=None,
                     after_from=None, findings_after=None, problems=[], request=None, retried=False, tool_calls=[])
        step = self.steps[n["k"]]
        if step["kind"] == "check":
            res = self.complete(w, i, nid, output)
        else:
            text = output.get("annotation", "") if isinstance(output, dict) else str(output)
            cur, parsed, frm, findings = self._before(ep, n)
            res = self._finish_text(ep, n, text, findings, machine=False)
        n["human"] = True
        n["machine_output"] = machine
        return res

    def pending(self, w, i):
        """A chain runs one step at a time: the first pending step, if the steps before it are done."""
        p = self.next_pending(w, i)
        return [p] if p else []

    def next_pending(self, w, i):
        ep = self.eps.get(int(i))
        if not ep:
            return None
        for n in ep["nodes"]:
            if n["status"] == "pending":
                return n["id"]
            if n["status"] == "error":
                return None
        return None

    def episode(self, w, i):
        i = int(i)
        ep = self.eps.get(i)
        label = self.doc["sents"][i]["text"]
        if not ep:
            return {"wave": w, "index": i, "label": label, "started": False, "nodes": [],
                    "needs": [list(x) for x in self.needs(w, i)]}
        nodes = []
        for n in ep["nodes"]:
            summ = ""
            if n["output"]:
                if "findings" in n["output"]:
                    summ = "%d findings" % len(n["output"]["findings"])
                elif n["after_parsed"] is not None:
                    g = n["after_parsed"][list(n["after_parsed"])[0]]
                    m = re.search(r"/\s*([^\s()]+)", g)
                    summ = (m.group(1) if m else "") + (" (+%d problems)" % len(n["problems"]) if n["problems"] else "")
                else:
                    summ = "unreadable"
            nodes.append({"id": n["id"], "skill": n["skill"], "kind": n["kind"], "edge": None,
                          "depth": 0, "step": n["k"], "status": n["status"], "human": n["human"],
                          "parent": n["id"].rsplit(".", 1)[0] if "." in n["id"] else None,
                          "text": None, "summary": summ, "waiting": False, "error": n["error"], "model": n["model"]})
        ctx = [{"index": j, "text": t, "annotation": a} for j, t, a in ep["context"]]
        return {"wave": w, "index": i, "label": label, "started": True, "error": None, "stale": ep.get("stale", False),
                "context": {"earlier": ctx, "sentence": self.b.sentence(self.doc, self._index(i)),
                            "header": self.b.header(self.doc)},
                "nodes": nodes, "needs": [list(x) for x in ep.get("missing", [])], "count": len(self.doc["sents"])}

    def node(self, w, i, nid):
        ep, n = self._node(i, nid)
        step = self.steps[n["k"]]
        files = [self._rel("rules", step["name"] + ".py")] if step["kind"] == "rule" else \
            [self._rel("skills", step["name"] + ".md")] + [self._rel("tools", t + ".py") for t in step.get("tools", [])]
        out = {k: jsonable(v) for k, v in n.items() if k not in ("after_parsed", "trace")}
        out.update(kind=step["kind"], files=files, trace=n.get("trace"),
                   emit={"findings": "list[dict]"} if step["kind"] == "check" else {"annotation": "str"})
        try:
            cur, _, frm, findings = self._before(ep, n)
            out["before"] = {"annotation": cur, "from": frm, "findings": jsonable(findings)}
        except StepError as e:
            out["before"] = {"blocked": str(e)}
        return out

    def set_window(self, w, var, rng):
        self.window = None if rng is None else [int(rng[0]), int(rng[1])]
        return self.describe()

    def render(self, auto_align=True):
        import umr
        preds = {}
        for i in range(len(self.doc["sents"])):
            f = self._final(i)
            if f is not None:
                preds[self._index(i)] = f["after_parsed"]
        text = umr.render_pred(self.doc, None, preds)
        added = []
        if auto_align:
            text, added = auto_align_umr(text, self.doc["lang"])
        return {"text": text, "added": added, "provenance": {}, "sentences": split_umr(text)}

    def export(self):
        eps = {}
        for i, ep in self.eps.items():
            eps[str(i)] = {"context": jsonable(ep["context"]),
                           "nodes": [{k: jsonable(v) for k, v in n.items() if k not in ("after_parsed", "trace")}
                                     for n in ep["nodes"]]}
        return {"skillset": self.sid, "doc": self._doc(), "window": self.window, "episodes": {self.WAVE: eps}}

    def reload(self):
        import yaml
        with open(os.path.join(self.path, "harness.yaml"), encoding="utf-8") as f:
            self.spec = yaml.safe_load(f)
        self.steps = self.spec["steps"]
        self.context_n = self.spec.get("context", self.b.context)
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
        for b in range(a, min(len(words), a + 8)):
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
        made = materialize_propbank()
        return {"propbank": made, "python": sys.version.split()[0]}

    def warm(self):
        """Load jieba's dictionary and tagger (the Jev skills and Chinese import need them)."""
        import logging
        import warnings
        warnings.filterwarnings("ignore", category=SyntaxWarning)     # jieba 0.42's regex strings
        import jieba
        import jieba.posseg  # noqa: F401
        jieba.setLogLevel(logging.WARNING)
        jieba.initialize()
        return True

    def docs(self):
        out = []
        for f in sorted(os.listdir(DOCS)):
            if f.endswith(".umr"):
                text = open(os.path.join(DOCS, f), encoding="utf-8").read()
                out.append({"id": f[:-4], "sentences": len(re.findall(r"#\s*::\s*snt\d+", text)),
                            "lang": "zh" if f.startswith("chinese") else "en"})
        return out

    def import_text(self, name, text, lang=None):
        name = re.sub(r"[^\w.-]+", "_", name or "imported")[:60] or "imported"
        if not re.search(r"#\s*::\s*snt\d+", text):
            text, lang = umr_from_text(text, lang)
        path = os.path.join(DOCS, name + ".umr")
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        return {"id": name}

    def open(self, skillset, doc):
        s = SKILLSETS[skillset]
        doc_path = os.path.join(DOCS, doc + ".umr")
        if s["engine"] == "registry":
            lang = "zh" if re.search(r"[一-鿿]", open(doc_path, encoding="utf-8").read()) else "en"
            self.engine = RegistryEngine(skillset, s["path"], os.path.join(DOCS, doc + ".txt"), lang)
        else:
            self.engine = HarnessEngine(skillset, s["path"], s["bench"], doc_path)
        return self.engine.describe()

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
