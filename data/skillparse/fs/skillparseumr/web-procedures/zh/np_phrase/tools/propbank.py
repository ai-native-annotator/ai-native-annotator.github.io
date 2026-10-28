"""propbank_lookup for np_phrase: the same tool as predicate's, read from
predicate/tools/propbank.py, so there is one implementation."""
import importlib.util
import os

_path = os.path.join(os.path.dirname(__file__), "..", "..", "predicate", "tools", "propbank.py")
_spec = importlib.util.spec_from_file_location("umr_tree_predicate_propbank", _path)
_impl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_impl)


def propbank_lookup(lemmas: list[str], language: str) -> dict:
    """Look up up to three lemmas (the lemma and alternates) in PropBank.

    language is "en" or "zh". Returns, per lemma, every roleset that exists
    with its argument descriptions, e.g.
    {"rescue": [{"roleset": "rescue-01", "roles": {"ARG0": "rescuer", ...}}]};
    an empty list means the lemma is not in PropBank.
    """
    return _impl.propbank_lookup(lemmas, language)
