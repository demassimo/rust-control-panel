import WebSocket from 'ws';
import EventEmitter from 'events';

export default class RustWebRcon extends EventEmitter {
  constructor({
    host,
    port,
    password,
    tls = false,                  // true|false|"auto"
    // Reliability tuning:
    reconnectDelayMs = 1000,      // initial backoff (ms)
    maxReconnectDelayMs = 15000,  // cap for backoff (ms)
    backoffFactor = 1.8,          // exponential factor
    jitterRatio = 0.3,            // add +/- jitter to delays
    heartbeatIntervalMs = 20000,  // ws.ping interval
    pongTimeoutMs = 12000,        // time to wait after ping before declaring dead
    commandTimeoutMs = 10000,     // default per-command timeout
    maxInFlight = 64,             // safety cap for pending requests
    // Pass-through for TLS/WS options (e.g., { rejectUnauthorized:false }):
    wsOptions = {},
  }) {
    super();

    if (!host || !port || !password) {
      throw new Error('RustWebRcon: host, port, and password are required.');
    }

    this.host = host;
    this.port = port;
    this.password = password;

    // TLS configuration: true/false explicitly, or "auto" to probe.
    this.configuredTls = (typeof tls === 'string' && tls.toLowerCase() === 'auto') ? null : !!tls;
    this.usingTls = this.configuredTls ?? false;
    this.autoTlsEnabled = false;

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
    this.pending = new Map(); // id -> {resolve,reject,timeout}
    this.maxInFlight = Math.max(1, maxInFlight);
    this.defaultCommandTimeoutMs = Math.max(1000, commandTimeoutMs);

    // Options to pass to ws ctor (e.g., TLS agent, rejectUnauthorized, headers)
    this.wsOptions = wsOptions;
  }

  // ---- Public API ----------------------------------------------------------

  get url() {
    const proto = this.usingTls ? 'wss' : 'ws';
    return `${proto}://${this.host}:${this.port}/${encodeURIComponent(this.password)}/`;
  }

  async connect() {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) return this.connectPromise;

    this.manualClose = false;
    this.clearReconnectTimer();

    // Try a few times if we detect TLS mismatch and flip mode.
    let tlsFlipAttempts = 0;

    const attempt = async () => {
      const promise = this.createConnectionPromise();
      this.connectPromise = promise;
      try {
        await promise;
        // Reset backoff on successful connect.
        this.currentDelay = this.baseReconnectDelayMs;
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
   * Send a Rust RCON command.
   * @param {string} cmd
   * @param {{timeoutMs?:number}} opts
   * @returns {Promise<object>} Raw WebRCON reply object
   */
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

  /**
   * Send a raw payload (advanced use).
   */
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

  /**
   * Gracefully close and stop all timers.
   */
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

  /**
   * Hard destroy (no reconnects, clears listeners).
   */
  async destroy() {
    await this.close();
    this.removeAllListeners();
  }

  // ---- Internal connection management -------------------------------------

  createConnectionPromise() {
    const ws = new WebSocket(this.url, this.wsOptions);
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
          // Sometimes the server can send non-JSON lines (rare). Expose them.
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

  // Send ws.ping on interval and expect a timely pong. If not, drop & reconnect.
  startHeartbeat() {
    this.stopHeartbeat();
    if (!this.ws) return;
    this.lastPong = Date.now();

    const pingOnce = () => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.ws.ping();
        // If no pong in time, consider dead:
        this.armPongTimer();
      } catch (err) {
        this.emit('error', err);
        try { this.ws.close(); } catch {}
      }
    };

    // First ping quickly after connect to start the watchdog quickly:
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
      // No pong received in time -> drop connection to trigger reconnect.
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

    // Apply jitter: +/- jitterRatio
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
        // Increase backoff for next time:
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
    // Node/ws error when contacting TLS endpoint via plain ws:
    return /Expected HTTP\/, RTSP\/ or ICE\//i.test(message || '');
  }

  shouldDowngradeFromTls(err) {
    if (!this.usingTls) return false;
    if (!this.autoTlsEnabled) return false;
    const message = err?.message?.toLowerCase?.() || '';
    const code = err?.code;
    // Common TLS handshake mismatches:
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
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  // Map common Rust WebRCON "Type" to higher-level events for convenience.
  routeTypedEvents(obj) {
    const t = String(obj?.Type ?? '').toLowerCase();
    const msg = obj?.Message ?? '';
    // Emit coarse-grained events; UI can subscribe as needed.
    if (!t && typeof msg === 'string') {
      // Fallback: generic console line
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

  // Convenience commands (optional sugar)
  async getServerInfo(opts) { return this.command('serverinfo', opts); }
  async status(opts) { return this.command('status', opts); }
  async players(opts) { return this.command('global.players', opts); }
}