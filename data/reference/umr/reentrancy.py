"""Module 6: within-sentence reentrancy (anaphora, control, PRO-drop)."""

from __future__ import annotations

from .base import SkillModule
from .. import graph as G


class ReentrancySkill(SkillModule):
    name = "reentrancy"
    skill_file = "reentrancy.md"
    notes_file = ""
    include_schema = False

    def run(self, *, sentence: str, root: dict, language: str) -> dict:
        """Mutates ``root`` in place, replacing duplicate mentions by refs."""
        nodes = list(G._iter_nodes(root))
        if len(nodes) < 3:
            return root
        # ensure every node has an id the LLM can talk about
        for i, n in enumerate(nodes, 1):
            n.setdefault("id", f"e{i}")
        listing = "\n".join(
            f"- {n['id']}: {n.get('concept')} | \"{n.get('phrase', '')}\""
            for n in nodes)
        task = (
            "## Task input\n"
            f"Sentence: {sentence}\n\n"
            "Nodes in the parsed graph:\n"
            f"{listing}\n\n"
            "List coreferent pairs; answer with the JSON only."
        )
        try:
            result = self.call(task, language)
            merges = result.get("merge", [])
        except Exception:
            merges = []
        by_id = {str(n["id"]): n for n in nodes}
        for pair in merges:
            if not (isinstance(pair, list) and len(pair) == 2):
                continue
            canon, dup = str(pair[0]), str(pair[1])
            if canon == dup or canon not in by_id or dup not in by_id:
                continue
            self._replace_with_ref(root, by_id[dup], canon)
        return root

    def _replace_with_ref(self, node: dict, target: dict, canon_id: str):
        for rel in node.get("relations", []) or []:
            if rel[1] is target:
                rel[1] = {"ref": canon_id}
            elif isinstance(rel[1], dict) and "ref" not in rel[1]:
                self._replace_with_ref(rel[1], target, canon_id)
