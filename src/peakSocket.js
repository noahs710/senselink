import WebSocket from "ws";
import { normalizeRoomCode, trimChat } from "./client.js";

function wsUrlFromApiBase(apiBase) {
  const base = (apiBase || "").replace(/\/$/, "");
  if (!base) return null;
  if (/^ws/i.test(base)) return base + "/socket";
  if (/^https/i.test(base)) return base.replace(/^http/i, "ws") + "/socket";
  return "ws://" + base.replace(/^http/, "") + "/socket";
}

export class PeakSenseSocket extends EventTarget {
  constructor({ origin, nickname = "SenseLink", role = "spectator", label = "socket" } = {}) {
    super();
    this._origin = origin || wsUrlFromApiBase(process.env.PEAKSENSE_API_BASE);
    this._nickname = String(nickname || "SenseLink").slice(0, 24) || "SenseLink";
    this._role = role === "competitor" || role === "host" ? role : "spectator";
    this._label = label;
    this._room = null;
    this._ws = null;
    this._closedByCaller = false;
    this._backoffMs = 500;
    this._reconnectTimer = null;
    this._lastJoin = null;
    this._handlers = new Set();
  }

  get url() { return this._origin; }
  get room() { return this._room; }
  get connected() { return !!(this._ws && this._ws.readyState === WebSocket.OPEN); }

  /** Return a snapshot of { players, spectators } counts for the room. */
  _presence() {
    if (!this._room) return { players: 0, spectators: 0 };
    const participants = this._room.participants || [];
    const peers = this._room.peers || [];
    // participants are competitors; spectators are peers minus participants.
    const players = participants.length;
    const spectators = Math.max(0, peers.length - players);
    return { players, spectators };
  }

  on(handler) {
    this._handlers.add(handler);
    return () => this._handlers.delete(handler);
  }

  _emit(type, detail) {
    const evt = new CustomEvent(type, { detail });
    this.dispatchEvent(evt);
    for (const h of this._handlers) {
      try { h(type, detail); } catch (err) { /* swallow listener errors */ }
    }
  }

  connect() {
    if (!this._origin) return false;
    this._closedByCaller = false;
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) return true;
    let ws;
    try {
      ws = new WebSocket(this._origin, { headers: { Origin: "https://peaksense.fly.dev" } });
    } catch (err) {
      this._scheduleReconnect();
      return false;
    }
    this._ws = ws;
    ws.on("open", () => {
      this._backoffMs = 500;
      this._emit("open", { origin: this._origin, room: this._room });
      const last = this._lastJoin;
      if (last) this._sendRaw({ t: "JOIN", d: last });
    });
    ws.on("message", (raw) => {
      let frame;
      try { frame = JSON.parse(String(raw)); } catch { return; }
      if (!frame || typeof frame !== "object") return;
      const t = frame.t;
      const d = frame.d || {};
      if (t === "JOINED") {
        this._room = { code: d.room, name: d.roomName, ownerId: d.ownerId, peers: d.peers || [], participants: d.participants || [] };
        this._emit("presence", this._presence());
      } else if (t === "JOIN_REJECTED" || t === "ROOM_CLOSED") {
        this._room = null;
      } else if (t === "PEER_JOINED" || t === "PEER_LEFT") {
        // Update room roster from the frame data if provided; otherwise
        // best-effort add/remove by nickname/id.
        if (this._room) {
          if (d.peers) this._room.peers = d.peers;
          else if (t === "PEER_JOINED" && d.peer) this._room.peers.push(d.peer);
          else if (t === "PEER_LEFT" && d.peerId) this._room.peers = this._room.peers.filter((p) => p.id !== d.peerId);
          if (d.participants) this._room.participants = d.participants;
          this._emit("presence", this._presence());
        }
      }
      if (t === "PING") {
        this._sendRaw({ t: "PONG", d: { ts: Date.now() } });
      }
      this._emit(t, d);
    });
    ws.on("close", () => {
      this._ws = null;
      this._emit("close", { room: this._room });
      if (!this._closedByCaller) this._scheduleReconnect();
    });
    ws.on("error", () => { /* surface only via close */ });
    return true;
  }

  _scheduleReconnect() {
    if (this._closedByCaller || this._reconnectTimer) return;
    const delay = this._backoffMs;
    this._backoffMs = Math.min(8000, Math.round(this._backoffMs * 1.7));
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, delay);
  }

  _sendRaw(frame) {
    const ws = this._ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try { ws.send(JSON.stringify(frame)); return true; } catch { return false; }
  }

  // Returns a Promise that resolves once the server has confirmed it
  // received the frame. Used by /chat say and /room say to make sure
  // a half-open TCP connection can't swallow a message without us
  // noticing. Resolves true on match, false on timeout / wrong type.
  _sendAndAwait(_type, frame, matcher, timeoutMs = 4000) {
    const ws = this._ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false;
      let off = null;
      let timer = null;
      const finish = (ok) => {
        if (done) return;
        done = true;
        if (timer) { clearTimeout(timer); timer = null; }
        if (off) { try { off(); } catch { /* ignore */ } off = null; }
        resolve(ok);
      };
      off = this.on((t, d) => { if (matcher(t, d)) finish(true); });
      timer = setTimeout(() => finish(false), timeoutMs);
      try { ws.send(JSON.stringify(frame)); }
      catch { finish(false); }
    });
  }

  joinRoom(rawCode, opts = {}) {
    const code = normalizeRoomCode(rawCode);
    if (!code) return false;
    const nickname = String(opts.nickname || this._nickname).slice(0, 24) || this._nickname;
    const role = ["spectator", "competitor", "host"].includes(opts.role) ? opts.role : this._role;
    this._lastJoin = { room: code, nickname, role };
    if (!this.connected) this.connect();
    return this._sendRaw({ t: "JOIN", d: this._lastJoin });
  }

  leaveRoom() {
    this._lastJoin = null;
    return this._sendRaw({ t: "LEAVE", d: {} });
  }

  // /room say: returns a Promise that resolves true when the server
  // echoes the same text back. A half-open TCP conn that drops the
  // message returns false (timeout) instead of pretending it sent.
  sendRoomChat(text) {
    const clean = trimChat(text, 200);
    if (!clean) return Promise.resolve(false);
    return this._sendAndAwait("CHAT", { t: "CHAT", d: { text: clean, nickname: this._nickname } }, (t, msg) => t === "CHAT" && msg && msg.text === clean);
  }

  // /chat say posts without confirmation. Returns a Promise that
  // resolves true once the server echoes the SITE_CHAT frame back,
  // false on timeout. The caller is expected to fall back to REST
  // POST on false so a half-open WS can never swallow the message.
  sendSiteChat(text, guestName) {
    const clean = trimChat(text, 280);
    if (!clean) return Promise.resolve(false);
    const d = { text: clean };
    if (guestName) d.guestName = String(guestName).slice(0, 40);
    return this._sendAndAwait("SITE_CHAT", { t: "SITE_CHAT", d }, (t, msg) => t === "SITE_CHAT" && msg && msg.text === clean);
  }

  close() {
    this._closedByCaller = true;
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    try { this._ws && this._ws.close(); } catch { /* ignore */ }
    this._ws = null;
    this._room = null;
  }
}

export function deriveSocketUrl() {
  return wsUrlFromApiBase(process.env.PEAKSENSE_API_BASE);
}

const _roomRegistry = new Map();

export function getRoomSocket(roomCode, opts = {}) {
  const code = normalizeRoomCode(roomCode);
  if (!code) return null;
  let sock = _roomRegistry.get(code);
  if (sock) return sock;
  sock = new PeakSenseSocket({ label: "room:" + code, nickname: opts.nickname || "SenseLink", role: "spectator" });
  sock.connect();
  _roomRegistry.set(code, sock);
  return sock;
}

export function releaseRoomSocket(roomCode) {
  const code = normalizeRoomCode(roomCode);
  if (!code) return;
  const sock = _roomRegistry.get(code);
  if (!sock) return;
  sock.close();
  _roomRegistry.delete(code);
}

let _siteSocket = null;
export function getSiteSocket() {
  if (_siteSocket) return _siteSocket;
  _siteSocket = new PeakSenseSocket({ label: "site-chat", role: "spectator" });
  _siteSocket.connect();
  return _siteSocket;
}

export function closeSiteSocket() {
  if (!_siteSocket) return;
  _siteSocket.close();
  _siteSocket = null;
}