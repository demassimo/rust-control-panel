import WebSocket from 'ws';
import EventEmitter from 'events';

export class RustWebRcon extends EventEmitter {
  constructor({ host, port, password, tls = false }) {
    super();
    this.host = host;
    this.port = port;
    this.password = password;
    this.tls = !!tls;
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
  }
  get url() {
    const proto = this.tls ? 'wss' : 'ws';
    return `${proto}://${this.host}:${this.port}/${encodeURIComponent(this.password)}/`;
  }
  async connect() {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) return this.connectPromise;
    this.manualClose = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;

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
        if (!settled) {
          settled = true;
          cleanup();
          reject(err);
        }
        this.emit('error', err);
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
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
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
    }, this.reconnectDelayMs);
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
  }
}
