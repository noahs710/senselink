import { getFeed } from './client.js';
import { liveFeedDabEmbed } from './formatters.js';
import { getRoomSocket } from './peakSocket.js';

const DEFAULT_POLL_MS = 60000;
const MAX_SEEN_IDS = 500;
const DEFAULT_WATCH_ROOM = 'BOTS';

function watchRoom() {
  return process.env.SENSELINK_FEEDWATCH_ROOM || DEFAULT_WATCH_ROOM;
}

class FeedWatcher {
  constructor(client, channelId, opts = {}) {
    this._client = client;
    this._channelId = channelId;
    this._pollMs = opts.pollMs || DEFAULT_POLL_MS;
    this._seen = [];
    this._seenSet = new Set();
    this._timer = null;
    this._running = false;
    this._roomHandler = null;
    this._room = null;
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
    this._seed().then(() => {
      this._wireRoomFeed();
      this._schedulePoll(1000);
    });
    console.log('[feedwatch] started for channel ' + this._channelId);
  }

  stop() {
    this._running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._unwireRoomFeed();
    console.log('[feedwatch] stopped for channel ' + this._channelId);
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
      // best-effort seed
    }
  }

  _wireRoomFeed() {
    try {
      this._room = getRoomSocket(watchRoom(), { nickname: 'SenseLink-Feedwatch' });
      this._roomHandler = async (t, d) => {
        if (!this._running) return;
        if (t !== 'FINAL') return;
        if (!d || d.room !== watchRoom()) return;
        await this._refreshFromFeed();
      };
      this._room.on(this._roomHandler);
    } catch (err) {
      console.error('[feedwatch] failed to wire room socket:', err?.message || err);
    }
  }

  _unwireRoomFeed() {
    if (this._room && this._roomHandler) {
      try { this._room.off?.(this._roomHandler); } catch (_) {}
      this._roomHandler = null;
    }
    this._room = null;
  }

  _schedulePoll(delay) {
    if (!this._running) return;
    this._timer = setTimeout(() => this._poll(), delay || this._pollMs);
    this._timer.unref?.();
  }

  async _poll() {
    if (!this._running) return;
    await this._refreshFromFeed();
    this._schedulePoll(this._pollMs);
  }

  async _refreshFromFeed() {
    try {
      const res = await getFeed(50, null, 'recent');
      const items = res?.entries ?? res?.dabs ?? res?.items ?? [];
      const newDabs = [];
      for (const item of items) {
        const dab = item.dab ?? item;
        if (dab?.id && !this._isSeen(dab.id)) {
          newDabs.push(dab);
          this._markSeen(dab.id);
        }
      }
      for (let i = newDabs.length - 1; i >= 0; i--) {
        await this._postDab(newDabs[i]);
      }
    } catch (err) {
      // swallow; next cycle retries
    }
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

const _watchers = new Map();

export function startFeedWatch(client, channelId, opts = {}) {
  stopFeedWatch(channelId);
  const watcher = new FeedWatcher(client, channelId, opts);
  watcher.start();
  _watchers.set(channelId, watcher);
  return watcher;
}

export function stopFeedWatch(channelId) {
  const watcher = _watchers.get(channelId);
  if (watcher) {
    watcher.stop();
    _watchers.delete(channelId);
    return true;
  }
  return false;
}

export function isFeedWatching(channelId) {
  return _watchers.has(channelId);
}

export function stopAllFeedWatchers() {
  for (const [, watcher] of _watchers) {
    watcher.stop();
  }
  _watchers.clear();
}
