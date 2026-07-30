/**
 * SenseLink Live Feed Watcher — polls the PeakSense public feed for
 * new dabs and posts them to a Discord channel in real time.
 *
 * Two strategies are supported:
 *  1. Polling (default) — fetches GET /api/feed?period=recent at a
 *     configurable interval and posts any dabs not yet seen.
 *  2. WebSocket — if the PeakSense socket emits NEW_DAB frames, the
 *     watcher uses those instead of polling. Falls back to polling
 *     automatically when WS frames are not received.
 *
 * Each /feedwatch invocation creates a watcher bound to the channel
 * where the command was run. Multiple channels can have independent
 * watchers. The watcher is cleaned up when the bot shuts down or
 * when /feedwatch stop is used.
 */

import { getFeed } from './client.js';
import { liveFeedDabEmbed } from './formatters.js';
import { getSiteSocket } from './peakSocket.js';

const DEFAULT_POLL_MS = 15_000; // 15 seconds
const MAX_SEEN_IDS = 500; // ring buffer of seen dab ids

/**
 * A single live-feed watcher for one Discord channel.
 */
class FeedWatcher {
  constructor(client, channelId, opts = {}) {
    this._client = client;
    this._channelId = channelId;
    this._pollMs = opts.pollMs || DEFAULT_POLL_MS;
    this._seen = []; // ring buffer of dab ids
    this._seenSet = new Set();
    this._timer = null;
    this._running = false;
    this._wsHandler = null;
    this._useWs = false;
    this._lastPollAt = 0;
  }

  get channelId() { return this._channelId; }
  get running() { return this._running; }

  _markSeen(id) {
    if (!id) return;
    const idStr = String(id);
    if (this._seenSet.has(idStr)) return;
    this._seenSet.add(idStr);
    this._seen.push(idStr);
    if (this._seen.length > MAX_SEEN_IDS) {
      const old = this._seen.shift();
      this._seenSet.delete(old);
    }
  }

  _isSeen(id) {
    return id != null && this._seenSet.has(String(id));
  }

  start() {
    if (this._running) return;
    this._running = true;
    // Seed: fetch the latest dabs and mark them as seen WITHOUT posting,
    // so the watcher only posts dabs that arrive *after* it starts.
    this._seed().then(() => {
      // Try to use the WS for real-time updates.
      this._wireWs();
      // Start polling as a fallback / supplement.
      this._schedulePoll(1000);
    });
    console.log(`[feedwatch] started for channel ${this._channelId}`);
  }

  stop() {
    this._running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._unwireWs();
    console.log(`[feedwatch] stopped for channel ${this._channelId}`);
  }

  async _seed() {
    try {
      const res = await getFeed(10, null, 'recent');
      const items = res?.entries ?? res?.dabs ?? res?.items ?? [];
      for (const item of items) {
        const dab = item.dab ?? item;
        this._markSeen(dab.id);
      }
    } catch (err) {
      // Best-effort; if seeding fails, the watcher will just post
      // everything on the first poll (which is fine).
    }
  }

  _wireWs() {
    try {
      const sock = getSiteSocket();
      this._wsHandler = (t, d) => {
        if (t === 'NEW_DAB' || t === 'DAB_POSTED') {
          this._useWs = true;
          const dab = d?.dab ?? d;
          if (dab && dab.id && !this._isSeen(dab.id)) {
            this._markSeen(dab.id);
            this._postDab(dab);
          }
        }
      };
      sock.on(this._wsHandler);
    } catch {
      // WS not available; polling will handle it.
    }
  }

  _unwireWs() {
    if (this._wsHandler) {
      try {
        const sock = getSiteSocket();
        sock._handlers?.delete?.(this._wsHandler);
      } catch { /* ignore */ }
      this._wsHandler = null;
    }
  }

  _schedulePoll(delay) {
    if (!this._running) return;
    this._timer = setTimeout(() => this._poll(), delay || this._pollMs);
    this._timer.unref?.();
  }

  async _poll() {
    if (!this._running) return;
    this._lastPollAt = Date.now();
    try {
      const res = await getFeed(10, null, 'recent');
      const items = res?.entries ?? res?.dabs ?? res?.items ?? [];
      // Items come newest-first; post oldest-newest so they appear in
      // chronological order in the channel.
      const newDabs = [];
      for (const item of items) {
        const dab = item.dab ?? item;
        if (dab?.id && !this._isSeen(dab.id)) {
          newDabs.push(dab);
          this._markSeen(dab.id);
        }
      }
      // Post in reverse (oldest first) for chronological order.
      for (let i = newDabs.length - 1; i >= 0; i--) {
        await this._postDab(newDabs[i]);
      }
    } catch (err) {
      // Swallow errors; next poll will retry.
    }
    // If WS is active, we can poll less frequently (every 60s as a
    // safety net). Otherwise keep the normal interval.
    const nextDelay = this._useWs ? Math.max(this._pollMs, 60_000) : this._pollMs;
    this._schedulePoll(nextDelay);
  }

  async _postDab(dab) {
    if (!dab) return;
    const embed = liveFeedDabEmbed(dab);
    if (!embed) return;
    try {
      if (!this._client?.isReady()) return;
      const channel = await this._client.channels.fetch(this._channelId);
      if (channel && typeof channel.send === 'function') {
        await channel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error('[feedwatch] failed to post dab:', err?.message || err);
    }
  }
}

// --- Registry of active watchers by channel id ---
const _watchers = new Map(); // channelId -> FeedWatcher

/**
 * Start a live feed watcher for a channel. If one is already running,
 * it is stopped and replaced.
 */
export function startFeedWatch(client, channelId, opts = {}) {
  stopFeedWatch(channelId);
  const watcher = new FeedWatcher(client, channelId, opts);
  watcher.start();
  _watchers.set(channelId, watcher);
  return watcher;
}

/**
 * Stop the live feed watcher for a channel.
 */
export function stopFeedWatch(channelId) {
  const watcher = _watchers.get(channelId);
  if (watcher) {
    watcher.stop();
    _watchers.delete(channelId);
    return true;
  }
  return false;
}

/**
 * Check if a feed watcher is active for a channel.
 */
export function isFeedWatching(channelId) {
  return _watchers.has(channelId);
}

/**
 * Stop all active feed watchers (called on shutdown).
 */
export function stopAllFeedWatchers() {
  for (const [, watcher] of _watchers) {
    watcher.stop();
  }
  _watchers.clear();
}