import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import bcrypt from 'bcrypt';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { db, initDb } from './db/index.js';
import { authMiddleware, signToken, requireAdmin } from './auth.js';
// index.js
import {
  connectRcon,
  sendRconCommand,
  closeRcon as terminateRcon,
  subscribeToRcon,
  startAutoMonitor,
  rconEventBus
} from './rcon.js';
import { fetchRustMapMetadata, downloadRustMapImage } from './rustmaps.js';
import {
  normaliseRolePermissions,
  serialiseRolePermissions,
  hasGlobalPermission,
  canAccessServer,
  filterServersByPermission,
  filterStatusMapByPermission,
  describeRoleTemplates
} from './permissions.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(process.cwd(), 'data');
const MAP_STORAGE_DIR = path.join(DATA_DIR, 'maps');
const MAP_GLOBAL_CACHE_DIR = path.join(MAP_STORAGE_DIR, 'global');
const MAP_METADATA_CACHE_DIR = path.join(MAP_STORAGE_DIR, 'metadata');

const app = express();
const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: process.env.CORS_ORIGIN?.split(',') || '*' } });

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error('unauthorized'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const context = await loadUserContext(payload.uid);
    if (!context) return next(new Error('unauthorized'));
    socket.data.user = context;
    next();
  } catch (err) {
    next(new Error('unauthorized'));
  }
});

const PORT = parseInt(process.env.PORT || '8787', 10);
const BIND = process.env.BIND || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'dev';
const ALLOW_REGISTRATION = (process.env.ALLOW_REGISTRATION || '').toLowerCase() === 'true';

async function loadUserContext(userId) {
  const numeric = Number(userId);
  if (!Number.isFinite(numeric)) return null;
  const row = await db.getUser(numeric);
  if (!row) return null;
  const permissions = normaliseRolePermissions(row.role_permissions, row.role);
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    roleName: row.role_name || row.role,
    permissions
  };
}

function requireGlobalPermissionMiddleware(permission) {
  return (req, res, next) => {
    if (!hasGlobalPermission(req.authUser, permission)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

function ensureServerCapability(req, res, capability, param = 'id') {
  const raw = req.params?.[param];
  const id = toServerId(raw);
  if (id == null) {
    res.status(400).json({ error: 'invalid_id' });
    return null;
  }
  if (!canAccessServer(req.authUser, id, capability)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return id;
}

function projectRole(row) {
  if (!row) return null;
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    permissions: normaliseRolePermissions(row.permissions, row.key),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

const ROLE_KEY_PATTERN = /^[a-z0-9_\-]{3,32}$/i;
const RESERVED_ROLE_KEYS = new Set(['admin', 'user']);

function normalizeRoleKey(value) {
  if (typeof value !== 'string') return null;
  const key = value.trim();
  if (!ROLE_KEY_PATTERN.test(key)) return null;
  return key.toLowerCase();
}

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function findUserCaseInsensitive(username) {
  if (typeof db.getUserByUsernameInsensitive === 'function') {
    return await db.getUserByUsernameInsensitive(username);
  }
  return await db.getUserByUsername(username);
}

function buildRolePermissionsPayload(body = {}, roleKey = 'default') {
  const source = body && typeof body.permissions === 'object' ? body.permissions : {};
  const payload = { ...source };
  if (source.servers && typeof source.servers === 'object') {
    payload.servers = { ...source.servers };
  }
  if (source.global && typeof source.global === 'object') {
    payload.global = { ...source.global };
  }
  const allowed = body.allowedServers ?? body.allowed ?? body.servers;
  if (typeof allowed !== 'undefined') {
    payload.servers = { ...(payload.servers || {}), allowed };
  }
  if (typeof body.capabilities !== 'undefined') {
    payload.servers = { ...(payload.servers || {}), capabilities: body.capabilities };
  }
  if (body.global && typeof body.global === 'object') {
    payload.global = { ...(payload.global || {}), ...body.global };
  }
  return serialiseRolePermissions(payload, roleKey);
}

const toInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const MONITOR_INTERVAL = Math.max(toInt(process.env.MONITOR_INTERVAL_MS || '60000', 60000), 15000);
const MONITOR_TIMEOUT = Math.max(toInt(process.env.MONITOR_TIMEOUT_MS || '8000', 8000), 2000);
const DEFAULT_RUSTMAPS_API_KEY = process.env.RUSTMAPS_API_KEY || '';
const SERVER_INFO_TTL = Math.max(toInt(process.env.SERVER_INFO_CACHE_MS, 60000), 10000);
const ALLOWED_USER_SETTINGS = new Set(['rustmaps_api_key']);
const MAP_PURGE_INTERVAL = Math.max(toInt(process.env.MAP_PURGE_INTERVAL_MS, 6 * 60 * 60 * 1000), 15 * 60 * 1000);
const MAP_CACHE_TZ_OFFSET_MINUTES = 120; // UTC+2
const MAP_CACHE_RESET_HOUR = 20;
const MAP_CACHE_RESET_MINUTE = 0;
const KNOWN_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
const STEAM_PROFILE_CACHE_TTL = Math.max(toInt(process.env.STEAM_PROFILE_CACHE_MS || '300000', 300000), 60000);
const STEAM_PROFILE_REFRESH_INTERVAL = Math.max(toInt(process.env.STEAM_PROFILE_REFRESH_MS || '1800000', 1800000), 300000);
const STEAM_PLAYTIME_REFRESH_INTERVAL = Math.max(toInt(process.env.STEAM_PLAYTIME_REFRESH_MS || '21600000', 21600000), 3600000);
const RUST_STEAM_APP_ID = 252490;

const MIN_PLAYER_HISTORY_RANGE_MS = 60 * 60 * 1000; // 1 hour
const MAX_PLAYER_HISTORY_RANGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MIN_PLAYER_HISTORY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PLAYER_HISTORY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PLAYER_HISTORY_MAX_BUCKETS = 2000;

const DEFAULT_RANGE_INTERVALS = [
  { maxRange: 6 * 60 * 60 * 1000, interval: 15 * 60 * 1000 },
  { maxRange: 24 * 60 * 60 * 1000, interval: 60 * 60 * 1000 },
  { maxRange: 3 * 24 * 60 * 60 * 1000, interval: 3 * 60 * 60 * 1000 },
  { maxRange: 7 * 24 * 60 * 60 * 1000, interval: 6 * 60 * 60 * 1000 },
  { maxRange: MAX_PLAYER_HISTORY_RANGE_MS + 1, interval: 24 * 60 * 60 * 1000 }
];

function clamp(value, min, max) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function parseDurationMs(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  const str = String(value).trim();
  if (!str) return fallback;
  const match = str.match(/^(-?\d+(?:\.\d+)?)(ms|s|m|h|d)?$/i);
  if (!match) return fallback;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  const unit = (match[2] || 'ms').toLowerCase();
  switch (unit) {
    case 'ms': return numeric;
    case 's': return numeric * 1000;
    case 'm': return numeric * 60 * 1000;
    case 'h': return numeric * 60 * 60 * 1000;
    case 'd': return numeric * 24 * 60 * 60 * 1000;
    default: return fallback;
  }
}

function pickDefaultInterval(rangeMs) {
  for (const entry of DEFAULT_RANGE_INTERVALS) {
    if (rangeMs <= entry.maxRange) return entry.interval;
  }
  return DEFAULT_RANGE_INTERVALS[DEFAULT_RANGE_INTERVALS.length - 1].interval;
}

function createLogger(scope) {
  const prefix = `[${scope}]`;
  return {
    debug: (...args) => console.debug(prefix, ...args),
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args)
  };
}

function parseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
}

function alignTimestamp(ms, intervalMs, direction = 'floor') {
  if (!Number.isFinite(ms) || !Number.isFinite(intervalMs) || intervalMs <= 0) return ms;
  if (direction === 'ceil') {
    return Math.ceil(ms / intervalMs) * intervalMs;
  }
  return Math.floor(ms / intervalMs) * intervalMs;
}

function buildPlayerHistoryBuckets(rows = [], startMs, endMs, intervalMs) {
  const bucketMap = new Map();
  let latestSample = null;
  let overallQueuedPeak = null;
  let overallSleepersPeak = null;
  let overallJoiningPeak = null;
  let overallFpsPeak = null;
  let totalFpsSum = 0;
  let totalFpsSamples = 0;
  let offlineBucketCount = 0;

  for (const row of rows) {
    const timestamp = parseTimestamp(row?.recorded_at ?? row?.recordedAt);
    if (!Number.isFinite(timestamp)) continue;
    if (timestamp < startMs || timestamp > endMs) continue;
    const playerValueRaw = Number(row?.player_count ?? row?.playerCount);
    const maxPlayersRaw = Number(row?.max_players ?? row?.maxPlayers);
    const queuedRaw = Number(row?.queued ?? row?.queuedPlayers);
    const sleepersRaw = Number(row?.sleepers ?? row?.sleepersPlayers);
    const joiningRaw = Number(row?.joining ?? row?.joiningPlayers);
    const fpsRaw = extractFloat(row?.fps ?? row?.frame_rate ?? row?.framerate ?? row?.frameRate ?? row?.average_fps ?? row?.avgFps);
    const onlineRaw = row?.online ?? row?.is_online ?? row?.onlineFlag;
    const isOnline = typeof onlineRaw === 'boolean'
      ? onlineRaw
      : Number.isFinite(Number(onlineRaw))
        ? Number(onlineRaw) !== 0
        : true;

    if (!latestSample || timestamp > latestSample.ts) {
      latestSample = {
        ts: timestamp,
        playerCount: Number.isFinite(playerValueRaw) ? Math.max(0, Math.trunc(playerValueRaw)) : null,
        maxPlayers: Number.isFinite(maxPlayersRaw) ? Math.max(0, Math.trunc(maxPlayersRaw)) : null,
        queued: Number.isFinite(queuedRaw) ? Math.max(0, Math.trunc(queuedRaw)) : null,
        sleepers: Number.isFinite(sleepersRaw) ? Math.max(0, Math.trunc(sleepersRaw)) : null,
        joining: Number.isFinite(joiningRaw) ? Math.max(0, Math.trunc(joiningRaw)) : null,
        fps: Number.isFinite(fpsRaw) ? Math.max(0, Math.round(fpsRaw * 10) / 10) : null,
        online: isOnline
      };
    }

    const adjustedTs = timestamp === endMs ? timestamp - 1 : timestamp;
    const bucketStart = alignTimestamp(adjustedTs, intervalMs, 'floor');
    if (bucketStart < startMs || bucketStart >= endMs) continue;
    let bucket = bucketMap.get(bucketStart);
    if (!bucket) {
      bucket = {
        sum: 0,
        samples: 0,
        peak: null,
        maxPlayers: null,
        queuedMax: null,
        sleepersMax: null,
        joiningMax: null,
        fpsSum: 0,
        fpsSamples: 0,
        fpsPeak: null,
        offlineSamples: 0
      };
      bucketMap.set(bucketStart, bucket);
    }
    if (Number.isFinite(playerValueRaw)) {
      const playerValue = Math.max(0, playerValueRaw);
      bucket.sum += playerValue;
      bucket.samples += 1;
      bucket.peak = bucket.peak != null ? Math.max(bucket.peak, playerValue) : playerValue;
    }
    if (Number.isFinite(maxPlayersRaw)) {
      const maxValue = Math.max(0, Math.trunc(maxPlayersRaw));
      bucket.maxPlayers = bucket.maxPlayers != null ? Math.max(bucket.maxPlayers, maxValue) : maxValue;
    }
    if (Number.isFinite(queuedRaw)) {
      const queuedValue = Math.max(0, Math.trunc(queuedRaw));
      bucket.queuedMax = bucket.queuedMax != null ? Math.max(bucket.queuedMax, queuedValue) : queuedValue;
      if (overallQueuedPeak == null || queuedValue > overallQueuedPeak) overallQueuedPeak = queuedValue;
    }
    if (Number.isFinite(sleepersRaw)) {
      const sleepersValue = Math.max(0, Math.trunc(sleepersRaw));
      bucket.sleepersMax = bucket.sleepersMax != null ? Math.max(bucket.sleepersMax, sleepersValue) : sleepersValue;
      if (overallSleepersPeak == null || sleepersValue > overallSleepersPeak) overallSleepersPeak = sleepersValue;
    }
    if (Number.isFinite(joiningRaw)) {
      const joiningValue = Math.max(0, Math.trunc(joiningRaw));
      bucket.joiningMax = bucket.joiningMax != null ? Math.max(bucket.joiningMax, joiningValue) : joiningValue;
      if (overallJoiningPeak == null || joiningValue > overallJoiningPeak) overallJoiningPeak = joiningValue;
    }
    if (Number.isFinite(fpsRaw)) {
      const fpsValue = Math.max(0, fpsRaw);
      bucket.fpsSum += fpsValue;
      bucket.fpsSamples += 1;
      bucket.fpsPeak = bucket.fpsPeak != null ? Math.max(bucket.fpsPeak, fpsValue) : fpsValue;
      if (overallFpsPeak == null || fpsValue > overallFpsPeak) overallFpsPeak = fpsValue;
      totalFpsSum += fpsValue;
      totalFpsSamples += 1;
    }
    if (!isOnline) {
      bucket.offlineSamples += 1;
    }
  }

  const buckets = [];
  let totalSamples = 0;
  let totalPlayers = 0;
  let peakPlayers = 0;

  for (let cursor = startMs; cursor < endMs; cursor += intervalMs) {
    const bucket = bucketMap.get(cursor) || null;
    let average = null;
    let samples = 0;
    let maxPlayers = null;
    let queued = null;
    let sleepers = null;
    let joining = null;
    let fps = null;
    if (bucket && bucket.samples > 0) {
      samples = bucket.samples;
      average = bucket.sum / bucket.samples;
      totalSamples += bucket.samples;
      totalPlayers += bucket.sum;
      if (bucket.peak != null && bucket.peak > peakPlayers) peakPlayers = bucket.peak;
      if (bucket.maxPlayers != null) maxPlayers = bucket.maxPlayers;
      if (bucket.queuedMax != null) queued = bucket.queuedMax;
      if (bucket.sleepersMax != null) sleepers = bucket.sleepersMax;
      if (bucket.joiningMax != null) joining = bucket.joiningMax;
      if (bucket.fpsSamples > 0) fps = Math.round((bucket.fpsSum / bucket.fpsSamples) * 10) / 10;
    }
    if (bucket && bucket.offlineSamples > 0) {
      offlineBucketCount += 1;
    }
    buckets.push({
      timestamp: new Date(cursor).toISOString(),
      playerCount: Number.isFinite(average) ? Math.round(average * 10) / 10 : null,
      maxPlayers,
      queued,
      sleepers,
      joining,
      fps,
      samples,
      offline: Boolean(bucket?.offlineSamples)
    });
  }

  const summary = {
    peakPlayers: peakPlayers || null,
    averagePlayers: totalSamples > 0 ? Math.round((totalPlayers / totalSamples) * 100) / 100 : null,
    sampleCount: totalSamples,
    maxQueued: overallQueuedPeak,
    maxSleepers: overallSleepersPeak,
    maxJoining: overallJoiningPeak,
    maxFps: overallFpsPeak != null ? Math.round(overallFpsPeak * 10) / 10 : null,
    averageFps: totalFpsSamples > 0 ? Math.round((totalFpsSum / totalFpsSamples) * 10) / 10 : null,
    offlineBucketCount,
    latest: latestSample
      ? {
          timestamp: new Date(latestSample.ts).toISOString(),
          playerCount: latestSample.playerCount,
          maxPlayers: latestSample.maxPlayers,
          queued: latestSample.queued,
          sleepers: latestSample.sleepers,
          joining: latestSample.joining,
          fps: latestSample.fps,
          online: latestSample.online
        }
      : null
  };

  return { buckets, summary };
}

let lastGlobalMapCacheReset = null;

app.use(express.json({ limit: '25mb' }));
app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }));

await initDb();
await fs.mkdir(MAP_STORAGE_DIR, { recursive: true });
await fs.mkdir(MAP_GLOBAL_CACHE_DIR, { recursive: true });
await fs.mkdir(MAP_METADATA_CACHE_DIR, { recursive: true });
await purgeExpiredMapCaches().catch((err) => console.error('initial map purge failed', err));

const auth = authMiddleware(JWT_SECRET, { loadUserContext });
const rconBindings = new Map();
const statusMap = new Map();
const serverInfoCache = new Map();

let monitorController = null;
let monitorRefreshPromise = null;

const PLAYER_CONNECTION_DEDUPE_MS = 5 * 60 * 1000;
const recentPlayerConnections = new Map();
const OFFLINE_SNAPSHOT_MIN_INTERVAL = Math.max(Math.floor(MONITOR_INTERVAL / 2), 15000);
const offlineSnapshotTimestamps = new Map();
const ANSI_COLOR_REGEX = /\u001b\[[0-9;]*m/g;

const steamProfileCache = new Map();
let monitoring = false;
let monitorTimer = null;

function broadcastStatusUpdate(serverId, payload) {
  for (const socket of io.sockets.sockets.values()) {
    const context = socket.data?.user;
    if (canAccessServer(context, serverId, 'view')) {
      socket.emit('status-map', { [serverId]: payload });
    }
  }
}

function recordStatus(id, data) {
  const key = Number(id);
  const payload = { id: key, ...data };
  statusMap.set(key, payload);
  io.to(`srv:${key}`).emit('status', payload);
  broadcastStatusUpdate(key, payload);
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
    console: (line) => {
      const cleanLine = typeof line === 'string' ? line.replace(ANSI_COLOR_REGEX, '') : '';
      if (cleanLine) handlePlayerConnectionLine(key, cleanLine);
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

function extractPlayerConnection(line) {
  if (!line) return null;
  const normalized = line.replace(ANSI_COLOR_REGEX, '').trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (!lower.includes('connected') && !lower.includes('joined')) return null;
  if (lower.includes('disconnected') || lower.includes('kicked')) return null;
  const steamMatch = normalized.match(/\[(\d{17})\]/);
  if (!steamMatch) return null;
  const steamid = steamMatch[1];
  let prefix = normalized.slice(0, steamMatch.index).trim();
  prefix = prefix.replace(/^\[[^\]]*\]\s*/, '').trim();
  prefix = prefix.replace(/\s+(?:connecting|connected|joining|joined).*$/i, '').trim();
  const persona = prefix || null;
  return { steamid, persona };
}

function handlePlayerConnectionLine(serverId, line) {
  const info = extractPlayerConnection(line);
  if (!info) return;
  const key = `${serverId}:${info.steamid}`;
  const now = Date.now();
  const last = recentPlayerConnections.get(key) || 0;
  if (now - last < PLAYER_CONNECTION_DEDUPE_MS) return;
  recentPlayerConnections.set(key, now);
  if (recentPlayerConnections.size > 2000) {
    const cutoff = now - PLAYER_CONNECTION_DEDUPE_MS;
    for (const [k, ts] of recentPlayerConnections.entries()) {
      if (ts < cutoff) recentPlayerConnections.delete(k);
    }
  }
  const note = info.persona ? `Connected as ${info.persona}` : 'Connected';
  db.upsertPlayer({
    steamid: info.steamid,
    persona: info.persona || null,
    avatar: null,
    country: null,
    profileurl: null,
    vac_banned: 0
  }).catch((err) => console.warn('player upsert failed', err));
  db.recordServerPlayer({
    server_id: serverId,
    steamid: info.steamid,
    display_name: info.persona || null
  }).catch((err) => console.warn('server player upsert failed', err));
  db.addPlayerEvent({ steamid: info.steamid, server_id: serverId, event: 'connected', note }).catch((err) => {
    console.warn('player event log failed', err);
  });
}

function parseStatusMessage(message) {
  const info = {
    raw: message,
    hostname: null,
    players: null,
    queued: null,
    sleepers: null,
    fps: null
  };
  if (!message) return info;
  const lines = message.split(/\r?\n/);
  for (const line of lines) {
    const hostnameMatch = line.match(/hostname\s*[:=]\s*(.+)$/i);
    if (hostnameMatch) info.hostname = hostnameMatch[1].trim();
    const playersMatch = line.match(/players?\s*(?:[:=]\s*|\s+)(\d+)(?:\s*\/\s*(\d+))?/i);
    if (playersMatch) {
      const online = parseInt(playersMatch[1], 10);
      let max = playersMatch[2] ? parseInt(playersMatch[2], 10) : null;
      if (!Number.isFinite(max)) {
        const inlineMaxMatch = line.match(/\((\d+)\s*(?:max|players?)\)/i);
        if (inlineMaxMatch) {
          const parsed = parseInt(inlineMaxMatch[1], 10);
          if (Number.isFinite(parsed)) max = parsed;
        }
      }
      info.players = { online, max: Number.isFinite(max) ? max : null };
    }
    const queuedMatch = line.match(/queued\s*[:=]\s*(\d+)/i) || line.match(/\((\d+)\s*queued\)/i);
    if (queuedMatch) info.queued = parseInt(queuedMatch[1], 10);
    const sleepersMatch = line.match(/sleepers\s*[:=]\s*(\d+)/i);
    if (sleepersMatch) info.sleepers = parseInt(sleepersMatch[1], 10);
    const joiningMatch = line.match(/joining\s*[:=]\s*(\d+)/i) || line.match(/\((\d+)\s*joining\)/i);
    if (joiningMatch) info.joining = parseInt(joiningMatch[1], 10);
    const fpsMatch = line.match(/\bfps\b\s*[:=]\s*(\d+(?:\.\d+)?)/i) || line.match(/(\d+(?:\.\d+)?)\s*fps\b/i);
    if (fpsMatch) {
      const fpsValue = extractFloat(fpsMatch[1]);
      if (fpsValue != null) info.fps = fpsValue;
    }
  }
  return info;
}

function extractInteger(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const match = String(value).match(/-?\d+/);
  if (!match) return null;
  const num = parseInt(match[0], 10);
  return Number.isFinite(num) ? num : null;
}

function extractFloat(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = parseFloat(match[0]);
  return Number.isFinite(num) ? num : null;
}

function parseServerInfoMessage(message) {
  const result = { raw: message, mapName: null, size: null, seed: null, fps: null };
  if (!message) return { ...result };

  const trimmed = typeof message === 'string' ? message.trim() : '';
  const fields = {};

  const assign = (key, value) => {
    const keyText = String(key ?? '').trim();
    if (!keyText) return;
    const trimmedValue = typeof value === 'string' ? value.trim() : value;
    fields[keyText] = trimmedValue;

    const lower = keyText.toLowerCase();
    if (trimmedValue == null || trimmedValue === '') return;

    if (lower.includes('map') && !lower.includes('seed') && !lower.includes('size') && !lower.includes('url')) {
      if (!result.mapName) result.mapName = String(trimmedValue);
    }

    if (lower.includes('size')) {
      const size = extractInteger(trimmedValue);
      if (size != null) result.size = size;
    }

    if (lower.includes('seed')) {
      const seed = extractInteger(trimmedValue);
      if (seed != null) result.seed = seed;
    }
    if (lower.includes('fps') || lower.includes('framerate')) {
      const fpsValue = extractFloat(trimmedValue);
      if (fpsValue != null) result.fps = fpsValue;
    }
  };

  let parsedJson = false;
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      if (data && typeof data === 'object') {
        for (const [key, value] of Object.entries(data)) assign(key, value);
        parsedJson = true;
      }
    } catch {
      /* ignore JSON parse errors */
    }
  }

  if (!parsedJson) {
    const lines = trimmed.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([^:=\t]+?)\s*(?:[:=]\s*|\s{2,}|\t+)(.+)$/);
      if (match) {
        assign(match[1], match[2]);
        continue;
      }
      const parts = line.split(':');
      if (parts.length < 2) continue;
      const key = parts.shift();
      const value = parts.join(':');
      assign(key, value);
    }
  }

  if (result.mapName == null) {
    const directMap = fields.Map ?? fields.map ?? null;
    if (typeof directMap === 'string' && directMap.trim()) result.mapName = directMap.trim();
  }

  if (result.mapName && result.size == null) {
    const size = extractInteger(result.mapName);
    if (size != null) result.size = size;
  }

  if (result.size == null) {
    const sizeMatch = trimmed.match(/world\s*\.\s*size\s*(?:[:=]\s*|\s+)(\d+)/i)
      || trimmed.match(/\b(?:map|world)?\s*size\s*(?:[:=]\s*|\s+)(\d{3,})/i);
    if (sizeMatch) {
      const parsed = parseInt(sizeMatch[1], 10);
      if (Number.isFinite(parsed)) result.size = parsed;
    }
  }

  if (result.seed == null) {
    const seedMatch = trimmed.match(/world\s*\.\s*seed\s*(?:[:=]\s*|\s+)(\d+)/i)
      || trimmed.match(/\bseed\s*(?:[:=]\s*|\s+)(-?\d+)/i);
    if (seedMatch) {
      const parsed = parseInt(seedMatch[1], 10);
      if (Number.isFinite(parsed)) result.seed = parsed;
    }
  }

  if (result.fps == null) {
    const fpsMatch = trimmed.match(/\bfps\b\s*[:=]\s*(\d+(?:\.\d+)?)/i) || trimmed.match(/(\d+(?:\.\d+)?)\s*fps\b/i);
    if (fpsMatch) {
      const parsed = extractFloat(fpsMatch[1]);
      if (parsed != null) result.fps = parsed;
    }
    const framerateMatch = trimmed.match(/framerate\s*[:=]\s*(\d+(?:\.\d+)?)/i);
    if (framerateMatch) {
      const parsed = extractFloat(framerateMatch[1]);
      if (parsed != null) result.fps = parsed;
    }
  }

  const output = { ...fields, ...result };
  if (!output.mapName && typeof output.Map === 'string' && output.Map.trim()) output.mapName = output.Map.trim();
  if (!output.mapName && typeof output.map === 'string' && output.map.trim()) output.mapName = output.map.trim();
  if (output.size == null) {
    const mapSize = extractInteger(output.Map ?? output.map ?? null);
    if (mapSize != null) output.size = mapSize;
  }

  if (output.fps == null) {
    const fpsCandidates = [output.Framerate, output.framerate, output.fps];
    for (const candidate of fpsCandidates) {
      const parsed = extractFloat(candidate);
      if (parsed != null) {
        output.fps = parsed;
        break;
      }
    }
  }

  return output;
}

const STEAM_ID_REGEX = /^\d{17}$/;

function parseVector3(value) {
  if (!value) return null;

  const toNumber = (input) => {
    const num = Number(input);
    return Number.isFinite(num) ? num : null;
  };

  if (typeof value === 'string') {
    const matches = value.match(/-?\d+(?:\.\d+)?/g);
    if (!matches || matches.length < 3) return null;
    const x = toNumber(matches[0]);
    const y = toNumber(matches[1]);
    const z = toNumber(matches[2]);
    if (x == null || y == null || z == null) return null;
    return { x, y, z };
  }

  if (typeof value === 'object') {
    const source = value || {};
    const x = toNumber(source.x ?? source.X);
    const y = toNumber(source.y ?? source.Y);
    const z = toNumber(source.z ?? source.Z);
    if (x == null || y == null || z == null) return null;
    return { x, y, z };
  }

  return null;
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

  const result = [];
  for (const entry of payload) {
    const steamIdRaw = entry && typeof entry === 'object'
      ? (entry.SteamID ?? entry.steamId ?? entry.steamid ?? '')
      : '';
    const steamId = String(steamIdRaw || '').trim();
    if (!STEAM_ID_REGEX.test(steamId)) continue;

    const rawPosition = entry.Position ?? entry.position ?? null;
    const position = parseVector3(rawPosition);

    result.push({
      steamId,
      ownerSteamId: entry.OwnerSteamID || entry.ownerSteamId || entry.ownerSteamID || null,
      displayName: entry.DisplayName || entry.displayName || '',
      ping: Number(entry.Ping ?? entry.ping ?? 0) || 0,
      address: entry.Address || entry.address || '',
      connectedSeconds: Number(entry.ConnectedSeconds ?? entry.connectedSeconds ?? 0) || 0,
      violationLevel: Number(entry.VoiationLevel ?? entry.ViolationLevel ?? entry.violationLevel ?? 0) || 0,
      health: Number(entry.Health ?? entry.health ?? 0) || 0,
      position,
      teamId: Number(entry.TeamId ?? entry.teamId ?? 0) || 0,
      networkId: Number(entry.NetworkId ?? entry.networkId ?? 0) || null
    });
  }
  return result;
}

function parseDateLike(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return new Date(ts);
}

function normaliseDbPlayer(row) {
  if (!row) return null;
  const toNumber = (val) => {
    if (val === null || typeof val === 'undefined') return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };
  const toBoolInt = (val) => (val ? 1 : 0);
  const toIso = (val) => {
    const date = parseDateLike(val);
    return date ? date.toISOString() : null;
  };
  return {
    steamid: row.steamid || row.SteamID || '',
    persona: row.persona || null,
    avatar: row.avatar || null,
    country: row.country || null,
    profileurl: row.profileurl || null,
    vac_banned: toBoolInt(row.vac_banned),
    game_bans: toNumber(row.game_bans) ?? 0,
    last_ban_days: toNumber(row.last_ban_days),
    visibility: toNumber(row.visibility),
    rust_playtime_minutes: toNumber(row.rust_playtime_minutes),
    playtime_updated_at: toIso(row.playtime_updated_at || row.playtimeUpdatedAt),
    updated_at: toIso(row.updated_at || row.updatedAt)
  };
}

function normaliseServerPlayer(row) {
  if (!row) return null;
  const base = normaliseDbPlayer(row) || { steamid: row.steamid || row.SteamID || '' };
  const serverId = Number(row.server_id ?? row.serverId);
  const toIso = (val) => {
    const date = parseDateLike(val);
    return date ? date.toISOString() : null;
  };
  const ip = typeof row.last_ip === 'string' && row.last_ip
    ? row.last_ip
    : (typeof row.lastIp === 'string' && row.lastIp ? row.lastIp : null);
  const portRaw = row.last_port ?? row.lastPort;
  const portNum = Number(portRaw);
  const totalSecondsRaw = row.total_playtime_seconds ?? row.totalPlaytimeSeconds;
  const totalSeconds = Number.isFinite(Number(totalSecondsRaw)) ? Number(totalSecondsRaw) : null;
  const forced = typeof row.forced_display_name === 'string' && row.forced_display_name
    ? row.forced_display_name
    : (typeof row.forcedDisplayName === 'string' && row.forcedDisplayName ? row.forcedDisplayName : null);
  const rawDisplay = row.display_name || row.displayName || base.persona || base.steamid || '';
  const effectiveName = forced || rawDisplay || '';
  return {
    server_id: Number.isFinite(serverId) ? serverId : null,
    display_name: effectiveName,
    raw_display_name: rawDisplay || null,
    forced_display_name: forced || null,
    first_seen: toIso(row.first_seen || row.firstSeen),
    last_seen: toIso(row.last_seen || row.lastSeen),
    last_ip: ip || null,
    last_port: Number.isFinite(portNum) ? portNum : null,
    total_playtime_seconds: totalSeconds,
    total_playtime_minutes: Number.isFinite(totalSeconds) ? Math.floor(totalSeconds / 60) : null,
    ...base
  };
}

function getCachedSteamProfile(steamid) {
  const key = String(steamid || '').trim();
  if (!key) return null;
  const entry = steamProfileCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > STEAM_PROFILE_CACHE_TTL) {
    steamProfileCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedSteamProfile(steamid, data) {
  const key = String(steamid || '').trim();
  if (!key || !data) return;
  steamProfileCache.set(key, { data, timestamp: Date.now() });
}

function isProfileIncomplete(profile) {
  if (!profile) return true;
  const hasPersona = typeof profile.persona === 'string' && profile.persona.trim().length > 0;
  const hasAvatar = typeof profile.avatar === 'string' && profile.avatar.trim().length > 0;
  const vacBanned = profile.vac_banned;
  const gameBans = profile.game_bans;
  const hasBanInfo = !(typeof vacBanned === 'undefined' || vacBanned === null)
    && !(typeof gameBans === 'undefined' || gameBans === null);
  return !hasPersona || !hasAvatar || !hasBanInfo;
}

function shouldRefreshProfile(profile, now = Date.now()) {
  if (isProfileIncomplete(profile)) return true;
  const updated = parseDateLike(profile?.updated_at);
  if (!updated) return true;
  return now - updated.getTime() > STEAM_PROFILE_REFRESH_INTERVAL;
}

function shouldRefreshPlaytime(profile, now = Date.now()) {
  const updated = parseDateLike(profile?.playtime_updated_at);
  if (!updated) return true;
  return now - updated.getTime() > STEAM_PLAYTIME_REFRESH_INTERVAL;
}

function extractEndpoint(address) {
  if (typeof address !== 'string' || address.length === 0) {
    return { ip: null, port: null };
  }
  const [ipPart, portPart] = address.split(':');
  const ip = ipPart?.trim() || null;
  const portNum = parseInt(portPart, 10);
  return { ip, port: Number.isFinite(portNum) ? portNum : null };
}

function formatSteamProfilePayload(profile) {
  if (!profile) return null;
  const toNumber = (val) => {
    if (val === null || typeof val === 'undefined') return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };
  const vacBanned = !!(Number(profile.vac_banned) || profile.vac_banned === true);
  const gameBans = toNumber(profile.game_bans) || 0;
  const rawBanDays = toNumber(profile.last_ban_days);
  const hasBanHistory = vacBanned || gameBans > 0;
  const daysSinceLastBan = hasBanHistory && Number.isFinite(rawBanDays) ? rawBanDays : null;
  const minutes = toNumber(profile.rust_playtime_minutes);
  return {
    persona: profile.persona || null,
    avatar: profile.avatar || null,
    country: profile.country || null,
    profileUrl: profile.profileurl || null,
    vacBanned,
    gameBans,
    daysSinceLastBan,
    visibility: toNumber(profile.visibility),
    rustPlaytimeMinutes: minutes,
    updatedAt: profile.updated_at || null,
    playtimeUpdatedAt: profile.playtime_updated_at || null
  };
}

async function fetchRustPlaytimeMinutes(steamid, key) {
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(key)}&steamid=${encodeURIComponent(steamid)}&include_appinfo=0&include_played_free_games=1&appids_filter%5B0%5D=${RUST_STEAM_APP_ID}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) return null;
    throw new Error('steam_playtime_error');
  }
  const data = await res.json();
  const games = data?.response?.games;
  if (!Array.isArray(games)) return null;
  const rust = games.find((g) => Number(g.appid) === RUST_STEAM_APP_ID);
  if (!rust) return 0;
  const minutes = Number(rust.playtime_forever);
  return Number.isFinite(minutes) ? minutes : null;
}

async function resolveSteamProfiles(steamids) {
  const ids = [...new Set((steamids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const profileMap = new Map();
  if (ids.length === 0) return profileMap;
  if (typeof db.getPlayersBySteamIds === 'function') {
    try {
      const rows = await db.getPlayersBySteamIds(ids);
      for (const row of rows) {
        const normalized = normaliseDbPlayer(row);
        if (normalized?.steamid) profileMap.set(normalized.steamid, normalized);
      }
    } catch (err) {
      console.warn('Failed to load stored player profiles', err);
    }
  }
  const now = Date.now();
  const toFetch = [];
  for (const steamid of ids) {
    const cached = getCachedSteamProfile(steamid);
    if (cached && !isProfileIncomplete(cached)) {
      profileMap.set(steamid, cached);
      continue;
    }
    const existing = profileMap.get(steamid);
    if (!existing || isProfileIncomplete(existing) || shouldRefreshProfile(existing, now) || shouldRefreshPlaytime(existing, now)) {
      toFetch.push(steamid);
    } else if (existing) {
      profileMap.set(steamid, existing);
    }
  }
  if (toFetch.length > 0 && process.env.STEAM_API_KEY) {
    try {
      const fetched = await fetchSteamProfiles(toFetch, process.env.STEAM_API_KEY, { includePlaytime: true });
      const nowIso = new Date().toISOString();
      await Promise.all(fetched.map(async (profile) => {
        const normalized = {
          ...profile,
          updated_at: nowIso,
          playtime_updated_at: profile.playtime_updated_at || nowIso
        };
        profileMap.set(profile.steamid, normalized);
        setCachedSteamProfile(profile.steamid, normalized);
        await db.upsertPlayer({ ...profile, playtime_updated_at: normalized.playtime_updated_at });
      }));
    } catch (err) {
      console.warn('Steam profile enrichment failed', err);
    }
  }
  return profileMap;
}

async function enrichLivePlayers(players) {
  if (!Array.isArray(players) || players.length === 0) return [];
  try {
    const steamIds = players.map((p) => p?.steamId || '').filter(Boolean);
    const profiles = await resolveSteamProfiles(steamIds);
    return players.map((player) => {
      const endpoint = extractEndpoint(player.address);
      const profile = profiles.get(player.steamId) || null;
      return {
        ...player,
        ip: endpoint.ip,
        port: endpoint.port,
        steamProfile: formatSteamProfilePayload(profile)
      };
    });
  } catch (err) {
    console.warn('Failed to enrich live players', err);
    return players.map((player) => {
      const endpoint = extractEndpoint(player.address);
      return { ...player, ip: endpoint.ip, port: endpoint.port, steamProfile: null };
    });
  }
}

async function syncServerPlayerDirectory(serverId, players) {
  const numericId = Number(serverId);
  if (!Number.isFinite(numericId) || !Array.isArray(players)) return;
  const seenAt = new Date().toISOString();
  const writes = [];
  const toNumber = (val) => {
    if (val === null || typeof val === 'undefined') return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };
  for (const player of players) {
    const steamId = String(player?.steamId || '').trim();
    if (!steamId) continue;
    const displayName = player.displayName || player.persona || player.steamProfile?.persona || null;
    const ip = typeof player.ip === 'string' && player.ip ? player.ip : null;
    const port = toNumber(player.port);
    if (typeof db.recordServerPlayer === 'function') {
      writes.push(db.recordServerPlayer({
        server_id: numericId,
        steamid: steamId,
        display_name: displayName,
        seen_at: seenAt,
        ip,
        port
      }));
    }
    if (typeof db.upsertPlayer === 'function') {
      const profile = player.steamProfile || null;
      if (profile) {
        const gameBans = toNumber(profile.gameBans);
        const lastBanDays = toNumber(profile.daysSinceLastBan);
        const hasBanHistory = (profile.vacBanned ? 1 : 0) || Number(gameBans) > 0;
        const payload = {
          steamid: steamId,
          persona: profile.persona || displayName || null,
          avatar: profile.avatar || null,
          country: profile.country || null,
          profileurl: profile.profileUrl || null,
          vac_banned: profile.vacBanned ? 1 : 0,
          game_bans: gameBans,
          last_ban_days: hasBanHistory && lastBanDays !== null ? lastBanDays : null,
          visibility: toNumber(profile.visibility),
          rust_playtime_minutes: toNumber(profile.rustPlaytimeMinutes),
          playtime_updated_at: profile.playtimeUpdatedAt || null
        };
        writes.push(db.upsertPlayer(payload));
      } else if (displayName) {
        writes.push(db.upsertPlayer({ steamid: steamId, persona: displayName }));
      }
    }
  }
  if (writes.length > 0) {
    try {
      await Promise.all(writes);
    } catch (err) {
      console.warn('Failed to sync server player directory', err);
    }
  }
}

async function processMonitorPlayerListSnapshot(serverId, message) {
  try {
    let players = parsePlayerListMessage(message);
    if (!Array.isArray(players) || players.length === 0) return;
    players = await enrichLivePlayers(players);
    await syncServerPlayerDirectory(serverId, players);
  } catch (err) {
    console.warn('Failed to process monitored player list', err);
  }
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

async function fetchSizeAndSeedViaRcon(server) {
  const out = { size: null, seed: null };

  try {
    const res = await sendRconCommand(server, 'server.worldsize');
    const m = String(res?.Message || '').match(/worldsize\s*[:=]\s*(\d+)/i);
    if (m) out.size = parseInt(m[1], 10);
  } catch {
    // ignore
  }

  try {
    const res = await sendRconCommand(server, 'server.seed');
    const m = String(res?.Message || '').match(/seed\s*[:=]\s*(\d+)/i);
    if (m) out.seed = parseInt(m[1], 10);
  } catch {
    // ignore
  }

  return out;
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

function shouldResetMapRecord(record, now = new Date(), resetPoint = firstThursdayResetTime(now)) {
  if (!record) return false;
  const updated = parseDateLike(
    record.updated_at || record.updatedAt || record.created_at || record.createdAt
  );
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

function globalMapMetadataFilePath(mapKey) {
  const safeKey = sanitizeFilenameSegment(mapKey || 'map');
  return path.join(MAP_METADATA_CACHE_DIR, `${safeKey}.json`);
}

function isWithinDir(targetPath, dir) {
  if (!targetPath) return false;
  const resolvedTarget = path.resolve(targetPath);
  const resolvedDir = path.resolve(dir);
  return resolvedTarget.startsWith(resolvedDir);
}

async function loadGlobalMapMetadata(mapKey) {
  if (!mapKey) return null;
  const filePath = globalMapMetadataFilePath(mapKey);
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.mapKey) parsed.mapKey = mapKey;
    return parsed;
  } catch (err) {
    if (err?.code !== 'ENOENT') console.warn('Failed to read cached map metadata', err);
    return null;
  }
}

async function saveGlobalMapMetadata(mapKey, metadata) {
  if (!mapKey || !metadata || typeof metadata !== 'object') return;
  const cachedAt = parseDateLike(metadata.cachedAt) || new Date();
  const payload = { ...metadata, mapKey, cachedAt: cachedAt.toISOString() };
  const filePath = globalMapMetadataFilePath(mapKey);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to persist cached map metadata', err);
  }
}

async function removeGlobalMapMetadata(mapKey) {
  if (!mapKey) return;
  const filePath = globalMapMetadataFilePath(mapKey);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err?.code !== 'ENOENT') console.warn('Failed to remove cached map metadata', err);
  }
}

async function clearGlobalMapMetadata(activeMapKeys = new Set()) {
  let entries;
  try {
    entries = await fs.readdir(MAP_METADATA_CACHE_DIR, { withFileTypes: true });
  } catch (err) {
    if (err?.code === 'ENOENT') return;
    console.warn('global map metadata read failed', err);
    return;
  }
  const keep = new Set();
  for (const key of activeMapKeys || []) {
    keep.add(sanitizeFilenameSegment(key));
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!name.endsWith('.json')) continue;
    const base = name.slice(0, -5);
    if (keep.has(base)) continue;
    const target = path.join(MAP_METADATA_CACHE_DIR, name);
    try {
      await fs.unlink(target);
    } catch (err) {
      if (err?.code !== 'ENOENT') console.warn('Failed to remove cached map metadata file', err);
    }
  }
}

function isMapMetadataStale(meta, now = new Date(), resetPoint = firstThursdayResetTime(now)) {
  if (!meta) return false;
  const cachedAt = parseDateLike(meta.cachedAt);
  if (!cachedAt) return false;
  return now >= resetPoint && cachedAt < resetPoint;
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

function mapMetadataHasRemote(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const sources = [meta.downloadUrl, meta.imageUrl, meta.rawImageUrl, meta.thumbnailUrl];
  return sources.some((value) => typeof value === 'string' && value.length > 0);
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

async function purgeGlobalCacheIfDue(resetPoint, now = new Date(), activeImages = new Set(), activeMapKeys = new Set()) {
  if (!resetPoint) return;
  if (lastGlobalMapCacheReset && lastGlobalMapCacheReset >= resetPoint) return;
  await clearGlobalMapCache(activeImages);
  await clearGlobalMapMetadata(activeMapKeys);
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
  const activeMapKeys = new Set();
  if (Array.isArray(rows) && rows.length > 0) {
    for (const row of rows) {
      try {
        if (!shouldResetMapRecord(row, now, resetPoint)) {
          if (row?.image_path) activeImages.add(row.image_path);
          if (row?.map_key) activeMapKeys.add(row.map_key);
          continue;
        }
        await removeMapImage(row);
        if (row?.map_key) await removeGlobalMapMetadata(row.map_key);
        const id = Number(row.server_id ?? row.serverId ?? row.id);
        if (!Number.isFinite(id)) continue;
        await db.deleteServerMap(id);
      } catch (err) {
        console.warn('map cache purge failed for server', row?.server_id ?? row?.serverId ?? row?.id, err);
      }
    }
  }
  await purgeGlobalCacheIfDue(resetPoint, now, activeImages, activeMapKeys);
}

function mapRecordToPayload(serverId, record, metadataOverride = null) {
  if (!record) return null;
  let meta = {};
  if (record.data) {
    try { meta = JSON.parse(record.data); } catch { /* ignore parse errors */ }
  }
  if (metadataOverride && typeof metadataOverride === 'object') {
    meta = { ...meta, ...metadataOverride };
  }
  const updatedAt = record.updated_at || record.updatedAt || record.created_at || record.createdAt || null;
  const mapKey = record.map_key || meta.mapKey || null;
  if (mapKey && !meta.mapKey) meta.mapKey = mapKey;
  const cachedAt = metadataOverride?.cachedAt || meta.cachedAt || updatedAt;
  if (cachedAt && !meta.cachedAt) meta.cachedAt = cachedAt;
  const hasRemote = mapMetadataHasRemote(meta);
  const version = encodeURIComponent(cachedAt || updatedAt || '');
  const payload = {
    ...meta,
    mapKey,
    cached: !!record.image_path,
    cachedAt: cachedAt || updatedAt || null,
    custom: !!record.custom
  };
  if (record.image_path) {
    payload.imageUrl = `/api/servers/${serverId}/map-image?v=${version}`;
    payload.localImage = true;
  } else if (hasRemote) {
    payload.imageUrl = `/api/servers/${serverId}/map-image?v=${version}`;
    payload.remoteImage = true;
  } else {
    payload.imageUrl = null;
  }
  if (payload.custom && !record.image_path) payload.needsUpload = true;
  return payload;
}

function deriveMapKey(info = {}, metadata = null) {
  const rawSize = Number(metadata?.size ?? info.size);
  const rawSeed = Number(metadata?.seed ?? info.seed);
  const saveVersion = metadata?.saveVersion || null;
  if (Number.isFinite(rawSeed) && Number.isFinite(rawSize)) {
    let key = `${rawSeed}_${rawSize}`;
    if (saveVersion) key = `${key}_v${saveVersion}`;
    return key;
  }
  const parts = [];
  if (Number.isFinite(rawSeed)) parts.push(`seed${rawSeed}`);
  if (Number.isFinite(rawSize)) parts.push(`size${rawSize}`);
  if (saveVersion) parts.push(`v${saveVersion}`);
  if (!parts.length && info.mapName) parts.push(`name-${info.mapName}`);
  if (!parts.length && metadata?.id) parts.push(`id${metadata.id}`);
  return parts.length ? parts.join(':') : null;
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

function toServerId(value) {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function sanitizeDiscordToken(value, maxLength = 256) {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text) return '';
  if (!Number.isFinite(maxLength) || maxLength <= 0) return text;
  return text.slice(0, maxLength);
}

function sanitizeDiscordSnowflake(value, maxLength = 64) {
  if (value == null) return '';
  const digits = String(value).replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (!Number.isFinite(maxLength) || maxLength <= 0) return digits;
  return digits.slice(0, maxLength);
}

function projectDiscordIntegration(row) {
  if (!row || typeof row !== 'object') return null;
  const serverId = Number(row.server_id ?? row.serverId);
  return {
    serverId: Number.isFinite(serverId) ? serverId : null,
    guildId: row.guild_id || row.guildId || null,
    channelId: row.channel_id || row.channelId || null,
    statusMessageId: row.status_message_id || row.statusMessageId || null,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
    hasToken: Boolean(row.bot_token)
  };
}

function describeDiscordStatus(serverId) {
  const numericId = Number(serverId);
  const status = Number.isFinite(numericId) ? statusMap.get(numericId) : null;
  const details = status?.details || {};
  const playersOnline = Number(details?.players?.online);
  const maxPlayers = Number(details?.players?.max);
  const joiningRaw = Number(details?.joining);
  const serverOnline = Boolean(status?.ok);
  return {
    serverOnline,
    players: {
      current: Number.isFinite(playersOnline) ? playersOnline : 0,
      max: Number.isFinite(maxPlayers) ? maxPlayers : null
    },
    joining: Number.isFinite(joiningRaw) ? Math.max(0, joiningRaw) : 0,
    presence: serverOnline ? 'online' : 'dnd',
    presenceLabel: serverOnline ? 'Online' : 'Do Not Disturb',
    lastCheck: status?.lastCheck || null
  };
}

rconEventBus.on('monitor_status', (serverId, payload) => {
  const id = toServerId(serverId);
  if (id == null) return;
  const latency = Number.isFinite(payload?.latency) ? payload.latency : null;
  const replies = Array.isArray(payload?.replies) ? payload.replies : [];
  const findReply = (command) => {
    const target = String(command || '').trim().toLowerCase();
    if (!target) return null;
    const entry = replies.find((item) => typeof item?.command === 'string' && item.command.toLowerCase() === target);
    return entry?.reply || null;
  };
  const statusReply = findReply('status') || payload?.reply || null;
  const statusMessage = statusReply?.Message || statusReply?.message || '';
  const details = parseStatusMessage(statusMessage);

  const serverInfoReply = findReply('serverinfo');
  const serverInfoMessage = serverInfoReply?.Message || serverInfoReply?.message || '';
  if (serverInfoMessage) {
    try {
      const info = parseServerInfoMessage(serverInfoMessage);
      if (info) {
        cacheServerInfo(id, info);
        details.serverInfo = info;
        details.serverinfo = info;
        details.serverInfoRaw = serverInfoMessage;
      }
    } catch (err) {
      console.warn('Failed to parse serverinfo response', err);
    }
  }

  recordStatus(id, {
    ok: true,
    lastCheck: new Date().toISOString(),
    latency,
    details
  });
  if (typeof db.recordServerPlayerCount === 'function' && details?.players?.online != null) {
    const fpsSources = [
      details?.fps,
      details?.serverInfo?.fps,
      details?.serverinfo?.fps,
      details?.serverInfo?.Framerate,
      details?.serverinfo?.Framerate,
      details?.serverInfo?.framerate,
      details?.serverinfo?.framerate
    ];
    let fpsValue = null;
    for (const source of fpsSources) {
      const parsed = extractFloat(source);
      if (parsed != null) {
        fpsValue = parsed;
        break;
      }
    }
    const snapshot = {
      server_id: id,
      player_count: details.players.online,
      max_players: Number.isFinite(details.players.max) ? details.players.max : null,
      queued: Number.isFinite(details.queued) ? details.queued : null,
      sleepers: Number.isFinite(details.sleepers) ? details.sleepers : null,
      joining: Number.isFinite(details.joining) ? details.joining : null,
      fps: fpsValue != null ? fpsValue : null,
      online: 1
    };
    db.recordServerPlayerCount(snapshot).catch((err) => {
      console.warn('Failed to record player count snapshot', err);
    });
  }
  offlineSnapshotTimestamps.delete(id);
  const playerReply = findReply('playerlist');
  const playerMessage = playerReply?.Message || playerReply?.message || '';
  if (playerMessage) {
    processMonitorPlayerListSnapshot(id, playerMessage).catch((err) => {
      console.warn('Failed to persist monitored player list', err);
    });
  }
});

rconEventBus.on('monitor_error', (serverId, error) => {
  const id = toServerId(serverId);
  if (id == null) return;
  const message = error?.message || String(error);
  recordStatus(id, {
    ok: false,
    lastCheck: new Date().toISOString(),
    error: message
  });
  if (typeof db.recordServerPlayerCount === 'function') {
    const now = Date.now();
    const last = offlineSnapshotTimestamps.get(id) || 0;
    if (now - last >= OFFLINE_SNAPSHOT_MIN_INTERVAL) {
      offlineSnapshotTimestamps.set(id, now);
      db.recordServerPlayerCount({
        server_id: id,
        player_count: 0,
        max_players: null,
        queued: null,
        sleepers: null,
        joining: null,
        fps: null,
        online: 0
      }).catch((err) => {
        console.warn('Failed to record offline player snapshot', err);
      });
    }
  }
});


async function fetchServersForMonitoring() {
  if (typeof db.listServersWithSecrets === 'function') {
    return await db.listServersWithSecrets();
  }
  return await db.listServers();
}


async function refreshMonitoredServers() {
  if (monitorRefreshPromise) return monitorRefreshPromise;
  monitorRefreshPromise = (async () => {
    try {

      const list = await fetchServersForMonitoring();

      const seen = new Set();
      for (const row of list) {
        const key = Number(row.id);
        if (!Number.isFinite(key)) continue;
        seen.add(key);
        ensureRconBinding(row);
      }
      for (const key of [...rconBindings.keys()]) {
        if (!seen.has(key)) closeServerRcon(key);
      }
      for (const key of [...statusMap.keys()]) {
        if (!seen.has(key)) statusMap.delete(key);
      }
      for (const entryKey of [...recentPlayerConnections.keys()]) {
        const [serverId] = entryKey.split(':');
        const numeric = Number(serverId);
        if (Number.isFinite(numeric) && !seen.has(numeric)) recentPlayerConnections.delete(entryKey);
      }
      for (const [serverId] of [...offlineSnapshotTimestamps.entries()]) {
        if (!seen.has(serverId)) offlineSnapshotTimestamps.delete(serverId);
      }
      if (!monitorController) {
        monitorController = startAutoMonitor(list, {
          intervalMs: MONITOR_INTERVAL,
          timeoutMs: MONITOR_TIMEOUT,
          commands: ['status', 'playerlist', 'serverinfo']
        });
      } else {
        monitorController.update(list);
      }
    } catch (err) {
      console.error('monitor refresh failed', err);
    } finally {
      monitorRefreshPromise = null;
    }
  })();
  return monitorRefreshPromise;
}

const mapPurgeHandle = setInterval(() => {
  purgeExpiredMapCaches().catch((err) => console.error('scheduled map purge error', err));
}, MAP_PURGE_INTERVAL);
if (mapPurgeHandle.unref) mapPurgeHandle.unref();

await refreshMonitoredServers();

// --- Public metadata
app.get('/api/public-config', (req, res) => {
  res.json({ allowRegistration: ALLOW_REGISTRATION });
});

// --- Auth
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  const userName = normalizeUsername(username);
  if (!userName || !password) return res.status(400).json({ error: 'missing_fields' });
  try {
    const row = await db.getUserByUsername(userName);
    if (!row) return res.status(401).json({ error: 'invalid_login' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_login' });
    const permissions = normaliseRolePermissions(row.role_permissions, row.role);
    const roleName = row.role_name || row.role;
    const token = signToken(row, JWT_SECRET);
    res.json({ token, username: row.username, role: row.role, roleName, id: row.id, permissions });
  } catch (e) {
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/register', async (req, res) => {
  if (!ALLOW_REGISTRATION) return res.status(403).json({ error: 'registration_disabled' });
  const { username, password } = req.body || {};
  const userName = normalizeUsername(username);
  if (!userName || !password) return res.status(400).json({ error: 'missing_fields' });
  if (!/^[a-z0-9_\-.]{3,32}$/i.test(userName)) return res.status(400).json({ error: 'invalid_username' });
  if (password.length < 8) return res.status(400).json({ error: 'weak_password' });
  try {
    const existing = await findUserCaseInsensitive(userName);
    if (existing) return res.status(409).json({ error: 'username_taken' });
    const hash = bcrypt.hashSync(password, 10);
    const id = await db.createUser({ username: userName, password_hash: hash, role: 'user' });
    res.status(201).json({ id, username: userName });
  } catch (e) {
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/me', auth, async (req, res) => {
  try {
    const row = await db.getUser(req.user.uid);
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json({
      id: row.id,
      username: row.username,
      role: row.role,
      roleName: row.role_name || row.role,
      permissions: normaliseRolePermissions(row.role_permissions, row.role),
      created_at: row.created_at
    });
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
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'missing_fields' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'weak_password' });
  try {
    const user = await db.getUser(req.user.uid);
    if (!user) return res.status(404).json({ error: 'not_found' });
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_current_password' });
    const hash = bcrypt.hashSync(newPassword, 10);
    await db.updateUserPassword(req.user.uid, hash);
    res.json({ ok: true });
  } catch (err) {
    console.error('password update failed', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/users', auth, requireAdmin, async (req, res) => {
  try {
    const rows = await db.listUsers();
    const payload = rows.map((row) => ({
      id: row.id,
      username: row.username,
      role: row.role,
      roleName: row.role_name || row.role,
      created_at: row.created_at
    }));
    res.json(payload);
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/users', auth, requireAdmin, async (req, res) => {
  const { username, password, role = 'user' } = req.body || {};
  const userName = normalizeUsername(username);
  if (!userName || !password) return res.status(400).json({ error: 'missing_fields' });
  if (!/^[a-z0-9_\-.]{3,32}$/i.test(userName)) return res.status(400).json({ error: 'invalid_username' });
  if (password.length < 8) return res.status(400).json({ error: 'weak_password' });
  const roleKey = typeof role === 'string' && role.trim() ? role.trim() : 'user';
  try {
    const roleRecord = await db.getRole(roleKey);
    if (!roleRecord) return res.status(400).json({ error: 'invalid_role' });
    const existing = await findUserCaseInsensitive(userName);
    if (existing) return res.status(409).json({ error: 'username_taken' });
    const hash = bcrypt.hashSync(password, 10);
    const id = await db.createUser({ username: userName, password_hash: hash, role: roleKey });
    res.status(201).json({ id, username: userName, role: roleKey, roleName: roleRecord.name });
  } catch (e) {
    res.status(500).json({ error: 'db_error' });
  }
});

app.patch('/api/users/:id', auth, requireAdmin, async (req, res) => {
  const { role } = req.body || {};
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
  const roleKey = typeof role === 'string' && role.trim() ? role.trim() : '';
  if (!roleKey) return res.status(400).json({ error: 'invalid_role' });
  try {
    const roleRecord = await db.getRole(roleKey);
    if (!roleRecord) return res.status(400).json({ error: 'invalid_role' });
    await db.updateUserRole(id, roleKey);
    res.json({ ok: true, role: roleKey, roleName: roleRecord.name });
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

app.get('/api/roles', auth, async (req, res) => {
  if (!hasGlobalPermission(req.authUser, 'manageRoles') && !hasGlobalPermission(req.authUser, 'manageUsers')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const rows = await db.listRoles();
    const roles = rows.map((row) => projectRole(row));
    res.json({ roles, templates: describeRoleTemplates() });
  } catch (err) {
    console.error('list roles failed', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/roles', auth, requireGlobalPermissionMiddleware('manageRoles'), async (req, res) => {
  const body = req.body || {};
  const key = normalizeRoleKey(body.key);
  const nameInput = typeof body.name === 'string' ? body.name.trim() : '';
  if (!key) return res.status(400).json({ error: 'invalid_role_key' });
  if (!nameInput) return res.status(400).json({ error: 'invalid_name' });
  if (RESERVED_ROLE_KEYS.has(key)) return res.status(400).json({ error: 'reserved_role' });
  const description = typeof body.description === 'string' ? body.description.trim() : null;
  try {
    const existing = await db.getRole(key);
    if (existing) return res.status(409).json({ error: 'role_exists' });
    const permissions = buildRolePermissionsPayload(body, key);
    await db.createRole({ key, name: nameInput, description, permissions });
    const created = await db.getRole(key);
    res.status(201).json(projectRole(created));
  } catch (err) {
    console.error('create role failed', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.patch('/api/roles/:key', auth, requireGlobalPermissionMiddleware('manageRoles'), async (req, res) => {
  const key = normalizeRoleKey(req.params.key);
  if (!key) return res.status(400).json({ error: 'invalid_role_key' });
  const activeRoleKey = normalizeRoleKey(req.authUser?.role);
  if (activeRoleKey && activeRoleKey === key) {
    return res.status(400).json({ error: 'cannot_edit_active_role' });
  }
  const body = req.body || {};
  const updates = {};
  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (!trimmed) return res.status(400).json({ error: 'invalid_name' });
    updates.name = trimmed;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'description')) {
    if (body.description === null || body.description === '') updates.description = null;
    else if (typeof body.description === 'string') updates.description = body.description.trim();
    else updates.description = String(body.description);
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'permissions') ||
    Object.prototype.hasOwnProperty.call(body, 'allowedServers') ||
    Object.prototype.hasOwnProperty.call(body, 'allowed') ||
    Object.prototype.hasOwnProperty.call(body, 'servers') ||
    Object.prototype.hasOwnProperty.call(body, 'capabilities') ||
    Object.prototype.hasOwnProperty.call(body, 'global')
  ) {
    updates.permissions = buildRolePermissionsPayload(body, key);
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'no_changes' });
  try {
    const changed = await db.updateRole(key, updates);
    if (!changed) return res.status(404).json({ error: 'not_found' });
    const role = await db.getRole(key);
    res.json(projectRole(role));
  } catch (err) {
    console.error('update role failed', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/roles/:key', auth, requireGlobalPermissionMiddleware('manageRoles'), async (req, res) => {
  const key = normalizeRoleKey(req.params.key);
  if (!key) return res.status(400).json({ error: 'invalid_role_key' });
  if (RESERVED_ROLE_KEYS.has(key)) return res.status(400).json({ error: 'reserved_role' });
  try {
    const count = await db.countUsersByRole(key);
    if (count > 0) return res.status(400).json({ error: 'role_in_use', users: count });
    const deleted = await db.deleteRole(key);
    if (!deleted) return res.status(404).json({ error: 'not_found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('delete role failed', err);
    res.status(500).json({ error: 'db_error' });
  }
});

// --- Servers CRUD
app.get('/api/servers', auth, async (req, res) => {
  try {
    const rows = await db.listServers();
    const sanitized = rows.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const { password: _pw, ...rest } = row;
      return rest;
    });
    const filtered = filterServersByPermission(sanitized, req.authUser, 'view');
    res.json(filtered);
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/servers/status', auth, (req, res) => {
  res.json(filterStatusMapByPermission(getStatusSnapshot(), req.authUser, 'view'));
});

app.get('/api/servers/:id/status', auth, (req, res) => {
  const id = ensureServerCapability(req, res, 'view');
  if (id == null) return;
  const status = statusMap.get(id);
  if (!status) return res.status(404).json({ error: 'not_found' });
  res.json(status);
});

app.get('/api/servers/:id/discord', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'discord');
  if (id == null) return;
  if (typeof db.getServerDiscordIntegration !== 'function') {
    return res.status(501).json({ error: 'not_supported' });
  }
  try {
    const server = await db.getServer(id);
    if (!server) return res.status(404).json({ error: 'not_found' });
    const integration = await db.getServerDiscordIntegration(id);
    res.json({
      integration: projectDiscordIntegration(integration),
      status: describeDiscordStatus(id)
    });
  } catch (err) {
    console.error('failed to load discord integration', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/servers/:id/discord', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'discord');
  if (id == null) return;
  if (typeof db.saveServerDiscordIntegration !== 'function' || typeof db.getServerDiscordIntegration !== 'function') {
    return res.status(501).json({ error: 'not_supported' });
  }
  try {
    const server = await db.getServer(id);
    if (!server) return res.status(404).json({ error: 'not_found' });
    const existing = await db.getServerDiscordIntegration(id);
    const body = req.body || {};
    const guildId = sanitizeDiscordSnowflake(body.guildId ?? body.guild_id);
    const channelId = sanitizeDiscordSnowflake(body.channelId ?? body.channel_id);
    const tokenInput = sanitizeDiscordToken(body.botToken ?? body.bot_token);
    if (!guildId || !channelId) return res.status(400).json({ error: 'missing_fields' });
    let botToken = tokenInput;
    if (!botToken) {
      const existingToken = existing?.bot_token;
      if (existingToken) botToken = existingToken;
      else return res.status(400).json({ error: 'missing_bot_token' });
    }
    let statusMessageId = existing?.status_message_id ?? existing?.statusMessageId ?? null;
    if (existing?.channel_id && existing.channel_id !== channelId) {
      statusMessageId = null;
    }
    await db.saveServerDiscordIntegration(id, {
      bot_token: botToken,
      guild_id: guildId,
      channel_id: channelId,
      status_message_id: statusMessageId
    });
    const integration = await db.getServerDiscordIntegration(id);
    res.json({
      integration: projectDiscordIntegration(integration),
      status: describeDiscordStatus(id)
    });
  } catch (err) {
    console.error('failed to save discord integration', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/servers/:id/discord', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'discord');
  if (id == null) return;
  if (typeof db.deleteServerDiscordIntegration !== 'function') {
    return res.status(501).json({ error: 'not_supported' });
  }
  try {
    const server = await db.getServer(id);
    if (!server) return res.status(404).json({ error: 'not_found' });
    const removed = await db.deleteServerDiscordIntegration(id);
    res.json({
      removed: Number(removed) > 0,
      integration: null,
      status: describeDiscordStatus(id)
    });
  } catch (err) {
    console.error('failed to delete discord integration', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/servers', auth, requireGlobalPermissionMiddleware('manageServers'), async (req, res) => {
  const { name, host, port, password, tls } = req.body || {};
  if (!name || !host || !port || !password) return res.status(400).json({ error: 'missing_fields' });
  try {
    const id = await db.createServer({ name, host, port: parseInt(port, 10), password, tls: tls ? 1 : 0 });
    refreshMonitoredServers().catch((err) => console.error('monitor refresh (create) failed', err));
    res.json({ id });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

function shouldResetRcon(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const resetKeys = ['host', 'port', 'password', 'tls'];
  for (const key of resetKeys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) return true;
  }
  return false;
}

app.patch('/api/servers/:id', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'manage');
  if (id == null) return;
  const changes = req.body || {};
  const needsReset = shouldResetRcon(changes);
  try {
    const updated = await db.updateServer(id, changes);
    if (needsReset) {
      closeServerRcon(id);
      try {
        const row = await db.getServer(id);
        if (row) ensureRconBinding(row);
      } catch (err) {
        console.error('failed to rebind RCON after update', err);
      }
    }
    if (updated || needsReset) {
      refreshMonitoredServers().catch((err) => console.error('monitor refresh (update) failed', err));
    }
    res.json({ updated });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/servers/:id', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'manage');
  if (id == null) return;
  try {
    const deleted = await db.deleteServer(id);
    closeServerRcon(id);
    statusMap.delete(id);
    refreshMonitoredServers().catch((err) => console.error('monitor refresh (delete) failed', err));
    res.json({ deleted });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/servers/:id/live-map', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'liveMap');
  if (id == null) return;
  const logger = createLogger(`live-map:${id}`);
  logger.info('Live map request received');
  try {
    const server = await db.getServer(id);
    if (!server) return res.status(404).json({ error: 'not_found' });
    logger.debug('Loaded server details', { name: server?.name, host: server?.host, port: server?.port });
    ensureRconBinding(server);
    let playerPayload = '';
    try {
      const reply = await sendRconCommand(server, 'playerlist');
      playerPayload = reply?.Message || '';
    } catch (err) {
      logger.error('playerlist command failed', err);
      return res.status(502).json({ error: 'playerlist_failed' });
    }
    let players = parsePlayerListMessage(playerPayload);
    players = await enrichLivePlayers(players);
    await syncServerPlayerDirectory(id, players);
    logger.debug('Processed live players', { count: players.length });
    let info = getCachedServerInfo(id);
    if (!info) {
      try {
        const reply = await sendRconCommand(server, 'serverinfo');
        info = parseServerInfoMessage(reply?.Message || '');
        cacheServerInfo(id, info);
        logger.debug('Fetched serverinfo via RCON', { size: info?.size, seed: info?.seed, mapName: info?.mapName });
      } catch (err) {
        info = { raw: null, mapName: null, size: null, seed: null };
        logger.warn('Failed to fetch serverinfo via RCON', err);
      }
    }
    if (!info?.size || !info?.seed) {
      try {
        const { size, seed } = await fetchSizeAndSeedViaRcon(server);
        if (!info.size && Number.isFinite(size)) info.size = size;
        if (!info.seed && Number.isFinite(seed)) info.seed = seed;
        cacheServerInfo(id, info);
        logger.debug('Augmented server info with world settings', { size: info?.size, seed: info?.seed });
      } catch {
        // leave info as-is if lookups fail
      }
    }
    const now = new Date();
    const resetPoint = firstThursdayResetTime(now);
    const infoMapKey = deriveMapKey(info) || null;
    let mapRecord = await db.getServerMap(id);
    if (mapRecord && shouldResetMapRecord(mapRecord, now, resetPoint)) {
      logger.info('Existing map record expired, removing cached image');
      await removeMapImage(mapRecord);
      if (!mapRecord.custom && mapRecord.map_key) await removeGlobalMapMetadata(mapRecord.map_key);
      await db.deleteServerMap(id);
      mapRecord = null;
    }
    if (mapRecord && !mapRecord.custom && infoMapKey && mapRecord.map_key && mapRecord.map_key !== infoMapKey) {
      logger.info('Map key changed, clearing stale cache', { previousKey: mapRecord.map_key, nextKey: infoMapKey });
      await removeMapImage(mapRecord);
      if (mapRecord.map_key) await removeGlobalMapMetadata(mapRecord.map_key);
      await db.deleteServerMap(id);
      mapRecord = null;
    }

    let mapMetadata = null;
    if (mapRecord?.map_key) {
      const cachedMeta = await loadGlobalMapMetadata(mapRecord.map_key);
      if (cachedMeta && isMapMetadataStale(cachedMeta, now, resetPoint)) {
        logger.info('Cached map metadata expired, clearing stored record', { mapKey: mapRecord.map_key });
        await removeMapImage(mapRecord);
        await removeGlobalMapMetadata(mapRecord.map_key);
        await db.deleteServerMap(id);
        mapRecord = null;
      } else if (cachedMeta) {
        mapMetadata = cachedMeta;
      }
    }

    if (!mapRecord && infoMapKey) {
      const cachedMeta = await loadGlobalMapMetadata(infoMapKey);
      if (cachedMeta && !isMapMetadataStale(cachedMeta, now, resetPoint)) {
        const cacheKey = cachedMeta.mapKey || infoMapKey;
        const cachedImage = await findGlobalMapImage(cacheKey);
        logger.info('Rehydrating map record from global cache', { mapKey: cacheKey, hasImage: !!cachedImage?.path });
        await db.saveServerMap(id, {
          map_key: cacheKey,
          data: JSON.stringify({ ...cachedMeta }),
          image_path: cachedImage?.path || null,
          custom: cachedMeta.isCustomMap ? 1 : 0
        });
        mapRecord = await db.getServerMap(id);
        mapMetadata = cachedMeta;
      } else if (cachedMeta) {
        await removeGlobalMapMetadata(infoMapKey);
      }
    }

    let map = mapRecordToPayload(id, mapRecord, mapMetadata);
    if (map && !map.mapKey && infoMapKey) map.mapKey = infoMapKey;
    if (!map) {
      if (info?.size && info?.seed) {
        const userKey = await db.getUserSetting(req.user.uid, 'rustmaps_api_key');
        const apiKey = userKey || DEFAULT_RUSTMAPS_API_KEY || '';
        try {
          logger.info('Requesting RustMaps metadata', { size: info.size, seed: info.seed, apiKeyProvided: !!apiKey });
          let metadata = await fetchRustMapMetadata(info.size, info.seed, apiKey, { logger });
          const finalKey = deriveMapKey(info, metadata) || infoMapKey;
          const storedMeta = { ...metadata, mapKey: finalKey };
          if (Number.isFinite(metadata?.size)) info.size = metadata.size;
          if (Number.isFinite(metadata?.seed)) info.seed = metadata.seed;
          if (metadata?.mapName) info.mapName = metadata.mapName;
          cacheServerInfo(id, info);
          if (!storedMeta.size && Number.isFinite(info.size)) storedMeta.size = info.size;
          if (!storedMeta.seed && Number.isFinite(info.seed)) storedMeta.seed = info.seed;
          storedMeta.cachedAt = new Date().toISOString();
          await removeMapImage(mapRecord);
          if (mapRecord?.map_key && mapRecord.map_key !== finalKey) {
            await removeGlobalMapMetadata(mapRecord.map_key);
          }
          let imagePath = null;
          if (!metadata.isCustomMap) {
            const cacheKey = finalKey || infoMapKey || `server-${id}`;
            const cached = await findGlobalMapImage(cacheKey);
            if (cached?.path) {
              logger.info('Using cached global map image', { cacheKey });
              imagePath = cached.path;
            } else {
              try {
                const download = await downloadRustMapImage(metadata, apiKey);
                if (download?.buffer) {
                  const filePath = globalMapImageFilePath(cacheKey, download.extension);
                  await fs.mkdir(path.dirname(filePath), { recursive: true });
                  await fs.writeFile(filePath, download.buffer);
                  logger.info('Downloaded RustMaps image', { cacheKey, path: filePath });
                  imagePath = filePath;
                }
              } catch (imageErr) {
                logger.warn('RustMaps image download failed', imageErr);
              }
            }
          }
          const cachedImage = !!imagePath;
          logger.info('Persisting map metadata to database', {
            mapKey: finalKey || infoMapKey,
            custom: metadata.isCustomMap,
            cached: cachedImage
          });
          const mapKeyToPersist = finalKey || infoMapKey;
          await db.saveServerMap(id, {
            map_key: mapKeyToPersist,
            data: JSON.stringify(storedMeta),
            image_path: imagePath,
            custom: metadata.isCustomMap ? 1 : 0
          });
          await saveGlobalMapMetadata(mapKeyToPersist, storedMeta);
          mapRecord = await db.getServerMap(id);
          map = mapRecordToPayload(id, mapRecord, storedMeta);
          if (map && !map.mapKey) map.mapKey = mapKeyToPersist;
          if (!cachedImage && mapMetadataHasRemote(storedMeta)) {
            logger.info('Map imagery available remotely, awaiting proxy fetch', { mapKey: finalKey || infoMapKey });
          }
        } catch (err) {
          const code = err?.code || err?.message;
          if (code === 'rustmaps_api_key_missing' || code === 'rustmaps_unauthorized' || code === 'rustmaps_invalid_parameters') {
            logger.warn('RustMaps rejected request', { code });
            return res.status(400).json({ error: code });
          }
          if (code === 'rustmaps_generation_timeout') {
            logger.warn('RustMaps generation timed out');
            return res.status(504).json({ error: code });
          }
          if (code === 'rustmaps_generation_pending') {
            logger.info('RustMaps generation pending');
            return res.status(202).json({ error: code });
          }
          if (code === 'rustmaps_not_found') {
            logger.info('RustMaps has no data for this map yet', { mapKey: infoMapKey });
            map = {
              mapKey: infoMapKey,
              cached: false,
              imageUrl: null,
              custom: false,
              notFound: true
            };
          } else if (code === 'rustmaps_image_error') {
            logger.warn('RustMaps image download error', err);
            map = {
              mapKey: infoMapKey,
              cached: false,
              imageUrl: null,
              custom: false
            };
          } else {
            logger.error('RustMaps metadata fetch failed', err);
            return res.status(502).json({ error: 'rustmaps_error' });
          }
        }
      } else if (mapRecord) {
        map = mapRecordToPayload(id, mapRecord);
      }
    }
    if (map && map.custom && !map.imageUrl) map.needsUpload = true;
    if (map && !map.mapKey && infoMapKey) map.mapKey = infoMapKey;
    // keep cached flag consistent
    if (map && typeof map.cached === 'undefined') map.cached = !!(mapRecord?.image_path);


    // unified response (keeps main's shape, adds richer status from codex)
    const mapPayload = map || null;

    // derive a status + requirements summary for the frontend
    let status = 'ready';
    const requirements = {};
    if (!mapPayload) {
      if (!info?.size || !info?.seed) {
        status = 'awaiting_world_details';
        requirements.world = {
          sizeMissing: !info?.size,
          seedMissing: !info?.seed
        };
      } else {
        status = 'awaiting_imagery';
      }
    } else if (mapPayload.notFound) {
      status = 'rustmaps_not_found';
    } else if (mapPayload.custom && mapPayload.needsUpload) {
      status = 'awaiting_upload';
    } else if (!mapPayload.imageUrl) {
      status = 'awaiting_imagery';
    }

    // structured log so you can see why the map didn't render
    logger.info('Live map payload ready', {
      players: players.length,
      mapKey: mapPayload?.mapKey || null,
      cached: !!mapPayload?.cached,
      hasImage: !!mapPayload?.imageUrl,
      status
    });

    // backward-compatible shape + richer fields
    const responsePayload = {
      players,
      map: mapPayload,
      info,
      status,                    // <-- new
      fetchedAt: new Date().toISOString()
    };
    if (Object.keys(requirements).length > 0) {
      responsePayload.requirements = requirements;   // <-- new
    }

    res.json(responsePayload);
  } catch (err) {
    logger.error('live-map route error', err);
    res.status(500).json({ error: 'live_map_failed' });
  }
});

app.post('/api/servers/:id/live-map/world', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'liveMap');
  if (id == null) return;
  const { size, seed } = req.body || {};
  const numericSize = Number(size);
  const numericSeed = Number(seed);
  if (!Number.isFinite(numericSize) || numericSize <= 0 || !Number.isFinite(numericSeed)) {
    return res.status(400).json({ error: 'invalid_world_config' });
  }
  const logger = createLogger(`live-map-config:${id}`);
  logger.info('Manual RustMaps request received', { size: numericSize, seed: numericSeed });
  try {
    const server = await db.getServer(id);
    if (!server) return res.status(404).json({ error: 'not_found' });
    const userKey = await db.getUserSetting(req.user.uid, 'rustmaps_api_key');
    const apiKey = userKey || DEFAULT_RUSTMAPS_API_KEY || '';
    if (!apiKey) {
      logger.warn('RustMaps API key missing for manual request');
      return res.status(400).json({ error: 'rustmaps_api_key_missing' });
    }

    const info = { ...(getCachedServerInfo(id) || {}) };
    info.size = numericSize;
    info.seed = numericSeed;

    let metadata;
    try {
      metadata = await fetchRustMapMetadata(numericSize, numericSeed, apiKey, {
        logger,
        timeoutMs: Math.max(30000, toInt(process.env.RUSTMAPS_CONFIG_TIMEOUT_MS) || 45000)
      });
    } catch (err) {
      const code = err?.code || err?.message;
      if (code === 'rustmaps_generation_timeout') {
        cacheServerInfo(id, info);
        logger.info('RustMaps still generating map after timeout');
        return res.status(202).json({
          status: 'pending',
          info,
          map: null
        });
      }
      if (code === 'rustmaps_api_key_missing' || code === 'rustmaps_unauthorized' || code === 'rustmaps_invalid_parameters') {
        logger.warn('RustMaps rejected manual request', { code });
        return res.status(400).json({ error: code });
      }
      if (code === 'rustmaps_not_found') {
        cacheServerInfo(id, info);
        logger.info('RustMaps has no data for requested map');
        return res.status(404).json({ error: code });
      }
      throw err;
    }

    const enrichedInfo = { ...info };
    if (Number.isFinite(metadata?.size)) enrichedInfo.size = metadata.size;
    if (Number.isFinite(metadata?.seed)) enrichedInfo.seed = metadata.seed;
    if (metadata?.mapName) enrichedInfo.mapName = metadata.mapName;
    cacheServerInfo(id, enrichedInfo);

    const finalKey = deriveMapKey(enrichedInfo, metadata) || deriveMapKey(enrichedInfo) || `server-${id}`;
    const storedMeta = { ...metadata, mapKey: finalKey };
    if (!storedMeta.size && Number.isFinite(enrichedInfo.size)) storedMeta.size = enrichedInfo.size;
    if (!storedMeta.seed && Number.isFinite(enrichedInfo.seed)) storedMeta.seed = enrichedInfo.seed;
    storedMeta.cachedAt = new Date().toISOString();

    let record = await db.getServerMap(id);
    if (record) await removeMapImage(record);
    if (record?.map_key && record.map_key !== finalKey) await removeGlobalMapMetadata(record.map_key);

    let imagePath = null;
    if (!metadata?.isCustomMap) {
      const cacheKey = finalKey;
      const cached = await findGlobalMapImage(cacheKey);
      if (cached?.path) {
        logger.info('Using cached global map image for manual request', { cacheKey });
        imagePath = cached.path;
      } else {
        try {
          const download = await downloadRustMapImage(metadata, apiKey);
          if (download?.buffer) {
            const filePath = globalMapImageFilePath(cacheKey, download.extension);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, download.buffer);
            logger.info('Downloaded RustMaps image for manual request', { cacheKey, path: filePath });
            imagePath = filePath;
          }
        } catch (imageErr) {
          logger.warn('RustMaps image download failed during manual request', imageErr);
        }
      }
    }

    await db.saveServerMap(id, {
      map_key: finalKey,
      data: JSON.stringify(storedMeta),
      image_path: imagePath,
      custom: metadata?.isCustomMap ? 1 : 0
    });
    await saveGlobalMapMetadata(finalKey, storedMeta);
    record = await db.getServerMap(id);
    let map = mapRecordToPayload(id, record, storedMeta);
    if (map && !map.mapKey) map.mapKey = finalKey;
    if (map && typeof map.cached === 'undefined') map.cached = !!imagePath;
    if (map && map.custom && !map.imageUrl) map.needsUpload = true;

    logger.info('Manual RustMaps request completed', {
      mapKey: map?.mapKey || finalKey,
      cached: !!map?.cached,
      hasImage: !!map?.imageUrl
    });

    res.json({
      status: map?.imageUrl ? 'ready' : 'awaiting_imagery',
      map,
      info: enrichedInfo,
      fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    const code = err?.code || err?.message;
    if (code === 'rustmaps_image_error') {
      logger.warn('RustMaps image download failed', err);
      return res.status(502).json({ error: 'rustmaps_image_error' });
    }
    logger.error('Manual RustMaps request failed', err);
    res.status(502).json({ error: 'rustmaps_error' });
  }
});

app.post('/api/servers/:id/map-image', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'manage');
  if (id == null) return;
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
    if (record?.map_key && record.map_key !== targetKey) await removeGlobalMapMetadata(record.map_key);
    const filePath = serverMapImageFilePath(id, targetKey, decoded.extension);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, decoded.buffer);
    let data = {};
    if (record?.data) {
      try { data = JSON.parse(record.data); } catch { data = {}; }
    }
    if (info?.size && !data.size) data.size = info.size;
    if (info?.seed && !data.seed) data.seed = info.seed;
    if (info?.mapName && !data.mapName) data.mapName = info.mapName;
    data = { ...data, mapKey: targetKey, manualUpload: true };
    if (!data.cachedAt) data.cachedAt = new Date().toISOString();
    await db.saveServerMap(id, {
      map_key: targetKey,
      data: JSON.stringify(data),
      image_path: filePath,
      custom: 1
    });
    await saveGlobalMapMetadata(targetKey, data);
    record = await db.getServerMap(id);
    const map = mapRecordToPayload(id, record, data);
    res.json({ map, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('map upload failed', err);
    res.status(500).json({ error: 'map_upload_failed' });
  }
});

app.get('/api/servers/:id/map-image', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'liveMap');
  if (id == null) return;
  const logger = createLogger(`map-image:${id}`);
  try {
    let record = await db.getServerMap(id);
    let meta = null;
    if (record?.data) {
      try {
        meta = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
      } catch (err) {
        logger.warn('Failed to parse stored map metadata', err);
      }
    }

    const now = new Date();
    const resetPoint = firstThursdayResetTime(now);
    const resolvedMapKey = record?.map_key || meta?.mapKey || null;
    if (resolvedMapKey) {
      const cachedMeta = await loadGlobalMapMetadata(resolvedMapKey);
      if (cachedMeta && isMapMetadataStale(cachedMeta, now, resetPoint)) {
        await removeGlobalMapMetadata(resolvedMapKey);
      } else if (cachedMeta) {
        meta = { ...cachedMeta, ...(meta || {}) };
      }
    }

    const serveLocalImage = async () => {
      if (!record?.image_path) return false;
      if (!isWithinDir(record.image_path, MAP_STORAGE_DIR)) return false;
      try {
        await fs.stat(record.image_path);
        res.sendFile(path.resolve(record.image_path));
        return true;
      } catch (err) {
        if (err?.code === 'ENOENT') {
          logger.warn('Cached map image missing from disk, clearing reference', { path: record.image_path });
          await db.saveServerMap(id, {
            map_key: record.map_key || meta?.mapKey || null,
            data: record.data ?? (meta ? JSON.stringify(meta) : null),
            image_path: null,
            custom: record.custom ? 1 : 0
          });
          record = await db.getServerMap(id);
          return false;
        }
        throw err;
      }
    };

    if (await serveLocalImage()) return;

    if (!meta) {
      logger.warn('No map metadata available for proxy fetch');
      return res.status(404).json({ error: 'not_found' });
    }

    if (!mapMetadataHasRemote(meta)) {
      logger.warn('No remote imagery references available', { mapKey: record?.map_key || meta?.mapKey || null });
      return res.status(404).json({ error: 'not_found' });
    }

    const userKey = await db.getUserSetting(req.user.uid, 'rustmaps_api_key');
    const apiKey = userKey || DEFAULT_RUSTMAPS_API_KEY || '';
    if (!apiKey) {
      logger.warn('RustMaps API key unavailable for proxy fetch');
      return res.status(404).json({ error: 'not_found' });
    }

    try {
      logger.info('Downloading RustMaps imagery for proxy response');
      const download = await downloadRustMapImage(meta, apiKey);
      if (!download?.buffer) throw new Error('download_failed');
      const info = getCachedServerInfo(id) || {};
      const finalKey = record?.map_key || meta.mapKey || deriveMapKey(info, meta) || deriveMapKey(info) || `server-${id}`;
      const filePath = globalMapImageFilePath(finalKey, download.extension);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, download.buffer);
      const storedMeta = { ...meta, mapKey: finalKey };
      if (!storedMeta.size && Number.isFinite(info.size)) storedMeta.size = info.size;
      if (!storedMeta.seed && Number.isFinite(info.seed)) storedMeta.seed = info.seed;
      if (!storedMeta.cachedAt) storedMeta.cachedAt = new Date().toISOString();
      await db.saveServerMap(id, {
        map_key: finalKey,
        data: JSON.stringify(storedMeta),
        image_path: filePath,
        custom: meta.isCustomMap ? 1 : 0
      });
      await saveGlobalMapMetadata(finalKey, storedMeta);
      res.setHeader('Content-Type', download.mime || 'image/jpeg');
      res.send(download.buffer);
    } catch (err) {
      if (err?.code === 'rustmaps_image_error') {
        logger.warn('RustMaps image download failed', err);
      } else {
        logger.error('RustMaps proxy fetch failed', err);
      }
      res.status(502).json({ error: 'map_image_unavailable' });
    }
  } catch (err) {
    logger.error('map image handler failed', err);
    res.status(500).json({ error: 'map_image_error' });
  }
});

// --- RCON
app.post('/api/rcon/:id', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'commands');
  if (id == null) return;
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

app.get('/api/servers/:id/players', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'players');
  if (id == null) return;
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  const offset = parseInt(req.query.offset || '0', 10);
  try {
    const rows = await db.listServerPlayers(id, { limit, offset });
    const payload = rows.map((row) => normaliseServerPlayer(row)).filter(Boolean);
    res.json(payload);
  } catch (err) {
    console.error('listServerPlayers failed', err);
    res.status(500).json({ error: 'db_error' });
  }
});

// --- Player history: /api/servers/:id/player-counts
app.get('/api/servers/:id/player-counts', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'players');
  if (id == null) return;

  const now = Date.now();
  const explicitTo = parseTimestamp(req.query.to) ?? now;
  let endMs = Number.isFinite(explicitTo) ? explicitTo : now;

  const rangeMsRaw = parseDurationMs(req.query.range, 24 * 60 * 60 * 1000);
  let startMs = parseTimestamp(req.query.from);

  const clampedRange = clamp(rangeMsRaw, MIN_PLAYER_HISTORY_RANGE_MS, MAX_PLAYER_HISTORY_RANGE_MS);
  if (!Number.isFinite(startMs)) startMs = endMs - clampedRange;

  if (endMs - startMs < MIN_PLAYER_HISTORY_RANGE_MS) startMs = endMs - MIN_PLAYER_HISTORY_RANGE_MS;
  if (endMs <= startMs) endMs = startMs + MIN_PLAYER_HISTORY_RANGE_MS;
  if (endMs - startMs > MAX_PLAYER_HISTORY_RANGE_MS) startMs = endMs - MAX_PLAYER_HISTORY_RANGE_MS;

  let intervalMs = parseDurationMs(req.query.interval, null);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) intervalMs = pickDefaultInterval(endMs - startMs);
  intervalMs = clamp(intervalMs, MIN_PLAYER_HISTORY_INTERVAL_MS, MAX_PLAYER_HISTORY_INTERVAL_MS);

  let alignedStart = alignTimestamp(startMs, intervalMs, 'floor');
  let alignedEnd = alignTimestamp(endMs, intervalMs, 'ceil');
  if (alignedEnd <= alignedStart) alignedEnd = alignedStart + intervalMs;

  const span = alignedEnd - alignedStart;
  if (span <= 0) {
    return res.json({
      serverId: id,
      from: new Date(alignedStart).toISOString(),
      to: new Date(alignedEnd).toISOString(),
      intervalSeconds: Math.round(intervalMs / 1000),
      buckets: [],
      summary: { peakPlayers: null, averagePlayers: null, sampleCount: 0, latest: null }
    });
  }

  let bucketCount = Math.ceil(span / intervalMs);
  if (bucketCount > PLAYER_HISTORY_MAX_BUCKETS) {
    const multiplier = Math.ceil(bucketCount / PLAYER_HISTORY_MAX_BUCKETS);
    intervalMs = clamp(intervalMs * multiplier, MIN_PLAYER_HISTORY_INTERVAL_MS, MAX_PLAYER_HISTORY_INTERVAL_MS);
    alignedStart = alignTimestamp(startMs, intervalMs, 'floor');
    alignedEnd = alignTimestamp(endMs, intervalMs, 'ceil');
    if (alignedEnd <= alignedStart) alignedEnd = alignedStart + intervalMs;
  }

  try {
    const rows = await db.listServerPlayerCounts(id, {
      since: new Date(alignedStart),
      until: new Date(alignedEnd),
      limit: PLAYER_HISTORY_MAX_BUCKETS * 4
    });
    const { buckets, summary } = buildPlayerHistoryBuckets(rows, alignedStart, alignedEnd, intervalMs);
    res.json({
      serverId: id,
      from: new Date(alignedStart).toISOString(),
      to: new Date(alignedEnd).toISOString(),
      intervalSeconds: Math.round(intervalMs / 1000),
      buckets,
      summary
    });
  } catch (err) {
    console.error('player history fetch failed', err);
    res.status(500).json({ error: 'player_history_failed' });
  }
});

// --- Forced display name: /api/servers/:serverId/players/:steamid
app.patch('/api/servers/:serverId/players/:steamid', auth, async (req, res) => {
  if (typeof db.setServerPlayerDisplayName !== 'function') {
    return res.status(400).json({ error: 'unsupported' });
  }
  const serverId = ensureServerCapability(req, res, 'manage', 'serverId');
  if (serverId == null) return;

  const steamid = String(req.params.steamid || '').trim();
  if (!steamid) return res.status(400).json({ error: 'invalid_steamid' });

  const { display_name } = req.body || {};
  if (typeof display_name !== 'undefined' && display_name !== null && typeof display_name !== 'string') {
    return res.status(400).json({ error: 'invalid_display_name' });
  }
  const trimmed = typeof display_name === 'string' ? display_name.trim().slice(0, 190) : null;
  const payload = trimmed ? trimmed : null;

  try {
    const updated = await db.setServerPlayerDisplayName({ server_id: serverId, steamid, display_name: payload });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, forced_display_name: payload });
  } catch (err) {
    console.error('setServerPlayerDisplayName failed', err);
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

async function fetchSteamProfiles(steamids, key, { includePlaytime = false } = {}) {
  const unique = [...new Set((steamids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const ids = unique.slice(0, 100);
  const joined = ids.join(',');
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(joined)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('steam_api_error');
  const j = await r.json();
  const players = j?.response?.players || [];
  const bansUrl = `https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(joined)}`;
  const rb = await fetch(bansUrl);
  const banMap = new Map();
  if (rb.ok) {
    const jb = await rb.json();
    for (const b of jb?.players || []) {
      const vacBanned = b.VACBanned ? 1 : 0;
      const gameBans = Number(b.NumberOfGameBans) || 0;
      const banDays = Number.isFinite(Number(b.DaysSinceLastBan)) ? Number(b.DaysSinceLastBan) : null;
      const hasBanHistory = vacBanned || gameBans > 0;
      banMap.set(String(b.SteamId), {
        vac_banned: vacBanned,
        game_bans: gameBans,
        last_ban_days: hasBanHistory && banDays !== null ? banDays : null
      });
    }
  }
  const playtimeMap = new Map();
  const nowIso = new Date().toISOString();
  if (includePlaytime) {
    for (const player of players) {
      const sid = String(player?.steamid || '');
      if (!sid) continue;
      const visibility = Number(player.communityvisibilitystate);
      if (visibility !== 3) {
        playtimeMap.set(sid, null);
        continue;
      }
      try {
        const minutes = await fetchRustPlaytimeMinutes(sid, key);
        playtimeMap.set(sid, typeof minutes === 'number' ? minutes : null);
      } catch (err) {
        console.warn('Steam playtime fetch failed for', sid, err);
        playtimeMap.set(sid, null);
      }
    }
  }
  const out = [];
  for (const player of players) {
    const sid = String(player?.steamid || '');
    if (!sid) continue;
    const ban = banMap.get(sid) || {};
    const banDays = Number.isFinite(Number(ban.last_ban_days)) ? Number(ban.last_ban_days) : null;
    const hasBanHistory = (ban.vac_banned ? 1 : 0) || Number(ban.game_bans) > 0;
    const visibility = Number.isFinite(Number(player.communityvisibilitystate)) ? Number(player.communityvisibilitystate) : null;
    const playtime = playtimeMap.has(sid) ? playtimeMap.get(sid) : null;
    out.push({
      steamid: sid,
      persona: player.personaname || null,
      avatar: player.avatarfull || null,
      country: player.loccountrycode || null,
      profileurl: player.profileurl || null,
      vac_banned: ban.vac_banned ? 1 : 0,
      game_bans: Number(ban.game_bans) || 0,
      last_ban_days: hasBanHistory && banDays !== null ? banDays : null,
      visibility,
      rust_playtime_minutes: typeof playtime === 'number' ? playtime : null,
      playtime_updated_at: includePlaytime ? nowIso : null
    });
  }
  return out;
}

app.post('/api/steam/sync', auth, async (req, res) => {
  const { steamids } = req.body || {};
  if (!Array.isArray(steamids) || steamids.length === 0) return res.status(400).json({ error: 'missing_steamids' });
  if (!process.env.STEAM_API_KEY) return res.status(400).json({ error: 'no_steam_api_key' });
  try {
    const list = await fetchSteamProfiles(steamids, process.env.STEAM_API_KEY, { includePlaytime: true });
    const nowIso = new Date().toISOString();
    for (const profile of list) {
      await db.upsertPlayer({
        steamid: profile.steamid,
        persona: profile.persona,
        avatar: profile.avatar,
        country: profile.country,
        profileurl: profile.profileurl,
        vac_banned: profile.vac_banned || 0,
        game_bans: profile.game_bans || 0,
        last_ban_days: profile.last_ban_days ?? null,
        visibility: profile.visibility ?? null,
        rust_playtime_minutes: profile.rust_playtime_minutes ?? null,
        playtime_updated_at: profile.playtime_updated_at || nowIso
      });
    }
    res.json({ updated: list.length });
  } catch (e) {
    res.status(500).json({ error: e.message || 'steam_sync_failed' });
  }
});

// --- sockets
io.on('connection', (socket) => {
  socket.emit('status-map', filterStatusMapByPermission(getStatusSnapshot(), socket.data?.user, 'view'));
  socket.on('join-server', async (serverId) => {
    const id = Number(serverId);
    if (!Number.isFinite(id)) return;
    if (!canAccessServer(socket.data?.user, id, 'console')) {
      socket.emit('error', 'forbidden');
      return;
    }
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
