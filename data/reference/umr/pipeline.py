"""Modular parsing pipeline (orchestrator).

Sentence flow (see docs/architecture.md for the chart)::

    sentence ──▶ [discourse] ──▶ clause segments
    clause  ──▶ [predicate] ──▶ PropBank lookup ──▶ [arguments] ──▶ event node
    pending leaf ──▶ [stop_test] ──▶ {atomic | np | clause | special}
                     np ──▶ [np_phrase]   special ──▶ [special_entity]
                     clause ──▶ recurse   atomic ──▶ leaf node
    tree ──▶ [reentrancy] ──▶ attribute defaults ──▶ coverage check ──▶ Penman

Document flow: sentence graphs are parsed independently (parallelisable),
then a sequential [doc_level] pass walks sentences in order, growing the
variable registry and emitting the document-level annotation blocks.
"""

from __future__ import annotations

import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

from . import graph as G
from .documents import Document, Sentence
from .modules import build_modules
from .modules.doc_level import registry_from_penman

# Depth at which clause recursion stops and phrases are handed to the NP
# module in one shot; beyond FORCE_ATOMIC_DEPTH everything becomes a leaf.
MAX_DEPTH = 6
FORCE_ATOMIC_DEPTH = 8


class ModularParser:
    def __init__(self, config: dict):
        self.config = config
        self.modules = build_modules(config)
        self.report: List[dict] = []       # per-sentence diagnostics

    # ------------------------------------------------------------- sentence
    COVERAGE_RETRY_THRESHOLD = 0.85

    def parse_sentence(self, sentence: str, language: str) -> dict:
        """Full sentence → node tree (with intermediate artefacts).

        If the discourse segmentation loses content (token coverage below
        threshold), the sentence is re-parsed as a single clause and the
        better-covering tree wins — the plan's step-3 verification acting as
        a repair loop."""
        disc = self.modules["discourse"].run(sentence=sentence, language=language)

        used_discourse = disc.get("has_discourse") and isinstance(disc.get("structure"), dict)
        root = disc["structure"] if used_discourse else \
            {"expand": True, "phrase": sentence, "kind": "clause"}
        root = self._expand(root, sentence, language, depth=0)
        coverage, _ = G.coverage_report(root, sentence.split())

        if used_discourse and coverage < self.COVERAGE_RETRY_THRESHOLD:
            retry = self._expand({"expand": True, "phrase": sentence, "kind": "clause"},
                                 sentence, language, depth=0)
            retry_cov, _ = G.coverage_report(retry, sentence.split())
            if retry_cov > coverage:
                root = retry

        root = self.modules["reentrancy"].run(
            sentence=sentence, root=root, language=language)
        self._default_attributes(root)
        return root

    def _expand(self, node: dict, sentence: str, language: str, depth: int) -> dict:
        """Recursively resolve pending leaves into subtrees."""
        if not isinstance(node, dict):
            return node
        if node.get("expand"):
            node = self._expand_pending(node, sentence, language, depth)
        # extra subordinate relations attached by the discourse module
        subs = node.pop("sub", None) or []
        rels = node.setdefault("relations", [])
        for role, val in subs:
            rels.append([role, val])
        for rel in node.get("relations", []) or []:
            if isinstance(rel[1], dict) and "ref" not in rel[1]:
                rel[1] = self._expand(rel[1], sentence, language, depth + 1)
        return node

    def _expand_pending(self, leaf: dict, sentence: str, language: str, depth: int) -> dict:
        phrase = str(leaf.get("phrase", "")).strip()
        kind = leaf.get("kind") or "np"
        sub = leaf.get("sub")
        if not phrase:
            return {"concept": "thing", "relations": [], "phrase": phrase}
        if depth >= FORCE_ATOMIC_DEPTH:
            kind = "atomic"
        elif depth >= MAX_DEPTH and kind == "clause":
            kind = "np"        # last full analysis, no further clause recursion
        if kind not in ("clause", "np", "special", "atomic"):
            kind = self.modules["stop_test"].run(phrase=phrase, language=language)

        if kind == "clause":
            node = self._parse_clause(phrase, sentence, language)
        elif kind == "special":
            node = self.modules["special_entity"].run(
                phrase=phrase, sentence=sentence, language=language)
        elif kind == "np":
            node = self.modules["np_phrase"].run(
                phrase=phrase, sentence=sentence, language=language)
        else:  # atomic
            node = self._atomic(phrase, language)
        if sub:
            node["sub"] = sub
        node.setdefault("phrase", phrase)
        return node

    def _atomic(self, phrase: str, language: str) -> dict:
        concept = phrase.strip().strip(".,!?;\"'，。！？；、")
        if language == "en":
            concept = concept.lower().replace(" ", "-")
        else:
            concept = concept.replace(" ", "")
        return {"concept": concept or "thing", "relations": [], "phrase": phrase}

    def _parse_clause(self, clause: str, sentence: str, language: str) -> dict:
        pred = self.modules["predicate"].run(
            clause=clause, sentence=sentence, language=language)
        node = self.modules["arguments"].run(
            clause=clause, sentence=sentence, predicate_info=pred,
            language=language)
        return node

    def _default_attributes(self, root: dict) -> None:
        """Guarantee :aspect and :modstr on every event node."""
        for n in G._iter_nodes(root):
            concept = str(n.get("concept", ""))
            is_event = bool(re.search(r"-\d+$", concept))
            if not is_event:
                continue
            roles = [r[0] for r in n.get("relations", []) or []]
            rels = n.setdefault("relations", [])
            if ":aspect" not in roles:
                default = "state" if re.search(r"-9\d$", concept) else "performance"
                rels.append([":aspect", default])
            if ":modstr" not in roles:
                rels.append([":modstr", "fullaff"])

    # ------------------------------------------------------------- document
    def parse_document(self, doc: Document, workers: int = 4,
                       progress=None) -> Document:
        """Parse all sentences (parallel) then run the doc-level pass (serial)."""
        out = Document(doc_id=doc.doc_id, language=doc.language)

        def one(s: Sentence):
            try:
                tree = self.parse_sentence(s.text, doc.language)
                penman = G.to_penman(tree, s.index)
                problems = G.validate_tree(tree, doc.language)
                coverage, missing = G.coverage_report(tree, s.tokens)
                return s, tree, penman, problems, coverage, missing, None
            except Exception as e:            # keep going; log the failure
                return s, None, f"(s{s.index}x / umr-empty)", [], 0.0, [], repr(e)

        # real UMR keeps modal strength in the doc-level modal deps for
        # both languages, not in the sentence graph
        strip_modstr = True

        with ThreadPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(one, doc.sentences))

        registry: List[dict] = []
        for s, tree, penman, problems, coverage, missing, error in results:
            entries = registry_from_penman(penman)   # captures :modstr first
            if strip_modstr:
                penman = G.strip_modstr(penman)
            doc_ann = ""
            if self.config.get("doc_level", True):
                doc_ann = self.modules["doc_level"].run(
                    snt_index=s.index, sentence=s.text, current=entries,
                    registry=registry, language=doc.language)
            for e in entries:
                e["snt"] = s.index
            registry.extend(entries)

            out.sentences.append(Sentence(
                index=s.index, tokens=list(s.tokens), sent_graph=penman,
                doc_annotation=doc_ann))
            self.report.append({
                "doc": doc.doc_id, "snt": s.index, "coverage": round(coverage, 3),
                "missing_tokens": missing, "problems": problems, "error": error,
            })
            if progress:
                progress(s.index, len(results))
        return out
