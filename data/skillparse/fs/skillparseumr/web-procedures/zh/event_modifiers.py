"""Readable event-role inventory shared by the repaired interfaces.

The YAML preserves frozen J2 adjuncts and adds schema candidates. Core roles
come from a selected frame, with explicit no-frame fallback. This inventory
does not claim complete support for every UMR structure.
"""
from prompt_loader import load_prompts

PROMPTS = load_prompts(__file__, "event_modifiers.yaml")
EVENT_MODIFIERS = PROMPTS["tables"]["EVENT_MODIFIERS"]
NATIVE_CORE_ROLES = PROMPTS["tables"]["NATIVE_CORE_ROLES"]
