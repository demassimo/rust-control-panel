// rcon.js - WebRCON client (ESM)
// Node 18+
// Usage (behind reverse proxy w/ TLS):
//   const rcon = new RustWebRcon({ host: 'panel.example.com', port: 443, password: '***', tls: 'auto', basePath: '/rcon', origin: 'https://panel.example.com', tlsInsecure: false });

import WebSocket from 'ws';
import EventEmitter from 'events';

export default class RustWebRcon extends EventEmitter {
  constructor({
    host,
    port,
    password,

    // TLS: true|false|"auto"
    tls = false,

    // Reverse proxy / CDN helpers:
    basePath = '',           // e.g. '/rcon' if your proxy maps /rcon/<password>/
    origin = null,           // e.g. 'https://panel.example.com' for strict proxies/CDNs
    tlsInsecure = false,     // convenient switch for self-signed proxy certs (maps to wsOptions.rejectUnauthorized=false)

    // Reliability tuning:
    reconnectDelayMs = 1000,
    maxReconnectDelayMs = 15000,
    backoffFactor = 1.8,
    jitterRatio = 0.3,
    heartbeatIntervalMs = 20000,
    pongTimeoutMs = 12000,
    commandTimeoutMs = 10000,
    maxInFlight = 64,

    // Extra ws options (agent, headers, etc.). Will be merged with internal ones.
    wsOptions = {},
  }) {
    super();

    if (!host || !port || !password) {
      throw new Error('RustWebRcon: host, port, and password are required.');
    }

    this.host = host;
    this.port = port;
    this.password = password;

    // Reverse-proxy options
    this.basePath = String(basePath || '');
    this.origin = origin ? String(origin) : null;

    // TLS config
    this.configuredTls = (typeof tls === 'string' && tls.toLowerCase() === 'auto') ? null : !!tls;
    this.usingTls = this.configuredTls ?? false;
    this.autoTlsEnabled = false;
    this.tlsInsecure = !!tlsInsecure;

    // Timers / state
    this.ws = null;
    this.connected = false;
    this.manualClose = false;
    this.connectPromise = null;

    // Backoff
    this.baseReconnectDelayMs = Math.max(100, reconnectDelayMs);
    this.maxReconnectDelayMs = Math.max(this.baseReconnectDelayMs, maxReconnectDelayMs);
    this.backoffFactor = Math.max(1.0, backoffFactor);
    this.jitterRatio = Math.min(Math.max(jitterRatio, 0), 1);
    this.currentDelay = this.baseReconnectDelayMs;
    this.nextReconnectDelayOverride = null;
    this.reconnectTimer = null;

    // Heartbeat
    this.heartbeatIntervalMs = Math.max(1000, heartbeatIntervalMs);
    this.pongTimeoutMs = Math.max(2000, pongTimeoutMs);
    this.heartbeatInterval = null;
    this.pongTimer = null;
    this.lastPong = 0;

    // Commands
    this.nextId = 1;
    this.pending = new Map();
    this.maxInFlight = Math.max(1, maxInFlight);
    this.defaultCommandTimeoutMs = Math.max(1000, commandTimeoutMs);

    // ws options (merged later)
    this.wsOptions = { ...wsOptions };

    // For debugging
    this.lastUrl = '';
  }

  // ---- Public API ----------------------------------------------------------

  get url() {
    const proto = this.usingTls ? 'wss' : 'ws';
    const host = this.isIpv6Literal(this.host) ? `[${this.host}]` : this.host;

    // Normalize basePath: '', or '/rcon' -> '/rcon'
    const base = this.basePath ? (this.basePath.startsWith('/') ? this.basePath : `/${this.basePath}`) : '';

    // WebRCON requires '/<password>/' at the END; basePath sits before it when proxied.
    const tail = `/${encodeURIComponent(this.password)}/`;

    const url = `${proto}://${host}:${this.port}${base}${tail}`;
    this.lastUrl = url;
    return url;
  }

  async connect() {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) return this.connectPromise;

    this.manualClose = false;
    this.clearReconnectTimer();

    let tlsFlipAttempts = 0;

    const attempt = async () => {
      const promise = this.createConnectionPromise();
      this.connectPromise = promise;
      try {
        await promise;
        this.currentDelay = this.baseReconnectDelayMs; // reset backoff
        return;
      } catch (err) {
        if (this.shouldRetryAfterTlsChange(err) && tlsFlipAttempts < 2) {
          tlsFlipAttempts += 1;
          return attempt();
        }
        throw err;
      } finally {
        if (this.connectPromise === promise) this.connectPromise = null;
      }
    };

    return attempt();
  }

  async ensure() {
    if (!this.connected) await this.connect();
  }

  /**
   * Resolve once socket is open and a basic command succeeds.
   * Helpful when you want "fully ready" before wiring UI.
   */
  async waitUntilReady(timeoutMs = 15000) {
    const start = Date.now();
    if (!this.connected) await this.connect();
    while (true) {
      try {
        await this.getServerInfo({ timeoutMs: 4000 });
        return;
      } catch (e) {
        if (Date.now() - start > timeoutMs) throw new Error('waitUntilReady timed out');
        await this.sleep(300);
      }
    }
  }

  async command(cmd, opts = {}) {
    await this.ensure();

    if (this.pending.size >= this.maxInFlight) {
      throw new Error(`Too many in-flight RCON requests (${this.pending.size}/${this.maxInFlight}).`);
    }

    const id = this.nextId++;
    const payload = JSON.stringify({ Identifier: id, Message: String(cmd ?? ''), Name: 'WebRcon' });
    const timeoutMs = Math.max(500, Number(opts.timeoutMs ?? this.defaultCommandTimeoutMs));

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RCON timeout after ${timeoutMs}ms for: ${cmd}`));
      }, timeoutMs);

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

  async sendRaw(obj, opts = {}) {
    await this.ensure();
    const id = this.nextId++;
    const payload = JSON.stringify({ Identifier: id, ...obj });
    const timeoutMs = Math.max(500, Number(opts.timeoutMs ?? this.defaultCommandTimeoutMs));

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RCON timeout after ${timeoutMs}ms for raw payload`));
      }, timeoutMs);

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
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.clearPongTimer();
    try { this.ws?.close(); } catch {}
    this.connected = false;
    this.rejectPending(new Error('RCON connection closed'));
    this.ws = null;
    this.resetTlsState();
  }

  async destroy() {
    await this.close();
    this.removeAllListeners();
  }

  // ---- Internal connection management -------------------------------------

  createConnectionPromise() {
    const headers = { ...(this.wsOptions.headers || {}) };
    if (this.origin && !headers.Origin) headers.Origin = this.origin;

    const mergedWsOptions = {
      ...this.wsOptions,
      headers,
    };

    // tlsInsecure => wsOptions.rejectUnauthorized:false
    if (this.tlsInsecure) {
      mergedWsOptions.rejectUnauthorized = false;
    }

    const ws = new WebSocket(this.url, mergedWsOptions);
    this.ws = ws;

    return new Promise((resolve, reject) => {
      const remove = (event, handler) => {
        if (typeof ws.off === 'function') ws.off(event, handler);
        else if (typeof ws.removeListener === 'function') ws.removeListener(event, handler);
        else if (typeof ws.removeEventListener === 'function') ws.removeEventListener(event, handler);
      };

      const cleanup = () => {
        remove('open', handleOpen);
        remove('message', handleMessage);
        remove('error', handleError);
        remove('close', handleClose);
        remove('pong', handlePong);
      };

      let settled = false;

      const handleOpen = () => {
        this.connected = true;
        this.emit('open');
        this.startHeartbeat();
        settled = true;
        resolve();
      };

      const handleMessage = (data) => {
        const text = data?.toString?.() ?? String(data);
        const parsed = this.safeJson(text);
        if (parsed) {
          this.emit('message', parsed);
          this.routeTypedEvents(parsed);
          const ident = parsed.Identifier;
          if (typeof ident === 'number' && this.pending.has(ident)) {
            const pending = this.pending.get(ident);
            this.pending.delete(ident);
            clearTimeout(pending.timeout);
            pending.resolve(parsed);
          }
        } else {
          this.emit('raw', text);
        }
      };

      const handleError = (err) => {
        const decorated = this.handleTlsMismatch(err) ?? err;
        if (!settled) {
          settled = true;
          cleanup();
          reject(decorated);
        }
        this.emit('error', decorated);
        if (ws.readyState !== WebSocket.CLOSING && ws.readyState !== WebSocket.CLOSED) {
          try { ws.close(); } catch {}
        }
      };

      const handleClose = () => {
        this.connected = false;
        this.stopHeartbeat();
        this.clearPongTimer();
        this.rejectPending(new Error('RCON connection closed'));
        cleanup();
        if (!settled) {
          settled = true;
          reject(new Error('RCON connection closed'));
        }
        this.emit('close');
        this.ws = null;
        if (!this.manualClose) this.scheduleReconnect();
      };

      const handlePong = () => {
        this.lastPong = Date.now();
        this.clearPongTimer();
      };

      ws.on('open', handleOpen);
      ws.on('message', handleMessage);
      ws.on('error', handleError);
      ws.on('close', handleClose);
      ws.on('pong', handlePong);
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    if (!this.ws) return;
    this.lastPong = Date.now();

    const pingOnce = () => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.ws.ping();
        this.armPongTimer();
      } catch (err) {
        this.emit('error', err);
        try { this.ws.close(); } catch {}
      }
    };

    this.heartbeatInterval = setInterval(pingOnce, this.heartbeatIntervalMs);
    setTimeout(pingOnce, 500);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  armPongTimer() {
    this.clearPongTimer();
    this.pongTimer = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.emit('error', new Error('WebRCON heartbeat missed pong; reconnecting.'));
        try { this.ws.terminate?.(); } catch { try { this.ws.close(); } catch {} }
      }
    }, this.pongTimeoutMs);
  }

  clearPongTimer() {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.manualClose) return;

    const base = (typeof this.nextReconnectDelayOverride === 'number')
      ? this.nextReconnectDelayOverride
      : this.currentDelay;

    this.nextReconnectDelayOverride = null;

    const jitter = base * this.jitterRatio;
    const delay = Math.max(200, Math.floor(base + (Math.random() * 2 - 1) * jitter));

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.manualClose) return;
      try {
        await this.connect();
        this.emit('reconnect');
      } catch (err) {
        this.emit('error', err);
        this.currentDelay = Math.min(
          Math.floor(this.currentDelay * this.backoffFactor),
          this.maxReconnectDelayMs
        );
        this.scheduleReconnect();
      }
    }, delay);
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ---- TLS auto-detect helpers --------------------------------------------

  handleTlsMismatch(err) {
    if (!err) return null;
    const message = err?.message || '';

    // Upgrade to TLS if server expects TLS but we tried plain:
    if (this.shouldUpgradeToTls(message)) {
      this.usingTls = true;
      this.autoTlsEnabled = true;
      this.nextReconnectDelayOverride = Math.min(500, this.baseReconnectDelayMs);
      const friendly = new Error('Rust WebRCON appears to require TLS; retrying with a secure WebSocket connection.');
      friendly.code = 'web_rcon_tls_upgrade';
      friendly.cause = err;
      return friendly;
    }

    // Downgrade if TLS handshake clearly failed after an auto-upgrade:
    if (this.shouldDowngradeFromTls(err)) {
      this.usingTls = this.configuredTls ?? false;
      this.autoTlsEnabled = false;
      this.nextReconnectDelayOverride = Math.min(500, this.baseReconnectDelayMs);
      const friendly = new Error('Rust WebRCON rejected the TLS handshake; falling back to an unsecured WebSocket.');
      friendly.code = 'web_rcon_tls_downgrade';
      friendly.cause = err;
      return friendly;
    }

    // Generic hint:
    if (this.isTlsMismatchHint(err)) {
      const friendly = new Error('Rust WebRCON connection failed; verify the TLS setting matches the server configuration.');
      friendly.code = 'web_rcon_tls_mismatch';
      friendly.cause = err;
      return friendly;
    }

    return null;
  }

  shouldUpgradeToTls(message) {
    if (this.usingTls) return false;
    if (this.configuredTls === true) return false; // already forced TLS
    if (this.autoTlsEnabled) return false;
    return /Expected HTTP\/, RTSP\/ or ICE\//i.test(message || '');
  }

  shouldDowngradeFromTls(err) {
    if (!this.usingTls) return false;
    if (!this.autoTlsEnabled) return false;
    const message = err?.message?.toLowerCase?.() || '';
    const code = err?.code;
    if (code === 'ERR_SSL_WRONG_VERSION_NUMBER' || code === 'ERR_SSL_UNKNOWN_PROTOCOL') return true;
    if (code === 'EPROTO' || code === 'ECONNRESET') {
      return message.includes('wrong version number') ||
             message.includes('unknown protocol') ||
             message.includes('unexpected message');
    }
    return false;
  }

  isTlsMismatchHint(err) {
    if (!err) return false;
    const message = err?.message || '';
    if (!message) return false;
    if (/self signed certificate/i.test(message)) return true;
    if (/unable to verify the first certificate/i.test(message)) return true;
    if (/certificate/i.test(message) && this.usingTls) return true;
    if (/Expected HTTP\/, RTSP\/ or ICE\//i.test(message)) return true;
    return false;
  }

  resetTlsState() {
    this.usingTls = this.configuredTls ?? false;
    this.autoTlsEnabled = false;
    this.nextReconnectDelayOverride = null;
  }

  shouldRetryAfterTlsChange(err) {
    if (!err) return false;
    const code = err?.code;
    return code === 'web_rcon_tls_upgrade' || code === 'web_rcon_tls_downgrade';
  }

  // ---- Helpers -------------------------------------------------------------

  rejectPending(error) {
    if (this.pending.size === 0) return;
    for (const [, p] of this.pending.entries()) {
      clearTimeout(p.timeout);
      p.reject(error);
    }
    this.pending.clear();
  }

  safeJson(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  routeTypedEvents(obj) {
    const t = String(obj?.Type ?? '').toLowerCase();
    const msg = obj?.Message ?? '';
    if (!t && typeof msg === 'string') {
      this.emit('console', msg);
      return;
    }
    if (t.includes('chat')) {
      this.emit('chat', msg, obj);
    } else if (t.includes('generic') || t.includes('log') || t.includes('console')) {
      this.emit('console', msg, obj);
    } else {
      this.emit('event', obj);
    }
  }

  async getServerInfo(opts) { return this.command('serverinfo', opts); }
  async status(opts) { return this.command('status', opts); }
  async players(opts) { return this.command('global.players', opts); }

  // Tiny utils
  isIpv6Literal(h) { return h && h.includes(':') && !h.startsWith('['); }
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}
