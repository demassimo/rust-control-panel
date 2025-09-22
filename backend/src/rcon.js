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
  }
  get url() {
    const proto = this.tls ? 'wss' : 'ws';
    return `${proto}://${this.host}:${this.port}/${encodeURIComponent(this.password)}/`;
  }
  async connect() {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.on('open', () => { this.connected = true; this.emit('open'); resolve(); });
      ws.on('message', (data) => {
        try {
          const obj = JSON.parse(data.toString());
          this.emit('message', obj);
          if (typeof obj.Identifier === 'number' && this.pending.has(obj.Identifier)) {
            const fn = this.pending.get(obj.Identifier);
            this.pending.delete(obj.Identifier);
            fn(obj);
          }
        } catch (e) { this.emit('raw', data.toString()); }
      });
      ws.on('error', (err) => this.emit('error', err));
      ws.on('close', () => { this.connected = false; this.emit('close'); this.ws = null; });
    });
  }
  async ensure() { if (!this.connected) await this.connect(); }
  async command(cmd) {
    await this.ensure();
    const id = this.nextId++;
    const payload = JSON.stringify({ Identifier: id, Message: cmd, Name: "WebRcon" });
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error('RCON timeout')); }, 10000);
      this.pending.set(id, (msg) => { clearTimeout(timeout); resolve(msg); });
      this.ws.send(payload);
    });
  }
  async close() { try { this.ws?.close(); } catch {} this.connected = false; this.pending.clear(); }
}
