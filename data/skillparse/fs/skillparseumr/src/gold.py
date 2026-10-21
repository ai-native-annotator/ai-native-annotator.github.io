"""Where the gold files are.

    gold.path("chinese_umr-0003", "zh", ".umr")   # newdata/chinese_umr-0003.umr
    gold.path("english_umr-0003", "en", ".txt")   # olddata/gold/en/english_umr-0003.txt
    gold.sentences("chinese_umr-0010", "zh")      # its sentences, one per line

newdata/ is the gold (Chinese, .umr only: the sentences are read off the
`Words:` lines, see input_handler.umrinputhandler.text_of_umr). olddata/gold/<lang>/
is the gold before it (.umr and .txt, English and Chinese); a document newdata
does not have, such as the English ones, is found there. UMR_GOLD_DIR, if set,
is one folder of gold files that replaces both (the experiments run on the old
gold set it to olddata/gold/zh).
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEW = os.path.join(ROOT, "newdata")
OLD = os.path.join(ROOT, "olddata", "gold")


def folder(doc, lang):
    """The folder that holds doc's gold."""
    if os.environ.get("UMR_GOLD_DIR"):
        return os.path.abspath(os.environ["UMR_GOLD_DIR"])
    if os.path.exists(os.path.join(NEW, doc + ".umr")):
        return NEW
    return os.path.join(OLD, lang)


def path(doc, lang, ext):
    """doc's gold file with this extension (.umr or .txt). The .txt need not
    exist: the input handler then reads the sentences off the .umr."""
    return os.path.join(folder(doc, lang), doc + ext)


def sentences(doc, lang):
    """doc's sentences, from its .txt, or from its .umr when there is no .txt."""
    from input_handler.umrinputhandler import text_of_umr
    txt = path(doc, lang, ".txt")
    if os.path.exists(txt):
        with open(txt, encoding="utf-8-sig") as f:
            text = f.read()
    else:
        text = text_of_umr(path(doc, lang, ".umr"))
    return [line.strip() for line in text.splitlines() if line.strip()]
