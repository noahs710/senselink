/**
 * Tiny in-memory handle cache used to power slash-command autocomplete.
 * PeakSense has no public search endpoint, so we warm this cache
 * passively from leaderboard / feed / user / dab responses. It keeps
 * the most recently seen handles (insertion-ordered, capped) and
 * supports a substring query for the focused option.
 */

const MAX = 1000;
const cache = new Set();

export function recordHandle(handle) {
  if (!handle) return;
  const h = String(handle);
  if (cache.has(h)) {
    // refresh insertion order by re-inserting
    cache.delete(h);
  } else if (cache.size >= MAX) {
    // drop the oldest entry (Sets iterate in insertion order)
    const oldest = cache.values().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.add(h);
}

export function recordHandles(handles = []) {
  for (const h of handles) recordHandle(h);
}

/**
 * Return up to `limit` handles matching a substring query (case-insensitive).
 * Empty query returns the most recently seen handles.
 */
export function searchHandles(query, limit = 25) {
  const arr = [...cache];
  const q = String(query ?? '').toLowerCase();
  const filtered = q ? arr.filter((h) => h.toLowerCase().includes(q)) : arr;
  return filtered.slice(0, limit);
}
