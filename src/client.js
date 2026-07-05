import { recordHandle, recordHandles } from './handles.js';

const PEAKSENSE_API_BASE = (process.env.PEAKSENSE_API_BASE || 'http://127.0.0.1:8081').replace(/\/$/, '');

/**
 * Minimal PeakSense public API client. All endpoints are read-only
 * and anonymous-friendly. The bot never needs auth.
 */
export async function psFetch(path) {
  const url = `${PEAKSENSE_API_BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`PeakSense API error ${res.status} for ${path}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function apiPath(p) {
  return PEAKSENSE_API_BASE + p;
}

/**
 * Normalize a user-typed handle to PeakSense canonical slug form,
 * mirroring server/auth.mjs deriveHandle(): lowercase, collapse runs
 * of non-[a-z0-9_-] chars (including spaces) into a single hyphen,
 * drop leading/trailing hyphens. A leading "@pretty-peaky" is also
 * accepted. The 18-char creation cap is intentionally NOT applied,
 * since a stored handle may include a collision suffix (e.g. pretty-peaky2).
 */
export function normalizeHandle(input) {
  if (input == null) return "";
  return String(input)
    .trim()
    .replace(/^@+/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function getHealth() {
  return psFetch('/api/health');
}

export async function getUser(handle) {
  recordHandle(handle);
  const res = await psFetch(`/api/users/${encodeURIComponent(handle)}`);
  if (res?.user?.handle) recordHandle(res.user.handle);
  return res;
}

export async function getUserDabs(handle, cursor, limit) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  let path = `/api/users/${encodeURIComponent(handle)}/dabs`;
  if (qs) path += `?${qs}`;
  return psFetch(path);
}

export async function getUserStats(handle) {
  return psFetch(`/api/users/${encodeURIComponent(handle)}/stats`);
}

export async function getUserAchievements(handle) {
  return psFetch(`/api/users/${encodeURIComponent(handle)}/achievements`);
}

/**
 * Fetch the public achievement catalog (key -> { title, description })
 * and cache it for an hour. The catalog is static, so a long TTL is
 * safe. Used to resolve achievement titles when the per-user
 * achievements endpoint omits them.
 */
let _catalogCache = null;
let _catalogAt = 0;
const CATALOG_TTL_MS = 60 * 60 * 1000;

export async function getAchievementsCatalog() {
  const now = Date.now();
  if (_catalogCache && now - _catalogAt < CATALOG_TTL_MS) return _catalogCache;
  const res = await psFetch('/api/achievements/catalog').catch(() => null);
  const list = res?.catalog ?? [];
  const map = new Map();
  for (const e of list) {
    if (e?.key) map.set(String(e.key), { title: String(e.title ?? ''), description: String(e.description ?? '') });
  }
  _catalogCache = map;
  _catalogAt = now;
  return map;
}


export async function getDab(id) {
  const res = await psFetch(`/api/dabs/${encodeURIComponent(id)}`);
  if (res?.dab?.user?.handle) recordHandle(res.dab.user.handle);
  return res;
}

export async function getDabLikes(id) {
  return psFetch(`/api/dabs/${encodeURIComponent(id)}/likes`);
}

export async function getLeaderboard(period = 'all', limit = 10, cursor) {
  let path = `/api/leaderboard?period=${encodeURIComponent(period)}&limit=${limit}`;
  if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;
  const res = await psFetch(path);
  recordHandles((res?.entries ?? []).map((e) => e?.user?.handle));
  return res;
}

export async function getFeed(limit = 10, cursor, period = 'recent') {
  let path = `/api/feed?period=${encodeURIComponent(period)}&limit=${limit}`;
  if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;
  const res = await psFetch(path);
  const items = res?.entries ?? res?.dabs ?? res?.items ?? [];
  recordHandles(items.map((e) => (e.user ?? e)?.handle));
  return res;
}
