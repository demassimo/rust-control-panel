import WebSocket from 'ws';
import EventEmitter from 'events';

export class RustWebRcon extends EventEmitter {
  constructor({ host, port, password, tls = false }) {
    super();
    this.host = host;
    this.port = port;
    this.password = password;
    this.configuredTls = typeof tls === 'string' && tls.toLowerCase() === 'auto' ? null : !!tls;
    this.usingTls = this.configuredTls ?? false;
    this.autoTlsEnabled = false;
    this.ws = null;
    this.connected = false;
    this.nextId = 1;
    this.pending = new Map();
    this.manualClose = false;
    this.connectPromise = null;
    this.heartbeatInterval = null;
    this.reconnectTimer = null;
    this.heartbeatIntervalMs = 20000;
    this.reconnectDelayMs = 3000;
    this.nextReconnectDelayOverride = null;
  }
  get url() {
    const proto = this.usingTls ? 'wss' : 'ws';
    return `${proto}://${this.host}:${this.port}/${encodeURIComponent(this.password)}/`;
  }
  async connect() {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) return this.connectPromise;
    this.manualClose = false;
    this.clearReconnectTimer();

    let attempts = 0;
    while (true) {
      attempts += 1;
      const promise = this.createConnectionPromise();
      this.connectPromise = promise;
      try {
        await promise;
        return;
      } catch (err) {
        if (this.shouldRetryAfterTlsChange(err) && attempts < 3) {
          continue;
        }
        throw err;
      } finally {
        if (this.connectPromise === promise) this.connectPromise = null;
      }
    }
  }
  async ensure() { if (!this.connected) await this.connect(); }
  async command(cmd) {
    await this.ensure();
    const id = this.nextId++;
    const payload = JSON.stringify({ Identifier: id, Message: cmd, Name: "WebRcon" });
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('RCON timeout'));
      }, 10000);
      this.pending.set(id, { resolve, reject, timeout });
      this.ws.send(payload, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }
  startHeartbeat() {
    this.stopHeartbeat();
    if (!this.ws) return;
    this.lastPong = Date.now();
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.ws.ping();
      } catch (err) {
        this.emit('error', err);
        this.ws.close();
      }
    }, this.heartbeatIntervalMs);
  }
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  scheduleReconnect() {
    if (this.reconnectTimer || this.manualClose) return;
    const delay = typeof this.nextReconnectDelayOverride === 'number'
      ? this.nextReconnectDelayOverride
      : this.reconnectDelayMs;
    this.nextReconnectDelayOverride = null;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.manualClose) return;
      try {
        await this.connect();
        this.emit('reconnect');
      } catch (err) {
        this.emit('error', err);
        this.scheduleReconnect();
      }
    }, delay);
  }
  rejectPending(error) {
    if (this.pending.size === 0) return;
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
  async close() {
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    try { this.ws?.close(); } catch {}
    this.connected = false;
    this.rejectPending(new Error('RCON connection closed'));
    this.ws = null;
    this.resetTlsState();
  }

  createConnectionPromise() {
    const ws = new WebSocket(this.url);
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
        try {
          const obj = JSON.parse(data.toString());
          this.emit('message', obj);
          if (typeof obj.Identifier === 'number' && this.pending.has(obj.Identifier)) {
            const pending = this.pending.get(obj.Identifier);
            this.pending.delete(obj.Identifier);
            clearTimeout(pending.timeout);
            pending.resolve(obj);
          }
        } catch (e) {
          this.emit('raw', data.toString());
        }
      };

      const handleError = (err) => {
        const decoratedError = this.handleTlsMismatch(err) ?? err;
        if (!settled) {
          settled = true;
          cleanup();
          reject(decoratedError);
        }
        this.emit('error', decoratedError);
        if (ws.readyState !== WebSocket.CLOSING && ws.readyState !== WebSocket.CLOSED) {
          try { ws.close(); } catch {}
        }
      };

      const handleClose = () => {
        this.connected = false;
        this.stopHeartbeat();
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
      };

      ws.on('open', handleOpen);
      ws.on('message', handleMessage);
      ws.on('error', handleError);
      ws.on('close', handleClose);
      ws.on('pong', handlePong);
    });
  }

  handleTlsMismatch(err) {
    if (!err) return null;
    const message = err?.message || '';

    if (this.shouldUpgradeToTls(message)) {
      this.usingTls = true;
      this.autoTlsEnabled = true;
      this.nextReconnectDelayOverride = Math.min(500, this.reconnectDelayMs);
      const friendly = new Error('Rust WebRCON appears to require TLS; retrying with a secure WebSocket connection.');
      friendly.code = 'web_rcon_tls_upgrade';
      friendly.cause = err;
      return friendly;
    }

    if (this.shouldDowngradeFromTls(err)) {
      this.usingTls = this.configuredTls ?? false;
      this.autoTlsEnabled = false;
      this.nextReconnectDelayOverride = Math.min(500, this.reconnectDelayMs);
      const friendly = new Error('Rust WebRCON rejected the TLS handshake; falling back to an unsecured WebSocket.');
      friendly.code = 'web_rcon_tls_downgrade';
      friendly.cause = err;
      return friendly;
    }

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
    if (this.configuredTls === true) return false;
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
      return message.includes('wrong version number') || message.includes('unknown protocol') || message.includes('unexpected message');
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
    if (code === 'web_rcon_tls_upgrade' || code === 'web_rcon_tls_downgrade') return true;
    return false;
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
