import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import bcrypt from 'bcrypt';
import { db, initDb } from './db/index.js';
import { authMiddleware, signToken, requireAdmin } from './auth.js';
import { RustWebRcon } from './rcon.js';

const app = express();
const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: process.env.CORS_ORIGIN?.split(',') || '*' } });

const PORT = parseInt(process.env.PORT || '8787', 10);
const BIND = process.env.BIND || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'dev';
const ALLOW_REGISTRATION = (process.env.ALLOW_REGISTRATION || '').toLowerCase() === 'true';

const toInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const MONITOR_INTERVAL = Math.max(toInt(process.env.MONITOR_INTERVAL_MS || '60000', 60000), 15000);
const RUSTMAPS_API_KEY = process.env.RUSTMAPS_API_KEY || '';
const SERVER_INFO_TTL = Math.max(toInt(process.env.SERVER_INFO_CACHE_MS, 60000), 10000);
const MAP_CACHE_TTL = Math.max(toInt(process.env.RUSTMAPS_CACHE_MS, 30 * 60 * 1000), 60000);

app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }));

await initDb();

const auth = authMiddleware(JWT_SECRET);
const rconMap = new Map();
const statusMap = new Map();
const serverInfoCache = new Map();
const mapCache = new Map();
let monitoring = false;
let monitorTimer = null;

function recordStatus(id, data) {
  const key = Number(id);
  const payload = { id: key, ...data };
  statusMap.set(key, payload);
  io.to(`srv:${key}`).emit('status', payload);
  return payload;
}

function getStatusSnapshot() {
  const out = {};
  for (const [id, data] of statusMap.entries()) out[id] = data;
  return out;
}

function closeRcon(id) {
  const key = Number(id);
  const client = rconMap.get(key);
  if (client) {
    try { client.close(); } catch { /* ignore */ }
    rconMap.delete(key);
  }
}

function getOrCreateRcon(row) {
  const key = Number(row.id);
  if (rconMap.has(key)) return rconMap.get(key);
  const client = new RustWebRcon({ host: row.host, port: row.port, password: row.password, tls: !!row.tls });
  client.on('message', (msg) => io.to(`srv:${key}`).emit('console', msg));
  client.on('error', (e) => {
    const message = e?.message || String(e);
    io.to(`srv:${key}`).emit('error', message);
    recordStatus(key, { ok: false, lastCheck: new Date().toISOString(), error: message });
  });
  client.on('close', () => {
    rconMap.delete(key);
    recordStatus(key, { ok: false, lastCheck: new Date().toISOString(), error: 'connection_closed' });
  });
  rconMap.set(key, client);
  return client;
}

function parseStatusMessage(message) {
  const info = {
    raw: message,
    hostname: null,
    players: null,
    queued: null,
    sleepers: null
  };
  if (!message) return info;
  const lines = message.split(/\r?\n/);
  for (const line of lines) {
    const hostnameMatch = line.match(/hostname\s*[:=]\s*(.+)$/i);
    if (hostnameMatch) info.hostname = hostnameMatch[1].trim();
    const playersMatch = line.match(/players?\s*[:=]\s*(\d+)(?:\s*\/\s*(\d+))?/i);
    if (playersMatch) {
      info.players = {
        online: parseInt(playersMatch[1], 10),
        max: playersMatch[2] ? parseInt(playersMatch[2], 10) : null
      };
    }
    const queuedMatch = line.match(/queued\s*[:=]\s*(\d+)/i);
    if (queuedMatch) info.queued = parseInt(queuedMatch[1], 10);
    const sleepersMatch = line.match(/sleepers\s*[:=]\s*(\d+)/i);
    if (sleepersMatch) info.sleepers = parseInt(sleepersMatch[1], 10);
  }
  return info;
}

function parseServerInfoMessage(message) {
  const info = {
    raw: message,
    mapName: null,
    size: null,
    seed: null
  };
  if (!message) return info;
  const lines = message.split(/\r?\n/);
  for (const line of lines) {
    const parts = line.split(':');
    if (parts.length < 2) continue;
    const key = parts.shift().trim().toLowerCase();
    const value = parts.join(':').trim();
    if (!value) continue;
    if (key.includes('map')) {
      if (!key.includes('seed') && !key.includes('size')) info.mapName = value;
    }
    if (key.includes('world size') || key === 'worldsize' || key === 'size') {
      const size = parseInt(value, 10);
      if (Number.isFinite(size)) info.size = size;
    }
    if (key.includes('seed')) {
      const seed = parseInt(value, 10);
      if (Number.isFinite(seed)) info.seed = seed;
    }
  }
  return info;
}

function parsePlayerListMessage(message) {
  if (!message) return [];
  let text = message.trim();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
      try { payload = JSON.parse(text.slice(start, end + 1)); } catch { /* ignore */ }
    }
  }
  if (payload && Array.isArray(payload.Players)) payload = payload.Players;
  if (!Array.isArray(payload)) return [];
  return payload.map((entry) => ({
    steamId: entry.SteamID || entry.steamId || entry.steamid || '',
    ownerSteamId: entry.OwnerSteamID || entry.ownerSteamId || entry.ownerSteamID || null,
    displayName: entry.DisplayName || entry.displayName || '',
    ping: Number(entry.Ping ?? entry.ping ?? 0) || 0,
    address: entry.Address || entry.address || '',
    connectedSeconds: Number(entry.ConnectedSeconds ?? entry.connectedSeconds ?? 0) || 0,
    violationLevel: Number(entry.VoiationLevel ?? entry.ViolationLevel ?? entry.violationLevel ?? 0) || 0,
    health: Number(entry.Health ?? entry.health ?? 0) || 0,
    position: {
      x: Number(entry.Position?.x ?? entry.position?.x ?? 0) || 0,
      y: Number(entry.Position?.y ?? entry.position?.y ?? 0) || 0,
      z: Number(entry.Position?.z ?? entry.position?.z ?? 0) || 0
    },
    teamId: Number(entry.TeamId ?? entry.teamId ?? 0) || 0,
    networkId: Number(entry.NetworkId ?? entry.networkId ?? 0) || null
  }));
}

function getCachedServerInfo(id) {
  const cached = serverInfoCache.get(id);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > SERVER_INFO_TTL) {
    serverInfoCache.delete(id);
    return null;
  }
  return cached.data;
}

function cacheServerInfo(id, info) {
  serverInfoCache.set(id, { data: info, timestamp: Date.now() });
}

async function fetchRustMapMetadata(size, seed) {
  if (!size || !seed) return null;
  const key = `${size}:${seed}`;
  const cached = mapCache.get(key);
  if (cached && Date.now() - cached.timestamp < MAP_CACHE_TTL) return cached.data;
  if (!RUSTMAPS_API_KEY) {
    const err = new Error('no_rustmaps_api_key');
    err.code = 'no_rustmaps_api_key';
    throw err;
  }
  const url = `https://api.rustmaps.com/v4/maps/${encodeURIComponent(size)}/${encodeURIComponent(seed)}?staging=false`;
  const res = await fetch(url, { headers: { 'x-api-key': RUSTMAPS_API_KEY } });
  if (res.status === 401 || res.status === 403) {
    const err = new Error('rustmaps_unauthorized');
    err.code = 'rustmaps_unauthorized';
    throw err;
  }
  if (res.status === 404) {
    const err = new Error('rustmaps_not_found');
    err.code = 'rustmaps_not_found';
    throw err;
  }
  if (!res.ok) {
    const err = new Error('rustmaps_error');
    err.code = 'rustmaps_error';
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  const data = body?.data;
  if (!data) {
    const err = new Error('rustmaps_error');
    err.code = 'rustmaps_error';
    throw err;
  }
  const normalized = {
    id: data.id || null,
    type: data.type || null,
    seed: data.seed || seed,
    size: data.size || size,
    saveVersion: data.saveVersion || null,
    imageUrl: data.imageUrl || data.rawImageUrl || null,
    rawImageUrl: data.rawImageUrl || null,
    thumbnailUrl: data.thumbnailUrl || null,
    url: data.url || null,
    isCustomMap: !!data.isCustomMap,
    totalMonuments: data.totalMonuments || null
  };
  mapCache.set(key, { data: normalized, timestamp: Date.now() });
  return normalized;
}

async function monitorServers() {
  if (monitoring) return;
  monitoring = true;
  try {
    const list = await db.listServers();
    const seen = new Set();
    for (const row of list) {
      const key = Number(row.id);
      seen.add(key);
      try {
        const client = getOrCreateRcon(row);
        const started = Date.now();
        await client.ensure();
        const reply = await client.command('status');
        recordStatus(key, {
          ok: true,
          lastCheck: new Date().toISOString(),
          latency: Date.now() - started,
          details: parseStatusMessage(reply?.Message || '')
        });
      } catch (e) {
        closeRcon(key);
        recordStatus(key, {
          ok: false,
          lastCheck: new Date().toISOString(),
          error: e?.message || String(e)
        });
      }
    }
    for (const key of [...statusMap.keys()]) {
      if (!seen.has(key)) statusMap.delete(key);
    }
  } catch (e) {
    console.error('monitor error', e);
  } finally {
    monitoring = false;
  }
}

function triggerMonitorSoon(delay = 1000) {
  if (monitorTimer) return;
  monitorTimer = setTimeout(() => {
    monitorTimer = null;
    monitorServers().catch((err) => console.error('monitor retry error', err));
  }, delay);
}

const monitorHandle = setInterval(() => {
  monitorServers().catch((err) => console.error('monitor tick error', err));
}, MONITOR_INTERVAL);
if (monitorHandle.unref) monitorHandle.unref();
monitorServers().catch((err) => console.error('initial monitor error', err));

// --- Public metadata
app.get('/api/public-config', (req, res) => {
  res.json({ allowRegistration: ALLOW_REGISTRATION });
});

// --- Auth
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
  try {
    const row = await db.getUserByUsername(username);
    if (!row) return res.status(401).json({ error: 'invalid_login' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_login' });
    const token = signToken(row, JWT_SECRET);
    res.json({ token, username: row.username, role: row.role, id: row.id });
  } catch (e) {
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/register', async (req, res) => {
  if (!ALLOW_REGISTRATION) return res.status(403).json({ error: 'registration_disabled' });
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
  if (!/^[a-z0-9_\-.]{3,32}$/i.test(username)) return res.status(400).json({ error: 'invalid_username' });
  if (password.length < 8) return res.status(400).json({ error: 'weak_password' });
  try {
    const existing = await db.getUserByUsername(username);
    if (existing) return res.status(409).json({ error: 'username_taken' });
    const hash = bcrypt.hashSync(password, 10);
    const id = await db.createUser({ username, password_hash: hash, role: 'user' });
    res.status(201).json({ id, username });
  } catch (e) {
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/me', auth, async (req, res) => {
  try {
    const row = await db.getUser(req.user.uid);
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json({ id: row.id, username: row.username, role: row.role, created_at: row.created_at });
  } catch (e) {
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/password', auth, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'weak_password' });
  const hash = bcrypt.hashSync(newPassword, 10);
  try {
    await db.updateUserPassword(req.user.uid, hash);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/users', auth, requireAdmin, async (req, res) => {
  try {
    res.json(await db.listUsers());
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/users', auth, requireAdmin, async (req, res) => {
  const { username, password, role = 'user' } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
  if (!/^[a-z0-9_\-.]{3,32}$/i.test(username)) return res.status(400).json({ error: 'invalid_username' });
  if (password.length < 8) return res.status(400).json({ error: 'weak_password' });
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'invalid_role' });
  try {
    const existing = await db.getUserByUsername(username);
    if (existing) return res.status(409).json({ error: 'username_taken' });
    const hash = bcrypt.hashSync(password, 10);
    const id = await db.createUser({ username, password_hash: hash, role });
    res.status(201).json({ id, username, role });
  } catch (e) {
    res.status(500).json({ error: 'db_error' });
  }
});

app.patch('/api/users/:id', auth, requireAdmin, async (req, res) => {
  const { role } = req.body || {};
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
  if (!role || !['user', 'admin'].includes(role)) return res.status(400).json({ error: 'invalid_role' });
  try {
    await db.updateUserRole(id, role);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/users/:id/password', auth, requireAdmin, async (req, res) => {
  const { newPassword } = req.body || {};
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'weak_password' });
  const hash = bcrypt.hashSync(newPassword, 10);
  try {
    await db.updateUserPassword(id, hash);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/users/:id', auth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
  if (id === req.user.uid) return res.status(400).json({ error: 'cannot_delete_self' });
  try {
    const user = await db.getUser(id);
    if (!user) return res.status(404).json({ error: 'not_found' });
    if (user.role === 'admin') {
      const count = await db.countAdmins();
      if (count <= 1) return res.status(400).json({ error: 'last_admin' });
    }
    const deleted = await db.deleteUser(id);
    res.json({ deleted });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

// --- Servers CRUD
app.get('/api/servers', auth, async (req, res) => {
  try { res.json(await db.listServers()); } catch { res.status(500).json({ error: 'db_error' }); }
});

app.get('/api/servers/status', auth, (req, res) => {
  res.json(getStatusSnapshot());
});

app.get('/api/servers/:id/status', auth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
  const status = statusMap.get(id);
  if (!status) return res.status(404).json({ error: 'not_found' });
  res.json(status);
});

app.post('/api/servers', auth, async (req, res) => {
  const { name, host, port, password, tls } = req.body || {};
  if (!name || !host || !port || !password) return res.status(400).json({ error: 'missing_fields' });
  try {
    const id = await db.createServer({ name, host, port: parseInt(port, 10), password, tls: tls ? 1 : 0 });
    triggerMonitorSoon();
    res.json({ id });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.patch('/api/servers/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
  try {
    const updated = await db.updateServer(id, req.body || {});
    if (updated) {
      closeRcon(id);
      triggerMonitorSoon();
    }
    res.json({ updated });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/servers/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
  try {
    const deleted = await db.deleteServer(id);
    closeRcon(id);
    statusMap.delete(id);
    res.json({ deleted });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/servers/:id/live-map', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
  try {
    const server = await db.getServer(id);
    if (!server) return res.status(404).json({ error: 'not_found' });
    const client = getOrCreateRcon(server);
    let info = getCachedServerInfo(id);
    if (!info) {
      try {
        const reply = await client.command('serverinfo');
        info = parseServerInfoMessage(reply?.Message || '');
        cacheServerInfo(id, info);
      } catch (err) {
        info = { raw: null, mapName: null, size: null, seed: null };
      }
    }
    let playerPayload = '';
    try {
      const reply = await client.command('playerlist');
      playerPayload = reply?.Message || '';
    } catch (err) {
      console.error('playerlist command failed', err);
      return res.status(502).json({ error: 'playerlist_failed' });
    }
    const players = parsePlayerListMessage(playerPayload);
    let map = null;
    if (info?.size && info?.seed) {
      try {
        map = await fetchRustMapMetadata(info.size, info.seed);
      } catch (err) {
        const code = err?.code || err?.message;
        if (code === 'no_rustmaps_api_key' || code === 'rustmaps_unauthorized') {
          return res.status(400).json({ error: code });
        }
        if (code === 'rustmaps_not_found') {
          map = null;
        } else {
          console.error('RustMaps metadata fetch failed', err);
          return res.status(502).json({ error: 'rustmaps_error' });
        }
      }
    }
    res.json({ players, map, info, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('live-map route error', err);
    res.status(500).json({ error: 'live_map_failed' });
  }
});

// --- RCON
app.post('/api/rcon/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { cmd } = req.body || {};
  if (!cmd) return res.status(400).json({ error: 'missing_cmd' });
  try {
    const row = await db.getServer(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const client = getOrCreateRcon(row);
    const reply = await client.command(cmd);
    res.json(reply);
  } catch (e) {
    res.status(500).json({ error: e.message || 'rcon_error' });
  }
});

// --- Players & Steam sync
app.get('/api/players', auth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  const offset = parseInt(req.query.offset || '0', 10);
  try {
    const rows = await db.listPlayers({ limit, offset });
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/players/:steamid', auth, async (req, res) => {
  try {
    const p = await db.getPlayer(req.params.steamid);
    if (!p) return res.status(404).json({ error: 'not_found' });
    const events = await db.listPlayerEvents(req.params.steamid, { limit: 50, offset: 0 });
    res.json({ ...p, events });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/players/:steamid/event', auth, async (req, res) => {
  const { steamid } = req.params;
  const { server_id, event, note } = req.body || {};
  if (!event) return res.status(400).json({ error: 'missing_event' });
  try {
    await db.addPlayerEvent({ steamid, server_id, event, note });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

async function fetchSteamProfiles(steamids, key) {
  const ids = steamids.slice(0, 100).join(',');
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(ids)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('steam_api_error');
  const j = await r.json();
  const players = j?.response?.players || [];
  const bansUrl = `https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(ids)}`;
  const rb = await fetch(bansUrl);
  let bans = {};
  if (rb.ok) {
    const jb = await rb.json();
    for (const b of (jb?.players || [])) bans[b.SteamId] = b.VACBanned ? 1 : 0;
  }
  for (const p of players) p.vac_banned = bans[p.steamid] || 0;
  return players;
}

app.post('/api/steam/sync', auth, async (req, res) => {
  const { steamids } = req.body || {};
  if (!Array.isArray(steamids) || steamids.length === 0) return res.status(400).json({ error: 'missing_steamids' });
  if (!process.env.STEAM_API_KEY) return res.status(400).json({ error: 'no_steam_api_key' });
  try {
    const list = await fetchSteamProfiles(steamids, process.env.STEAM_API_KEY);
    for (const p of list) {
      await db.upsertPlayer({
        steamid: p.steamid,
        persona: p.personaname,
        avatar: p.avatarfull,
        country: p.loccountrycode || null,
        profileurl: p.profileurl || null,
        vac_banned: p.vac_banned || 0
      });
    }
    res.json({ updated: list.length });
  } catch (e) {
    res.status(500).json({ error: e.message || 'steam_sync_failed' });
  }
});

// --- sockets
io.on('connection', (socket) => {
  socket.emit('status-map', getStatusSnapshot());
  socket.on('join-server', async (serverId) => {
    const id = Number(serverId);
    if (!Number.isFinite(id)) return;
    const row = await db.getServer(id);
    if (!row) return;
    socket.join(`srv:${id}`);
    const status = statusMap.get(id);
    if (status) socket.emit('status', status);
    try {
      const client = getOrCreateRcon(row);
      await client.ensure();
      client.command('status').catch(() => {});
    } catch (e) {
      socket.emit('error', e.message || String(e));
    }
  });
  socket.on('leave-server', (serverId) => {
    const id = Number(serverId);
    socket.leave(`srv:${id}`);
  });
});

server.listen(PORT, BIND, () => {
  console.log(`API on http://${BIND}:${PORT}`);
});
