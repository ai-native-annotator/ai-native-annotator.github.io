"""antecedent (kind: rule): a participant of a clause that is written outside it.

    run(text, span, **context) -> {"span": span}

The argument skill hands these over (the subject of *to leave* in *Pope wanted
to leave*). Nothing is decided here: the node only carries the span, and the
reentrancy wave merges it into the node that has that span.
"""


def run(text, span, **_):
    return {"span": list(span)}
