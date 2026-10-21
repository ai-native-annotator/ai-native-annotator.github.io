"""Parser for a skillset's registry.yaml. The syntax is in skillsets/REGISTRY.md.

Registry.load() reads the file into Wave / Skill / Rule objects and runs every
load-time check of REGISTRY.md section 7. All problems are collected and
raised together as one RegistryError, so a broken file is fixed in one go.

At run time the Runner uses:
    evaluate(expr, names, position)   the value of an expression
    holds(rule, names)                whether a rule's `when` is true
    python_type(spec)                 a type from `input` / `emit` as a Python type

    reg = Registry.load("skillsets/umr-tree/registry.yaml")
    wave = reg.waves[0]
    sents = evaluate(wave.for_each["sentence"], {"annotation": doc})
"""
from __future__ import annotations

import os
import re
import string
from dataclasses import dataclass, field
from typing import Any, Literal, Optional, Union

import yaml


class RegistryError(Exception):
    def __init__(self, errors):
        self.errors = errors
        lines = "\n".join("  - " + e for e in errors)
        super().__init__(f"registry.yaml has {len(errors)} problem(s):\n{lines}")


class ExpressionError(Exception):
    pass


# ---------------------------------------------------------------------------
# Expressions
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Path:
    """A dotted path: root.attr.attr"""
    root: str
    attrs: tuple = ()

    def __str__(self):
        return ".".join((self.root,) + self.attrs)


@dataclass(frozen=True)
class Window:
    """{window: <path>, range: [start, stop], pick: <attrs>}"""
    source: Path
    start: int
    stop: int
    pick: tuple = ()


Expr = Union[Path, Window]


def evaluate(expr, names, position=None):
    """The value of `expr`.

    names:    name -> value, for the first segment of a path.
    position: (i, n) - the index of the current for_each item and the length
              of the for_each list. Only a Window needs it.
    """
    if isinstance(expr, Path):
        return _resolve(expr, names)

    if position is None:
        raise ExpressionError(f"window over {expr.source} needs a for_each position")
    i, n = position
    items = _resolve(expr.source, names)
    lo = max(0, i + expr.start)
    hi = min(n, i + expr.stop)
    # A list from the current wave's worktree is still being filled, so it may
    # be shorter than the for_each list - but it must hold every item asked for.
    if len(items) > n or len(items) < hi:
        raise ExpressionError(
            f"window over {expr.source}: it has {len(items)} items, "
            f"the for_each list has {n}, items up to {hi} are needed")
    out = list(items[lo:hi])
    if expr.pick:
        out = [_follow(x, expr.pick, f"{expr.source}[*].{'.'.join(expr.pick)}") for x in out]
    return out


def _resolve(path, names):
    if path.root not in names:
        raise ExpressionError(f"unknown name '{path.root}'")
    return _follow(names[path.root], path.attrs, str(path))


def _follow(value, attrs, label):
    for a in attrs:
        if isinstance(value, dict):
            if a not in value:
                raise ExpressionError(f"{label}: no key '{a}'")
            value = value[a]
        else:
            if not hasattr(value, a):
                raise ExpressionError(f"{label}: no attribute '{a}' on {type(value).__name__}")
            value = getattr(value, a)
    return value


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

BASIC_TYPES = {
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
    "dict": dict,
    "list[str]": list[str],
    "list[int]": list[int],
    "list[float]": list[float],
    "list[dict]": list[dict],
}


def python_type(spec):
    """A type spec from `input` / `emit` as a Python type. An enum (a yaml
    list) becomes a Literal, so pydantic only accepts those values."""
    if isinstance(spec, list):
        return Literal[tuple(spec)]
    return BASIC_TYPES[spec]


# ---------------------------------------------------------------------------
# The parsed registry
# ---------------------------------------------------------------------------

@dataclass
class Skill:
    name: str
    path: str                   # absolute directory of the skill
    input: dict                 # variable -> type spec
    emit: dict                  # field -> type spec
    store: list                 # fields of emit kept on the worktree node
    kind: str = "agent"         # agent: skill.md through the model; rule: <name>.py, no model;
                                # jev: <name>.py asks Jev closed questions (src/jev.py)


@dataclass
class Condition:
    left: Path
    value: Any
    negate: bool = False


@dataclass
class Rule:
    skill: str                  # the skill whose emit this rule handles
    run: str
    input: dict                 # variable of `run` -> Path
    when: list = field(default_factory=list)   # list of Condition, all must hold
    each: Optional[tuple] = None                # (name, Path)
    edge: Optional[Path] = None


@dataclass
class Wave:
    name: str
    start: str
    for_each: dict              # name -> Path, zipped by position; {} for one episode
    context: dict               # variable -> Expr
    input: dict                 # variable -> Expr
    parallel: int = 1
    max_depth: Optional[int] = None
    max_nodes: Optional[int] = None


@dataclass
class Registry:
    path: str
    waves: list                 # list of Wave, in order
    skills: dict                # name -> Skill
    dispatcher: dict            # skill name -> list of Rule

    @classmethod
    def load(cls, path):
        errors = []
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        reg = _build(data, path, errors)
        if not errors:
            _check(reg, errors)
        if errors:
            raise RegistryError(list(dict.fromkeys(errors)))
        return reg

    def rules(self, skill):
        return self.dispatcher.get(skill, [])

    def emit_name(self, skill):
        return f"{skill}_emit"


def holds(rule, names):
    """True when every condition of rule.when holds."""
    for c in rule.when:
        value = evaluate(c.left, names)
        if (value == c.value) == c.negate:
            return False
    return True


# ---------------------------------------------------------------------------
# Building: yaml -> objects, with the structural checks
# ---------------------------------------------------------------------------

TOP_KEYS = {"waves", "skills", "dispatcher"}
WAVE_KEYS = {"name", "start", "parallel", "max_depth", "max_nodes", "init_input"}
INIT_KEYS = {"for_each", "context", "input"}
SKILL_KEYS = {"path", "input", "emit", "store", "kind"}
KINDS = {"agent", "rule", "jev"}
RULE_KEYS = {"when", "each", "run", "input", "edge"}
WINDOW_KEYS = {"window", "range", "pick"}
RESERVED = {"annotation", "worktree"}


def _build(data, path, errors):
    if not isinstance(data, dict):
        errors.append("the file must be a mapping with waves, skills and dispatcher")
        return None
    _keys(data, TOP_KEYS, TOP_KEYS, "top level", errors)
    base_dir = os.path.dirname(os.path.abspath(path))
    skills = _build_skills(data.get("skills"), base_dir, errors)
    waves = _build_waves(data.get("waves"), errors)
    dispatcher = _build_dispatcher(data.get("dispatcher"), errors)
    return Registry(path, waves, skills, dispatcher)


def _keys(d, allowed, required, where, errors):
    """Report unknown and missing keys. False when d is not a mapping at all."""
    if not isinstance(d, dict):
        errors.append(f"{where}: must be a mapping")
        return False
    for k in d:
        if k not in allowed:
            errors.append(f"{where}: unknown key '{k}' (allowed: {', '.join(sorted(allowed))})")
    for k in required:
        if k not in d:
            errors.append(f"{where}: missing '{k}'")
    return True


def _mapping(value, where, errors, non_empty=False):
    """value if it is a (non-empty) mapping; otherwise report it and use {}."""
    if isinstance(value, dict) and (value or not non_empty):
        return value
    errors.append(f"{where}: must be a {'non-empty ' if non_empty else ''}mapping")
    return {}


def _name(value, where, errors):
    if not isinstance(value, str) or not value.isidentifier():
        errors.append(f"{where}: '{value}' is not a valid name")
        return False
    if value in RESERVED:
        errors.append(f"{where}: '{value}' is reserved")
        return False
    return True


def _path(value, where, errors):
    if not isinstance(value, str):
        errors.append(f"{where}: expected a dotted path, got {value!r}")
        return None
    parts = value.split(".")
    if not all(p.isidentifier() for p in parts):
        errors.append(f"{where}: '{value}' is not a dotted path")
        return None
    return Path(parts[0], tuple(parts[1:]))


def _exprs(d, where, errors, allow_window):
    """A {variable: expression} mapping, as in init_input.context / input and
    a rule's input. Bad entries are reported and left out."""
    out = {}
    for k, v in d.items():
        if _name(k, where, errors):
            e = _expr(v, f"{where}.{k}", errors, allow_window)
            if e:
                out[k] = e
    return out


def _expr(value, where, errors, allow_window):
    if isinstance(value, dict) and "window" in value:
        if not allow_window:
            errors.append(f"{where}: window can only be used in init_input")
            return None
        return _window(value, where, errors)
    return _path(value, where, errors)


def _window(value, where, errors):
    _keys(value, WINDOW_KEYS, {"window", "range"}, where, errors)
    source = _path(value.get("window"), f"{where}.window", errors)
    rng = value.get("range")
    if (not isinstance(rng, list) or len(rng) != 2
            or not all(isinstance(x, int) and not isinstance(x, bool) for x in rng)):
        errors.append(f"{where}.range: must be [start, stop], two integers")
        return None
    if rng[0] >= rng[1]:
        errors.append(f"{where}.range: start must be less than stop")
        return None
    pick = ()
    if "pick" in value:
        p = _path(value["pick"], f"{where}.pick", errors)
        if p is None:
            return None
        pick = (p.root,) + p.attrs
    if source is None:
        return None
    return Window(source, rng[0], rng[1], pick)


def _type(spec, where, errors, allow_enum):
    if isinstance(spec, list):
        if not allow_enum:
            errors.append(f"{where}: an enum can only be used in emit")
        elif not spec:
            errors.append(f"{where}: an enum needs at least one value")
        else:
            for v in spec:
                if not isinstance(v, str):
                    errors.append(f"{where}: enum value {v!r} is not a string - "
                                  f"quote it (yaml reads no/yes/on/off/null unquoted)")
    elif spec not in BASIC_TYPES:
        errors.append(f"{where}: unknown type {spec!r} (allowed: {', '.join(BASIC_TYPES)}, or an enum list)")


def _positive_int(d, key, where, errors):
    if key not in d:
        return None
    v = d[key]
    if not isinstance(v, int) or isinstance(v, bool) or v < 1:
        errors.append(f"{where}.{key}: must be a positive integer")
        return None
    return v


def _single(d, where, errors):
    """A {name: path} mapping with exactly one item, as in each."""
    if not isinstance(d, dict) or len(d) != 1:
        errors.append(f"{where}: must be {{<name>: <list>}} with exactly one item")
        return None
    (name, value), = d.items()
    if not _name(name, where, errors):
        return None
    p = _path(value, f"{where}.{name}", errors)
    return (name, p) if p else None


def _build_skills(data, base_dir, errors):
    skills = {}
    for name, s in _mapping(data, "skills", errors, non_empty=True).items():
        where = f"skills.{name}"
        if not _name(name, where, errors) or not _keys(s, SKILL_KEYS, {"path", "emit"}, where, errors):
            continue
        inp = _mapping(s.get("input") or {}, f"{where}.input", errors)
        emit = _mapping(s.get("emit") or {}, f"{where}.emit", errors, non_empty=True)
        store = s.get("store") or []
        if not isinstance(store, list):
            errors.append(f"{where}.store: must be a list")
            store = []
        for k, t in inp.items():
            _name(k, f"{where}.input", errors)
            _type(t, f"{where}.input.{k}", errors, allow_enum=False)
        for k, t in emit.items():
            _name(k, f"{where}.emit", errors)
            _type(t, f"{where}.emit.{k}", errors, allow_enum=True)
        path = os.path.join(base_dir, str(s.get("path", "")))
        kind = s.get("kind", "agent")
        if kind not in KINDS:
            errors.append(f"{where}.kind: must be one of {', '.join(sorted(KINDS))}")
        skills[name] = Skill(name, path, inp, emit, store, kind)
    return skills


def _build_waves(data, errors):
    waves = []
    if not isinstance(data, list) or not data:
        errors.append("waves: must be a non-empty list")
        return waves
    for n, w in enumerate(data):
        if not _keys(w, WAVE_KEYS, {"name", "start", "init_input"}, f"waves[{n}]", errors):
            continue
        where = f"waves[{n}] ({w.get('name')})"
        _name(w.get("name"), f"{where}.name", errors)
        init = w.get("init_input")
        if not _keys(init, INIT_KEYS, set(), f"{where}.init_input", errors):
            init = {}
        for_each = {}
        if "for_each" in init:
            at = f"{where}.init_input.for_each"
            for name, value in _mapping(init["for_each"], at, errors, non_empty=True).items():
                p = _path(value, f"{at}.{name}", errors) if _name(name, at, errors) else None
                if p:
                    for_each[name] = p
        sections = {}
        for section in ("context", "input"):
            at = f"{where}.init_input.{section}"
            sections[section] = _exprs(_mapping(init.get(section) or {}, at, errors),
                                       at, errors, allow_window=True)
        waves.append(Wave(
            name=w.get("name"),
            start=w.get("start"),
            for_each=for_each,
            context=sections["context"],
            input=sections["input"],
            parallel=_positive_int(w, "parallel", where, errors) or 1,
            max_depth=_positive_int(w, "max_depth", where, errors),
            max_nodes=_positive_int(w, "max_nodes", where, errors),
        ))
    return waves


def _build_dispatcher(data, errors):
    dispatcher = {}
    if data is None:            # no rules at all is fine
        return dispatcher
    for skill, rules in _mapping(data, "dispatcher", errors).items():
        if not isinstance(rules, list):
            errors.append(f"dispatcher.{skill}: must be a list of rules")
            continue
        dispatcher[skill] = []
        for n, r in enumerate(rules):
            where = f"dispatcher.{skill}[{n}]"
            if not _keys(r, RULE_KEYS, {"run", "input"}, where, errors):
                continue
            at = f"{where}.input"
            rule = Rule(skill=skill, run=r.get("run"),
                        input=_exprs(_mapping(r.get("input"), at, errors), at, errors, allow_window=False))
            if "when" in r:
                rule.when = _when(r["when"], f"{where}.when", errors)
            if "each" in r:
                rule.each = _single(r["each"], f"{where}.each", errors)
            if "edge" in r:
                rule.edge = _path(r["edge"], f"{where}.edge", errors)
            dispatcher[skill].append(rule)
    return dispatcher


def _when(data, where, errors):
    conds = []
    if not isinstance(data, dict) or not data:
        errors.append(f"{where}: must be a mapping {{<path>: <value>}}")
        return conds
    for left, value in data.items():
        p = _path(left, where, errors)
        negate = False
        if isinstance(value, dict):
            if list(value) != ["not"]:
                errors.append(f"{where}.{left}: only {{not: <value>}} is allowed here")
                continue
            value, negate = value["not"], True
        if isinstance(value, (list, dict)):
            errors.append(f"{where}.{left}: the value must be a single literal")
            continue
        if p:
            conds.append(Condition(p, value, negate))
    return conds


# ---------------------------------------------------------------------------
# Checking: the cross-references of REGISTRY.md section 7
# ---------------------------------------------------------------------------

def _check(reg, errors):
    skills, waves = reg.skills, reg.waves

    names = [w.name for w in waves]
    for name in set(names):
        if names.count(name) > 1:
            errors.append(f"waves: the name '{name}' is used more than once")

    for s in skills.values():
        need = f"{s.name}.py" if s.kind in ("rule", "jev") else "skill.md"
        if not os.path.isfile(os.path.join(s.path, need)):
            errors.append(f"skills.{s.name}: no {need} in {s.path}")
        for f in s.store:
            if f not in s.emit:
                errors.append(f"skills.{s.name}.store: '{f}' is not in emit")

    for skill, rules in reg.dispatcher.items():
        if skill not in skills:
            errors.append(f"dispatcher.{skill}: no such skill")
        for n, r in enumerate(rules):
            if r.run not in skills:
                errors.append(f"dispatcher.{skill}[{n}].run: no such skill '{r.run}'")

    reached = set()
    for i, w in enumerate(waves):
        where = f"waves[{i}] ({w.name})"
        if w.start not in skills:
            errors.append(f"{where}.start: no such skill '{w.start}'")
            continue
        _check_wave(reg, i, w, where, errors)
        wave_skills = _reachable(reg, w.start)
        reached |= wave_skills
        for s in sorted(wave_skills):
            _check_skill_in_wave(reg, skills[s], w, where, errors)

    # A skill no wave reaches is still checked, only without a wave's context.
    for skill, rules in reg.dispatcher.items():
        if skill in skills and skill not in reached:
            for n, r in enumerate(rules):
                _check_rule(reg, r, f"dispatcher.{skill}[{n}]", None, errors)


def _reachable(reg, start):
    """The skills an episode starting at `start` can run."""
    seen, todo = set(), [start]
    while todo:
        s = todo.pop()
        if s in seen or s not in reg.skills:
            continue
        seen.add(s)
        todo.extend(r.run for r in reg.rules(s))
    return seen


def _root_ok(p, allowed, where, errors):
    if p.root not in allowed:
        errors.append(f"{where}: '{p.root}' cannot be used here (allowed: {', '.join(sorted(allowed))})")
        return False
    return True


def _check_wave(reg, i, w, where, errors):
    allowed = set(RESERVED)
    for name, p in w.for_each.items():
        _check_path(reg, i, w, p, None, RESERVED, f"{where}.init_input.for_each.{name}", errors)
        allowed.add(name)
        if name in w.context:
            errors.append(f"{where}: the for_each name '{name}' is also a context variable")

    for section, d in (("context", w.context), ("input", w.input)):
        for k, e in d.items():
            at = f"{where}.init_input.{section}.{k}"
            win = e if isinstance(e, Window) else None
            if win and not w.for_each:
                errors.append(f"{at}: window needs a for_each in this wave")
            _check_path(reg, i, w, win.source if win else e, win, allowed, at, errors)

    _check_cover(set(w.input), reg.skills[w.start], f"{where}.init_input.input", errors)


def _check_path(reg, i, w, p, win, allowed, where, errors):
    """A path in wave i's init_input; win is the window it sits in, if any."""
    if not _root_ok(p, allowed, where, errors) or p.root != "worktree":
        return
    if not p.attrs:
        errors.append(f"{where}: write worktree.<wave name>")
        return
    target = p.attrs[0]
    if target in [x.name for x in reg.waves[:i]]:
        return
    if target != w.name:
        errors.append(f"{where}: worktree.{target} is not an earlier wave or this wave")
        return
    # This wave's own worktree: only finished items, so only through a window
    # that stops before the current item, and only when episodes run in order.
    if win is None:
        errors.append(f"{where}: this wave's own worktree can only be read through a window")
    elif win.stop > 0:
        errors.append(f"{where}: a window over this wave's own worktree must have stop <= 0")
    if w.parallel != 1:
        errors.append(f"{where}: reading this wave's own worktree needs parallel: 1")


def _check_cover(given, skill, where, errors):
    """The variables given to a skill are exactly its input."""
    need = set(skill.input)
    for k in sorted(need - given):
        errors.append(f"{where}: missing '{k}', needed by {skill.name}")
    for k in sorted(given - need):
        errors.append(f"{where}: '{k}' is not an input of {skill.name}")


def _check_skill_in_wave(reg, s, w, where, errors):
    for k in s.input:
        if k in w.context:
            errors.append(f"{where}: context variable '{k}' is also an input of {s.name}")
    _check_template(s, w, errors)
    for n, r in enumerate(reg.rules(s.name)):
        _check_rule(reg, r, f"dispatcher.{s.name}[{n}]", w, errors)


def _check_template(s, w, errors):
    """Every {placeholder} in skill.md is an input of s or a context variable of w."""
    md = os.path.join(s.path, "skill.md")
    if s.kind == "rule" or not os.path.isfile(md):
        return                  # a rule has no template; a missing one is reported in _check
    with open(md, encoding="utf-8") as f:
        text = f.read()
    try:
        fields = [f for _, f, _, _ in string.Formatter().parse(text) if f is not None]
    except ValueError as e:
        errors.append(f"skills.{s.name}: skill.md is not a valid template ({e}); "
                      f"write literal braces as {{{{ and }}}}")
        return
    available = set(w.context) | set(s.input)
    for f in fields:
        root = re.split(r"[.\[]", f)[0]     # {x.attr} / {x[0]} -> x
        if not root:
            errors.append(f"skills.{s.name}: skill.md has a positional {{}} placeholder")
        elif root not in available:
            errors.append(f"skills.{s.name}: skill.md uses {{{root}}}, which is neither "
                          f"an input nor a context variable of wave '{w.name}'")


def _check_rule(reg, r, where, wave, errors):
    """The names a rule may use (REGISTRY.md 4.3): the skill's input, its
    <skill>_emit, the wave's context (when known), and the each name."""
    s = reg.skills[r.skill]
    emit = reg.emit_name(r.skill)
    names = set(s.input) | {emit}
    if wave is not None:
        names |= set(wave.context)

    def check(p, scope, at):
        if _root_ok(p, scope, at, errors) and p.root == emit and p.attrs and p.attrs[0] not in s.emit:
            errors.append(f"{at}: {r.skill} does not emit '{p.attrs[0]}'")

    for c in r.when:
        check(c.left, names, f"{where}.when")
        if c.left.root == emit and len(c.left.attrs) == 1:
            spec = s.emit.get(c.left.attrs[0])
            if isinstance(spec, list) and c.value not in spec:
                errors.append(f"{where}.when: {c.value!r} is not one of {spec}")

    scope = names
    if r.each:
        name, p = r.each
        check(p, names, f"{where}.each")
        if name in names:
            errors.append(f"{where}.each: the name '{name}' is already in use")
        scope = names | {name}

    for k, e in r.input.items():
        check(e, scope, f"{where}.input.{k}")
    if r.edge:
        check(r.edge, scope, f"{where}.edge")
    if r.run in reg.skills:
        _check_cover(set(r.input), reg.skills[r.run], f"{where}.input", errors)
