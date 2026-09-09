"""Module 7: document-level annotation (temporal, modal, coreference).

Keeps a per-document *variable registry* — every event and entity from prior
sentences with its variable, concept and source phrase — so the LLM can link
current-sentence variables to earlier ones (the cross-sentence memory the
plan asks for)."""

from __future__ import annotations

import re
from typing import Dict, List

from .base import SkillModule

_MODSTR_TO_DEP = {
    "fullaff": ":full-affirmative",
    "partaff": ":partial-affirmative",
    "neutaff": ":neutral-affirmative",
    "fullneg": ":full-negative",
    "partneg": ":partial-negative",
    "neutneg": ":neutral-negative",
}


def registry_from_penman(graph_text: str, phrase_hint: str = "") -> List[dict]:
    """Extract (var, concept, attributes, nesting depth) from an emitted graph."""
    entries = []
    for m in re.finditer(r"\((s\d+[a-z]+\d*) / ([^\s()]+)", graph_text):
        var, concept = m.group(1), m.group(2)
        head = graph_text[:m.start()]
        depth = head.count("(") - head.count(")") + 1
        tail = graph_text[m.end():m.end() + 400]
        aspect = re.search(r":aspect ([\w-]+)", tail)
        modstr = re.search(r":modstr ([\w-]+)", tail)
        entries.append({
            "var": var, "concept": concept, "depth": depth,
            "is_event": bool(re.search(r"-\d+$", concept)),
            "aspect": aspect.group(1) if aspect else None,
            "modstr": modstr.group(1) if modstr else None,
        })
    return entries


_OVERLAP_ASPECTS = {"state", "habitual", "activity", "process", "imperfective",
                    "atelic-process", "generic"}


_DISCOURSE = {"and-91", "but-91", "contrast-91", "and", "or",
              "unexpected-co-occurrence-91", "multi-sentence"}


def main_events(current: List[dict]) -> List[dict]:
    """Top-level (non-embedded, non-discourse) events — the ones the gold
    document annotation actually anchors temporally and modally."""
    return [e for e in current if e["is_event"]
            and e["concept"] not in _DISCOURSE and e.get("depth", 9) <= 3]


def default_temporal(current: List[dict]) -> List[list]:
    """One DCT anchor per main event, direction chosen by aspect.
    (DCT :after e) = e is in the past; (DCT :overlap e) = state/ongoing."""
    triples = []
    for e in main_events(current):
        rel = ":overlap" if (e.get("aspect") in _OVERLAP_ASPECTS) else ":after"
        triples.append(["document-creation-time", rel, e["var"]])
    return triples[:4]


class DocLevelSkill(SkillModule):
    name = "doc_level"
    skill_file = "doc_level.md"
    notes_file = "doc_level.md"
    include_schema = False

    def run(self, *, snt_index: int, sentence: str, current: List[dict],
            registry: List[dict], language: str) -> str:
        """Returns the document-level annotation text for this sentence."""
        default_modal = [["root", ":modal", "author"]]
        for e in main_events(current):
            dep = _MODSTR_TO_DEP.get(e.get("modstr") or "fullaff", ":full-affirmative")
            default_modal.append(["author", dep, e["var"]])

        cur_txt = "\n".join(
            f"- {e['var']}: {e['concept']}"
            + (f" (aspect={e['aspect']}, modstr={e['modstr']})" if e["is_event"] else "")
            for e in current)
        reg_txt = "\n".join(
            f"- snt{e['snt']}: {e['var']}: {e['concept']}" for e in registry[-120:]
        ) or "(none — this is the first sentence)"

        task = (
            "## Task input\n"
            f"Current sentence (snt{snt_index}): {sentence}\n\n"
            f"Current sentence variables:\n{cur_txt}\n\n"
            f"Registry of previous sentences' variables:\n{reg_txt}\n\n"
            f"Default modal triples (adjust if needed): {default_modal}\n\n"
            "Produce temporal/modal/coref; answer with the JSON only."
        )
        try:
            result = self.call(task, language)
        except Exception:
            result = {}
        # Modal is deterministic from :modstr — the gold data virtually always
        # uses (author :full-affirmative e); LLM-invented conceiver chains
        # hurt precision, so the LLM output is ignored for modal.
        modal = default_modal
        known_vars = ({e["var"] for e in current} | {e["var"] for e in registry}
                      | {"document-creation-time", "root", "author",
                         "past-reference", "present-reference", "future-reference"})
        # DCT anchoring is deterministic (aspect-driven); the LLM contributes
        # only date-containment and event–event ordering triples.
        temporal = default_temporal(current)
        anchored = {t[2] for t in temporal}
        extras = [t for t in result.get("temporal", [])
                  if isinstance(t, (list, tuple)) and len(t) == 3
                  and str(t[0]) in known_vars and str(t[2]) in known_vars
                  and str(t[0]) != "document-creation-time"
                  and str(t[2]) not in anchored][:2]
        temporal = temporal + extras
        coref = [t for t in result.get("coref", [])
                 if isinstance(t, (list, tuple)) and len(t) == 3
                 and str(t[0]) in known_vars and str(t[2]) in known_vars][:4]
        return render_doc_annotation(snt_index, temporal, modal, coref)


def render_doc_annotation(snt_index: int, temporal, modal, coref) -> str:
    def block(triples):
        rows = []
        for t in triples:
            if isinstance(t, (list, tuple)) and len(t) == 3:
                rel = t[1] if str(t[1]).startswith(":") else f":{t[1]}"
                rows.append(f"({t[0]} {rel} {t[2]})")
        return rows

    parts = [f"(s{snt_index}s0 / sentence"]
    for role, triples in ((":temporal", temporal), (":modal", modal), (":coref", coref)):
        rows = block(triples)
        if rows:
            inner = "\n\t\t".join(rows)
            parts.append(f"\t{role} ({inner})")
    return "\n".join(parts) + ")"
