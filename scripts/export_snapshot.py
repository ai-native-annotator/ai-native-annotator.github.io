"""What the page exports for the gold documents, to compare before and after a change to the
assembly of the .umr (engine/umroutputhandler.py), the loader (bridge/umr_load.py) or the bridge.

    python3 scripts/export_snapshot.py before.json          # on the code as it was
    python3 scripts/export_snapshot.py after.json           # on the changed code
    python3 scripts/export_snapshot.py before.json after.json   # compare: IDENTICAL, or what differs

Each gold document (all the Chinese ones, the first 25 English ones, 40 sentences at most) is
loaded into the steps as the page loads a .umr file, in plain Python (no browser, no model); the
snapshot holds its exported .umr, each sentence's drawn graph and the names of its nodes.
"""
import json, os, shutil, sys, tempfile, zipfile, hashlib
repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
n_en = 25


def compare(before, after):
    a, b = json.load(open(before)), json.load(open(after))
    diff = {}
    for doc in a:
        for field in a[doc]:
            if a[doc][field] != b.get(doc, {}).get(field):
                diff.setdefault(field, []).append(doc)
    if not diff:
        print("IDENTICAL")
    for field, docs in diff.items():
        print("%s differs in %d documents: %s" % (field, len(docs), ", ".join(docs[:8])))
    return 1 if diff else 0


if len(sys.argv) == 3:
    sys.exit(compare(sys.argv[1], sys.argv[2]))
out = sys.argv[1]
base = os.path.join(repo, "data", "skillparse")
fs = tempfile.mkdtemp(prefix="sp-")
m = json.load(open(os.path.join(base, "MANIFEST.json")))
for dest, src in m["files"].items():
    d = os.path.join(fs, dest); os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copyfile(os.path.join(base, src), d)
for v in m["vendor"]:
    zipfile.ZipFile(os.path.join(base, v)).extractall(os.path.join(fs, "vendor"))
os.environ["SP_FS"] = fs
os.environ["SP_RESOURCES"] = os.path.join(base, "resources")
sys.path.insert(0, os.path.join(fs, "bridge"))
import sp_bridge as B
RULE = "#" * 80
res = {}
def call(method, **a):
    r = json.loads(B.call(method, json.dumps(a)))
    if "error" in r: raise RuntimeError(method + ": " + r["error"] + "\n" + r.get("trace", ""))
    return r["ok"]
for lang, sid, limit in (("zh", "web-zh", 10**9), ("en", "web-en", n_en)):
    gold = json.load(open(os.path.join(base, "resources", "gold", lang, "gold.json")))
    docs = {}
    for g in gold: docs.setdefault(g["doc"], []).append(g)
    for name in sorted(docs)[:limit]:
        sents = sorted(docs[name], key=lambda g: g["snt"])[:40]
        text = "\n\n".join(RULE + "\n" + g["annotation"] for g in sents) + "\n"
        try:
            call("import_doc", name=name, text=text, fmt="umr-load", lang=lang)
            desc = call("open", skillset=sid, doc=name)
            r = {"loaded": desc.get("loaded"), "render": call("render", auto_align=True), "raw": call("render", auto_align=False)["text"],
                 "graphs": [call("graph", i=i) for i in range(len(desc["doc"]["sents"]))]}
            eng = B.SESSION.engine
            r["refs"] = eng.node_refs(len(desc["doc"]["sents"]) - 1)
            try: r["tree0"] = eng.tree_markdown(0)
            except Exception as e: r["tree0"] = "ERR %s" % e
            r["training"] = len(call("training", unconfirmed=True)["records"])
        except Exception as e:
            r = {"error": str(e)[:2000]}
        res[name] = r
        print(name, "error" if "error" in r else len(r["graphs"]), flush=True)
json.dump(res, open(out, "w"), ensure_ascii=False, sort_keys=True)
print("sha", hashlib.sha256(open(out, "rb").read()).hexdigest()[:16], "docs", len(res), "errors", sum("error" in r for r in res.values()))
