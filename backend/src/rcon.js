// rcon.js â€” WebRCON client with central management (ESM, Node 18+)
import WebSocket from 'ws';
import EventEmitter from 'events';
import { parseServerInfoMessage, parseLevelUrlMessage, extractInteger } from './rcon-parsers.js';

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

    // reconnection control
    this.failedAttempts = 0;
    this.hardBackoffMs = 30000;
    this.hardBackoffUntil = 0;
  }

  get url() {
    const proto = this.tls ? 'wss' : 'ws';
    const host = this.host.includes(':') && !this.host.startsWith('[')
      ? `[${this.host}]`
      : this.host;

    // IMPORTANT: raw password, no encodeURIComponent()
    return `${proto}://${host}:${this.port}/${this.password}`;
  }

  async connect() {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) return;
    const waitFor = this._remainingHardBackoff();
    if (waitFor > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitFor));
    }
    this.manualClose = false;
    this._clearReconnect();

    this.ws = new WebSocket(this.url);

    return new Promise((resolve, reject) => {
      let settled = false;

      const onOpen = () => {
        this.connected = true;
        this.lastMessageAt = Date.now();
        this.failedAttempts = 0;
        this.hardBackoffUntil = 0;
        this.emit('open');
        this._startKeepalive();
        settled = true;
        resolve();
      };

      const onMessage = (data) => {
        this.lastMessageAt = Date.now();
        this.failedAttempts = 0;
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
      // No 'pong' â€” Rust doesn't send ws control frames
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

    this.failedAttempts += 1;

    if (this.failedAttempts >= 3) {
      const now = Date.now();
      const silence = this.lastMessageAt ? now - this.lastMessageAt : null;
      let delay = this.hardBackoffMs;

      if (silence != null) {
        delay = silence >= this.hardBackoffMs ? 0 : this.hardBackoffMs - silence;
      }

      if (delay > 0) {
        this.hardBackoffUntil = now + delay;
        this.emit('rcon_error', new Error('Maximum reconnect attempts reached; backing off.'));
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.failedAttempts = 0;
          this._scheduleReconnect();
        }, delay);
        return;
      }

      this.failedAttempts = 0;
      this.hardBackoffUntil = 0;
    }

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

  _remainingHardBackoff() {
    if (!this.hardBackoffUntil) return 0;
    const now = Date.now();
    if (now >= this.hardBackoffUntil) {
      this.hardBackoffUntil = 0;
      return 0;
    }
    return this.hardBackoffUntil - now;
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
    const rawMessage = obj?.Message;
    const messageText = typeof rawMessage === 'string'
      ? rawMessage
      : (rawMessage == null ? '' : (() => {
        try { return JSON.stringify(rawMessage); }
        catch { return String(rawMessage); }
      })());

    if (!t && messageText) {
      this.emit('console', messageText, obj);
      return;
    }

    if (t.includes('chat')) {
      this.emit('chat', messageText || rawMessage, obj);
    } else if (
      t.includes('generic') ||
      t.includes('log') ||
      t.includes('console') ||
      t.includes('f7')
    ) {
      this.emit('console', messageText, obj);
    } else {
      this.emit('event', obj);
    }
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

function normalizeClientOptions(row) {
  const host = typeof row?.host === 'string' ? row.host.trim() : '';
  const port = Number.parseInt(row?.port, 10);

  let password = row?.password ?? '';
  if (typeof password !== 'string') password = String(password);
  try { password = decodeURIComponent(password); }
  catch { /* ignore */ }

  return {
    host,
    port: Number.isFinite(port) ? port : undefined,
    password,
    tls: !!row?.tls,
  };
}

function clientSignature(options) {
  const port = Number.isFinite(options?.port) ? Number(options.port) : null;
  return JSON.stringify({
    host: options?.host || '',
    port,
    tls: !!options?.tls,
    password: options?.password || '',
  });
}

function teardownClient(key, client) {
  if (!client) return;
  clientMap.delete(key);
  try {
    const arr = activeSubs.get(key) || [];
    for (const fn of arr) {
      try { fn(); } catch { /* ignore */ }
    }
    activeSubs.delete(key);
  } catch { /* ignore */ }

  try {
    const result = client.close?.();
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  } catch { /* ignore */ }
}

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
  const options = normalizeClientOptions(row);
  const signature = clientSignature(options);

  const existing = clientMap.get(key);
  if (existing) {
    if (existing.__configSignature === signature) {
      return existing;
    }
    teardownClient(key, existing);
  }

  const { host, port, password, tls } = options;
  if (!host || !password) throw new Error('RustWebRcon: host and password are required.');

  const client = new RustWebRcon({
    host,
    port,
    password,
    tls,
    heartbeatIntervalMs: 20000,
    keepaliveIdleMs: 20000,
  });
  client.__configSignature = signature;

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

function parseWorldSizeMessage(message) {
  const text = typeof message === 'string' ? message : String(message ?? '');
  const trimmed = text.trim();
  if (!trimmed) return null;
  const explicit = trimmed.match(/world\s*size\s*[:=]\s*([\d,_'\s]+)/i)
    || trimmed.match(/worldsize\s*[:=]\s*([\d,_'\s]+)/i);
  const parsed = explicit ? extractInteger(explicit[1]) : extractInteger(trimmed);
  if (parsed == null || Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseWorldSeedMessage(message) {
  const text = typeof message === 'string' ? message : String(message ?? '');
  const trimmed = text.trim();
  if (!trimmed) return null;
  const explicit = trimmed.match(/seed\s*[:=]\s*([-\d,_'\s]+)/i)
    || trimmed.match(/world\s*seed\s*[:=]\s*([-\d,_'\s]+)/i);
  const parsed = explicit ? extractInteger(explicit[1]) : extractInteger(trimmed);
  if (parsed == null || Number.isNaN(parsed)) return null;
  return parsed;
}

export async function fetchWorldSize(row, options = {}) {
  const commandOptions = { ...options };
  if (typeof commandOptions.silent === 'undefined') commandOptions.silent = true;
  const reply = await sendRconCommand(row, 'server.worldsize', commandOptions);
  const message = reply?.Message ?? reply?.message ?? '';
  const size = parseWorldSizeMessage(message);
  return Number.isFinite(size) ? size : null;
}

export async function fetchWorldSeed(row, options = {}) {
  const commandOptions = { ...options };
  if (typeof commandOptions.silent === 'undefined') commandOptions.silent = true;
  const reply = await sendRconCommand(row, 'server.seed', commandOptions);
  const message = reply?.Message ?? reply?.message ?? '';
  const seed = parseWorldSeedMessage(message);
  return Number.isFinite(seed) ? seed : null;
}

export async function fetchWorldSettings(row, options = {}) {
  const result = { size: null, seed: null };
  try {
    const size = await fetchWorldSize(row, options);
    if (Number.isFinite(size) && size > 0) result.size = size;
  } catch {}
  try {
    const seed = await fetchWorldSeed(row, options);
    if (Number.isFinite(seed)) result.seed = seed;
  } catch {}
  return result;
}

export async function fetchServerInfo(row, options = {}) {
  const commandOptions = { ...options };
  if (typeof commandOptions.silent === 'undefined') commandOptions.silent = true;
  const reply = await sendRconCommand(row, 'serverinfo', commandOptions);
  const message = reply?.Message ?? reply?.message ?? '';
  return parseServerInfoMessage(message);
}

export async function fetchLevelUrl(row, options = {}) {
  const commandOptions = { ...options };
  if (typeof commandOptions.silent === 'undefined') commandOptions.silent = true;
  const reply = await sendRconCommand(row, 'levelurl', commandOptions);
  const message = reply?.Message ?? reply?.message ?? '';
  return parseLevelUrlMessage(message);
}

export function closeRcon(id) {
  const key = toServerKey(id);
  const client = clientMap.get(key);
  if (!client) return;
  teardownClient(key, client);
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

// ===== Auto-monitor (optional, lightweight) ==================================
// Public API:
//   startAutoMonitor(servers, options?)
//   updateAutoMonitor(servers)
//   stopAutoMonitor()
// Events emitted on `bridge` (and scoped variants):
//   'monitor_tick', 'monitor_status', 'monitor_error'

const _monitor = {
  running: false,
  servers: new Map(), // id -> row
  timers: new Map(),  // id -> NodeJS.Timer
  subs: new Map(),    // id -> unsubscribe()
  inflight: new Set(),// ids currently polling (prevent overlap)
  backoff: new Map(), // id -> ms
  opts: {
    intervalMs: 30000,
    commands: ['status'],     // order matters; run sequentially
    timeoutMs: 8000,
    maxBackoffMs: 5 * 60 * 1000,
  }
};

function _normalizeRows(list) {
  const out = new Map();
  for (const row of list || []) {
    const id = Number(row?.id ?? row?.server_id ?? row?.serverId);
    if (Number.isFinite(id)) out.set(id, row);
  }
  return out;
}

function _clearTimer(id) {
  const t = _monitor.timers.get(id);
  if (t) {
    clearTimeout(t);
    _monitor.timers.delete(id);
  }
}

function _unsubscribe(id) {
  const u = _monitor.subs.get(id);
  if (u) {
    try { u(); } catch {}
    _monitor.subs.delete(id);
  }
}

function _nextDelay(id) {
  const cur = _monitor.backoff.get(id) || _monitor.opts.intervalMs;
  const next = Math.min(
    cur === _monitor.opts.intervalMs ? _monitor.opts.intervalMs * 2 : Math.ceil(cur * 1.8),
    _monitor.opts.maxBackoffMs
  );
  _monitor.backoff.set(id, next);
  return next;
}

function _resetBackoff(id) {
  _monitor.backoff.set(id, _monitor.opts.intervalMs);
}

function _schedule(id, delayMs) {
  _clearTimer(id);
  const d = Math.max(1000, Number(delayMs) || _monitor.opts.intervalMs);
  const timer = setTimeout(() => _pollOnce(id).catch(() => {}), d);
  if (timer.unref) timer.unref();
  _monitor.timers.set(id, timer);
}

async function _ensureBinding(row) {
  const id = Number(row.id ?? row.server_id ?? row.serverId);
  // connect & ensure single subscription (replace=true by default)
  const client = ensureClient(row);
  if (!_monitor.subs.has(id)) {
    const unsub = subscribeToRcon(id, {
      rcon_error: (err) => emitScoped('monitor_error', id, err),
      close: () => emitScoped('monitor_error', id, new Error('connection_closed')),
    }, { replace: false });
    _monitor.subs.set(id, unsub);
  }
  await client.ensure();
}

async function _pollOnce(id) {
  if (!_monitor.running) return;
  const row = _monitor.servers.get(id);
  if (!row) return;

  if (_monitor.inflight.has(id)) {
    // A poll is already running; try again next tick
    _schedule(id, _monitor.opts.intervalMs);
    return;
  }

  _monitor.inflight.add(id);
  emitScoped('monitor_tick', id, Date.now());

  try {
    await _ensureBinding(row);

    const start = Date.now();
    const replies = [];
    let lastReply = null;

    // Run commands sequentially to avoid inflight overflow
    for (const cmd of _monitor.opts.commands) {
      try {
        const reply = await sendRconCommand(row, cmd, { timeoutMs: _monitor.opts.timeoutMs });
        replies.push({ command: String(cmd || ''), reply });
        lastReply = reply;
      } catch (e) {
        // single command failed â€” escalate as monitor error and backoff
        emitScoped('monitor_error', id, e);
        const delay = _nextDelay(id);
        _monitor.inflight.delete(id);
        _schedule(id, delay);
        return;
      }
    }

    const latency = Date.now() - start;
    emitScoped('monitor_status', id, { ok: true, latency, reply: lastReply, replies });
    _resetBackoff(id);
    _monitor.inflight.delete(id);
    _schedule(id, _monitor.opts.intervalMs);
  } catch (e) {
    emitScoped('monitor_error', id, e);
    _monitor.inflight.delete(id);
    const delay = _nextDelay(id);
    _schedule(id, delay);
  }
}

export function startAutoMonitor(servers, options = {}) {
  // merge options
  _monitor.opts = {
    ..._monitor.opts,
    ...options,
    intervalMs: Math.max(2000, Number(options.intervalMs ?? _monitor.opts.intervalMs)),
    timeoutMs: Math.max(1000, Number(options.timeoutMs ?? _monitor.opts.timeoutMs)),
  };

  // reset state
  stopAutoMonitor(false);

  _monitor.servers = _normalizeRows(servers);
  _monitor.running = true;

  // seed backoff
  for (const id of _monitor.servers.keys()) {
    _monitor.backoff.set(id, _monitor.opts.intervalMs);
    _schedule(id, Math.floor(Math.random() * 1500)); // jittered initial start
  }

  return {
    stop: () => stopAutoMonitor(),
    update: (svrs) => updateAutoMonitor(svrs),
  };
}

export function updateAutoMonitor(servers) {
  if (!_monitor.running) return;
  const next = _normalizeRows(servers);

  // stop removed servers
  for (const id of [..._monitor.servers.keys()]) {
    if (!next.has(id)) {
      _clearTimer(id);
      _unsubscribe(id);
      _monitor.inflight.delete(id);
      _monitor.backoff.delete(id);
      _monitor.servers.delete(id);
    }
  }

  // add new / update existing
  for (const [id, row] of next.entries()) {
    _monitor.servers.set(id, row); // update row
    if (!_monitor.timers.has(id)) {
      _monitor.backoff.set(id, _monitor.opts.intervalMs);
      _schedule(id, Math.floor(Math.random() * 1500));
    }
  }
}

export function stopAutoMonitor(resetState = true) {
  _monitor.running = false;
  for (const id of _monitor.timers.keys()) _clearTimer(id);
  for (const id of _monitor.subs.keys()) _unsubscribe(id);
  _monitor.inflight.clear();
  if (resetState) {
    _monitor.timers.clear();
    _monitor.subs.clear();
    _monitor.servers.clear();
    _monitor.backoff.clear();
  }
  return true;
}

// Optional: expose the bridge so callers can listen from outside this module.
export { bridge as rconEventBus };
