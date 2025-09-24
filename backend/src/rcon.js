// rcon.js — minimal WebRCON client (ESM, Node 18+)
import WebSocket from 'ws';
import EventEmitter from 'events';

export default class RustWebRcon extends EventEmitter {
  constructor({
    host,
    port,
    password,
    tls = false,              // true for wss://, false for ws://
    heartbeatIntervalMs = 20000,
    pongTimeoutMs = 12000,
    commandTimeoutMs = 10000,
    maxInFlight = 64,
    reconnectDelayMs = 3000,  // fixed delay (no backoff)
  }) {
    super();
    if (!host || !port || !password) {
      throw new Error('RustWebRcon: host, port, and password are required.');
    }
    this.host = host;
    this.port = port;
    this.password = password;
    this.tls = !!tls;

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
    this.pending = new Map(); // id -> {resolve,reject,timeout}
  }

  get url() {
    const proto = this.tls ? 'wss' : 'ws';
    const host = (this.host.includes(':') && !this.host.startsWith('[')) ? `[${this.host}]` : this.host; // IPv6-safe
    return `${proto}://${host}:${this.port}/${encodeURIComponent(this.password)}/`;
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
        try { obj = JSON.parse(text); } catch {}
        if (obj) {
          this.emit('message', obj);
          this._routeTyped(obj);
          const id = obj.Identifier;
          if (typeof id === 'number' && this.pending.has(id)) {
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
        this.emit('error', err);
        if (!settled) {
          settled = true;
          reject(err);
        }
        try { this.ws?.close(); } catch {}
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
      throw new Error(`Too many in-flight RCON requests (${this.pending.size}/${this.maxInFlight}).`);
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ Identifier: id, Message: String(cmd ?? ''), Name: 'WebRcon' });
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
    try { this.ws?.close(); } catch {}
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
        this.emit('error', e);
        try { this.ws.close(); } catch {}
      }
    };

    this.heartbeatInterval = setInterval(pingOnce, this.heartbeatIntervalMs);
    setTimeout(pingOnce, 500); // kick early
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
        this.emit('error', new Error('Heartbeat missed pong; reconnecting.'));
        try { this.ws.terminate?.(); } catch { try { this.ws.close(); } catch {} }
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
        this.emit('error', e);
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
