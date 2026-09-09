"""Module 1: intra-sentence discourse relation detection."""

from __future__ import annotations

from .base import SkillModule


class DiscourseSkill(SkillModule):
    name = "discourse"
    skill_file = "discourse.md"
    notes_file = "discourse.md"
    include_schema = True

    def run(self, *, sentence: str, language: str) -> dict:
        task = (
            "## Task input\n"
            f"Sentence ({'Chinese' if language == 'zh' else 'English'}):\n"
            f"{sentence}\n\n"
            "Decide the discourse structure and answer with the JSON only."
        )
        result = self.call(task, language)
        if not isinstance(result, dict) or "has_discourse" not in result:
            return {"has_discourse": False}
        return result
