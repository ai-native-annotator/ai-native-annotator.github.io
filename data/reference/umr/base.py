"""Module framework.

A *module* is one step of the parsing workflow.  Each module can be backed by
three implementation kinds (the research axis of this project):

* ``skill``    — an LLM agent following a skill file (implemented here);
* ``model``    — a fine-tuned small model (stub; see docs/blueprints.md);
* ``workflow`` — a composite system, e.g. retrieval-augmented (stub; see
  docs/blueprints.md).

The active kind for every module is chosen in the run config (the 总开关,
``configs/*.json``).  Swapping implementations must not touch the pipeline:
the pipeline only calls :meth:`Module.run`.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

from .. import SKILLS_DIR
from .. import llm


class Module:
    """Base class; concrete modules implement :meth:`run`."""

    name: str = "?"

    def __init__(self, config: dict):
        self.config = config
        self.model = config.get("model", llm.DEFAULT_MODEL)

    def run(self, **inputs):
        raise NotImplementedError


class SkillModule(Module):
    """A module implemented as an LLM skill call.

    The prompt is assembled from: the shared skill file, the language overlay
    (ablation flag ``language_overlay``), mined gold annotation notes
    (ablation flag ``notes``), the shared node schema, and the task input.
    """

    skill_file: str = ""          # e.g. "discourse.md"
    notes_file: str = ""          # e.g. "discourse.md" under skills/notes/<lang>/
    include_schema: bool = True

    def _read(self, path: Path) -> str:
        return path.read_text(encoding="utf8") if path.exists() else ""

    def build_prompt(self, task_input: str, language: str) -> str:
        parts = [self._read(SKILLS_DIR / "shared" / self.skill_file)]
        if self.config.get("language_overlay", True):
            parts.append(self._read(SKILLS_DIR / language / "overlay.md"))
        if self.include_schema:
            parts.append(self._read(SKILLS_DIR / "shared" / "_node_schema.md"))
        if self.config.get("notes", True) and self.notes_file:
            notes = self._read(SKILLS_DIR / "notes" / language / self.notes_file)
            if notes:
                parts.append(notes)
        parts.append(task_input)
        return "\n\n---\n\n".join(p for p in parts if p.strip())

    def call(self, task_input: str, language: str):
        prompt = self.build_prompt(task_input, language)
        response = llm.complete(prompt, model=self.model, module=self.name)
        return llm.extract_json(response)


class ModelModule(Module):
    """Fine-tuned small-model implementation (not yet trained).

    Design blueprint in docs/blueprints.md: each module's LLM traces
    (data/llm_cache + UMR_LLM_TRACE JSONL) double as distillation data for a
    small seq2seq/classifier model with the same JSON interface.
    """

    def run(self, **inputs):
        raise NotImplementedError(
            f"model-backed implementation of {self.name} is a future experiment; "
            "see docs/blueprints.md")


class WorkflowModule(Module):
    """Composite workflow implementation (retrieval-augmented, not yet built).

    Design blueprint in docs/blueprints.md: embed gold (sentence, subtree)
    pairs in a vector store, retrieve nearest neighbours at parse time, and
    condition the skill call on them.
    """

    def run(self, **inputs):
        raise NotImplementedError(
            f"workflow-backed implementation of {self.name} is a future experiment; "
            "see docs/blueprints.md")


def make_module(name: str, cls_by_kind: Dict[str, type], config: dict) -> Module:
    """Instantiate the implementation kind selected by the config."""
    kind = config.get("modules", {}).get(name, "skill")
    cls = cls_by_kind.get(kind)
    if cls is None:
        raise KeyError(f"module {name}: no implementation of kind '{kind}'")
    return cls(config)
