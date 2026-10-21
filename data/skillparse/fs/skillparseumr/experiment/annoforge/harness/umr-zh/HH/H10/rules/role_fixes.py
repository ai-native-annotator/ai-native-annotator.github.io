import re

PAT = re.compile(r'(:poss|:location|:destination)(?=[\s)])')
MAP = {':poss': ':possessor', ':location': ':place', ':destination': ':goal'}


def run(annotation: str, sentence: dict) -> str:
    """Rename non-gold role labels in the sentence-level graph: :poss -> :possessor,
    :location -> :place, :destination -> :goal. The alignment and document sections are untouched."""
    i = annotation.find('# alignment:')
    if i < 0:
        head, tail = annotation, ''
    else:
        head, tail = annotation[:i], annotation[i:]
    head = PAT.sub(lambda m: MAP[m.group(1)], head)
    return head + tail
