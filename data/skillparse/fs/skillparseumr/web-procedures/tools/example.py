"""get_example: a shared tool every skill has. It reads a skill's worked examples.

Each skill may keep worked examples of its input and output in
<skill dir>/reference/example.md. A skill calls get_example() to read its own;
get_example(skill="np_phrase") reads another skill's in the same skillset.
SkillCallable passes the calling skill's directory as the run's deps, which is
how the tool knows whose examples "its own" are.
"""
import os

from pydantic_ai import RunContext


def get_example(ctx: RunContext[dict], skill: str = "") -> dict:
    """Worked examples of a skill's input and output.

    skill: the skill whose examples to read; leave it empty for the skill you are
    running now. Returns {"example": the examples as text}, or {"example": "",
    "error": why} when there are none.
    """
    skill_dir = (ctx.deps or {}).get("skill_dir", "")
    if skill:
        if "/" in skill or "\\" in skill or skill.startswith("."):
            return {"example": "", "error": f"not a skill name: {skill!r}"}
        skill_dir = os.path.join(os.path.dirname(skill_dir), skill)
    path = os.path.join(skill_dir, "reference", "example.md")
    if not os.path.isfile(path):
        return {"example": "", "error": f"{os.path.basename(skill_dir)} has no reference/example.md"}
    with open(path, encoding="utf-8") as f:
        return {"example": f.read()}
