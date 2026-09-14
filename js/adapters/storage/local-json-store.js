/**
 * Small, explicit adapter around browser localStorage.
 *
 * Domain and application modules receive this interface instead of reaching
 * into browser globals themselves. Keeping the boundary this small makes an
 * IndexedDB or server-backed implementation a drop-in replacement later.
 */
export function createLocalJsonStore(key) {
  if (!key) throw new TypeError('A storage key is required');
  return {
    read(fallback) {
      const raw = localStorage.getItem(key);
      if (!raw) return structuredClone(fallback);
      return JSON.parse(raw);
    },
    write(value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
    remove() {
      localStorage.removeItem(key);
    },
  };
}
