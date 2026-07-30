/**
 * SenseLink Announcer — background poller that watches for two kinds
 * of events and posts announcements to configurable Discord channels:
 *
 *  1. Achievement unlocks  — polls the leaderboard's top users
 *     periodically, fetches their achievements, and announces any new
 *     ones since the last check.
 *  2. Rank-up (ELO tier crossing) — polls the leaderboard, tracks each
 *     user's rating, and when a user crosses a tier boundary (e.g.
 *     Bronze → Silver), posts a rank-up announcement.
 *
 * Configuration:
 *  - SENSelink_ANNOUNCE_CHANNEL_ID  — Discord channel id for announcements
 *    (set via env or passed to startAnnouncer)
 *  - SENSelink_ANNOUNCE_POLL_MS     — poll interval, default 60s
 *  - SENSelink_ANNOUNCE_MAX_USERS   — how many top users to track, default 25
 *  - SENSelink_ANNOUNCE_DISABLED    — "1" to disable entirely
 *
 * The announcer is designed to be resilient: API failures are swallowed,
 * the poll interval has jitter, and the timer is unref()'d so it doesn't
 * keep the process alive on shutdown.
 */

import {
  getLeaderboard,
  getUserAchievements,
  getAchievementsCatalog,
  getUser,
} from './client.js';
import {
  achievementAnnouncementEmbed,
  rankUpAnnouncementEmbed,
} from './formatters.js';

// --- ELO tier definitions ---
// Boundaries map a numeric rating to a tier name. When a user's rating
// crosses from one tier to another, a rank-up announcement fires.
const TIER_BOUNDARIES = [
  { min: 0, name: 'Bronze' },
  { min: 800, name: 'Silver' },
  { min: 1000, name: 'Gold' },
  { min: 1200, name: 'Platinum' },
  { min: 1400, name: 'Diamond' },
  { min: 1600, name: 'Master' },
  { min: 1800, name: 'Grandmaster' },
  { min: 2000, name: 'Legend' },
];

export function tierForRating(rating) {
  if (rating == null) return 'Unranked';
  for (let i = TIER_BOUNDARIES.length - 1; i >= 0; i--) {
    if (rating >= TIER_BOUNDARIES[i].min) return TIER_BOUNDARIES[i].name;
  }
  return TIER_BOUNDARIES[0].name;
}

/**
 * The Announcer class manages the polling lifecycle. It is
 * instantiated once at bot startup (see startAnnouncer) and tracks
 * state across polls.
 */
export class Announcer {
  constructor(client, opts = {}) {
    this._client = client;
    this._channelId = opts.channelId || process.env.SENSELINK_ANNOUNCE_CHANNEL_ID || null;
    this._pollMs = opts.pollMs || Number(process.env.SENSELINK_ANNOUNCE_POLL_MS) || 60_000;
    this._maxUsers = opts.maxUsers || Number(process.env.SENSELINK_ANNOUNCE_MAX_USERS) || 25;
    this._disabled = opts.disabled || process.env.SENSELINK_ANNOUNCE_DISABLED === '1';
    this._timer = null;
    this._running = false;

    // State tracked across polls:
    // handle -> Set of achievement keys already seen
    this._seenAchievements = new Map();
    // handle -> last known tier name
    this._lastTier = new Map();
    // handle -> last known rating (for logging / debugging)
    this._lastRating = new Map();
  }

  get channelId() { return this._channelId; }
  get running() { return this._running; }

  /** Set or update the target announcement channel at runtime. */
  setChannel(channelId) {
    this._channelId = channelId;
  }

  /**
   * Start polling. Safe to call before the client is fully ready;
   * the first poll will be deferred until client.isReady() returns true.
   */
  start() {
    if (this._disabled) {
      console.log('[announcer] disabled via SENSELINK_ANNOUNCE_DISABLED');
      return;
    }
    if (this._running) return;
    if (!this._channelId) {
      console.log('[announcer] no channel configured (set SENSELINK_ANNOUNCE_CHANNEL_ID); announcements will be skipped until /announce channel is used');
    }
    this._running = true;
    // First poll after a short delay to let the bot connect.
    this._timer = setTimeout(() => this._poll(), 5_000);
    this._timer.unref?.();
    console.log(`[announcer] started — polling every ${this._pollMs}ms, tracking up to ${this._maxUsers} users`);
  }

  stop() {
    this._running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  async _poll() {
    if (!this._running) return;
    try {
      if (this._client && this._client.isReady()) {
        await this._checkLeaderboard();
      }
    } catch (err) {
      console.error('[announcer] poll error:', err?.message || err);
    }
    // Schedule next poll with small jitter (±10%) to avoid thundering herd.
    const jitter = Math.round(this._pollMs * (0.9 + Math.random() * 0.2));
    this._timer = setTimeout(() => this._poll(), jitter);
    this._timer.unref?.();
  }

  async _checkLeaderboard() {
    const board = await getLeaderboard('all', this._maxUsers).catch(() => null);
    const entries = board?.entries ?? [];
    if (entries.length === 0) return;

    const catalog = await getAchievementsCatalog();

    // Process each user in parallel.
    await Promise.allSettled(entries.map((entry) => this._checkUser(entry, catalog)));
  }

  async _checkUser(entry, catalog) {
    const handle = entry?.user?.handle;
    if (!handle) return;
    const displayName = entry.user.displayName || handle;
    const avatarUrl = entry.user.avatarUrl || '';
    const rating = entry.rating ?? entry.user?.rating ?? null;

    // --- Rank-up detection ---
    if (rating != null) {
      const newTier = tierForRating(rating);
      const oldTier = this._lastTier.get(handle);
      if (oldTier && oldTier !== newTier) {
        // Tier changed — announce it.
        await this._postRankUp({
          handle, displayName, avatarUrl,
          oldTier, newTier, newRating: rating,
        });
      }
      this._lastTier.set(handle, newTier);
      this._lastRating.set(handle, rating);
    }

    // --- Achievement detection ---
    const res = await getUserAchievements(handle).catch(() => null);
    const achievements = res?.achievements ?? [];
    const seen = this._seenAchievements.get(handle) || new Set();

    for (const a of achievements) {
      if (a?.isPublic === false) continue;
      const key = a.key || a.title || a.id;
      if (!key) continue;
      const keyStr = String(key);
      if (seen.has(keyStr)) continue;
      // First poll: seed the set without announcing (we don't know if
      // these are new or already existed before we started watching).
      if (seen.size > 0 || this._seenAchievements.has(handle)) {
        // This is a genuinely new achievement since our last check.
        const title = a.title || (catalog?.has(keyStr) ? catalog.get(keyStr).title : keyStr);
        const desc = a.description || (catalog?.has(keyStr) ? catalog.get(keyStr).description : '');
        await this._postAchievement({
          handle, displayName, avatarUrl,
          achievementTitle: title,
          achievementDescription: desc,
        });
      }
      seen.add(keyStr);
    }
    this._seenAchievements.set(handle, seen);
  }

  async _postAchievement(info) {
    const embed = achievementAnnouncementEmbed(info);
    await this._sendToChannel(embed);
  }

  async _postRankUp(info) {
    const embed = rankUpAnnouncementEmbed(info);
    await this._sendToChannel(embed);
  }

  async _sendToChannel(embed) {
    if (!this._channelId || !this._client?.isReady()) return;
    try {
      const channel = await this._client.channels.fetch(this._channelId);
      if (channel && typeof channel.send === 'function') {
        await channel.send({ embeds: [embed] });
        console.log(`[announcer] posted announcement to channel ${this._channelId}`);
      }
    } catch (err) {
      console.error('[announcer] failed to send announcement:', err?.message || err);
    }
  }
}

// --- Singleton management ---

let _announcer = null;

/**
 * Start the announcer service. Called once at bot startup from
 * index.js after the Discord client is ready.
 */
export function startAnnouncer(client, opts = {}) {
  if (_announcer) return _announcer;
  _announcer = new Announcer(client, opts);
  _announcer.start();
  return _announcer;
}

export function getAnnouncer() {
  return _announcer;
}

export function stopAnnouncer() {
  if (_announcer) {
    _announcer.stop();
    _announcer = null;
  }
}