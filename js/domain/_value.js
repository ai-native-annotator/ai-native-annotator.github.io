/**
 * Small value-object helpers shared by the skill-evolution domain.
 *
 * Domain constructors accept JSON-compatible data, copy it, and freeze the
 * copy. Callers can therefore keep editing their input objects without
 * silently changing a revision or an evaluation that has already been made.
 * There are deliberately no browser, storage, clock, or provider dependencies
 * here: the application layer supplies ids and timestamps at its boundary.
 */

export function invariant(condition, message) {
  if (!condition) throw new TypeError(message);
}

export function nonEmpty(value, label) {
  const text = String(value ?? '').trim();
  invariant(text, `${label} must be a non-empty string`);
  return text;
}

/** Copy JSON-compatible input and freeze every level of the resulting value. */
export function immutable(value, label = 'value') {
  return deepFreeze(copyJson(value, label, new WeakSet()));
}

function copyJson(value, path, seen) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), `${path} must contain only finite numbers`);
    return value;
  }
  invariant(typeof value === 'object', `${path} must be JSON-compatible`);
  invariant(!seen.has(value), `${path} must not contain cycles`);
  seen.add(value);

  if (Array.isArray(value)) {
    const out = value.map((item, index) => copyJson(item, `${path}[${index}]`, seen));
    seen.delete(value);
    return out;
  }

  const proto = Object.getPrototypeOf(value);
  invariant(
    proto === Object.prototype || proto === null,
    `${path} must contain only plain objects`,
  );
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    invariant(item !== undefined, `${path}.${key} must not be undefined`);
    out[key] = copyJson(item, `${path}.${key}`, seen);
  }
  seen.delete(value);
  return out;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

/** Stable JSON for local content fingerprints (object key order is ignored). */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

/**
 * Deterministic, non-cryptographic content fingerprint.
 *
 * It makes domain-created ids stable in every modern browser. A persistence or
 * publication adapter may replace it with SHA-256 without changing the domain
 * model; callers may always supply an explicit id to the constructors.
 */
export function fingerprint(value) {
  const text = typeof value === 'string' ? value : stableStringify(value);
  let hi = 0x811c9dc5;
  let lo = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    hi = Math.imul(hi ^ code, 0x01000193);
    lo = Math.imul(lo ^ code, 0x85ebca6b);
  }
  return `${(hi >>> 0).toString(16).padStart(8, '0')}${(lo >>> 0).toString(16).padStart(8, '0')}`;
}

export function uniqueStrings(values, label) {
  invariant(Array.isArray(values), `${label} must be an array`);
  const out = values.map((value, index) => nonEmpty(value, `${label}[${index}]`));
  invariant(new Set(out).size === out.length, `${label} must not contain duplicates`);
  return out;
}
