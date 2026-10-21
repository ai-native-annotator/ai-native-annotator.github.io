"""Input handler for UMR: read a document file into an Annotation.

Only sentence splitting and tokenisation happen here, nothing else.

English is tokenised on whitespace. Chinese is tokenised one character per
token, except that a run of Latin letters or digits ("Apple", "3", "499")
stays one token - otherwise "Apple Vision Pro" and "AppleVisionPro" would
tokenise the same and the space between the words would be lost.

Runner holds one configured instance and calls read() on it per file:
    self.input_handler = UMRInputHandler()
    doc = self.input_handler.read("olddata/gold/en/english_umr-0003.txt")
    doc.sents[0].text, doc.sents[0].tokenized_text
"""
import os
import re

from dataclasses import dataclass, field, asdict

from input_handler import InputHandler, Annotation


@dataclass
class Sentence:
    index: int                       # 1-based, as in the .umr files
    text: str                        # the sentence as written
    tokenized_text: list[str]        # list of tokens
    annotations: dict = field(default_factory=dict)  # skill_name -> output dict

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
class UMRAnnotation(Annotation):
    """UMR-specific annotation with sentence-level structure."""
    doc_id: str              # the file name without extension
    lang: str                # "en" or "zh"
    sents: list[Sentence]    # list of Sentence
    source: str = ""         # the file it was read from

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "UMRAnnotation":
        data = dict(data)
        data["sents"] = [Sentence(**s) for s in data.get("sents", [])]
        return cls(**data)


class UMRInputHandler(InputHandler):

    annotation_class = UMRAnnotation

    def __init__(self, lang=None, sentence_per_line=True):
        """
        lang:              "en" or "zh". If None, each file is "zh" when it
                           contains Chinese characters, otherwise "en".
        sentence_per_line: True (the default, and how every file under olddata/
                           is written): each non-empty line is one sentence
                           and is not split further, so the sentences line up
                           one-to-one with a gold .umr file. False: the file is
                           running text, and every line is split into
                           sentences.
        """
        self.lang = lang
        self.sentence_per_line = sentence_per_line

    def read(self, path):
        """Read a .txt file into an Annotation. With no .txt but a gold .umr next
        to it, the sentences are the .umr's `Words:` lines (see text_of_umr)."""
        umr = os.path.splitext(path)[0] + ".umr"
        if not os.path.exists(path) and os.path.exists(umr):
            text = text_of_umr(umr)
        else:
            with open(path, encoding="utf-8-sig") as f:
                text = f.read()

        lang = self.lang
        if lang is None:
            lang = guess_lang(text)

        lines = []
        for line in text.splitlines():
            line = clean(line)
            if line:
                lines.append(line)

        if self.sentence_per_line:
            texts = lines
        else:
            texts = []
            for line in lines:
                texts.extend(split_sentences(line, lang))

        sents = []
        for i, t in enumerate(texts, 1):
            sents.append(Sentence(i, t, tokenize(t, lang)))

        doc_id = os.path.splitext(os.path.basename(path))[0]
        return UMRAnnotation(doc_id, lang, sents, source=path)


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
