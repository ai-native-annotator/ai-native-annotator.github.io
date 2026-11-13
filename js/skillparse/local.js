/** localStorage as JSON. Storage can be full or blocked: a read then gives the fallback, a write false. */

export function readJson(key, fallback = {}) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
