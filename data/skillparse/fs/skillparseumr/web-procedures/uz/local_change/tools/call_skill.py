"""call_skill: the local change's tool (web). It looks up one skill of the procedure, so the model
is not handed a skill at the start but reads the one it needs."""
from pydantic_ai import RunContext


def call_skill(ctx: RunContext[dict], skill: str) -> str:
    """The instructions of one skill of this procedure: how it annotates its kind of node.

    skill: the skill's name, as the tree of steps shows it (predicate, np_phrase, special_entity,
    discourse, sent_type, ...).

    Returns what the skill is given, what it decides (its output fields) and its instructions:
    for a model skill its skill.md, for a rule or Jev skill what its code says it does."""
    engine = (ctx.deps or {}).get("engine")
    if engine is None:
        return "call_skill needs the page's procedure"
    return engine.skill_guide(skill)
