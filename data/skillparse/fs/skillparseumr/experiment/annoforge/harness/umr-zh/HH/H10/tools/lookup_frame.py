import resources
import xml.etree.ElementTree as ET


def lookup_frame(lemma: str) -> str:
    """Look up a Chinese predicate (verb or adjective lemma, e.g. 痛苦) in the Chinese PropBank.
    Returns its rolesets with numbered roles (e.g. 痛苦-01: ARG0=entity described, ARG1=cause of pain),
    or says NO FRAME, in which case the concept must be written lemma-00 with :actor/:undergoer.
    """
    lemma = lemma.strip()
    if not lemma or "/" in lemma or ".." in lemma:
        return "NO FRAME for %s: use %s-00 with :actor (agent) / :undergoer (patient) instead of ARGn." % (lemma, lemma)
    path = "propbank-zh/%s.xml" % lemma
    if not resources.resource_exists(path):
        return "NO FRAME for %s: use %s-00 with :actor (agent) / :undergoer (patient) instead of ARGn." % (lemma, lemma)
    try:
        root = ET.fromstring(resources.read_resource(path))
    except Exception:
        return "Frame file for %s exists but is unreadable: use %s-01 with ARG0/ARG1." % (lemma, lemma)
    out = []
    for rs in root.iter("roleset"):
        rid = (rs.get("id") or lemma + ".01").replace(".", "-")
        roles = []
        for r in rs.iter("role"):
            roles.append("ARG%s=%s" % (r.get("n"), r.get("descr") or ""))
        out.append("%s: %s" % (rid, ", ".join(roles)))
    if not out:
        return "Frame file for %s has no rolesets: use %s-01." % (lemma, lemma)
    return "\n".join(out)
