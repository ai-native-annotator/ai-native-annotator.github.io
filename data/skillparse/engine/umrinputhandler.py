"""Input handler for UMR: read a document file into an Annotation.

Only sentence splitting and tokenisation happen here, nothing else.

English is tokenised on whitespace. Chinese is tokenised one character per
token, except that a run of Latin letters or digits ("Apple", "3", "499")
stays one token - otherwise "Apple Vision Pro" and "AppleVisionPro" would
tokenise the same and the space between the words would be lost.

    doc = UMRInputHandler(lang="en").read("docs/english_umr-0008.txt")
    doc.sents[0].text, doc.sents[0].tokenized_text
"""
import os
import re

from dataclasses import dataclass


@dataclass
class Sentence:
    index: int                       # 1-based, as in the .umr files
    text: str                        # the sentence as written
    tokenized_text: list[str]        # list of tokens

    @property
    def numbered_tokens(self):
        """[(1, "Edmund"), (2, "Pope"), ...]: each token with its number, so a
        model reads span numbers off instead of counting."""
        return [(k, t) for k, t in enumerate(self.tokenized_text, 1)]

    @property
    def span(self):
        """The whole sentence as a span: [first, last] token number, 1-based, both included."""
        return [1, len(self.tokenized_text)]


@dataclass
class UMRAnnotation:
    """A document: its sentences, each with its tokens."""
    doc_id: str              # the file name without extension
    lang: str                # "en", "zh", "uz"
    sents: list[Sentence]


class UMRInputHandler:

    def __init__(self, lang):
        self.lang = lang

    def read(self, path):
        """Read a .txt file (one sentence per line) into an Annotation. With no .txt but a .umr
        next to it, the sentences are the .umr's `Words:` lines (see text_of_umr)."""
        umr = os.path.splitext(path)[0] + ".umr"
        if not os.path.exists(path) and os.path.exists(umr):
            text = text_of_umr(umr)
        else:
            with open(path, encoding="utf-8-sig") as f:
                text = f.read()
        lang = self.lang

        lines = []
        for line in text.splitlines():
            line = clean(line)
            if line:
                lines.append(line)

        sents = [Sentence(i, t, tokenize(t, lang)) for i, t in enumerate(lines, 1)]

        doc_id = os.path.splitext(os.path.basename(path))[0]
        return UMRAnnotation(doc_id, lang, sents)


def text_of_umr(path):
    """One line per sentence, from the `Words:` lines of a gold .umr: the words
    joined without spaces, except between two Latin letters or digits. For the
    Chinese gold this gives the .txt files under olddata/gold/zh exactly."""
    lines = []
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            if not line.startswith("Words:"):
                continue
            s = ""
            for w in line[len("Words:"):].split():
                if s and re.match(r"[A-Za-z0-9]", w) and re.search(r"[A-Za-z0-9]$", s):
                    s += " "
                s += w
            lines.append(s)
    return "\n".join(lines) + "\n"


def guess_lang(text):
    if re.search(r"[一-鿿]", text):
        return "zh"
    return "en"


def clean(line):
    line = line.replace("　", " ")
    line = re.sub(r"\s+", " ", line)
    return line.strip()


ZH_TOKEN = re.compile(r"[A-Za-z0-9]+|[^\sA-Za-z0-9]")


def tokenize(text, lang):
    if lang == "zh":
        return ZH_TOKEN.findall(text)
    return text.split()


def split_sentences(text, lang):
    if lang == "zh":
        return split_zh(text)
    return split_en(text)


ZH_END = "。！？!?…"
ZH_CLOSE = "」』”’）)》"


def split_zh(text):
    """Cut after 。！？… and keep any closing quotes or brackets that follow
    with the sentence they close."""
    sents = []
    current = ""
    i = 0
    while i < len(text):
        current += text[i]
        if text[i] in ZH_END:
            while i + 1 < len(text) and (text[i + 1] in ZH_END or text[i + 1] in ZH_CLOSE):
                i += 1
                current += text[i]
            sents.append(current.strip())
            current = ""
        i += 1
    if current.strip():
        sents.append(current.strip())
    return sents


EN_ABBREV = {"mr", "mrs", "ms", "dr", "prof", "st", "jr", "sr", "inc", "ltd",
             "co", "corp", "vs", "etc", "e.g", "i.e", "u.s", "u.k", "no", "fig",
             "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept",
             "oct", "nov", "dec"}


def split_en(text):
    """Cut after . ! ? (optionally followed by a closing quote or bracket),
    except after an abbreviation or a single-letter initial."""
    pieces = re.split(r"(?<=[.!?])\s+|(?<=[.!?][\"'”’)\]])\s+", text)
    sents = []
    current = ""
    for piece in pieces:
        if current:
            current = current + " " + piece
        else:
            current = piece
        last = current.split()[-1].strip("\"'”’()[]").rstrip(".!?").lower()
        if last in EN_ABBREV or re.fullmatch(r"[a-z]", last):
            continue
        sents.append(current.strip())
        current = ""
    if current.strip():
        sents.append(current.strip())
    return sents
