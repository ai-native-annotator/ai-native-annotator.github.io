"""Read-only resource files that harness tools may use: `import resources` in a tool.

    resources.list_resources("propbank-zh")          names under a folder (at most `limit`)
    resources.read_resource("propbank-zh/吃.xml")     the whole text of one file ("" if there is none)
    resources.resource_exists("propbank-en/eat.xml")

Paths are relative to the resource root of the benchmark; a tool cannot read anything else. MANIFEST
describes what is there; the builder sees it, the annotating steps do not.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
AF = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(AF))
MP = os.path.join(os.path.dirname(ROOT), "modular-parsing", "resources")

# name -> (folder or file on disk, description shown to the builder)
ROOTS = {
    "umr": {
        "propbank-zh": (os.path.join(MP, "chinese-propbank"),
                        "Chinese PropBank frame files, one XML file per lemma (<lemma>.xml, e.g. 发生.xml), 24,521 "
                        "files. Each <frameset> has <roleset id=\"发生.01\" name=...> with <role n=\"0\" f=... "
                        "descr=...> children and examples."),
        "propbank-en": (os.path.join(MP, "english-propbank", "propbank-amr-frames-xml-2018-01-25"),
                        "English PropBank frames as used by AMR (2018-01-25), one XML file per lemma (<lemma>.xml, e.g. "
                        "eat.xml), 5,620 files. <predicate lemma=...><roleset id=\"eat.01\" name=...><roles><role "
                        "n=\"0\" descr=...>."),
        "propbank-en-args.txt": (os.path.join(MP, "english-propbank", "propbank-amr-frame-arg-descr.txt"),
                                 "One line per English roleset: `eat-01  ARG0: consumer, eater  ARG1: meal  ...`."),
        "umr-abstract-rolesets.csv": (os.path.join(MP, "Abstract_predicate_and_rolesets.csv"),
                                      "UMR abstract rolesets (have-org-role-92, identity-91, ...): name, description, "
                                      "numbered arguments and their roles (CSV)."),
        "umr-relations.csv": (os.path.join(MP, "All_relations.csv"), "UMR roles with their inverses and notes (CSV)."),
        "umr-attribute-values.csv": (os.path.join(MP, "Attribute_Values.csv"),
                                     "UMR attributes (:aspect, :modal-strength, :refer-person, ...) and their allowed "
                                     "values with definitions (CSV)."),
        "umr-abstract-concepts.csv": (os.path.join(MP, "SP_and_Discourse.csv"),
                                      "UMR abstract concepts (named-entity types, discourse concepts, ...) with "
                                      "suggested roles (CSV)."),
        "umr-guidelines.md": (os.path.join(AF, "guidelines", "umr_guidelines.md"),
                              "The full UMR annotation guidelines (Markdown, 365,742 characters)."),
    },
    "timeml": {
        "timeml-guidelines.txt": (os.path.join(AF, "guidelines", "timeml_guidelines_1.2.1.txt"),
                                  "The full TimeML Annotation Guidelines 1.2.1 (plain text from the PDF, 115,146 "
                                  "characters, pages separated by form feeds)."),
    },
}

SCHEME = os.environ.get("AF_SCHEME", "umr")


def _resolve(path):
    path = (path or "").strip().strip("/")
    first, _, rest = path.partition("/")
    if first not in ROOTS[SCHEME]:
        return None
    base = ROOTS[SCHEME][first][0]
    full = os.path.normpath(os.path.join(base, rest)) if rest else base
    if not (full == base or full.startswith(base.rstrip("/") + "/")):
        return None
    return full


def list_resources(path="", limit=200):
    """Names under a resource folder ("" lists the top level)."""
    if not path.strip("/"):
        return sorted(ROOTS[SCHEME])
    full = _resolve(path)
    if not full or not os.path.isdir(full):
        return []
    return sorted(os.listdir(full))[:limit]


def resource_exists(path):
    full = _resolve(path)
    return bool(full) and os.path.exists(full)


def read_resource(path):
    """The text of one resource file, or "" when there is none."""
    full = _resolve(path)
    if not full or not os.path.isfile(full):
        return ""
    with open(full, encoding="utf-8", errors="replace") as f:
        return f.read()


def manifest(scheme):
    lines = []
    for name, (where, descr) in ROOTS[scheme].items():
        kind = "folder" if os.path.isdir(where) else "file"
        lines.append("- `%s` (%s): %s" % (name, kind, descr))
    return "\n".join(lines)
