"""Load readable model-facing text beside a skill, independently of the cwd."""
from functools import lru_cache
from pathlib import Path

import yaml


@lru_cache(maxsize=None)
def load_prompts(module_file, filename="prompts.yaml"):
    path = Path(module_file).resolve().with_name(filename)
    with path.open(encoding="utf-8") as stream:
        data = yaml.safe_load(stream)
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise ValueError(f"Unsupported prompt file: {path}")
    for section in ("tables", "instructions", "templates"):
        if not isinstance(data.get(section), dict):
            raise ValueError(f"Missing {section} in {path}")
    return data
