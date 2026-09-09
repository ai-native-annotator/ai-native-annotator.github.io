"""Module 4/5: phrase decomposition (NP, special text) and the stop test."""

from __future__ import annotations

import re

from .base import SkillModule
from .. import resources

# Cheap programmatic stop test; the LLM skill is consulted only when this
# cannot decide (keeps the call budget low without giving up modularity).
_PRONOUNS_EN = {"i", "you", "he", "she", "it", "we", "they", "me", "him",
                "her", "us", "them", "his", "its", "their", "my", "your",
                "our", "this", "that", "these", "those"}
_PRONOUNS_ZH = {"我", "你", "他", "她", "它", "我们", "你们", "他们", "她们",
                "它们", "这", "那", "这些", "那些", "自己", "其", "该"}

_SPECIAL_RX = re.compile(
    r"\d[\d,.:/年月日时点分%]*|https?://|\bwww\.|[０-９]+", re.I)


def quick_stop_test(phrase: str, language: str):
    """Return a kind if decidable programmatically, else None."""
    p = phrase.strip()
    tokens = p.split() if language == "en" else list(p.replace(" ", ""))
    if language == "en":
        if len(tokens) == 1:
            w = tokens[0].strip(".,!?\"'").lower()
            if w in _PRONOUNS_EN:
                return "np"           # pronouns need refer-* attributes
            if _SPECIAL_RX.search(w):
                return "special"
            return "atomic"
    else:
        if p in _PRONOUNS_ZH:
            return "np"
        if len(p) <= 3 and not _SPECIAL_RX.search(p):
            return "atomic"
    if _SPECIAL_RX.fullmatch(p):
        return "special"
    return None


class StopTestSkill(SkillModule):
    name = "stop_test"
    skill_file = "stop_test.md"
    notes_file = ""
    include_schema = False

    def run(self, *, phrase: str, language: str) -> str:
        kind = quick_stop_test(phrase, language)
        if kind:
            return kind
        task = f"## Task input\nPhrase: {phrase}\n\nClassify it; answer with the JSON only."
        try:
            result = self.call(task, language)
            kind = result.get("kind", "np")
        except Exception:
            kind = "np"
        return kind if kind in ("atomic", "np", "clause", "special") else "np"


class NPSkill(SkillModule):
    name = "np_phrase"
    skill_file = "np_phrase.md"
    notes_file = "np_phrase.md"
    include_schema = True

    def run(self, *, phrase: str, sentence: str, language: str) -> dict:
        ner = ", ".join(resources.ner_types()[:80])
        task = (
            "## Named-entity type inventory (head concepts for named entities)\n"
            f"{ner}\n\n"
            "## Task input\n"
            f"Full sentence (context): {sentence}\n"
            f"Noun phrase to analyse: {phrase}\n\n"
            "Build the subtree; answer with the JSON node only."
        )
        node = self.call(task, language)
        if not isinstance(node, dict) or not node.get("concept"):
            node = {"concept": phrase.replace(" ", "-").lower() or "thing",
                    "relations": [], "phrase": phrase}
        return node


class SpecialSkill(SkillModule):
    name = "special_entity"
    skill_file = "special_entity.md"
    notes_file = "special_entity.md"
    include_schema = True

    def run(self, *, phrase: str, sentence: str, language: str) -> dict:
        task = (
            "## Task input\n"
            f"Full sentence (context): {sentence}\n"
            f"Special phrase to analyse: {phrase}\n\n"
            "Build the subtree; answer with the JSON node only."
        )
        node = self.call(task, language)
        if not isinstance(node, dict) or not node.get("concept"):
            node = {"concept": "string-entity",
                    "relations": [[":value", f'"{phrase}"']], "phrase": phrase}
        return node
