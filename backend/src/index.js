import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import bcrypt from 'bcrypt';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, initDb } from './db/index.js';
import { authMiddleware, signToken, requireAdmin } from './auth.js';
// index.js
import { connectRcon, sendRconCommand, closeRcon as terminateRcon, subscribeToRcon } from './rcon.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(process.cwd(), 'data');
const MAP_STORAGE_DIR = path.join(DATA_DIR, 'maps');
const MAP_GLOBAL_CACHE_DIR = path.join(MAP_STORAGE_DIR, 'global');

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
const DEFAULT_RUSTMAPS_API_KEY = process.env.RUSTMAPS_API_KEY || '';
const SERVER_INFO_TTL = Math.max(toInt(process.env.SERVER_INFO_CACHE_MS, 60000), 10000);
const ALLOWED_USER_SETTINGS = new Set(['rustmaps_api_key']);
const MAP_PURGE_INTERVAL = Math.max(toInt(process.env.MAP_PURGE_INTERVAL_MS, 6 * 60 * 60 * 1000), 15 * 60 * 1000);
const MAP_CACHE_TZ_OFFSET_MINUTES = 120; // UTC+2
const MAP_CACHE_RESET_HOUR = 20;
const MAP_CACHE_RESET_MINUTE = 0;
const KNOWN_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

let lastGlobalMapCacheReset = null;

app.use(express.json({ limit: '25mb' }));
app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }));

await initDb();
await fs.mkdir(MAP_STORAGE_DIR, { recursive: true });
await fs.mkdir(MAP_GLOBAL_CACHE_DIR, { recursive: true });
await purgeExpiredMapCaches().catch((err) => console.error('initial map purge failed', err));

const auth = authMiddleware(JWT_SECRET);
const rconBindings = new Map();
const statusMap = new Map();
const serverInfoCache = new Map();
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

function cleanupRconBinding(id) {
  const key = Number(id);
  if (!Number.isFinite(key)) return;
  const unsubscribe = rconBindings.get(key);
  if (!unsubscribe) return;
  rconBindings.delete(key);
  try { unsubscribe(); }
  catch { /* ignore */ }
}

function ensureRconBinding(row) {
  const key = Number(row?.id);
  if (!Number.isFinite(key)) throw new Error('invalid_server_id');
  if (rconBindings.has(key)) return;

  const host = row.host;
  const port = row.port;

  const handleError = (error) => {
    const message = error?.message || String(error);
    io.to(`srv:${key}`).emit('error', message);
    recordStatus(key, { ok: false, lastCheck: new Date().toISOString(), error: message });
  };

  const unsubscribe = subscribeToRcon(key, {
    message: (msg) => {
      io.to(`srv:${key}`).emit('console', msg);
      console.log(`[RCON:${host}:${port}]`, msg);
    },
    rcon_error: handleError,
    close: ({ manual } = {}) => {
      recordStatus(key, { ok: false, lastCheck: new Date().toISOString(), error: 'connection_closed' });
      if (manual) cleanupRconBinding(key);
    }
  });

  rconBindings.set(key, unsubscribe);

  connectRcon(row).catch((err) => {
    console.error(`[RCON:${host}:${port}] connect failed:`, err);
  });
}

function closeServerRcon(id) {
  cleanupRconBinding(id);
  terminateRcon(id);
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

function firstThursdayResetTime(now = new Date()) {
  const tzAdjusted = new Date(now.getTime() + MAP_CACHE_TZ_OFFSET_MINUTES * 60000);
  const year = tzAdjusted.getUTCFullYear();
  const month = tzAdjusted.getUTCMonth();
  const firstDayDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysUntilThursday = (4 - firstDayDow + 7) % 7;
  const day = 1 + daysUntilThursday;
  const hourUtc = MAP_CACHE_RESET_HOUR - Math.trunc(MAP_CACHE_TZ_OFFSET_MINUTES / 60);
  const minuteUtc = MAP_CACHE_RESET_MINUTE - (MAP_CACHE_TZ_OFFSET_MINUTES % 60);
  return new Date(Date.UTC(year, month, day, hourUtc, minuteUtc, 0, 0));
}

function parseTimestamp(value) {
  if (!value) return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return new Date(ts);
}

function shouldResetMapRecord(record, now = new Date(), resetPoint = firstThursdayResetTime(now)) {
  if (!record) return false;
  const updated = parseTimestamp(record.updated_at || record.updatedAt || record.created_at || record.createdAt);
  if (!updated) return false;
  return now >= resetPoint && updated < resetPoint;
}

function sanitizeFilenameSegment(value) {
  return (String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'map').slice(0, 80);
}

function serverMapImageFilePath(serverId, mapKey, extension = 'png') {
  const safeKey = sanitizeFilenameSegment(mapKey || `server-${serverId}`);
  return path.join(MAP_STORAGE_DIR, `server-${serverId}-${safeKey}.${extension}`);
}

function globalMapImageFilePath(mapKey, extension = 'png') {
  const safeKey = sanitizeFilenameSegment(mapKey || 'map');
  return path.join(MAP_GLOBAL_CACHE_DIR, `${safeKey}.${extension}`);
}

function isWithinDir(targetPath, dir) {
  if (!targetPath) return false;
  const resolvedTarget = path.resolve(targetPath);
  const resolvedDir = path.resolve(dir);
  return resolvedTarget.startsWith(resolvedDir);
}

async function findGlobalMapImage(mapKey) {
  if (!mapKey) return null;
  for (const ext of KNOWN_IMAGE_EXTENSIONS) {
    const filePath = globalMapImageFilePath(mapKey, ext);
    try {
      await fs.access(filePath);
      return { path: filePath, extension: ext };
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function removeMapImage(record) {
  if (!record?.image_path) return;
  if (!isWithinDir(record.image_path, MAP_STORAGE_DIR)) return;
  if (typeof db.countServerMapsByImagePath === 'function') {
    try {
      const exclude = Number(record.server_id ?? record.serverId);
      const remaining = await db.countServerMapsByImagePath(record.image_path, Number.isFinite(exclude) ? exclude : null);
      if (remaining > 0) return;
    } catch (err) {
      console.warn('map image reference count failed', err);
    }
  }
  try {
    await fs.unlink(record.image_path);
  } catch (err) {
    if (err?.code !== 'ENOENT') console.warn('Failed to remove cached map image', err);
  }
}

async function clearGlobalMapCache(activeImages = new Set()) {
  let entries;
  try {
    entries = await fs.readdir(MAP_GLOBAL_CACHE_DIR, { withFileTypes: true });
  } catch (err) {
    if (err?.code === 'ENOENT') return;
    console.warn('global map cache read failed', err);
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const target = path.join(MAP_GLOBAL_CACHE_DIR, entry.name);
    if (activeImages.has(target)) continue;
    try {
      await fs.unlink(target);
    } catch (err) {
      if (err?.code !== 'ENOENT') console.warn('Failed to remove cached global map image', err);
    }
  }
}

async function purgeGlobalCacheIfDue(resetPoint, now = new Date(), activeImages = new Set()) {
  if (!resetPoint) return;
  if (lastGlobalMapCacheReset && lastGlobalMapCacheReset >= resetPoint) return;
  await clearGlobalMapCache(activeImages);
  lastGlobalMapCacheReset = now;
}

async function purgeExpiredMapCaches(now = new Date()) {
  const resetPoint = firstThursdayResetTime(now);
  if (typeof db.listServerMaps !== 'function') return;
  let rows;
  try {
    rows = await db.listServerMaps();
  } catch (err) {
    console.error('map cache query failed', err);
    rows = [];
  }
  const activeImages = new Set();
  if (Array.isArray(rows) && rows.length > 0) {
    for (const row of rows) {
      try {
        if (!shouldResetMapRecord(row, now, resetPoint)) {
          if (row?.image_path) activeImages.add(row.image_path);
          continue;
        }
        await removeMapImage(row);
        const id = Number(row.server_id ?? row.serverId ?? row.id);
        if (!Number.isFinite(id)) continue;
        await db.deleteServerMap(id);
      } catch (err) {
        console.warn('map cache purge failed for server', row?.server_id ?? row?.serverId ?? row?.id, err);
      }
    }
  }
  await purgeGlobalCacheIfDue(resetPoint, now, activeImages);
}

function mapRecordToPayload(serverId, record) {
  if (!record) return null;
  let meta = {};
  if (record.data) {
    try { meta = JSON.parse(record.data); } catch { /* ignore parse errors */ }
  }
  const updatedAt = record.updated_at || record.updatedAt || record.created_at || record.createdAt || null;
  const payload = {
    ...meta,
    mapKey: record.map_key || meta.mapKey || null,
    cached: true,
    cachedAt: updatedAt,
    custom: !!record.custom
  };
  if (record.image_path) {
    payload.imageUrl = `/api/servers/${serverId}/map-image?v=${encodeURIComponent(updatedAt || '')}`;
    payload.localImage = true;
  } else if (!payload.imageUrl) {
    payload.imageUrl = null;
  }
  if (payload.custom && !payload.imageUrl) payload.needsUpload = true;
  return payload;
}

function deriveMapKey(info = {}, metadata = null) {
  const rawSize = Number(metadata?.size ?? info.size);
  const rawSeed = Number(metadata?.seed ?? info.seed);
  const saveVersion = metadata?.saveVersion || null;
  const parts = [];
  if (Number.isFinite(rawSize)) parts.push(`size${rawSize}`);
  if (Number.isFinite(rawSeed)) parts.push(`seed${rawSeed}`);
  if (saveVersion) parts.push(`v${saveVersion}`);
  if (!parts.length && info.mapName) parts.push(`name-${info.mapName}`);
  if (!parts.length && metadata?.id) parts.push(`id${metadata.id}`);
  return parts.length ? parts.join(':') : null;
}

async function fetchRustMapMetadata(size, seed, apiKey) {
  if (!size || !seed) return null;
  if (!apiKey) {
    const err = new Error('rustmaps_api_key_missing');
    err.code = 'rustmaps_api_key_missing';
    throw err;
  }
  const url = `https://api.rustmaps.com/v4/maps/${encodeURIComponent(size)}/${encodeURIComponent(seed)}?staging=false`;
  const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
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
  return {
    id: data.id || null,
    type: data.type || null,
    seed: Number(data.seed ?? seed) || seed,
    size: Number(data.size ?? size) || size,
    saveVersion: data.saveVersion || null,
    mapName: data.mapName || data.map || null,
    imageUrl: data.imageUrl || data.rawImageUrl || null,
    rawImageUrl: data.rawImageUrl || null,
    thumbnailUrl: data.thumbnailUrl || null,
    url: data.url || null,
    isCustomMap: !!data.isCustomMap,
    totalMonuments: data.totalMonuments || null
  };
}

async function downloadRustMapImage(meta, apiKey) {
  const imageUrl = meta?.imageUrl || meta?.rawImageUrl;
  if (!imageUrl) return null;
  const headers = apiKey ? { 'x-api-key': apiKey } : undefined;
  const res = await fetch(imageUrl, { headers });
  if (!res.ok) {
    const err = new Error('rustmaps_image_error');
    err.code = 'rustmaps_image_error';
    err.status = res.status;
    throw err;
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const type = res.headers.get('content-type') || '';
  let extension = 'jpg';
  if (type.includes('png')) extension = 'png';
  else if (type.includes('webp')) extension = 'webp';
  return { buffer, extension, mime: type || 'image/jpeg' };
}

function decodeBase64Image(input) {
  if (typeof input !== 'string' || !input) return null;
  let data = input.trim();
  let mime = 'application/octet-stream';
  const match = data.match(/^data:(.+);base64,(.*)$/);
  if (match) {
    mime = match[1];
    data = match[2];
  }
  try {
    const buffer = Buffer.from(data, 'base64');
    let extension = 'jpg';
    if (mime.includes('png')) extension = 'png';
    else if (mime.includes('webp')) extension = 'webp';
    else if (mime.includes('jpeg')) extension = 'jpg';
    return { buffer, mime, extension };
  } catch {
    return null;
  }
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
        ensureRconBinding(row);
        const started = Date.now();
        const reply = await sendRconCommand(row, 'status');
        recordStatus(key, {
          ok: true,
          lastCheck: new Date().toISOString(),
          latency: Date.now() - started,
          details: parseStatusMessage(reply?.Message || '')
        });
      } catch (e) {
        closeServerRcon(key);
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

const mapPurgeHandle = setInterval(() => {
  purgeExpiredMapCaches().catch((err) => console.error('scheduled map purge error', err));
}, MAP_PURGE_INTERVAL);
if (mapPurgeHandle.unref) mapPurgeHandle.unref();

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

app.get('/api/me/settings', auth, async (req, res) => {
  try {
    const settings = await db.getUserSettings(req.user.uid);
    res.json(settings);
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/me/settings', auth, async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });
  try {
    for (const [key, value] of Object.entries(payload)) {
      if (!ALLOWED_USER_SETTINGS.has(key)) continue;
      const normalized = typeof value === 'string' ? value.trim() : value;
      if (normalized === '' || normalized === null || typeof normalized === 'undefined') {
        await db.deleteUserSetting(req.user.uid, key);
      } else {
        await db.setUserSetting(req.user.uid, key, String(normalized));
      }
    }
    const settings = await db.getUserSettings(req.user.uid);
    res.json(settings);
  } catch (err) {
    console.error('settings update failed', err);
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
      closeServerRcon(id);
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
    closeServerRcon(id);
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
    ensureRconBinding(server);
    let info = getCachedServerInfo(id);
    if (!info) {
      try {
        const reply = await sendRconCommand(server, 'serverinfo');
        info = parseServerInfoMessage(reply?.Message || '');
        cacheServerInfo(id, info);
      } catch (err) {
        info = { raw: null, mapName: null, size: null, seed: null };
      }
    }
    let playerPayload = '';
    try {
      const reply = await sendRconCommand(server, 'playerlist');
      playerPayload = reply?.Message || '';
    } catch (err) {
      console.error('playerlist command failed', err);
      return res.status(502).json({ error: 'playerlist_failed' });
    }
    const players = parsePlayerListMessage(playerPayload);
    const now = new Date();
    let mapRecord = await db.getServerMap(id);
    if (mapRecord && shouldResetMapRecord(mapRecord, now)) {
      await removeMapImage(mapRecord);
      await db.deleteServerMap(id);
      mapRecord = null;
    }
    const infoMapKey = deriveMapKey(info) || null;
    if (mapRecord && !mapRecord.custom && infoMapKey && mapRecord.map_key && mapRecord.map_key !== infoMapKey) {
      await removeMapImage(mapRecord);
      await db.deleteServerMap(id);
      mapRecord = null;
    }
    let map = mapRecordToPayload(id, mapRecord);
    if (map && !map.mapKey && infoMapKey) map.mapKey = infoMapKey;
    if (!map) {
      if (info?.size && info?.seed) {
        const userKey = await db.getUserSetting(req.user.uid, 'rustmaps_api_key');
        const apiKey = userKey || DEFAULT_RUSTMAPS_API_KEY || '';
        try {
          let metadata = await fetchRustMapMetadata(info.size, info.seed, apiKey);
          const finalKey = deriveMapKey(info, metadata) || infoMapKey;
          const storedMeta = { ...metadata, mapKey: finalKey };
          await removeMapImage(mapRecord);
          let imagePath = null;
          if (!metadata.isCustomMap) {
            const cacheKey = finalKey || infoMapKey || `server-${id}`;
            const cached = await findGlobalMapImage(cacheKey);
            if (cached?.path) {
              imagePath = cached.path;
            } else {
              try {
                const download = await downloadRustMapImage(metadata, apiKey);
                if (download?.buffer) {
                  const filePath = globalMapImageFilePath(cacheKey, download.extension);
                  await fs.writeFile(filePath, download.buffer);
                  imagePath = filePath;
                }
              } catch (imageErr) {
                console.warn('RustMaps image download failed', imageErr);
              }
            }
          }
          if (metadata.isCustomMap || imagePath) {
            await db.saveServerMap(id, {
              map_key: finalKey || infoMapKey,
              data: JSON.stringify(storedMeta),
              image_path: imagePath,
              custom: metadata.isCustomMap ? 1 : 0
            });
            mapRecord = await db.getServerMap(id);
            map = mapRecordToPayload(id, mapRecord);
            if (map && !map.mapKey) map.mapKey = finalKey || infoMapKey;
          } else {
            map = { ...storedMeta, imageUrl: null, cached: false, custom: !!metadata.isCustomMap };
          }
        } catch (err) {
          const code = err?.code || err?.message;
          if (code === 'rustmaps_api_key_missing' || code === 'rustmaps_unauthorized') {
            return res.status(400).json({ error: code });
          }
          if (code === 'rustmaps_not_found') {
            map = {
              mapKey: infoMapKey,
              cached: false,
              imageUrl: null,
              custom: false,
              notFound: true
            };
          } else if (code === 'rustmaps_image_error') {
            console.warn('RustMaps image download error', err);
            map = {
              mapKey: infoMapKey,
              cached: false,
              imageUrl: null,
              custom: false
            };
          } else {
            console.error('RustMaps metadata fetch failed', err);
            return res.status(502).json({ error: 'rustmaps_error' });
          }
        }
      } else if (mapRecord) {
        map = mapRecordToPayload(id, mapRecord);
      }
    }
    if (map && map.custom && !map.imageUrl) map.needsUpload = true;
    if (map && !map.mapKey && infoMapKey) map.mapKey = infoMapKey;
    if (map && typeof map.cached === 'undefined') map.cached = !!mapRecord;
    res.json({ players, map, info, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('live-map route error', err);
    res.status(500).json({ error: 'live_map_failed' });
  }
});

app.post('/api/servers/:id/map-image', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
  const { image, mapKey } = req.body || {};
  if (!image) return res.status(400).json({ error: 'missing_image' });
  const decoded = decodeBase64Image(image);
  if (!decoded?.buffer || decoded.buffer.length === 0) return res.status(400).json({ error: 'invalid_image' });
  if (decoded.buffer.length > 20 * 1024 * 1024) return res.status(413).json({ error: 'image_too_large' });
  try {
    const server = await db.getServer(id);
    if (!server) return res.status(404).json({ error: 'not_found' });
    let record = await db.getServerMap(id);
    const info = getCachedServerInfo(id) || {};
    const derivedKey = deriveMapKey(info) || null;
    const targetKey = mapKey || record?.map_key || derivedKey || `custom-${id}`;
    if (record) await removeMapImage(record);
    const filePath = serverMapImageFilePath(id, targetKey, decoded.extension);
    await fs.writeFile(filePath, decoded.buffer);
    let data = {};
    if (record?.data) {
      try { data = JSON.parse(record.data); } catch { data = {}; }
    }
    if (info?.size && !data.size) data.size = info.size;
    if (info?.seed && !data.seed) data.seed = info.seed;
    if (info?.mapName && !data.mapName) data.mapName = info.mapName;
    data = { ...data, mapKey: targetKey, manualUpload: true };
    await db.saveServerMap(id, {
      map_key: targetKey,
      data: JSON.stringify(data),
      image_path: filePath,
      custom: 1
    });
    record = await db.getServerMap(id);
    const map = mapRecordToPayload(id, record);
    res.json({ map, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('map upload failed', err);
    res.status(500).json({ error: 'map_upload_failed' });
  }
});

app.get('/api/servers/:id/map-image', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
  try {
    const record = await db.getServerMap(id);
    if (!record?.image_path) return res.status(404).json({ error: 'not_found' });
    if (!isWithinDir(record.image_path, MAP_STORAGE_DIR)) return res.status(404).json({ error: 'not_found' });
    await fs.stat(record.image_path);
    res.sendFile(path.resolve(record.image_path));
  } catch (err) {
    res.status(404).json({ error: 'not_found' });
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
    ensureRconBinding(row);
    const reply = await sendRconCommand(row, cmd);
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
      ensureRconBinding(row);
      await connectRcon(row);
      sendRconCommand(row, 'status').catch(() => {});
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
