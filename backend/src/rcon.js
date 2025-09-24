// rcon.js — WebRCON client with central management (ESM, Node 18+)
import WebSocket from 'ws';
import EventEmitter from 'events';

// ---------- endpoint normalize ----------
function normalizeEndpoint({ host, port, tls }) {
  const rawHost = typeof host === 'string' ? host.trim() : '';
  if (!rawHost) throw new Error('RustWebRcon: host is required.');

  let resolvedHost = rawHost;
  let resolvedPort = Number.parseInt(port, 10);
  let useTls = !!tls;

  const ensureScheme = (value, scheme) =>
    (/^[a-z]+:\/\//i.test(value) ? value : `${scheme}//${value}`);
  const tryParseUrl = (value) => { try { return new URL(value); } catch { return null; } };

  const scheme = useTls ? 'wss://' : 'ws://';
  let parsed = tryParseUrl(ensureScheme(resolvedHost, scheme));
  if (!parsed && resolvedHost.includes(':') && !resolvedHost.includes('[') && !resolvedHost.includes('//')) {
    parsed = tryParseUrl(`${scheme}[${resolvedHost}]`);
  }

  if (parsed) {
    if (parsed.hostname) resolvedHost = parsed.hostname;
    if (parsed.port) {
      const candidate = Number.parseInt(parsed.port, 10);
      if (Number.isFinite(candidate)) resolvedPort = candidate;
    }
    if (parsed.protocol === 'wss:' || parsed.protocol === 'https:') useTls = true;
    else if (parsed.protocol === 'ws:' || parsed.protocol === 'http:') useTls = false;
  } else {
    const hostPortMatch = resolvedHost.match(/^([^:\[]+):(\d+)$/);
    if (hostPortMatch && !hostPortMatch[1].includes(':')) {
      resolvedHost = hostPortMatch[1];
      const candidate = Number.parseInt(hostPortMatch[2], 10);
      if (Number.isFinite(candidate)) resolvedPort = candidate;
    }
  }

  if (!Number.isFinite(resolvedPort) || resolvedPort <= 0 || resolvedPort > 65535) {
    throw new Error('RustWebRcon: a valid port is required.');
  }

  return { host: resolvedHost, port: resolvedPort, tls: useTls };
}

// ---------- core client ----------
class RustWebRcon extends EventEmitter {
  constructor({
    host,
    port,
    password,
    tls = false,

    // Set heartbeatIntervalMs = 0 to disable app-level keepalive entirely
    heartbeatIntervalMs = 20000,
    commandTimeoutMs = 10000,

    maxInFlight = 64,
    reconnectDelayMs = 3000,

    // Keepalive command + idle window
    keepaliveCommand = 'serverinfo',
    keepaliveIdleMs, // default derived from heartbeatIntervalMs
  }) {
    super();
    if (!password) throw new Error('RustWebRcon: password is required.');

    const normalized = normalizeEndpoint({ host, port, tls });
    this.host = normalized.host;
    this.port = normalized.port;
    this.tls = normalized.tls;
    this.password = password;

    this.ws = null;
    this.connected = false;
    this.manualClose = false;

    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.commandTimeoutMs = commandTimeoutMs;
    this.maxInFlight = Math.max(1, maxInFlight);
    this.reconnectDelayMs = Math.max(500, reconnectDelayMs);

    // app-level keepalive (Rust doesn't respond to WS pongs)
    this.keepaliveInterval = null;
    this.keepaliveCommand = keepaliveCommand || 'serverinfo';
    this.keepaliveIdleMs = Math.max(10000, keepaliveIdleMs || heartbeatIntervalMs || 20000);

    // keepalive uses a DISTINCT negative Identifier range to be unambiguous
    this._kaBase = -900000000; // -900M space
    this._kaSeq = 0;

    this.reconnectTimer = null;

    this.nextId = 1;
    this.pending = new Map();

    // track inbound activity
    this.lastMessageAt = 0;
  }

  get url() {
    const proto = this.tls ? 'wss' : 'ws';
    const host = this.host.includes(':') && !this.host.startsWith('[') ? `[${this.host}]` : this.host;
    return `${proto}://${host}:${this.port}/${encodeURIComponent(this.password)}`;
  }

  async connect() {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) return;
    this.manualClose = false;
    this._clearReconnect();

    this.ws = new WebSocket(this.url);

    return new Promise((resolve, reject) => {
      let settled = false;

      const onOpen = () => {
        this.connected = true;
        this.lastMessageAt = Date.now();
        this.emit('open');
        this._startKeepalive();
        settled = true;
        resolve();
      };

      const onMessage = (data) => {
        this.lastMessageAt = Date.now();
        const text = data?.toString?.() ?? String(data);

        let obj = null;
        try { obj = JSON.parse(text); } catch {}

        if (!obj) {
          this.emit('raw', text);
          return;
        }

        // Handle pending first so we can suppress "silent" ones
        const id = Number(obj.Identifier);
        if (Number.isFinite(id) && this.pending.has(id)) {
          const p = this.pending.get(id);
          this.pending.delete(id);
          clearTimeout(p.timeout);

          if (p.silent) {
            p.resolve(obj); // resolve silently
            return;         // DO NOT emit anything
          }

          this.emit('message', obj);
          this._routeTyped(obj);
          p.resolve(obj);
          return;
        }

        // Unmatched async event from server (console/log/chat push)
        this.emit('message', obj);
        this._routeTyped(obj);
      };

      const onError = (err) => {
        this.emit('rcon_error', err);
        if (!settled) { settled = true; reject(err); }
        try { this.ws?.close(); } catch {}
      };

      const onClose = () => {
        this.connected = false;
        this._stopKeepalive();
        this._rejectAll(new Error('RCON connection closed'));
        this.emit('close');
        if (!settled) { settled = true; reject(new Error('RCON connection closed')); }
        this.ws = null;
        if (!this.manualClose) this._scheduleReconnect();
      };

      this.ws.on('open', onOpen);
      this.ws.on('message', onMessage);
      this.ws.on('error', onError);
      this.ws.on('close', onClose);
      // No 'pong' — Rust doesn't send ws control frames
    });
  }

  async ensure() {
    if (!this.connected) await this.connect();
  }

  // Supports { silent, forceId } for keepalive / special traffic
  async command(cmd, { timeoutMs, silent = false, forceId } = {}) {
    await this.ensure();
    if (this.pending.size >= this.maxInFlight) {
      throw new Error(`Too many in-flight RCON requests (${this.pending.size}/${this.maxInFlight}).`);
    }

    const id = Number.isFinite(forceId) ? forceId : this.nextId++;
    const payload = JSON.stringify({
      Identifier: id,
      Message: String(cmd ?? ''),
      Name: silent ? 'WebRconKeepalive' : 'WebRcon', // server ignores, just a tag
    });
    const to = Math.max(500, timeoutMs ?? this.commandTimeoutMs);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RCON timeout after ${to}ms for: ${cmd}`));
      }, to);
      this.pending.set(id, { resolve, reject, timeout, silent });

      try {
        this.ws.send(payload, (err) => {
          if (err) {
            clearTimeout(timeout);
            this.pending.delete(id);
            reject(err);
          }
        });
      } catch (err) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  async close() {
    this.manualClose = true;
    this._clearReconnect();
    this._stopKeepalive();
    try { this.ws?.close(); } catch {}
    this.connected = false;
    this._rejectAll(new Error('RCON connection closed'));
    this.ws = null;
  }

  // ---------- internals ----------
  _nextKeepaliveId() {
    // Negative space: -900000000, -899999999, ...
    return this._kaBase + (this._kaSeq++ % 1000000);
  }

  _startKeepalive() {
    this._stopKeepalive();
    if (!this.ws || this.heartbeatIntervalMs === 0) return;

    const tick = async () => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const idleFor = Date.now() - (this.lastMessageAt || 0);
      if (!this.lastMessageAt || idleFor >= this.keepaliveIdleMs) {
        try {
          await this.command(this.keepaliveCommand, {
            timeoutMs: Math.min(5000, this.commandTimeoutMs),
            silent: true,
            forceId: this._nextKeepaliveId(), // DIFFERENT ID namespace
          });
        } catch {
          this.emit('rcon_error', new Error('Keepalive command timed out; reconnecting.'));
          try { this.ws.terminate?.(); } catch { try { this.ws.close(); } catch {} }
        }
      }
    };

    this.keepaliveInterval = setInterval(tick, this.keepaliveIdleMs);
    setTimeout(tick, 1000);
  }

  _stopKeepalive() {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer || this.manualClose) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.manualClose) return;
      try {
        await this.connect();
        this.emit('reconnect');
      } catch (e) {
        this.emit('rcon_error', e);
        this._scheduleReconnect();
      }
    }, this.reconnectDelayMs);
  }

  _clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  _rejectAll(err) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timeout);
      p.reject(err);
    }
    this.pending.clear();
  }

  _routeTyped(obj) {
    const t = String(obj?.Type ?? '').toLowerCase();
    const msg = obj?.Message ?? '';
    if (!t && typeof msg === 'string') {
      this.emit('console', msg);
      return;
    }
    if (t.includes('chat')) this.emit('chat', msg, obj);
    else if (t.includes('generic') || t.includes('log') || t.includes('console')) this.emit('console', msg, obj);
    else this.emit('event', obj);
  }
}

// ---------- central management ----------
const clientMap = new Map();
const bridge = new EventEmitter();

// De-dupe guard: avoid emitting same line/event multiple times within a short window
const _dedupe = new Map(); // key: `${event}:${serverId}:${sig}` -> timestamp
const DEDUPE_MS = 1500;

function _shouldEmitOnce(serverId, event, args) {
  let sig = '';
  try {
    sig = JSON.stringify(args.length === 1 ? args[0] : args);
  } catch {
    sig = String(args?.[0] ?? '');
  }
  const k = `${event}:${serverId}:${sig}`;
  const now = Date.now();
  const last = _dedupe.get(k) || 0;
  if (now - last <= DEDUPE_MS) return false;
  _dedupe.set(k, now);
  return true;
}

// registry of active per-server subscriptions; used to de-dupe on re-subscribe
const activeSubs = new Map(); // key:number -> Array<() => void>

function toServerKey(rowOrId) {
  if (rowOrId && typeof rowOrId === 'object') {
    const value = Number(rowOrId.id ?? rowOrId.server_id ?? rowOrId.serverId);
    if (Number.isFinite(value)) return value;
  }
  const numeric = Number(rowOrId);
  if (Number.isFinite(numeric)) return numeric;
  throw new Error('RustWebRcon: server id is required.');
}

function emitScoped(event, key, ...args) {
  if (!_shouldEmitOnce(key, event, args)) return;
  bridge.emit(event, key, ...args);
  bridge.emit(`${event}:${key}`, ...args);
}

function attachClientEvents(key, client) {
  // Attached once per client instance; reconnect reuses the same instance.
  client.on('open', () => emitScoped('open', key));
  client.on('reconnect', () => emitScoped('reconnect', key));
  client.on('message', (message) => emitScoped('message', key, message));
  client.on('console', (line, payload) => emitScoped('console', key, line, payload));
  client.on('chat', (line, payload) => emitScoped('chat', key, line, payload));
  client.on('event', (payload) => emitScoped('event', key, payload));
  client.on('raw', (text) => emitScoped('raw', key, text));
  client.on('rcon_error', (err) => emitScoped('rcon_error', key, err));
  client.on('close', () => {
    clientMap.delete(key);
    emitScoped('close', key, { manual: !!client.manualClose });
  });
}

function ensureClient(row) {
  const key = toServerKey(row);
  if (clientMap.has(key)) return clientMap.get(key);
  const host = row?.host;
  const port = row?.port;
  const password = row?.password;
  const tls = !!row?.tls;
  if (!host || !password) throw new Error('RustWebRcon: host and password are required.');
  const client = new RustWebRcon({
    host, port, password, tls,
    // disable keepalive completely if you want: heartbeatIntervalMs: 0,
    heartbeatIntervalMs: 20000,
    keepaliveIdleMs: 20000,
  });
  attachClientEvents(key, client);
  clientMap.set(key, client);
  return client;
}

// ---------- public API ----------
export function connectRcon(row) {
  const client = ensureClient(row);
  return client.ensure();
}

export function sendRconCommand(row, command, options) {
  const client = ensureClient(row);
  return client.command(command, options);
}

export function closeRcon(id) {
  const key = toServerKey(id);
  const client = clientMap.get(key);
  if (!client) return;
  clientMap.delete(key);
  try {
    // also clear any lingering subscriptions
    const arr = activeSubs.get(key) || [];
    for (const fn of arr) { try { fn(); } catch {} }
    activeSubs.delete(key);
  } catch {}
  client.close().catch(() => {});
}

export function subscribeToRcon(id, handlers = {}, { replace = true } = {}) {
  const key = toServerKey(id);

  // If replace=true (default), wipe out previous listeners for this server
  if (replace && activeSubs.has(key)) {
    for (const fn of activeSubs.get(key)) { try { fn(); } catch {} }
    activeSubs.delete(key);
  }

  const mapping = [
    ['open', handlers.open],
    ['reconnect', handlers.reconnect],
    ['message', handlers.message],
    ['console', handlers.console],
    ['chat', handlers.chat],
    ['event', handlers.event],
    ['raw', handlers.raw],
    ['rcon_error', handlers.rcon_error],
    ['close', handlers.close],
  ];

  const unsubs = [];
  for (const [event, handler] of mapping) {
    if (typeof handler !== 'function') continue;
    const wrapped = (...args) => handler(...args);
    bridge.on(`${event}:${key}`, wrapped);
    unsubs.push(() => bridge.off(`${event}:${key}`, wrapped));
  }

  // record these unsubs so future subscribe calls can replace them
  const list = activeSubs.get(key) || [];
  list.push(...unsubs);
  activeSubs.set(key, list);

  // return an unsubscribe that also cleans registry
  return () => {
    const arr = activeSubs.get(key) || [];
    for (const fn of unsubs) {
      try { fn(); } catch {}
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    }
    if (!arr.length) activeSubs.delete(key);
  };
}

export function activeRconIds() {
  return [...clientMap.keys()];
}

export { RustWebRcon };
