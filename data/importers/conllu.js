/**
 * CoNLL-U: the Universal Dependencies interchange format.
 *
 * Here as a worked second example, because it is the case the built-in reader
 * cannot handle and the one a real corpus most often arrives in: sentences are
 * blocks separated by blank lines, the text is a `# text = …` comment, and the
 * tokens are the rows in between — so "one line = one sentence" reads it as
 * gibberish.
 *
 * It also shows what an importer is allowed to keep. The columns beyond FORM
 * (lemma, UPOS, and the HEAD/DEPREL that make it a dependency treebank) are
 * carried through on each sentence, where a format that understands them can
 * project them. An importer's job is to lose nothing, not to interpret.
 */
function parse(text, filename) {
  const sentences = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const meta = {};
    const rows = [];
    for (const line of lines) {
      if (line.startsWith('#')) {
        const m = /^#\s*([^=]+?)\s*=\s*(.*)$/.exec(line);
        if (m) meta[m[1].trim()] = m[2].trim();
        continue;
      }
      const col = line.split('\t');
      // Skip multiword ranges (1-2) and empty nodes (1.1): they have no id of
      // their own to hang an annotation on.
      if (col.length < 2 || /[-.]/.test(col[0])) continue;
      rows.push({
        id: col[0], form: col[1], lemma: col[2] || '', upos: col[3] || '',
        head: col[6] || '', deprel: col[7] || '',
      });
    }
    if (!rows.length && !meta.text) continue;

    sentences.push({
      text: meta.text || rows.map((r) => r.form).join(' '),
      tokens: rows.map((r) => r.form),
      conllu: rows,            // kept whole; nothing here is thrown away
      sentId: meta.sent_id || '',
    });
  }

  return {
    id: filename.replace(/\.[^.]+$/, ''),
    language: /[一-鿿]/.test(text) ? 'zh' : 'en',
    sentences,
  };
}
