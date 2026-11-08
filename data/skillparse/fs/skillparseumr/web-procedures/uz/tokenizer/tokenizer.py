"""tokenizer (web-uz): the first step of wave 0. It cuts an Uzbek sentence into the tokens every
later step counts spans by; the page then gives the sentence these tokens (its Words:).

Not just the spaces:
  - punctuation is a token of its own (. , ! ? ; : … « » " ( ) — –), and so is a quote mark at
    the start or end of a word; a decimal number (3,5 / 2.5) stays one token;
  - the apostrophe of oʻ, gʻ and the tutuq belgisi (ʼ) inside a word stay in it (oʻzbek, maʼno),
    whichever of ' ʻ ʼ ‘ ’ ` is typed;
  - a number joined to a word by a hyphen is three tokens: 2023-yil → 2023 | - | yil, 5-sinfda →
    5 | - | sinfda;
  - a particle joined by a hyphen is a token of its own, with its hyphen: kecha-yu → kecha | -yu,
    sen-chi → sen | -chi (u, yu, chi, ku, mi, da, oq, yoq, gina, kina, qina, a, ya);
  - the question particle mi written onto the word before a question mark: kelasizmi? →
    kelasiz | mi | ?;
  - a word joined to another word by a hyphen (ota-ona, asta-sekin) stays one token, and so do
    the suffixes on a word (kitoblarimizdan): a token is a word, not a morpheme.

Every character of the sentence but the spaces is in exactly one token, in order.
"""
import re

APOS = "'ʻʼ‘’`"
PIECE = re.compile(r"\d+(?:[.,]\d+)+|[\w%s-]+|[^\w\s]" % re.escape(APOS))
PARTICLES = ("yu", "u", "chi", "ku", "mi", "da", "oq", "yoq", "gina", "kina", "qina", "a", "ya")
NUMBER_WORD = re.compile(r"^(\d+(?:[.,]\d+)?)-(\w.*)$")
WORD_PARTICLE = re.compile(r"^(.*\w)-(%s)$" % "|".join(PARTICLES), re.I)


def _word(w):
    """One piece of letters, digits, apostrophes and hyphens, cut as the module says."""
    lead, tail = [], []
    while w and (w[0] in APOS or w[0] == "-"):
        lead.append(w[0])
        w = w[1:]
    # an apostrophe at the end is a closing quote, unless it is the one of oʻ / gʻ
    while w and (w[-1] == "-" or (w[-1] in APOS and not (len(w) > 1 and w[-2] in "oOgG"))):
        tail.insert(0, w[-1])
        w = w[:-1]
    mid = []
    if w:
        m = NUMBER_WORD.match(w)
        p = WORD_PARTICLE.match(w)
        if m:
            mid = [m.group(1), "-"] + _word(m.group(2))
        elif p:
            mid = _word(p.group(1)) + ["-" + p.group(2)]
        else:
            mid = [w]
    return lead + mid + tail


def tokenize(sent):
    pieces = PIECE.findall(sent or "")
    out = []
    for k, piece in enumerate(pieces):
        if re.match(r"[\w%s-]" % re.escape(APOS), piece) and not re.fullmatch(r"\d+(?:[.,]\d+)+", piece):
            words = _word(piece)
            nxt = pieces[k + 1] if k + 1 < len(pieces) else ""
            last = words[-1] if words else ""
            if nxt == "?" and len(last) >= 5 and last.lower().endswith("mi") and not last.startswith("-"):
                words = words[:-1] + [last[:-2], last[-2:]]
            out += words
        else:
            out.append(piece)
    return out


def run(sent, **_):
    tokens = tokenize(sent)
    return {"tokens": tokens, "numbered": " ".join("[%d]%s" % (k, t) for k, t in enumerate(tokens, 1))}
