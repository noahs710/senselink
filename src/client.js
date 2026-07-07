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
 * Site chat - anonymous-friendly persistent chat shared by every
 * connected PeakSense user. Backed by GET/POST /api/site-chat.
 * POST is optional-auth; signed-in users post under their handle,
 * anonymous browsers post under a guest name. New messages also
 * stream live over the same WebSocket the rooms use (frame t:
 * 'SITE_CHAT') so a single socket can carry site chat and any
 * joined room(s).
 */
export async function getSiteChat(limit = 25) {
  const n = Math.max(1, Math.min(200, Math.floor(Number(limit) || 25)));
  return psFetch('/api/site-chat?limit=' + n).catch(() => null);
}

export async function postSiteChat(text, guestName) {
  const body = { text: String(text ?? '') };
  if (guestName) body.guestName = String(guestName);
  const res = await fetch(PEAKSENSE_API_BASE + '/api/site-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error('site-chat post failed: ' + res.status);
  }
  if (res.status === 404) return null;
  const json = await res.json().catch(() => null);
  return (json && json.message) || null;
}

/**
 * Sanitize a room code the way the PeakSense WS server does so
 * /room AB12 cd and /room ab12cd map to the same lobby. Mirrors
 * server/index.mjs sanitizeRoomCode(): uppercase, strip non-alnum,
 * cap at 32.
 */
export function normalizeRoomCode(input) {
  if (input == null) return '';
  return String(input).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
}

/**
 * Trim + cap a chat message to the PeakSense chat limit
 * (server caps at 280 for site chat, 200 for room CHAT). Mirrors
 * the server sanitize() so the bot never sends something the
 * server will immediately reject.
 */
export function trimChat(text, max = 200) {
  if (text == null) return '';
  return String(text).split("").filter(function (ch) { var code = ch.charCodeAt(0); return code > 0x1f && code !== 0x7f; }).join("").trim().slice(0, Math.max(1, max));
}


/**
 * Accept a dab id in any of the forms people paste: the bare id, a
 * "/dab/<id>" path, or a full "https://peaksense.fly.dev/dab/<id>" URL.
 * Returns the raw id segment, or the trimmed input if no /dab/ path is
 * present. Never throws.
 */
export function normalizeDabId(input) {
  if (input == null) return "";
  const raw = String(input).trim();
  if (!raw) return "";
  const m = raw.match(/\/dab\/([^/?#]+)/i);
  return m ? m[1] : raw;
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

/**
 * Resolve a PeakSense user profile by handle with a 6-hour in-process
 * cache.  Returns { handle, displayName, avatarUrl, profileUrl } on
 * success, or null when the handle does not exist.  The cache is
 * synchronous after the first resolve: subsequent calls with the same
 * handle return the cached value immediately (via a cached promise).
 */
const _profileCache = new Map(); // handle -> Promise<{...} | null>
const PROFILE_TTL_MS = 6 * 60 * 60 * 1000;

export function resolveProfile(handle) {
  if (!handle) return Promise.resolve(null);
  const h = String(handle);
  const entry = _profileCache.get(h);
  if (entry && Date.now() - entry.at < PROFILE_TTL_MS) return entry.promise;
  const promise = getUser(h)
    .then((res) => {
      const u = res?.user;
      if (!u?.handle) return null;
      return {
        handle: u.handle,
        displayName: u.displayName || u.handle,
        avatarUrl: u.avatarUrl || '',
        profileUrl: `${PEAKSENSE_API_BASE}/u/${encodeURIComponent(u.handle)}`,
      };
    })
    .catch(() => null);
  _profileCache.set(h, { promise, at: Date.now() });
  return promise;
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
