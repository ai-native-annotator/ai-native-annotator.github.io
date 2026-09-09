/**
 * Plain text: one sentence per line.
 *
 * This is the default reader, and it is here as an editable file rather than
 * buried in the app so that "how does this format read a file" is a question
 * with an answer you can open, change, and keep.
 *
 * The contract for every importer is the same, and it is small on purpose:
 * given the file's text and its name, return a DOCUMENT — the text, cut into
 * sentences. It does not return an annotation. Annotation is what the skills
 * are for, and which method annotates it is chosen separately.
 *
 *   parse(text, filename) -> {
 *     id?:        string,     // defaults to the filename without its extension
 *     language?:  'en'|'zh',  // guessed from the text when absent
 *     sentences:  [{ text: string, tokens?: string[] }]
 *   }
 *
 * Anything else on the returned object is kept as-is, so an importer that
 * knows more about its format can carry it through.
 */
function parse(text, filename) {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    id: filename.replace(/\.[^.]+$/, ''),
    language: /[一-鿿]/.test(text) ? 'zh' : 'en',
    sentences: lines.map((line) => ({ text: line, tokens: tokenize(line) })),
  };
}

/** Whitespace where there is any; otherwise per character, which is what CJK needs. */
function tokenize(line) {
  if (/\s/.test(line)) return line.split(/\s+/).filter(Boolean);
  return /[一-鿿]/.test(line) ? [...line] : line.split(/\s+/);
}
