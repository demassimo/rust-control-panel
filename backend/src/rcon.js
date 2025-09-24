// rcon.js — WebRCON client with central management (ESM, Node 18+)
import WebSocket from 'ws';
import EventEmitter from 'events';

function normalizeEndpoint({ host, port, tls }) {
  const rawHost = typeof host === 'string' ? host.trim() : '';
  if (!rawHost) throw new Error('RustWebRcon: host is required.');

  let resolvedHost = rawHost;
  let resolvedPort = Number.parseInt(port, 10);
  let useTls = !!tls;

  const ensureScheme = (value, scheme) =>
    (/^[a-z]+:\/\//i.test(value) ? value : `${scheme}//${value}`);
  const tryParseUrl = (value) => {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  };

  const scheme = useTls ? 'wss://' : 'ws://';
  let parsed = tryParseUrl(ensureScheme(resolvedHost, scheme));
  if (
    !parsed &&
    resolvedHost.includes(':') &&
    !resolvedHost.includes('[') &&
    !resolvedHost.includes('//')
  ) {
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

class RustWebRcon extends EventEmitter {
  constructor({
    host,
    port,
    password,
    tls = false,
    heartbeatIntervalMs = 20000,
    pongTimeoutMs = 12000,
    commandTimeoutMs = 10000,
    maxInFlight = 64,
    reconnectDelayMs = 3000,
  }) {
    super();
    if (!password) {
      throw new Error('RustWebRcon: password is required.');
    }

    const normalized = normalizeEndpoint({ host, port, tls });
    this.host = normalized.host;
    this.port = normalized.port;
    this.tls = normalized.tls;
    this.password = password;

    this.ws = null;
    this.connected = false;
    this.manualClose = false;

    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.pongTimeoutMs = pongTimeoutMs;
    this.commandTimeoutMs = commandTimeoutMs;
    this.maxInFlight = Math.max(1, maxInFlight);
    this.reconnectDelayMs = Math.max(500, reconnectDelayMs);

    this.heartbeatInterval = null;
    this.pongTimer = null;
    this.reconnectTimer = null;

    this.nextId = 1;
    this.pending = new Map();
  }

  get url() {
    const proto = this.tls ? 'wss' : 'ws';
    const host =
      this.host.includes(':') && !this.host.startsWith('[')
        ? `[${this.host}]`
        : this.host;
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
        this.emit('open');
        this._startHeartbeat();
        settled = true;
        resolve();
      };

      const onMessage = (data) => {
        const text = data?.toString?.() ?? String(data);
        let obj = null;
        try {
          obj = JSON.parse(text);
        } catch {}
        if (obj) {
          this.emit('message', obj);
          this._routeTyped(obj);
          const id = Number(obj.Identifier);
          if (Number.isFinite(id) && this.pending.has(id)) {
            const p = this.pending.get(id);
            this.pending.delete(id);
            clearTimeout(p.timeout);
            p.resolve(obj);
          }
        } else {
          this.emit('raw', text);
        }
      };

      const onError = (err) => {
        this.emit('rcon_error', err); // patched event
        if (!settled) {
          settled = true;
          reject(err);
        }
        try {
          this.ws?.close();
        } catch {}
      };

      const onClose = () => {
        this.connected = false;
        this._stopHeartbeat();
        this._rejectAll(new Error('RCON connection closed'));
        this.emit('close');
        if (!settled) {
          settled = true;
          reject(new Error('RCON connection closed'));
        }
        this.ws = null;
        if (!this.manualClose) this._scheduleReconnect();
      };

      const onPong = () => this._clearPongTimer();

      this.ws.on('open', onOpen);
      this.ws.on('message', onMessage);
      this.ws.on('error', onError);
      this.ws.on('close', onClose);
      this.ws.on('pong', onPong);
    });
  }

  async ensure() {
    if (!this.connected) await this.connect();
  }

  async command(cmd, { timeoutMs } = {}) {
    await this.ensure();
    if (this.pending.size >= this.maxInFlight) {
      throw new Error(
        `Too many in-flight RCON requests (${this.pending.size}/${this.maxInFlight}).`,
      );
    }
    const id = this.nextId++;
    const payload = JSON.stringify({
      Identifier: id,
      Message: String(cmd ?? ''),
      Name: 'WebRcon',
    });
    const to = Math.max(500, timeoutMs ?? this.commandTimeoutMs);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RCON timeout after ${to}ms for: ${cmd}`));
      }, to);
      this.pending.set(id, { resolve, reject, timeout });

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
    this._stopHeartbeat();
    try {
      this.ws?.close();
    } catch {}
    this.connected = false;
    this._rejectAll(new Error('RCON connection closed'));
    this.ws = null;
  }

  // ---------- internals ----------

  _startHeartbeat() {
    this._stopHeartbeat();
    if (!this.ws) return;

    const pingOnce = () => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.ws.ping();
        this._armPongTimer();
      } catch (e) {
        this.emit('rcon_error', e);
        try {
          this.ws.close();
        } catch {}
      }
    };

    this.heartbeatInterval = setInterval(pingOnce, this.heartbeatIntervalMs);
    setTimeout(pingOnce, 500);
  }

  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this._clearPongTimer();
  }

  _armPongTimer() {
    this._clearPongTimer();
    this.pongTimer = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.emit('rcon_error', new Error('Heartbeat missed pong; reconnecting.'));
        try {
          this.ws.terminate?.();
        } catch {
          try {
            this.ws.close();
          } catch {}
        }
      }
    }, this.pongTimeoutMs);
  }

  _clearPongTimer() {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
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
    else if (t.includes('generic') || t.includes('log') || t.includes('console'))
      this.emit('console', msg, obj);
    else this.emit('event', obj);
  }
}

const clientMap = new Map();
const bridge = new EventEmitter();

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
  bridge.emit(event, key, ...args);
  bridge.emit(`${event}:${key}`, ...args);
}

function attachClientEvents(key, client) {
  client.on('open', () => emitScoped('open', key));
  client.on('reconnect', () => emitScoped('reconnect', key));
  client.on('message', (message) => emitScoped('message', key, message));
  client.on('console', (line, payload) =>
    emitScoped('console', key, line, payload),
  );
  client.on('chat', (line, payload) => emitScoped('chat', key, line, payload));
  client.on('event', (payload) => emitScoped('event', key, payload));
  client.on('raw', (text) => emitScoped('raw', key, text));
  client.on('rcon_error', (err) => emitScoped('rcon_error', key, err)); // patched
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
  const client = new RustWebRcon({ host, port, password, tls });
  attachClientEvents(key, client);
  clientMap.set(key, client);
  return client;
}

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
  client.close().catch(() => {});
}

export function subscribeToRcon(id, handlers = {}) {
  const key = toServerKey(id);
  const mapping = [
    ['open', handlers.open],
    ['reconnect', handlers.reconnect],
    ['message', handlers.message],
    ['console', handlers.console],
    ['chat', handlers.chat],
    ['event', handlers.event],
    ['raw', handlers.raw],
    ['rcon_error', handlers.rcon_error], // patched
    ['close', handlers.close],
  ];
  const unsubs = [];
  for (const [event, handler] of mapping) {
    if (typeof handler !== 'function') continue;
    const wrapped = (...args) => handler(...args);
    bridge.on(`${event}:${key}`, wrapped);
    unsubs.push(() => bridge.off(`${event}:${key}`, wrapped));
  }
  return () => {
    while (unsubs.length) {
      const fn = unsubs.pop();
      try {
        fn();
      } catch {}
    }
  };
}

export function activeRconIds() {
  return [...clientMap.keys()];
}

export { RustWebRcon };
