/**
 * Format + skill registries.
 *
 * An *annotation format* (UMR, sentiment, ...) declares:
 *   - `skills`      : the skill pipeline, mirroring the Python module registry
 *                     in modular-parsing's umr_parser/modules/__init__.py
 *                     (same names, so a skill file edited here maps 1:1 onto
 *                     the backend module).
 *   - `renderSource`/`renderAnnotated` : the two panes' HTML.
 *   - `legend`      : what the colours/markers mean.
 *   - `themes`      : alternative renderings of the annotated side.
 *
 * Formats are registered lazily (`loadFormat` dynamic-imports on first use),
 * which is what lets an AI-generated format be dropped in at runtime.
 */

const formats = new Map();
const loaders = {
  umr: () => import('../formats/umr.js'),
  sentiment: () => import('../formats/sentiment.js'),
};

export function registerFormat(format) {
  formats.set(format.id, format);
  return format;
}

export function getFormat(id) {
  return formats.get(id);
}

export function listFormats() {
  return [...formats.values()];
}

/** Format ids that can be loaded, whether or not they are loaded yet. */
export function availableFormatIds() {
  return [...new Set([...Object.keys(loaders), ...formats.keys()])];
}

export async function loadFormat(id) {
  if (formats.has(id)) return formats.get(id);
  const loader = loaders[id];
  if (!loader) throw new Error(`unknown format: ${id}`);
  const mod = await loader();
  return registerFormat(mod.default);
}

/**
 * Register a format produced at runtime (AI-generated or hand-written in the
 * format studio). Also makes it loadable by id for the rest of the session.
 */
export function registerRuntimeFormat(format) {
  loaders[format.id] = async () => ({ default: format });
  return registerFormat(format);
}

/* ------------------------------------------------------------------ skills */

/**
 * A skill is the unit that produces one label (or one group of labels).
 * `id` matches the Python module name; `file` points at the markdown spec so
 * the UI can show — and propose patches to — the actual instructions.
 */
export function defineSkill({ id, label, file, describes, serial = false, llm = true }) {
  return { id, label, file, describes, serial, llm };
}

/** Look up a skill definition across all loaded formats. */
export function findSkill(skillId) {
  for (const f of formats.values()) {
    const hit = (f.skills || []).find((s) => s.id === skillId);
    if (hit) return { skill: hit, format: f };
  }
  return { skill: null, format: null };
}
