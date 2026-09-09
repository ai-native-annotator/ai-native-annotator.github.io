"""Module 2b/2c: sense selection, argument structure, event attributes."""

from __future__ import annotations

from .base import SkillModule
from .. import resources
from ..propbank import get_propbank


def frames_reference(predicate_info: dict, language: str) -> str:
    """Prompt-ready sense/role inventory for the identified predicate."""
    if predicate_info.get("predicate_kind") == "abstract" and predicate_info.get("concept"):
        concept = predicate_info["concept"]
        entry = resources.abstract_rolesets().get(concept)
        if entry:
            roles = "  ".join(f"{k}: {v}" for k, v in entry["roles"].items())
            return f"{concept} ({entry['description']})  {roles}"
        return f"{concept} (abstract roleset; use ARG1/ARG2 as in the examples)"
    lemmas = [l for l in predicate_info.get("lemmas", []) if l]
    if not lemmas:
        return "(no PropBank candidates; use <lemma>-01 if you keep a verb)"
    return get_propbank(language).candidates_text(lemmas)


class ArgumentsSkill(SkillModule):
    name = "arguments"
    skill_file = "arguments.md"
    notes_file = "arguments.md"
    include_schema = True

    def run(self, *, clause: str, sentence: str, predicate_info: dict,
            language: str) -> dict:
        frames = frames_reference(predicate_info, language)
        task = (
            "## PropBank / roleset reference for this predicate\n"
            f"{frames}\n\n"
            "## Task input\n"
            f"Full sentence (context): {sentence}\n"
            f"Clause to analyse: {clause}\n"
            f"Core predicate: {predicate_info.get('predicate_text', '?')} "
            f"(kind: {predicate_info.get('predicate_kind')})\n\n"
            "Build the event node; answer with the JSON node only."
        )
        node = self.call(task, language)
        if not isinstance(node, dict) or not node.get("concept"):
            # degenerate fallback: keep the clause as an unanalysed event
            lemma = (predicate_info.get("lemmas") or [clause.split()[0] if clause.split() else "event"])[0]
            node = {"concept": f"{lemma}-01", "relations": [], "phrase": clause}
        return node
