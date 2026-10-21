import re
import xml.etree.ElementTree as ET
import resources


def variants(lem: str) -> list:
    out = [lem]
    rules = (('ers', ['e', '']), ('er', ['e', '']), ('ors', ['e', '']), ('or', ['e', '']),
             ('ions', ['e', '']), ('ion', ['e', '']), ('ing', ['e', '']), ('ed', ['e', '']),
             ('ies', ['y']), ('s', ['']))
    for suf, reps in rules:
        if lem.endswith(suf) and len(lem) > len(suf) + 2:
            for r in reps:
                c = lem[:-len(suf)] + r
                if c not in out:
                    out.append(c)
    return out


def parse_xml(text: str) -> list:
    lines = []
    try:
        root = ET.fromstring(text)
    except Exception:
        return lines
    for rs in root.iter('roleset'):
        rid = (rs.get('id') or '').replace('.', '-')
        name = (rs.get('name') or '')[:70]
        roles = []
        for role in rs.iter('role'):
            n = role.get('n') or ''
            if n.isdigit():
                roles.append('ARG' + n + ': ' + (role.get('descr') or ''))
        lines.append(rid + ' [' + name + ']  ' + '  '.join(roles))
    return lines


def phrasal_lines(lem: str) -> list:
    try:
        text = resources.read_resource('propbank-en-args.txt')
    except Exception:
        return []
    pre = lem + '-'
    out = []
    for ln in text.splitlines():
        if ln.startswith(pre) and len(ln) > len(pre) and ln[len(pre)].isalpha():
            out.append(ln)
    return out[:10]


def roleset_lookup(lemma: str) -> str:
    """Look up English PropBank rolesets for a lemma (verb, adjective or noun base form, e.g. 'dump', 'full', 'important', 'upright'; derived forms like 'indicator' fall back to the verb). For a phrasal verb pass 'verb particle' (e.g. 'pick up', 'get up'): if a phrasal roleset exists (pick-up-04) it is returned and should be used as ONE concept aligned from the verb to the particle. Looking up a plain verb also lists its phrasal rolesets after the senses. Lines look like 'consider-01 [believe, view, hold as true]  ARG0: thinker  ARG1: belief': choose the sense by MEANING and the ARGn by its description. Returns 'no roleset' if there is none (then use -01 for verbs, or a plain lemma / abstract predicate)."""
    lem = lemma.strip().lower().replace(' ', '-').replace('_', '-')
    if not lem:
        return 'no roleset: empty lemma'
    try:
        for c in variants(lem):
            path = 'propbank-en/' + c + '.xml'
            if resources.resource_exists(path):
                lines = parse_xml(resources.read_resource(path))
                if lines:
                    head = '' if c == lem else '(no file for ' + lem + '; showing ' + c + ')\n'
                    res = head + '\n'.join(lines[:14])
                    extra = phrasal_lines(c)
                    if extra:
                        res += '\nPHRASAL rolesets (if verb+particle fits, use ONE concept aligned verb..particle, no separate particle node):\n' + '\n'.join(extra)
                    return res
    except Exception:
        pass
    try:
        text = resources.read_resource('propbank-en-args.txt')
    except Exception:
        return 'lookup unavailable'
    out = [ln for ln in text.splitlines() if ln.startswith(lem + '-')]
    if not out:
        if '-' in lem:
            base = lem.split('-')[0]
            return 'no phrasal roleset for ' + lem + '; the verb alone:\n' + roleset_lookup(base)
        return 'no roleset for ' + lem
    return '\n'.join(out[:14])
