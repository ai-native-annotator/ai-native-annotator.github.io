"""Module 2a: core predicate identification (abstract concept vs. verb lemma)."""

from __future__ import annotations

from .base import SkillModule
from .. import resources


class PredicateSkill(SkillModule):
    name = "predicate"
    skill_file = "predicate.md"
    notes_file = ""
    include_schema = False

    def run(self, *, clause: str, sentence: str, language: str) -> dict:
        abstract = ", ".join(sorted(resources.abstract_rolesets().keys()))
        task = (
            "## Available abstract rolesets\n"
            f"{abstract}\n\n"
            "## Task input\n"
            f"Full sentence (context): {sentence}\n"
            f"Clause to analyse: {clause}\n\n"
            "Identify the core predicate; answer with the JSON only."
        )
        result = self.call(task, language)
        if not isinstance(result, dict):
            result = {}
        result.setdefault("predicate_kind", "verb")
        result.setdefault("lemmas", [])
        result.setdefault("concept", None)
        return result
