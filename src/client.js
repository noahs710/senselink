const PEAKSENSE_API_BASE = (process.env.PEAKSENSE_API_BASE || 'http://127.0.0.1:8081').replace(/\/$/, '');

/**
 * Minimal PeakSense public API client. All endpoints are read-only
 * and anonymous-friendly. The bot never needs auth.
 */
export async function psFetch(path) {
  const url = `${PEAKSENSE_API_BASE}${path}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`PeakSense API error ${res.status} for ${path}`);
  }
  return res.json();
}

export function apiPath(p) {
  return PEAKSENSE_API_BASE + p;
}

export async function getHealth() {
  return psFetch('/api/health');
}

export async function getUser(handle) {
  return psFetch(`/api/users/${encodeURIComponent(handle)}`);
}

export async function getUserDabs(handle, cursor) {
  let path = `/api/users/${encodeURIComponent(handle)}/dabs`;
  if (cursor) path += `?cursor=${encodeURIComponent(cursor)}`;
  return psFetch(path);
}

export async function getUserStats(handle) {
  return psFetch(`/api/users/${encodeURIComponent(handle)}/stats`);
}

export async function getUserAchievements(handle) {
  return psFetch(`/api/users/${encodeURIComponent(handle)}/achievements`);
}

export async function getDab(id) {
  return psFetch(`/api/dabs/${encodeURIComponent(id)}`);
}

export async function getDabLikes(id) {
  return psFetch(`/api/dabs/${encodeURIComponent(id)}/likes`);
}

export async function getLeaderboard(period = 'all', limit = 10, cursor) {
  let path = `/api/leaderboard?period=${encodeURIComponent(period)}&limit=${limit}`;
  if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;
  return psFetch(path);
}

export async function getFeed(limit = 10, cursor, period = 'recent') {
  let path = `/api/feed?period=${encodeURIComponent(period)}&limit=${limit}`;
  if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;
  return psFetch(path);
}
