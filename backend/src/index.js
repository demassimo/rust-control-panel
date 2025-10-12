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
import geoip from 'geoip-lite';
import multer from 'multer';
import { db, initDb } from './db/index.js';
import { authMiddleware, signToken, requireAdmin } from './auth.js';
// index.js
import {
  connectRcon,
  sendRconCommand,
  closeRcon as terminateRcon,
  subscribeToRcon,
  startAutoMonitor,
  rconEventBus,
  fetchServerInfo,
  fetchLevelUrl,
  fetchWorldSettings
} from './rcon.js';
import {
  fetchRustMapMetadata,
  downloadRustMapImage,
  configureRustMapsCache,
  ensureRustMapsCacheDirs,
  loadCachedRustMapMetadata,
  saveCachedRustMapMetadata,
  removeCachedRustMapMetadata,
  findCachedRustMapImage,
  resolveRustMapImageCachePath,
  firstThursdayResetTime,
  isRustMapMetadataStale,
  purgeRustMapCacheIfDue
} from './rustmaps.js';
import { parseDiscordBotConfig } from './discord-config.js';
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
const MAX_MAP_IMAGE_BYTES = 40 * 1024 * 1024;

import {
  extractInteger,
  extractFloat,
  isLikelyLevelUrl,
  isCustomLevelUrl,
  isFacepunchLevelUrl,
  parseServerInfoMessage,
  parseChatMessage,
  stripAnsiSequences,
  stripRconTimestampPrefix,
  parseF7ReportLine
} from './rcon-parsers.js';

const mapImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MAP_IMAGE_BYTES }
});

const mapImageUploadMiddleware = (req, res, next) => {
  mapImageUpload.single('image')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'image_too_large' });
      }
      return res.status(400).json({ error: 'invalid_image' });
    }
    next();
  });
};

const REGION_DISPLAY = typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

const COUNTRY_NAME_FALLBACKS = {
  UK: 'United Kingdom',
  EU: 'European Union'
};

const WORLD_ENTITY_CACHE_TTL_MS = 15000;
const ENTITY_SEARCH_TIMEOUT_MS = 4500;

const ENTITY_SEARCH_DEFINITIONS = [
  {
    type: 'patrol_helicopter',
    label: 'Patrol Helicopter',
    icon: 'patrol-helicopter',
    commands: [
      'find "assets/prefabs/npc/patrolhelicopter/patrolhelicopter.prefab"',
      'find "patrol helicopter"',
      'find patrolhelicopter'
    ],
    matchers: [/patrol/i, /heli/i]
  },
  {
    type: 'cargo_ship',
    label: 'Cargo Ship',
    icon: 'cargo-ship',
    commands: [
      'find "assets/content/vehicles/boats/cargoship/cargoship.prefab"',
      'find "cargo ship"',
      'find cargoship'
    ],
    matchers: [/cargo/i, /ship/i]
  }
];

const worldEntityCache = new Map();

function lookupCountryCodeFromIp(ip) {
  if (typeof ip !== 'string' || !ip) return null;
  try {
    const result = geoip.lookup(ip);
    const code = typeof result?.country === 'string' ? result.country.trim() : '';
    if (!code) return null;
    return code.toUpperCase();
  } catch {
    return null;
  }
}

function countryNameFromCode(code) {
  if (!code) return null;
  const upper = String(code).trim().toUpperCase();
  if (!upper) return null;
  if (COUNTRY_NAME_FALLBACKS[upper]) return COUNTRY_NAME_FALLBACKS[upper];
  if (REGION_DISPLAY) {
    try {
      const label = REGION_DISPLAY.of(upper);
      if (label && label !== upper) return label;
    } catch {
      // ignore lookup errors
    }
  }
  return COUNTRY_NAME_FALLBACKS[upper] || upper;
}

function resolveIpCountry(ip) {
  const code = lookupCountryCodeFromIp(ip);
  if (!code) {
    return { code: null, name: null };
  }
  return {
    code,
    name: countryNameFromCode(code)
  };
}

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
  let teams = [];
  if (typeof db.listUserTeams === 'function') {
    try {
      teams = await db.listUserTeams(numeric);
    } catch (err) {
      console.warn('Failed to load user teams', err);
    }
  }
  let activeTeamId = null;
  if (typeof db.getUserActiveTeam === 'function') {
    try {
      const storedTeam = await db.getUserActiveTeam(numeric);
      if (storedTeam && teams.some((team) => team.id === storedTeam)) {
        activeTeamId = storedTeam;
      }
    } catch (err) {
      console.warn('Failed to load active team', err);
    }
  }
  if (!activeTeamId && teams.length > 0) {
    activeTeamId = teams[0].id;
    if (typeof db.setUserActiveTeam === 'function') {
      db.setUserActiveTeam(numeric, activeTeamId).catch((err) => {
        console.warn('Failed to persist default active team', err);
      });
    }
  }
  if (!activeTeamId && typeof db.createTeam === 'function') {
    try {
      const name = row.username ? `${row.username}'s Team` : 'My Team';
      const teamId = await db.createTeam({ name, owner_user_id: row.id });
      await db.addTeamMember({ team_id: teamId, user_id: row.id, role: row.role || 'admin' });
      if (typeof db.setUserActiveTeam === 'function') {
        await db.setUserActiveTeam(row.id, teamId);
      }
      activeTeamId = teamId;
      teams = await db.listUserTeams(numeric);
    } catch (err) {
      console.warn('Failed to create default team for user', err);
    }
  }
  let effectiveRole = row.role;
  let rolePermissions = row.role_permissions;
  let activeTeamName = null;
  let activeTeamRoleName = null;
  let activeTeamHasDiscordToken = false;
  const roleCache = new Map();
  let teamServers = [];
  if (activeTeamId && Array.isArray(teams)) {
    const membership = teams.find((team) => team.id === activeTeamId) || null;
    if (membership?.role) {
      effectiveRole = membership.role;
      if (typeof db.getRole === 'function') {
        if (!roleCache.has(membership.role)) {
          const roleRecord = await db.getRole(membership.role);
          roleCache.set(membership.role, roleRecord);
        }
        const roleRecord = roleCache.get(membership.role);
        if (roleRecord?.permissions) {
          rolePermissions = roleRecord.permissions;
          activeTeamRoleName = roleRecord.name || membership.role;
        }
      }
    }
    if (membership) {
      activeTeamName = membership.name || null;
      activeTeamHasDiscordToken = Boolean(membership.discord_token);
    }
    if (typeof db.listTeamServerIds === 'function') {
      try {
        teamServers = await db.listTeamServerIds(activeTeamId);
      } catch (err) {
        console.warn('Failed to list team server ids', err);
      }
    }
  }
  const permissions = normaliseRolePermissions(rolePermissions, effectiveRole);
  if (Array.isArray(permissions?.servers?.allowed)) {
    const teamIds = teamServers.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (permissions.servers.allowed.includes('*')) {
      permissions.servers.allowed = teamIds;
    } else {
      const allowedSet = new Set(
        permissions.servers.allowed
          .map((value) => {
            const numericValue = Number(value);
            return Number.isFinite(numericValue) ? numericValue : null;
          })
          .filter((value) => value != null)
      );
      permissions.servers.allowed = teamIds.filter((id) => allowedSet.has(id));
    }
  }
  const projectedTeams = [];
  if (Array.isArray(teams)) {
    for (const team of teams) {
      let roleName = null;
      if (team?.role) {
        if (!roleCache.has(team.role) && typeof db.getRole === 'function') {
          const roleRecord = await db.getRole(team.role);
          roleCache.set(team.role, roleRecord);
        }
        const cachedRole = roleCache.get(team.role);
        roleName = cachedRole?.name || team.role;
      }
      projectedTeams.push({
        id: team.id,
        name: team.name,
        ownerId: team.owner_user_id,
        role: team.role,
        roleName,
        hasDiscordToken: Boolean(team.discord_token)
      });
    }
  }
  return {
    id: row.id,
    username: row.username,
    role: effectiveRole,
    roleName: activeTeamRoleName || row.role_name || effectiveRole,
    permissions,
    activeTeamId,
    activeTeamName,
    teams: projectedTeams,
    created_at: row.created_at,
    activeTeamHasDiscordToken,
    teamDiscord: { hasToken: activeTeamHasDiscordToken }
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

function projectF7Report(row, fallback = {}) {
  const source = row || {};
  const base = fallback || {};
  const idCandidate = Number(source.id ?? base.id);
  const serverIdCandidate = Number(source.server_id ?? source.serverId ?? base.serverId);
  const createdAt = source.created_at || source.createdAt || base.createdAt || new Date().toISOString();
  const updatedAt = source.updated_at || source.updatedAt || createdAt;
  return {
    id: Number.isFinite(idCandidate) ? idCandidate : null,
    serverId: Number.isFinite(serverIdCandidate) ? serverIdCandidate : null,
    reportId: source.report_id ?? source.reportId ?? base.reportId ?? null,
    reporterSteamId: source.reporter_steamid ?? source.reporterSteamId ?? base.reporterSteamId ?? null,
    reporterName: source.reporter_name ?? source.reporterName ?? base.reporterName ?? null,
    targetSteamId: source.target_steamid ?? source.targetSteamId ?? base.targetSteamId ?? null,
    targetName: source.target_name ?? source.targetName ?? base.targetName ?? null,
    category: source.category ?? base.category ?? null,
    message: source.message ?? base.message ?? null,
    raw: source.raw ?? base.raw ?? null,
    createdAt,
    updatedAt
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
const STEAM_PROFILE_CACHE_TTL = Math.max(toInt(process.env.STEAM_PROFILE_CACHE_MS || '300000', 300000), 60000);
const STEAM_PROFILE_REFRESH_INTERVAL = Math.max(toInt(process.env.STEAM_PROFILE_REFRESH_MS || '1800000', 1800000), 300000);
const STEAM_PLAYTIME_REFRESH_INTERVAL = Math.max(toInt(process.env.STEAM_PLAYTIME_REFRESH_MS || '21600000', 21600000), 3600000);
const RUST_STEAM_APP_ID = 252490;

const MIN_PLAYER_HISTORY_RANGE_MS = 60 * 60 * 1000; // 1 hour
const MAX_PLAYER_HISTORY_RANGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MIN_PLAYER_HISTORY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PLAYER_HISTORY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PLAYER_HISTORY_MAX_BUCKETS = 2000;
const PLAYER_LIST_DEFAULT_LIMIT = 200;
const PLAYER_LIST_MAX_LIMIT = 1000;
const PLAYER_LIMIT_UNLIMITED_TOKENS = new Set(['unlimited', 'all', '*', 'infinite', 'infinity', 'none']);
const MAX_PLAYER_NOTE_LENGTH = 2000;

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

function parsePlayerQueryLimit(value, { defaultLimit = PLAYER_LIST_DEFAULT_LIMIT, maxLimit = PLAYER_LIST_MAX_LIMIT } = {}) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (rawValue == null) return defaultLimit;
  const str = String(rawValue).trim();
  if (!str) return defaultLimit;
  const lower = str.toLowerCase();
  if (PLAYER_LIMIT_UNLIMITED_TOKENS.has(lower)) return null;
  const numeric = Number(str);
  if (!Number.isFinite(numeric) || numeric <= 0) return defaultLimit;
  const integer = Math.floor(numeric);
  if (!Number.isFinite(maxLimit) || maxLimit <= 0) return integer;
  return Math.min(integer, Math.floor(maxLimit));
}

function parsePlayerQueryOffset(value) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = parseInt(rawValue ?? '0', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function parsePlayerQuerySearch(value, { maxLength = 200 } = {}) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (rawValue == null) return '';
  const str = String(rawValue).trim();
  if (!str) return '';
  if (!Number.isFinite(maxLength) || maxLength <= 0) return str;
  return str.slice(0, Math.floor(maxLength));
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

app.use(express.json({ limit: '25mb' }));
app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }));

await initDb();
await fs.mkdir(MAP_STORAGE_DIR, { recursive: true });
configureRustMapsCache({
  globalCacheDir: path.join(MAP_STORAGE_DIR, 'global'),
  metadataCacheDir: path.join(MAP_STORAGE_DIR, 'metadata')
});
await ensureRustMapsCacheDirs();
await purgeExpiredMapCaches().catch((err) => console.error('initial map purge failed', err));

const auth = authMiddleware(JWT_SECRET, { loadUserContext });
const rconBindings = new Map();
const monitoredServerRows = new Map();
const statusMap = new Map();
const serverInfoCache = new Map();

let monitorController = null;
let monitorRefreshPromise = null;

const PLAYER_CONNECTION_DEDUPE_MS = 5 * 60 * 1000;
const recentPlayerConnections = new Map();
const OFFLINE_SNAPSHOT_MIN_INTERVAL = Math.max(Math.floor(MONITOR_INTERVAL / 2), 15000);
const offlineSnapshotTimestamps = new Map();
const ANSI_COLOR_REGEX = /\u001b\[[0-9;]*m/g;
const CHAT_RETENTION_MS = 24 * 60 * 60 * 1000;
const CHAT_PURGE_INTERVAL_MS = 10 * 60 * 1000;
const chatCleanupSchedule = new Map();
let globalChatCleanupPromise = null;
const F7_REPORT_NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const F7_RECENT_HISTORY_LIMIT = 3;

const KILL_FEED_RETENTION_MS = 24 * 60 * 60 * 1000;
const KILL_FEED_PURGE_INTERVAL_MS = 15 * 60 * 1000;
const KILL_FEED_MAX_CACHE = 300;
const killFeedCache = new Map();
const killFeedCleanupSchedule = new Map();
let killFeedGlobalCleanupPromise = null;
const recentKillLines = new Map();
const KILL_FEED_DEDUPE_MS = 1500;

const steamProfileCache = new Map();
const TEAM_INFO_CACHE_TTL = 30 * 1000;
const TEAM_INFO_ERROR_RETRY_INTERVAL_MS = 10 * 1000;
const TEAM_INFO_COMMAND_TIMEOUT_MS = 5000;
const POSITION_CACHE_TTL = 30 * 1000;
const POSITION_COMMAND_TIMEOUT_MS = 5000;
const MANUAL_REFRESH_MIN_INTERVAL_MS = 20 * 1000;
const teamInfoCache = new Map();
const positionCache = new Map();
const manualRefreshState = new Map();
const teamInfoMonitorState = new Map();
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
  monitoredServerRows.delete(key);
  teamInfoMonitorState.delete(key);
  try { unsubscribe(); }
  catch { /* ignore */ }
}

function ensureRconBinding(row) {
  const key = Number(row?.id);
  if (!Number.isFinite(key)) throw new Error('invalid_server_id');
  monitoredServerRows.set(key, row);
  if (rconBindings.has(key)) return;

  const host = row.host;
  const port = row.port;

  const handleError = (error) => {
    const message = error?.message || String(error);
    io.to(`srv:${key}`).emit('error', message);
    recordStatus(key, { ok: false, lastCheck: new Date().toISOString(), error: message });
  };

  const handleConnected = () => {
    syncServerMapLevelUrl(row).catch((err) => {
      console.warn('Failed to sync level URL on connect', err);
    });
  };

  const unsubscribe = subscribeToRcon(key, {
    open: handleConnected,
    reconnect: handleConnected,
    message: (msg) => {
      io.to(`srv:${key}`).emit('console', msg);
      console.log(`[RCON:${host}:${port}]`, msg);
    },
    console: (line, payload) => {
      const cleanLine = typeof line === 'string' ? line.replace(ANSI_COLOR_REGEX, '') : '';
      if (cleanLine) {
        handlePlayerConnectionLine(key, cleanLine);
        handleF7ReportLine(key, cleanLine, payload).catch((err) => {
          console.warn('f7 report dispatch failed', err);
        });
        handleKillFeedLine(key, cleanLine).catch((err) => {
          console.warn('kill feed dispatch failed', err);
        });
      }
    },
    event: (payload = {}) => {
      try {
        const type = typeof payload?.Type === 'string' ? payload.Type.toLowerCase() : '';
        if (!type || (!type.includes('f7') && !type.includes('report'))) return;
        const message = payload?.Message ?? payload?.message ?? null;
        const text = typeof message === 'string' ? message.replace(ANSI_COLOR_REGEX, '') : '';
        handleF7ReportLine(key, text, payload).catch((err) => {
          console.warn('f7 report dispatch failed', err);
        });
      } catch (err) {
        console.warn('f7 report event handling failed', err);
      }
    },
    chat: (line, payload) => {
      handleChatMessage(key, line, payload).catch((err) => {
        console.warn('chat dispatch failed', err);
      });
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

async function getMonitoredServerRow(serverId) {
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric)) return null;
  const cached = monitoredServerRows.get(numeric);
  if (cached) return cached;
  try {
    const row = await db.getServer(numeric);
    if (row) {
      monitoredServerRows.set(numeric, row);
      return row;
    }
  } catch (err) {
    console.warn('Failed to load server for monitor lookup', err);
  }
  return null;
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

async function handleChatMessage(serverId, line, payload) {
  const key = Number(serverId);
  if (!Number.isFinite(key)) return;
  const rawInput = typeof line === 'string' ? line : (payload?.Message ?? payload?.message ?? '');
  const parsed = parseChatMessage(rawInput, payload);
  if (!parsed || !parsed.message) return;

  const record = {
    server_id: key,
    channel: parsed.channel || 'global',
    steamid: parsed.steamId || null,
    username: parsed.username || null,
    message: parsed.message,
    raw: parsed.raw || (typeof rawInput === 'string' ? rawInput : null),
    color: parsed.color || null,
    created_at: parsed.timestamp || null
  };

  let stored = null;
  if (typeof db?.recordChatMessage === 'function') {
    try {
      stored = await db.recordChatMessage(record);
    } catch (err) {
      console.warn('Failed to record chat message', err);
    }
  }

  const createdAt = stored?.created_at || parsed.timestamp || new Date().toISOString();
  const eventPayload = {
    id: stored?.id ?? null,
    serverId: key,
    channel: stored?.channel || record.channel,
    steamId: stored?.steamid || record.steamid || null,
    username: stored?.username || record.username || null,
    message: stored?.message || record.message,
    createdAt,
    raw: stored?.raw || record.raw || null,
    color: stored?.color || record.color || null
  };

  io.to(`srv:${key}`).emit('chat', { serverId: key, message: eventPayload });
  maybeCleanupChatHistory(key);
}

async function handleF7ReportLine(serverId, line, payload = null) {
  const numericId = Number(serverId);
  if (!Number.isFinite(numericId)) return;
  const parsed = parseF7ReportLine(line, payload);
  if (!parsed) return;

  const record = {
    server_id: numericId,
    report_id: parsed.reportId || null,
    reporter_steamid: parsed.reporterSteamId || null,
    reporter_name: parsed.reporterName || null,
    target_steamid: parsed.targetSteamId || null,
    target_name: parsed.targetName || null,
    category: parsed.category || null,
    message: parsed.message || null,
    raw: parsed.raw
      || line
      || (typeof payload?.Message === 'string' ? payload.Message : null)
      || (typeof payload?.message === 'string' ? payload.message : null),
    created_at: parsed.timestamp || null
  };

  let stored = null;
  if (typeof db?.recordF7Report === 'function') {
    try {
      stored = await db.recordF7Report(record);
    } catch (err) {
      console.warn('Failed to record F7 report', err);
    }
  }

  const fallback = {
    ...record,
    serverId: numericId,
    createdAt: record.created_at || new Date().toISOString()
  };
  const eventPayload = projectF7Report(stored, fallback);
  if (!eventPayload) return;
  io.to(`srv:${numericId}`).emit('f7-report', eventPayload);
}

function runGlobalChatCleanup() {
  if (typeof db?.purgeChatMessages !== 'function') return null;
  if (globalChatCleanupPromise) return globalChatCleanupPromise;
  const cutoffIso = new Date(Date.now() - CHAT_RETENTION_MS).toISOString();
  globalChatCleanupPromise = (async () => {
    try {
      await db.purgeChatMessages({ before: cutoffIso });
    } catch (err) {
      console.warn('Failed to purge chat history globally', err);
    } finally {
      globalChatCleanupPromise = null;
    }
  })();
  return globalChatCleanupPromise;
}

function maybeCleanupChatHistory(serverId) {
  if (typeof db?.purgeChatMessages !== 'function') return;
  const key = Number(serverId);
  if (!Number.isFinite(key)) return;
  const now = Date.now();
  const last = chatCleanupSchedule.get(key) || 0;
  if (now - last < CHAT_PURGE_INTERVAL_MS) return;
  chatCleanupSchedule.set(key, now);
  const cutoffIso = new Date(now - CHAT_RETENTION_MS).toISOString();
  db.purgeChatMessages({ before: cutoffIso, server_id: key }).catch((err) => {
    console.warn(`Failed to purge chat history for server ${key}`, err);
  });
  runGlobalChatCleanup();
}

async function handleKillFeedLine(serverId, line) {
  const key = Number(serverId);
  if (!Number.isFinite(key)) return;
  const parsed = parseKillLogLine(line);
  if (!parsed) return;
  if (!shouldProcessKillLine(key, parsed.normalized)) return;

  const record = {
    server_id: key,
    occurred_at: parsed.occurredAt,
    killer_steamid: parsed.killerSteamId,
    killer_name: parsed.killerName,
    killer_clan: parsed.killerClan,
    victim_steamid: parsed.victimSteamId,
    victim_name: parsed.victimName,
    victim_clan: parsed.victimClan,
    weapon: parsed.weapon,
    distance: parsed.distance,
    pos_x: parsed.position?.x ?? null,
    pos_y: parsed.position?.y ?? null,
    pos_z: parsed.position?.z ?? null,
    raw: parsed.normalized,
    created_at: parsed.occurredAt
  };

  let stored = null;
  if (typeof db?.recordKillEvent === 'function') {
    try {
      stored = await db.recordKillEvent(record);
    } catch (err) {
      console.warn('Failed to record kill event', err);
    }
  }

  const fallback = stored || {
    ...record,
    combat_log: null,
    combat_log_error: null,
    id: null
  };
  const normalized = normaliseKillEventRow(fallback);
  if (!normalized) return;

  const pendingEvent = (!normalized.combatLog && !normalized.combatLogError && parsed.victimSteamId)
    ? {
        ...normalized,
        combatLogError: 'Please wait, server is fetching combat log…'
      }
    : normalized;

  cacheKillEvent(key, pendingEvent);
  io.to(`srv:${key}`).emit('kill', { serverId: key, event: pendingEvent });
  maybeCleanupKillFeed(key);

  if (parsed.victimSteamId) {
    scheduleCombatLogFetch({
      serverId: key,
      victimSteamId: parsed.victimSteamId,
      eventId: stored?.id ?? null,
      baseEvent: pendingEvent
    });
  }
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

const STEAM_ID_REGEX = /^\d{17}$/;

function extractNumericValue(input, depth = 0) {
  if (input == null) return null;
  if (depth > 6) return null;

  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : null;
  }
  if (typeof input === 'bigint') {
    const num = Number(input);
    return Number.isFinite(num) ? num : null;
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const normalised = trimmed.replace(/,/g, '');
    const direct = Number(normalised);
    if (Number.isFinite(direct)) return direct;
    const match = normalised.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(input)) {
    for (const entry of input) {
      const nested = extractNumericValue(entry, depth + 1);
      if (nested != null) return nested;
    }
    return null;
  }
  if (typeof input === 'object') {
    const priorityKeys = [
      'value',
      'Value',
      '_value',
      '_Value',
      'data',
      'Data',
      'val',
      'Val',
      'number',
      'Number',
      'raw',
      'Raw',
      '$numberFloat',
      '$numberDouble',
      '$numberDecimal',
      '$numberInt64',
      '$numberLong',
      '$numberInt32',
      '$number'
    ];
    for (const key of priorityKeys) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        const nested = extractNumericValue(input[key], depth + 1);
        if (nested != null) return nested;
      }
    }
    for (const nested of Object.values(input)) {
      const resolved = extractNumericValue(nested, depth + 1);
      if (resolved != null) return resolved;
    }
  }
  return null;
}

function parseVector3(value) {
  if (!value) return null;

  const buildResult = ({ x, y, z }) => {
    const numericX = extractNumericValue(x);
    const numericY = extractNumericValue(y);
    const numericZ = extractNumericValue(z);
    if (numericX == null) return null;
    if (numericY == null && numericZ == null) return null;
    const result = { x: numericX };
    if (numericY != null) result.y = numericY;
    if (numericZ != null) result.z = numericZ;
    return result;
  };

  const tryFromObject = (input) => {
    if (!input || typeof input !== 'object') return null;
    if (Array.isArray(input)) {
      const [x, y, z] = input;
      return buildResult({ x, y, z });
    }
    const candidate = { ...input };
    const direct = {
      x: candidate.x ?? candidate.X ?? candidate[0],
      y: candidate.y ?? candidate.Y ?? candidate[1],
      z: candidate.z ?? candidate.Z ?? candidate[2]
    };
    if (direct.x != null || direct.y != null || direct.z != null) {
      return buildResult(direct);
    }
    const labelled = {};
    for (const [key, raw] of Object.entries(candidate)) {
      const match = key.match(/^([xyz])[a-z0-9]*$/i);
      if (!match) continue;
      const axis = match[1].toLowerCase();
      if (!(axis in labelled)) labelled[axis] = raw;
    }
    if (Object.keys(labelled).length === 0) return null;
    return buildResult(labelled);
  };

  const tryFromString = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const labelledMatches = [...trimmed.matchAll(/([xyz])\s*[:=]\s*(-?\d+(?:\.\d+)?)/gi)];
    if (labelledMatches.length > 0) {
      const data = {};
      for (const [, axis, raw] of labelledMatches) {
        const key = axis.toLowerCase();
        if (!(key in data)) data[key] = raw;
      }
      return buildResult({ x: data.x, y: data.y, z: data.z });
    }

    const numbers = trimmed.match(/-?\d+(?:\.\d+)?/g);
    if (!numbers || numbers.length < 2) return null;
    const [first, second, third] = numbers;
    if (numbers.length >= 3) {
      return buildResult({ x: first, y: second, z: third });
    }
    // Heuristic: two values typically represent the horizontal plane (x, z)
    return buildResult({ x: first, z: second });
  };

  if (typeof value === 'string') {
    return tryFromString(value);
  }

  const objectResult = tryFromObject(value);
  if (objectResult) return objectResult;

  const stringified = typeof value.toString === 'function' ? String(value) : null;
  if (stringified) return tryFromString(stringified);

  return null;
}

function extractTeamIdentifier(value, depth = 0) {
  if (value == null || depth > 6) return null;

  const toPositiveInt = (input) => {
    if (input == null) return null;
    const numeric = Number(input);
    if (!Number.isFinite(numeric)) return null;
    const truncated = Math.trunc(numeric);
    return truncated > 0 ? truncated : null;
  };

  if (typeof value === 'number' || typeof value === 'bigint') {
    return toPositiveInt(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      const stripped = trimmed
        .replace(/\u001b\[[0-9;]*m/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/#[0-9a-f]{3,8}\b/gi, ' ');
      const parts = stripped.match(/\d+/g);
      if (parts) {
        for (const part of parts) {
          const candidate = toPositiveInt(part);
          if (candidate != null) return candidate;
        }
      }
    }
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractTeamIdentifier(entry, depth + 1);
      if (nested != null) return nested;
    }
    return null;
  }

  if (typeof value === 'object') {
    const priorityKeys = [
      'team',
      'Team',
      'teamId',
      'TeamId',
      'teamID',
      'TeamID',
      'groupId',
      'GroupId',
      'groupID',
      'GroupID',
      'value',
      'Value',
      'id',
      'Id'
    ];
    for (const key of priorityKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const nested = extractTeamIdentifier(value[key], depth + 1);
        if (nested != null) return nested;
      }
    }
    for (const nested of Object.values(value)) {
      const resolved = extractTeamIdentifier(nested, depth + 1);
      if (resolved != null) return resolved;
    }
  }

  const extracted = extractNumericValue(value, depth + 1);
  return toPositiveInt(extracted);
}

function parseLegacyPlayerList(message) {
  if (!message || typeof message !== 'string') return [];

  const players = [];
  const numericPattern = /^-?\d+(?:\.\d+)?$/;
  const lines = message.split(/\r?\n/);

  const parseKeyValueLine = (text) => {
    if (!text || typeof text !== 'string') return null;
    const pairPattern = /([A-Za-z0-9_][A-Za-z0-9_\s]*)\s*[:=]\s*/g;
    let match;
    let lastKey = null;
    let lastIndex = 0;
    const original = {};
    const normalized = {};

    while ((match = pairPattern.exec(text)) !== null) {
      if (lastKey !== null) {
        const rawValue = text.slice(lastIndex, match.index);
        const cleaned = rawValue.replace(/^[,;\s]+/, '').replace(/[,;\s]+$/, '');
        if (cleaned) {
          const trimmedKey = lastKey.trim();
          if (trimmedKey) {
            let value = cleaned.trim();
            if (value && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
              value = value.slice(1, -1);
            }
            const normalizedKey = trimmedKey.replace(/[\s_-]+/g, '').toLowerCase();
            original[trimmedKey] = value;
            normalized[normalizedKey] = value;
          }
        }
      }
      lastKey = match[1];
      lastIndex = pairPattern.lastIndex;
    }

    if (lastKey !== null) {
      const rawValue = text.slice(lastIndex);
      const cleaned = rawValue.replace(/^[,;\s]+/, '').replace(/[,;\s]+$/, '');
      if (cleaned) {
        const trimmedKey = lastKey.trim();
        if (trimmedKey) {
          let value = cleaned.trim();
          if (value && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
            value = value.slice(1, -1);
          }
          const normalizedKey = trimmedKey.replace(/[\s_-]+/g, '').toLowerCase();
          original[trimmedKey] = value;
          normalized[normalizedKey] = value;
        }
      }
    }

    if (!normalized.steamid || !STEAM_ID_REGEX.test(String(normalized.steamid).trim())) {
      return null;
    }

    return { original, normalized };
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\u0000/g, '').trim();
    if (!line) continue;
    if (/^id\b/i.test(line)) continue;
    if (/^players?\b/i.test(line)) continue;
    if (!/\d{17}/.test(line)) continue;

    const keyValue = parseKeyValueLine(line);
    if (keyValue) {
      const data = keyValue.normalized;
      const original = keyValue.original;
      const steamId = String(data.steamid || '').trim();
      if (!STEAM_ID_REGEX.test(steamId)) continue;

      const ownerCandidate = String(data.ownersteamid || data.ownerid || '').trim();
      const ownerSteamId = STEAM_ID_REGEX.test(ownerCandidate) ? ownerCandidate : null;
      const displayName = (
        original.DisplayName
        ?? original.displayname
        ?? data.displayname
        ?? steamId
      );
      const ping = Number(data.ping ?? data.networkping ?? 0) || 0;
      const address = original.Address || data.address || '';
      const connectedSeconds = Number(
        data.connectedseconds
        ?? data.connectedtime
        ?? data.connectiontime
        ?? 0
      ) || 0;
      const violationLevel = Number(
        data.violationlevel
        ?? data.voiationlevel
        ?? data.violations
        ?? 0
      ) || 0;
      const health = Number(data.health ?? 0) || 0;
      const rawTeamCandidate = (
        data.teamid
        ?? data.team
        ?? original.Team
        ?? original.team
        ?? null
      );
      const teamCandidate = extractTeamIdentifier(rawTeamCandidate);
      const teamId = Number.isFinite(teamCandidate) && teamCandidate > 0
        ? Math.trunc(teamCandidate)
        : 0;
      const positionSource = (
        original.Position
        ?? original.position
        ?? data.position
        ?? data.pos
        ?? null
      );
      const position = parseVector3(positionSource);

      players.push({
        steamId,
        ownerSteamId,
        displayName,
        ping,
        address,
        connectedSeconds,
        violationLevel,
        health,
        position,
        teamId,
        networkId: null
      });
      continue;
    }

    let remaining = line;
    let position = null;
    const positionMatch = remaining.match(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)\s*$/);
    if (positionMatch) {
      position = parseVector3({
        x: positionMatch[1],
        y: positionMatch[2],
        z: positionMatch[3]
      });
      remaining = remaining.slice(0, positionMatch.index).trim();
    }

    const tokens = remaining.split(/\s+/);
    if (tokens.length < 2) continue;

    const idToken = tokens.shift();
    if (!numericPattern.test(idToken)) continue;

    const steamId = tokens.shift();
    if (!STEAM_ID_REGEX.test(steamId)) continue;

    let ownerSteamId = null;
    if (tokens.length > 0 && STEAM_ID_REGEX.test(tokens[0])) {
      ownerSteamId = tokens.shift();
    }

    if (tokens.length === 0 && !position) continue;

    const numericTail = [];
    while (tokens.length > 0 && numericPattern.test(tokens[tokens.length - 1])) {
      numericTail.push(tokens.pop());
      if (numericTail.length > 8) break;
    }
    numericTail.reverse();

    let address = '';
    if (tokens.length > 0) {
      const candidateAddress = tokens.pop();
      if (candidateAddress && !numericPattern.test(candidateAddress)) {
        address = candidateAddress;
      } else if (candidateAddress != null) {
        numericTail.unshift(candidateAddress);
      }
    }

    let ping = 0;
    if (tokens.length > 0 && numericPattern.test(tokens[tokens.length - 1])) {
      const rawPing = tokens.pop();
      const parsedPing = Number(rawPing);
      if (Number.isFinite(parsedPing)) ping = parsedPing;
    }

    const displayName = tokens.join(' ').trim() || steamId;

    const pickInt = () => {
      if (!numericTail.length) return null;
      const raw = numericTail.shift();
      const num = Number(raw);
      return Number.isFinite(num) ? Math.trunc(num) : null;
    };

    const pickFloat = () => {
      if (!numericTail.length) return null;
      const raw = numericTail.shift();
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    };

    const connectedSeconds = pickInt() ?? 0;
    if (numericTail.length >= 4) {
      const maybeSleeping = numericTail[0];
      if (maybeSleeping === '0' || maybeSleeping === '1') {
        pickInt();
      }
    }
    const violationLevel = pickInt() ?? 0;
    const currentLevel = pickInt() ?? 0;
    const health = pickFloat() ?? 0;
    let teamId = 0;
    const teamMatch = line.match(/(?:team|group|party|squad)\s*(?:[:=]\s*|id\s*)?([^,]+)/i);
    const matchedTeam = teamMatch ? extractTeamIdentifier(teamMatch[1]) : null;
    if (Number.isFinite(matchedTeam) && matchedTeam > 0) {
      teamId = Math.trunc(matchedTeam);
    } else if (numericTail.length > 0) {
      const candidateTeam = pickInt();
      if (Number.isFinite(candidateTeam) && candidateTeam > 0) {
        teamId = candidateTeam;
      }
    }

    players.push({
      steamId,
      ownerSteamId,
      displayName,
      ping,
      address,
      connectedSeconds,
      violationLevel,
      health,
      position,
      teamId,
      networkId: null
    });
  }

  return players;
}

function findNestedPositionCandidate(value, depth = 0) {
  if (!value || typeof value !== 'object') return null;
  if (depth > 6) return null;
  const directCandidates = [
    value.Position,
    value.position,
    value.LocalPosition,
    value.localPosition,
    value.WorldPosition,
    value.worldPosition,
    value.Location,
    value.location,
    value.Pos,
    value.pos,
    value.Coordinates,
    value.coordinates
  ];
  for (const candidate of directCandidates) {
    if (candidate == null) continue;
    if (Array.isArray(candidate)) {
      if (candidate.length >= 2) return candidate;
      continue;
    }
    if (typeof candidate === 'object') return candidate;
    if (typeof candidate === 'string') return candidate;
  }
  const queue = [];
  for (const [key, nested] of Object.entries(value)) {
    if (!nested || typeof nested !== 'object') continue;
    if (/(position|coordinates?|coords?|pos|location)/i.test(key)) {
      const candidate = nested.Position ?? nested.position ?? nested;
      if (candidate != null) {
        if (Array.isArray(candidate) && candidate.length >= 2) return candidate;
        if (typeof candidate === 'object') {
          if (candidate.x != null || candidate.y != null || candidate.z != null) return candidate;
          return candidate;
        }
        if (typeof candidate === 'string') return candidate;
      }
    }
    queue.push(nested);
  }
  for (const nested of queue) {
    const found = findNestedPositionCandidate(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

function hasValidPosition(position) {
  if (!position || typeof position !== 'object') return false;
  const numericX = Number(position.x);
  if (!Number.isFinite(numericX)) return false;
  const numericY = Number(position.y);
  const numericZ = Number(position.z);
  if (Number.isFinite(numericZ)) return true;
  if (Number.isFinite(numericY)) return true;
  return false;
}

function findNestedTeamId(value, depth = 0) {
  if (!value || depth > 6) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = findNestedTeamId(entry, depth + 1);
      if (nested != null) return nested;
    }
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    const numeric = extractTeamIdentifier(value);
    if (Number.isFinite(numeric) && numeric > 0) return Math.trunc(numeric);
    return null;
  }
  if (typeof value !== 'object') return null;

  const directKeys = [
    'TeamID',
    'TeamId',
    'teamID',
    'teamId',
    'team_id',
    'Team_id',
    'CurrentTeamID',
    'CurrentTeamId',
    'currentTeamID',
    'currentTeamId',
    'currentTeam',
    'CurrentTeam',
    'ActiveTeamID',
    'ActiveTeamId',
    'activeTeamID',
    'activeTeamId',
    'activeTeam',
    'ActiveTeam',
    'Team',
    'team',
    'GroupID',
    'GroupId',
    'groupID',
    'groupId',
    'ClanTeamID',
    'clanTeamID',
    'clanTeamId'
  ];

  for (const key of directKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const numeric = extractTeamIdentifier(value[key]);
      if (numeric != null && numeric > 0) return numeric;
    }
  }

  const targetedPattern = /(team|group|party|squad|relation)/i;
  for (const [key, nested] of Object.entries(value)) {
    if (!nested || (typeof nested !== 'object' && !Array.isArray(nested))) continue;
    if (!targetedPattern.test(key)) continue;
    const candidate = findNestedTeamId(nested, depth + 1);
    if (candidate != null) return candidate;
  }

  const skipPattern = /(position|coordinates?|transform|rotation|velocity|health|ping|seconds|time|level|sleep|violation|connected|owner|display|name|persona|address|ip|steam|inventory|blueprint|bag|spawn|stat|flags?)/i;
  for (const [key, nested] of Object.entries(value)) {
    if (!nested || (typeof nested !== 'object' && !Array.isArray(nested))) continue;
    if (targetedPattern.test(key)) continue;
    if (skipPattern.test(key)) continue;
    const candidate = findNestedTeamId(nested, depth + 1);
    if (candidate != null) return candidate;
  }

  return null;
}

function interpretBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return false;
}

function resolveSteamIdFromEntry(entry, depth = 0) {
  if (!entry || typeof entry !== 'object' || depth > 3) return null;
  const keys = [
    'SteamID',
    'SteamId',
    'steamID',
    'steamId',
    'steamid',
    'UserId',
    'userId',
    'userid',
    'Id',
    'ID',
    'PlayerId',
    'playerId',
    'playerID',
    'player_id',
    'Steam',
    'steam'
  ];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(entry, key)) continue;
    const raw = entry[key];
    if (raw == null) continue;
    const text = typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'bigint'
      ? String(raw).trim()
      : '';
    if (text && STEAM_ID_REGEX.test(text)) return text;
  }
  for (const [key, value] of Object.entries(entry)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    if (/(steam|player|user|identity|id)$/i.test(key)) {
      const nested = resolveSteamIdFromEntry(value, depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}

function hasPositionIndicator(entry, depth = 0) {
  if (!entry || typeof entry !== 'object' || depth > 3) return false;
  const axisKeys = [
    'X', 'x',
    'Y', 'y',
    'Z', 'z',
    'PosX', 'posX', 'POSX',
    'PosY', 'posY', 'POSY',
    'PosZ', 'posZ', 'POSZ',
    'PositionX', 'positionX',
    'PositionY', 'positionY',
    'PositionZ', 'positionZ'
  ];
  for (const key of axisKeys) {
    if (Object.prototype.hasOwnProperty.call(entry, key) && entry[key] != null) return true;
  }
  const candidateKeys = [
    'Position',
    'position',
    'Pos',
    'pos',
    'Coordinates',
    'coordinates',
    'Location',
    'location',
    'WorldPosition',
    'worldPosition',
    'LocalPosition',
    'localPosition'
  ];
  for (const key of candidateKeys) {
    if (Object.prototype.hasOwnProperty.call(entry, key) && entry[key] != null) return true;
  }
  for (const [key, value] of Object.entries(entry)) {
    if (!value || typeof value !== 'object') continue;
    if (!/(position|pos|coord|transform|location)/i.test(key)) continue;
    if (hasPositionIndicator(value, depth + 1)) return true;
  }
  return false;
}

function isSamplePlayerEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const booleanKeys = [
    'isSample',
    'IsSample',
    'is_sample',
    'sample',
    'Sample',
    'samplePlayer',
    'SamplePlayer',
    'isSamplePlayer',
    'IsSamplePlayer',
    'isDummy',
    'IsDummy',
    'dummy'
  ];
  for (const key of booleanKeys) {
    if (!Object.prototype.hasOwnProperty.call(entry, key)) continue;
    if (interpretBoolean(entry[key])) return true;
    if (typeof entry[key] === 'string' && /sample|dummy|bot|fake/i.test(entry[key])) return true;
  }
  const descriptorKeys = ['type', 'Type', 'category', 'Category', 'role', 'Role', 'kind', 'Kind'];
  for (const key of descriptorKeys) {
    if (!Object.prototype.hasOwnProperty.call(entry, key)) continue;
    const value = entry[key];
    if (typeof value === 'string' && /sample|dummy|bot|fake|example/i.test(value)) return true;
  }
  return false;
}

function collectPlayerArrayCandidates(value, path = [], depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || depth > 6) return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const results = [];
  if (Array.isArray(value)) {
    results.push({ array: value, path });
    for (let index = 0; index < value.length; index += 1) {
      const entry = value[index];
      if (!entry || typeof entry !== 'object') continue;
      const nestedPath = path.concat(String(index));
      results.push(...collectPlayerArrayCandidates(entry, nestedPath, depth + 1, seen));
    }
    return results;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (!nested || typeof nested !== 'object') continue;
    const nextPath = path.concat(String(key));
    results.push(...collectPlayerArrayCandidates(nested, nextPath, depth + 1, seen));
  }
  return results;
}

function scorePlayerArrayCandidate(candidate) {
  if (!candidate || !Array.isArray(candidate.array)) return Number.NEGATIVE_INFINITY;
  const { array, path } = candidate;
  let valid = 0;
  let sample = 0;
  let withPosition = 0;
  let considered = 0;
  for (const entry of array) {
    if (!entry || typeof entry !== 'object') continue;
    considered += 1;
    const steamId = resolveSteamIdFromEntry(entry);
    if (steamId) valid += 1;
    if (isSamplePlayerEntry(entry)) sample += 1;
    if (hasPositionIndicator(entry)) withPosition += 1;
  }
  if (valid === 0) return Number.NEGATIVE_INFINITY;
  let score = (valid * 10) + (withPosition * 2);
  if (sample > 0) score -= sample * 6;
  if (considered > 0 && valid / considered < 0.3) score -= 5;
  if (Array.isArray(path) && path.some((segment) => /sample|dummy|example|test/i.test(segment))) {
    score -= 20;
  }
  return score;
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
  if (payload && Array.isArray(payload.players)) payload = payload.players;
  if (payload && payload.players && Array.isArray(payload.players.list)) payload = payload.players.list;
  if (payload && payload.Players && Array.isArray(payload.Players.list)) payload = payload.Players.list;
  if (payload && payload.data && Array.isArray(payload.data.Players)) payload = payload.data.Players;
  if (payload && payload.data && Array.isArray(payload.data.players)) payload = payload.data.players;
  if (payload && Array.isArray(payload.list)) payload = payload.list;
  if (!Array.isArray(payload)) {
    const nestedArrays = [
      payload?.Result,
      payload?.result,
      payload?.value,
      payload?.Value,
      payload?.payload,
      payload?.Payload
    ];
    for (const candidate of nestedArrays) {
      if (Array.isArray(candidate)) {
        payload = candidate;
        break;
      }
    }
  }

  if (!Array.isArray(payload) && payload && typeof payload === 'object') {
    const candidates = collectPlayerArrayCandidates(payload, [], 0, new WeakSet());
    const scored = candidates
      .map((candidate) => ({ ...candidate, score: scorePlayerArrayCandidate(candidate) }))
      .filter((candidate) => Number.isFinite(candidate.score));
    if (scored.length > 0) {
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];
      if (best && best.score > 0) {
        payload = best.array;
      }
    }
  }

  if (!Array.isArray(payload)) {
    return parseLegacyPlayerList(message);
  }

  const result = [];
  let detectedTeamField = false;
  for (const entry of payload) {
    if (!entry || typeof entry !== 'object') continue;
    if (isSamplePlayerEntry(entry)) continue;
    let steamId = '';
    const steamIdRaw = entry.SteamID ?? entry.SteamId ?? entry.steamID ?? entry.steamId ?? entry.steamid ?? '';
    if (steamIdRaw != null) {
      steamId = String(steamIdRaw).trim();
    }
    if (!STEAM_ID_REGEX.test(steamId)) {
      const nestedSteamId = resolveSteamIdFromEntry(entry);
      steamId = nestedSteamId ? String(nestedSteamId).trim() : '';
    }
    if (!STEAM_ID_REGEX.test(steamId)) continue;

    let rawPosition = entry.Position ?? entry.position ?? null;
    if (!rawPosition && entry && typeof entry === 'object') {
      const transform = entry.Transform || entry.transform || null;
      if (!rawPosition && transform && typeof transform === 'object') {
        rawPosition = findNestedPositionCandidate(transform);
      }
      if (!rawPosition) {
        const nested = findNestedPositionCandidate(entry);
        if (nested) rawPosition = nested;
      }

      const positionFields = {};
      const xCandidates = [
        entry.X,
        entry.x,
        entry.PosX,
        entry.posX,
        entry.PositionX,
        entry.positionX,
        entry.XPos,
        entry.xPos
      ];
      const yCandidates = [
        entry.Y,
        entry.y,
        entry.PosY,
        entry.posY,
        entry.PositionY,
        entry.positionY,
        entry.YPos,
        entry.yPos
      ];
      const zCandidates = [
        entry.Z,
        entry.z,
        entry.PosZ,
        entry.posZ,
        entry.PositionZ,
        entry.positionZ,
        entry.ZPos,
        entry.zPos
      ];
      for (const candidate of xCandidates) {
        if (candidate != null) { positionFields.x = candidate; break; }
      }
      for (const candidate of yCandidates) {
        if (candidate != null) { positionFields.y = candidate; break; }
      }
      for (const candidate of zCandidates) {
        if (candidate != null) { positionFields.z = candidate; break; }
      }
      if (Object.keys(positionFields).length > 0) rawPosition = positionFields;
    }
    const position = parseVector3(rawPosition);

    const directTeamCandidates = [
      entry.TeamId,
      entry.TeamID,
      entry.teamId,
      entry.teamID,
      entry.team_id,
      entry.Team,
      entry.team,
      entry.CurrentTeam,
      entry.currentTeam,
      entry.CurrentTeamId,
      entry.currentTeamId,
      entry.ActiveTeam,
      entry.activeTeam
    ];
    let teamId = null;
    const hasDirectTeamCandidate = directTeamCandidates.some((candidate) => {
      if (candidate == null) return false;
      if (typeof candidate === 'string') return candidate.trim().length > 0;
      return true;
    });
    detectedTeamField = detectedTeamField || hasDirectTeamCandidate;
    for (const candidate of directTeamCandidates) {
      const parsed = extractTeamIdentifier(candidate);
      if (parsed != null && parsed > 0) {
        teamId = Math.trunc(parsed);
        break;
      }
    }
    if (teamId == null || teamId <= 0) {
      const nestedTeam = findNestedTeamId(entry);
      if (nestedTeam != null && nestedTeam > 0) {
        teamId = Math.trunc(nestedTeam);
        detectedTeamField = true;
      }
    }

    const ownerSources = [
      entry.OwnerSteamID,
      entry.ownerSteamId,
      entry.ownerSteamID,
      entry.OwnerID,
      entry.ownerID,
      entry.ownerId,
      entry.Owner,
      entry.owner
    ];
    let ownerSteamId = null;
    for (const candidate of ownerSources) {
      if (!candidate) continue;
      if (typeof candidate === 'string' || typeof candidate === 'number' || typeof candidate === 'bigint') {
        const text = String(candidate).trim();
        if (text && STEAM_ID_REGEX.test(text)) { ownerSteamId = text; break; }
      } else if (typeof candidate === 'object') {
        const nested = resolveSteamIdFromEntry(candidate);
        if (nested && STEAM_ID_REGEX.test(nested)) { ownerSteamId = nested; break; }
      }
    }

    result.push({
      steamId,
      ownerSteamId,
      displayName: entry.DisplayName || entry.displayName || '',
      ping: Number(entry.Ping ?? entry.ping ?? 0) || 0,
      address: entry.Address || entry.address || '',
      connectedSeconds: Number(entry.ConnectedSeconds ?? entry.connectedSeconds ?? 0) || 0,
      violationLevel: Number(entry.VoiationLevel ?? entry.ViolationLevel ?? entry.violationLevel ?? 0) || 0,
      health: Number(entry.Health ?? entry.health ?? 0) || 0,
      position,
      teamId: Number.isFinite(teamId) && teamId > 0 ? Math.trunc(teamId) : 0,
      networkId: Number(entry.NetworkId ?? entry.networkId ?? 0) || null
    });
  }
  Object.defineProperty(result, '_hasPlayerListTeamField', {
    value: detectedTeamField,
    enumerable: false,
    configurable: true,
    writable: true
  });
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
  const ipCountry = resolveIpCountry(ip);
  return {
    server_id: Number.isFinite(serverId) ? serverId : null,
    display_name: effectiveName,
    raw_display_name: rawDisplay || null,
    forced_display_name: forced || null,
    first_seen: toIso(row.first_seen || row.firstSeen),
    last_seen: toIso(row.last_seen || row.lastSeen),
    last_ip: ip || null,
    last_port: Number.isFinite(portNum) ? portNum : null,
    ip_country_code: ipCountry.code,
    ip_country_name: ipCountry.name,
    total_playtime_seconds: totalSeconds,
    total_playtime_minutes: Number.isFinite(totalSeconds) ? Math.floor(totalSeconds / 60) : null,
    ...base
  };
}

function projectPlayerNote(row) {
  if (!row) return null;
  const idRaw = row?.id ?? row?.note_id ?? row?.noteId;
  const serverIdRaw = row?.server_id ?? row?.serverId;
  const idNum = Number(idRaw);
  const serverIdNum = Number(serverIdRaw);
  return {
    id: Number.isFinite(idNum) && idNum > 0 ? Math.trunc(idNum) : null,
    steamid: row?.steamid || row?.SteamID || null,
    server_id: Number.isFinite(serverIdNum) ? Math.trunc(serverIdNum) : null,
    note: typeof row?.note === 'string' ? row.note : '',
    created_at: row?.created_at || row?.createdAt || null
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

function extractSteamIdFromText(value) {
  if (typeof value === 'string') {
    const match = value.match(/\b(7656119\d{10,})\b/);
    if (match) return match[1];
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    const text = String(value);
    if (STEAM_ID_REGEX.test(text)) return text;
  }
  return null;
}

function normaliseTeamMember(entry) {
  if (!entry) return null;
  if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'bigint') {
    const text = String(entry);
    const steamId = extractSteamIdFromText(text);
    if (!steamId) return null;
    const label = text.replace(steamId, '').replace(/[\[\]{}()<>]/g, ' ').replace(/[:,]/g, ' ');
    const display = label.replace(/\s+/g, ' ').trim();
    return {
      steamId,
      displayName: display || null,
      online: null,
      health: null
    };
  }
  if (typeof entry !== 'object') return null;
  const steamId = resolveSteamIdFromEntry(entry) || extractSteamIdFromText(entry?.id ?? entry?.Id ?? entry?.ID);
  if (!steamId || !STEAM_ID_REGEX.test(steamId)) return null;
  const nameCandidates = [
    entry.DisplayName,
    entry.displayName,
    entry.Name,
    entry.name,
    entry.Username,
    entry.username,
    entry.UserName,
    entry.userName,
    entry.Nickname,
    entry.nickname,
    entry.PlayerName,
    entry.playerName
  ];
  let displayName = null;
  for (const candidate of nameCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      displayName = candidate.trim();
      break;
    }
  }
  const onlineCandidates = [
    entry.IsOnline,
    entry.isOnline,
    entry.online,
    entry.Online,
    entry.isConnected,
    entry.IsConnected,
    entry.connected,
    entry.Connected,
    entry.isActive,
    entry.IsActive,
    entry.active,
    entry.Active,
    entry.isAlive,
    entry.IsAlive,
    entry.alive,
    entry.Alive
  ];
  let online = null;
  for (const candidate of onlineCandidates) {
    if (typeof candidate !== 'undefined') {
      online = interpretBoolean(candidate);
      break;
    }
  }
  const healthCandidates = [entry.Health, entry.health, entry.HP, entry.hp, entry.healthFraction];
  let health = null;
  for (const candidate of healthCandidates) {
    if (candidate == null) continue;
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      health = numeric;
      break;
    }
  }
  const teamCandidates = [entry.teamId, entry.TeamId, entry.TeamID, entry.team, entry.Team];
  let memberTeamId = null;
  for (const candidate of teamCandidates) {
    const parsed = extractTeamIdentifier(candidate);
    if (parsed != null && parsed > 0) {
      memberTeamId = parsed;
      break;
    }
  }
  const normalized = {
    steamId,
    displayName: displayName || null,
    online: typeof online === 'boolean' ? online : null,
    health: Number.isFinite(health) ? Math.round(health) : null
  };
  if (memberTeamId != null && memberTeamId > 0) normalized.teamId = memberTeamId;
  return normalized;
}

function scoreTeamInfoCandidate(info, requestedSteamId) {
  if (!info) return Number.NEGATIVE_INFINITY;
  let score = 0;
  if (info.hasTeam) score += 60;
  if (Number.isFinite(info.teamId) && info.teamId > 0) score += 30;
  if (Array.isArray(info.members)) score += info.members.length * 5;
  if (requestedSteamId && info.members?.some((member) => member.steamId === requestedSteamId)) score += 20;
  if (info.leaderSteamId) score += 5;
  if (info.ownerSteamId) score += 3;
  return score;
}

function extractTeamInfoFromNode(node, requestedSteamId) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;

  let teamId = null;
  const teamCandidates = [
    node.teamId,
    node.TeamId,
    node.TeamID,
    node.teamID,
    node.team,
    node.Team,
    node.groupId,
    node.GroupId,
    node.groupID,
    node.GroupID,
    node.id,
    node.Id,
    node.ID
  ];
  for (const candidate of teamCandidates) {
    const parsed = extractTeamIdentifier(candidate);
    if (parsed != null && parsed > 0) {
      teamId = parsed;
      break;
    }
  }

  const nameCandidates = [node.teamName, node.TeamName, node.name, node.Name, node.label, node.Label];
  let teamName = null;
  for (const candidate of nameCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      teamName = candidate.trim();
      break;
    }
  }

  const memberMap = new Map();
  const addMember = (entry) => {
    const normalized = normaliseTeamMember(entry);
    if (!normalized || !normalized.steamId || !STEAM_ID_REGEX.test(normalized.steamId)) return;
    if (!memberMap.has(normalized.steamId)) memberMap.set(normalized.steamId, normalized);
    if ((!Number.isFinite(teamId) || teamId <= 0) && Number.isFinite(normalized.teamId) && normalized.teamId > 0) {
      teamId = normalized.teamId;
    }
  };

  const memberKeys = [
    'members',
    'Members',
    'teamMembers',
    'TeamMembers',
    'teammates',
    'TeamMates',
    'membersOnline',
    'MembersOnline',
    'activeMembers',
    'ActiveMembers',
    'players',
    'Players',
    'list',
    'List'
  ];
  for (const key of memberKeys) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const entry of value) addMember(entry);
    }
  }

  if (node.member) addMember(node.member);
  if (node.Member) addMember(node.Member);

  const leaderEntry = node.leader ?? node.Leader ?? node.leaderInfo ?? node.LeaderInfo ?? node.captain ?? node.Captain ?? null;
  const ownerEntry = node.owner ?? node.Owner ?? node.ownerInfo ?? node.OwnerInfo ?? null;
  let leaderSteamId = null;
  let ownerSteamId = null;

  if (leaderEntry) {
    const leaderMember = normaliseTeamMember(leaderEntry);
    if (leaderMember?.steamId) {
      leaderSteamId = leaderMember.steamId;
      addMember(leaderMember);
    } else if (typeof leaderEntry === 'string' || typeof leaderEntry === 'number' || typeof leaderEntry === 'bigint') {
      const extracted = extractSteamIdFromText(leaderEntry);
      if (extracted) {
        leaderSteamId = extracted;
        addMember({ steamId: extracted });
      }
    }
  }

  if (ownerEntry) {
    const ownerMember = normaliseTeamMember(ownerEntry);
    if (ownerMember?.steamId) {
      ownerSteamId = ownerMember.steamId;
      addMember(ownerMember);
    } else if (typeof ownerEntry === 'string' || typeof ownerEntry === 'number' || typeof ownerEntry === 'bigint') {
      const extracted = extractSteamIdFromText(ownerEntry);
      if (extracted) {
        ownerSteamId = extracted;
        addMember({ steamId: extracted });
      }
    }
  }

  if (!ownerSteamId && leaderSteamId) ownerSteamId = leaderSteamId;

  if (requestedSteamId && STEAM_ID_REGEX.test(requestedSteamId)) {
    addMember({ steamId: requestedSteamId });
  }

  if (memberMap.size === 0 && (!Number.isFinite(teamId) || teamId <= 0)) return null;

  const members = [...memberMap.values()].map((member) => ({
    steamId: member.steamId,
    displayName: member.displayName || null,
    online: typeof member.online === 'boolean' ? member.online : null,
    health: Number.isFinite(member.health) ? Math.round(member.health) : null
  }));

  const hasTeam = Number.isFinite(teamId) && teamId > 0;

  return {
    teamId: Number.isFinite(teamId) ? Math.trunc(teamId) : 0,
    teamName: teamName || null,
    leaderSteamId: leaderSteamId || ownerSteamId || null,
    ownerSteamId: ownerSteamId || leaderSteamId || null,
    members,
    requestedSteamId,
    hasTeam
  };
}

function extractTeamInfoFromPayload(payload, requestedSteamId) {
  if (!payload || typeof payload !== 'object') return null;
  const seen = new WeakSet();
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  const visit = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (seen.has(node)) return;
    seen.add(node);

    if (!Array.isArray(node)) {
      const info = extractTeamInfoFromNode(node, requestedSteamId);
      if (info) {
        const score = scoreTeamInfoCandidate(info, requestedSteamId);
        if (score > bestScore) {
          bestScore = score;
          best = info;
        }
      }
    }

    if (Array.isArray(node)) {
      for (const entry of node) visit(entry, depth + 1);
    } else {
      for (const value of Object.values(node)) {
        if (value && typeof value === 'object') visit(value, depth + 1);
      }
    }
  };

  visit(payload, 0);
  return best;
}

function extractTeamInfoFromText(text, requestedSteamId) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const normalized = text.replace(/\r\n/g, '\n');
  const lower = normalized.toLowerCase();

  if (/no\s+team|not\s+in\s+a\s+team|not\s+part\s+of\s+a\s+team|has\s+no\s+team/.test(lower)) {
    const members = [];
    if (requestedSteamId && STEAM_ID_REGEX.test(requestedSteamId)) {
      members.push({ steamId: requestedSteamId, displayName: null, online: null, health: null });
    }
    return {
      teamId: 0,
      teamName: null,
      leaderSteamId: null,
      ownerSteamId: null,
      members,
      requestedSteamId,
      hasTeam: false
    };
  }

  const teamPatterns = [
    /team\s*id\s*[:=]\s*(\d{2,})/i,
    /team\s*[:=]\s*(\d{2,})/i,
    /group\s*id\s*[:=]\s*(\d{2,})/i,
    /team\s*(\d{2,})\b/i,
    /\bid\s*[:=]\s*(\d{2,})/i
  ];
  let teamId = null;
  for (const pattern of teamPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const parsed = extractTeamIdentifier(match[1]);
      if (parsed != null && parsed > 0) {
        teamId = parsed;
        break;
      }
    }
  }

  const teamNameMatch = normalized.match(/team\s*name\s*[:=]\s*([^\n]+)/i);
  const teamName = teamNameMatch ? teamNameMatch[1].trim() : null;

  const memberMap = new Map();
  const steamMatches = normalized.match(/\b7656119\d{10,}\b/g) || [];
  for (const match of steamMatches) {
    if (!memberMap.has(match)) {
      memberMap.set(match, { steamId: match, displayName: null, online: null, health: null });
    }
  }

  const lines = normalized.split('\n');
  for (const line of lines) {
    const ids = line.match(/\b7656119\d{10,}\b/g);
    if (!ids) continue;
    const lowerLine = line.toLowerCase();
    for (const id of ids) {
      const entry = memberMap.get(id) || { steamId: id, displayName: null, online: null, health: null };
      const label = line.replace(id, '').replace(/[:,\-]/g, ' ').replace(/[\[\]{}()]/g, ' ').replace(/\s+/g, ' ').trim();
      if (label && !entry.displayName) entry.displayName = label;
      if (/leader|captain/.test(lowerLine)) entry.isLeader = true;
      if (/owner/.test(lowerLine)) entry.isOwner = true;
      memberMap.set(id, entry);
    }
  }

  if (requestedSteamId && STEAM_ID_REGEX.test(requestedSteamId) && !memberMap.has(requestedSteamId)) {
    memberMap.set(requestedSteamId, { steamId: requestedSteamId, displayName: null, online: null, health: null });
  }

  let leaderSteamId = null;
  let ownerSteamId = null;
  for (const entry of memberMap.values()) {
    if (entry.isLeader && !leaderSteamId) leaderSteamId = entry.steamId;
    if (entry.isOwner && !ownerSteamId) ownerSteamId = entry.steamId;
  }
  if (!ownerSteamId) ownerSteamId = leaderSteamId || null;

  if (memberMap.size === 0 && (teamId == null || teamId <= 0)) return null;

  const members = [...memberMap.values()].map((entry) => ({
    steamId: entry.steamId,
    displayName: entry.displayName || null,
    online: null,
    health: null
  }));

  const hasTeam = Number.isFinite(teamId) && teamId > 0;

  return {
    teamId: Number.isFinite(teamId) ? Math.trunc(teamId) : 0,
    teamName: teamName || null,
    leaderSteamId: leaderSteamId || ownerSteamId || null,
    ownerSteamId: ownerSteamId || leaderSteamId || null,
    members,
    requestedSteamId,
    hasTeam
  };
}

function parseTeamInfoText(raw, requestedSteamId = null) {
  if (raw == null) return null;
  const cleaned = stripRconTimestampPrefix(stripAnsiSequences(String(raw))).trim();
  if (!cleaned) return null;

  const normalized = cleaned.replace(/\r\n/g, '\n');
  const lower = normalized.toLowerCase();
  if (/no\s+team|not\s+in\s+a\s+team|not\s+part\s+of\s+a\s+team|has\s+no\s+team/.test(lower)) {
    const members = [];
    if (requestedSteamId && STEAM_ID_REGEX.test(requestedSteamId)) {
      members.push({ steamId: requestedSteamId, displayName: null, online: null, health: null });
    }
    return {
      teamId: 0,
      teamName: null,
      leaderSteamId: null,
      ownerSteamId: null,
      members,
      requestedSteamId,
      hasTeam: false
    };
  }

  const jsonCandidates = [];
  const tryParse = (text) => {
    const input = typeof text === 'string' ? text : String(text ?? '');
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input);
      jsonCandidates.push(parsed);
    } catch {
      // ignore malformed JSON fragments
    }
  };

  tryParse(normalized);
  const braceMatch = normalized.match(/\{[\s\S]*\}/);
  if (braceMatch) tryParse(braceMatch[0]);
  const bracketMatch = normalized.match(/\[[\s\S]*\]/);
  if (bracketMatch) tryParse(bracketMatch[0]);

  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of jsonCandidates) {
    const extracted = extractTeamInfoFromPayload(candidate, requestedSteamId);
    if (!extracted) continue;
    const score = scoreTeamInfoCandidate(extracted, requestedSteamId);
    if (score > bestScore) {
      best = extracted;
      bestScore = score;
    }
  }
  if (best) return best;

  return extractTeamInfoFromText(normalized, requestedSteamId);
}

function parseTeamInfoMessage(message, requestedSteamId = null) {
  if (message == null) return null;

  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const seenObjects = new WeakSet();
  const seenStrings = new Set();

  const considerCandidate = (info) => {
    if (!info) return;
    const score = scoreTeamInfoCandidate(info, requestedSteamId);
    if (score > bestScore) {
      best = info;
      bestScore = score;
    }
  };

  const considerText = (text) => {
    if (text == null) return;
    const raw = typeof text === 'string' ? text : String(text ?? '');
    if (!raw.trim()) return;
    const key = raw.trim();
    if (seenStrings.has(key)) return;
    seenStrings.add(key);
    considerCandidate(parseTeamInfoText(raw, requestedSteamId));
  };

  const considerValue = (value) => {
    if (value == null) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
      considerText(value);
      return;
    }
    if (typeof value !== 'object') return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);

    considerCandidate(extractTeamInfoFromPayload(value, requestedSteamId));

    const stringKeys = ['Message', 'message', 'Result', 'result', 'Text', 'text', 'Value', 'value'];
    for (const key of stringKeys) {
      if (typeof value[key] === 'string' || typeof value[key] === 'number' || typeof value[key] === 'bigint') {
        considerText(value[key]);
      }
    }

    const nestedValues = Array.isArray(value) ? value : Object.values(value);
    for (const nested of nestedValues) {
      if (nested && typeof nested === 'object') {
        considerValue(nested);
      } else if (typeof nested === 'string' || typeof nested === 'number' || typeof nested === 'bigint') {
        considerText(nested);
      }
    }
  };

  considerValue(message);
  return best;
}

function manualRefreshCooldown(serverId, now = Date.now()) {
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric)) return { coolingDown: false, retryAfterMs: 0 };
  const entry = manualRefreshState.get(numeric);
  if (!entry || !Number.isFinite(entry.lastRun)) return { coolingDown: false, retryAfterMs: 0 };
  const elapsed = now - entry.lastRun;
  if (elapsed >= MANUAL_REFRESH_MIN_INTERVAL_MS) return { coolingDown: false, retryAfterMs: 0 };
  return { coolingDown: true, retryAfterMs: MANUAL_REFRESH_MIN_INTERVAL_MS - elapsed };
}

function markManualRefresh(serverId, now = Date.now()) {
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric)) return;
  manualRefreshState.set(numeric, { lastRun: now });
}

function clearManualRefreshState(serverId) {
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric)) return;
  manualRefreshState.delete(numeric);
}

function ensureTeamInfoCache(serverId) {
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric)) return null;
  let entry = teamInfoCache.get(numeric);
  if (!entry) {
    entry = { players: new Map(), teams: new Map() };
    teamInfoCache.set(numeric, entry);
  }
  return entry;
}

function pruneTeamInfoCache(serverId, now = Date.now()) {
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric)) return;
  const entry = teamInfoCache.get(numeric);
  if (!entry) return;
  for (const [steamId, cached] of entry.players) {
    if (now - cached.fetchedAt > TEAM_INFO_CACHE_TTL) entry.players.delete(steamId);
  }
  for (const [teamId, cached] of entry.teams) {
    if (now - cached.fetchedAt > TEAM_INFO_CACHE_TTL) entry.teams.delete(teamId);
  }
  if (entry.players.size === 0 && entry.teams.size === 0) teamInfoCache.delete(numeric);
}

function lookupCachedTeamInfoForPlayer(serverId, steamId, now = Date.now()) {
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric) || !steamId) return null;
  const entry = teamInfoCache.get(numeric);
  if (!entry) return null;
  const cached = entry.players.get(steamId);
  if (!cached) return null;
  if (now - cached.fetchedAt > TEAM_INFO_CACHE_TTL) {
    entry.players.delete(steamId);
    if (entry.players.size === 0 && entry.teams.size === 0) teamInfoCache.delete(numeric);
    return null;
  }
  return cached;
}

function cacheTeamInfoForServer(serverId, info, now = Date.now()) {
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric) || !info) return;
  const store = ensureTeamInfoCache(numeric);
  if (!store) return;

  let teamId = Number.isFinite(info.teamId) ? Math.trunc(info.teamId) : 0;
  const teamName = typeof info.teamName === 'string' && info.teamName.trim() ? info.teamName.trim() : null;
  const leaderSteamId = info.leaderSteamId && STEAM_ID_REGEX.test(info.leaderSteamId) ? info.leaderSteamId : null;
  const ownerSteamId = info.ownerSteamId && STEAM_ID_REGEX.test(info.ownerSteamId)
    ? info.ownerSteamId
    : (leaderSteamId || null);

  const members = [];
  const seen = new Set();

  const pushMember = (member) => {
    const normalized = normaliseTeamMember(member);
    if (!normalized || !normalized.steamId || !STEAM_ID_REGEX.test(normalized.steamId)) return;
    if (seen.has(normalized.steamId)) return;
    seen.add(normalized.steamId);
    if ((!Number.isFinite(teamId) || teamId <= 0) && Number.isFinite(normalized.teamId) && normalized.teamId > 0) {
      teamId = Math.trunc(normalized.teamId);
    }
    members.push({
      steamId: normalized.steamId,
      displayName: normalized.displayName || null,
      online: typeof normalized.online === 'boolean' ? normalized.online : null,
      health: Number.isFinite(normalized.health) ? Math.round(normalized.health) : null
    });
  };

  if (Array.isArray(info.members)) {
    for (const member of info.members) pushMember(member);
  }

  if (info.requestedSteamId && STEAM_ID_REGEX.test(info.requestedSteamId)) {
    pushMember({ steamId: info.requestedSteamId });
  }

  if (leaderSteamId) pushMember({ steamId: leaderSteamId });
  if (ownerSteamId) pushMember({ steamId: ownerSteamId });

  const hasTeam = Number.isFinite(teamId) && teamId > 0;

  const cacheEntry = {
    teamId: hasTeam ? teamId : 0,
    teamName,
    leaderSteamId,
    ownerSteamId,
    members,
    fetchedAt: now,
    hasTeam,
    error: false
  };

  if (hasTeam) store.teams.set(teamId, cacheEntry);

  for (const member of members) {
    store.players.set(member.steamId, { ...cacheEntry, steamId: member.steamId });
  }
  if (info.requestedSteamId && !store.players.has(info.requestedSteamId) && STEAM_ID_REGEX.test(info.requestedSteamId)) {
    store.players.set(info.requestedSteamId, { ...cacheEntry, steamId: info.requestedSteamId });
  }
}

function shouldProcessKillLine(serverId, normalized) {
  const text = typeof normalized === 'string' ? normalized.trim() : '';
  if (!text) return false;
  const key = `${serverId}:${text}`;
  const now = Date.now();
  const last = recentKillLines.get(key) || 0;
  if (now - last < KILL_FEED_DEDUPE_MS) return false;
  recentKillLines.set(key, now);
  if (recentKillLines.size > 2000) {
    const cutoff = now - KILL_FEED_DEDUPE_MS;
    for (const [entryKey, ts] of recentKillLines.entries()) {
      if (ts < cutoff) recentKillLines.delete(entryKey);
    }
  }
  return true;
}

function extractNameAndClan(segment) {
  if (typeof segment !== 'string') {
    const name = typeof segment === 'undefined' || segment === null ? '' : String(segment);
    return { name: name.trim() || null, clan: null };
  }
  let working = segment.trim();
  const clans = [];
  while (true) {
    const match = working.match(/^\s*\[([^\]]+)\]\s*/);
    if (!match) break;
    const value = match[1].trim();
    if (value) clans.push(value);
    working = working.slice(match[0].length);
  }
  const name = working.trim();
  return {
    name: name || null,
    clan: clans.length ? clans.join(' | ') : null
  };
}

const KILL_FEED_STEAM_PREFIX = '7656';

function parseKillLogLine(line) {
  if (!line) return null;
  const withoutAnsi = stripAnsiSequences(line) || '';
  const trimmed = withoutAnsi.trim();
  if (!trimmed) return null;
  const withoutTimestamp = stripRconTimestampPrefix(trimmed).trim();
  if (!withoutTimestamp) return null;
  if (!withoutTimestamp.toLowerCase().includes('was killed by')) return null;
  const match = withoutTimestamp.match(/^(?<victimPart>.+?)\[(?<victimId>\d{17})\]\s+was killed by\s+(?<killerPart>.+?)\[(?<killerId>\d{17})\](?<rest>.*)$/i);
  if (!match || !match.groups) return null;

  const killerId = match.groups.killerId;
  const victimId = match.groups.victimId;
  if (!STEAM_ID_REGEX.test(killerId) || !STEAM_ID_REGEX.test(victimId)) return null;
  if (!killerId.startsWith(KILL_FEED_STEAM_PREFIX) || !victimId.startsWith(KILL_FEED_STEAM_PREFIX)) return null;

  const victimInfo = extractNameAndClan(match.groups.victimPart);
  const killerInfo = extractNameAndClan(match.groups.killerPart);
  const rest = match.groups.rest || '';

  const weaponMatch = rest.match(/\b(?:using|with)\s+(?<weapon>.+?)(?=(?:\s+from\b|\s+at\b|$))/i);
  const distanceMatch = rest.match(/\bfrom\s+(-?\d+(?:\.\d+)?)\s*m\b/i);
  const positionMatch =
    rest.match(/\bat\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/i) ||
    rest.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);

  const distance = distanceMatch ? Number(distanceMatch[1]) : null;
  const posX = positionMatch ? Number(positionMatch[1]) : null;
  const posY = positionMatch ? Number(positionMatch[2]) : null;
  const posZ = positionMatch ? Number(positionMatch[3]) : null;

  return {
    raw: line,
    normalized: withoutTimestamp,
    occurredAt: new Date().toISOString(),
    killerSteamId: match.groups.killerId,
    killerName: killerInfo.name,
    killerClan: killerInfo.clan,
    victimSteamId: match.groups.victimId,
    victimName: victimInfo.name,
    victimClan: victimInfo.clan,
    weapon: (() => {
      if (weaponMatch?.groups?.weapon) {
        const value = weaponMatch.groups.weapon.trim();
        return value || null;
      }
      if (Array.isArray(weaponMatch) && weaponMatch[1]) {
        const value = weaponMatch[1].trim();
        return value || null;
      }
      return null;
    })(),
    distance: Number.isFinite(distance) ? distance : null,
    position: Number.isFinite(posX) && Number.isFinite(posY) && Number.isFinite(posZ)
      ? { x: posX, y: posY, z: posZ }
      : null
  };
}

function normaliseKillCombatLog(value) {
  if (!value) return null;
  let payload = value;
  if (typeof value === 'string') {
    const cleaned = stripAnsiSequences(value).replace(/\r/g, '');
    const lines = cleaned.split('\n').map((line) => line.replace(/\s+$/g, '')).filter((line) => line);
    return {
      text: lines.join('\n'),
      lines: lines.slice(0, 120),
      fetchedAt: new Date().toISOString()
    };
  }
  if (typeof value === 'object') {
    payload = { ...value };
    if (Array.isArray(payload.lines)) {
      payload.lines = payload.lines
        .map((line) => (typeof line === 'string' ? stripAnsiSequences(line) : String(line ?? '')))
        .map((line) => line.replace(/\r/g, '').replace(/\s+$/g, ''))
        .filter((line) => line)
        .slice(0, 120);
    } else if (typeof payload.text === 'string') {
      const cleaned = stripAnsiSequences(payload.text).replace(/\r/g, '');
      payload.lines = cleaned.split('\n').map((line) => line.replace(/\s+$/g, '')).filter((line) => line).slice(0, 120);
    } else {
      payload.lines = [];
    }
    if (typeof payload.text !== 'string') {
      payload.text = payload.lines.join('\n');
    } else {
      payload.text = stripAnsiSequences(payload.text).replace(/\r/g, '');
    }
    if (!payload.fetchedAt) payload.fetchedAt = new Date().toISOString();
    return payload;
  }
  return null;
}

function normaliseKillEventRow(row) {
  if (!row) return null;
  const serverId = Number(row?.server_id ?? row?.serverId);
  if (!Number.isFinite(serverId)) return null;
  const occurredRaw = row?.occurred_at ?? row?.occurredAt ?? row?.created_at ?? row?.createdAt;
  let occurredAt = occurredRaw ? new Date(occurredRaw) : new Date();
  if (Number.isNaN(occurredAt.getTime())) occurredAt = new Date();
  const parseNum = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  let combatLog = row?.combat_log ?? row?.combatLog ?? row?.combat_log_json ?? row?.combatLogJson ?? null;
  if (typeof combatLog === 'string') {
    try {
      const parsed = JSON.parse(combatLog);
      combatLog = parsed;
    } catch {
      combatLog = normaliseKillCombatLog(combatLog);
    }
  }
  if (combatLog) {
    combatLog = normaliseKillCombatLog(combatLog);
  }

  return {
    id: row?.id ?? null,
    serverId,
    occurredAt: occurredAt.toISOString(),
    killerSteamId: row?.killer_steamid ?? row?.killerSteamId ?? null,
    killerName: row?.killer_name ?? row?.killerName ?? null,
    killerClan: row?.killer_clan ?? row?.killerClan ?? null,
    victimSteamId: row?.victim_steamid ?? row?.victimSteamId ?? null,
    victimName: row?.victim_name ?? row?.victimName ?? null,
    victimClan: row?.victim_clan ?? row?.victimClan ?? null,
    weapon: row?.weapon ?? null,
    distance: parseNum(row?.distance),
    position: {
      x: parseNum(row?.pos_x ?? row?.posX ?? row?.position_x ?? row?.positionX),
      y: parseNum(row?.pos_y ?? row?.posY ?? row?.position_y ?? row?.positionY),
      z: parseNum(row?.pos_z ?? row?.posZ ?? row?.position_z ?? row?.positionZ)
    },
    raw: row?.raw ?? null,
    combatLog,
    combatLogError: row?.combat_log_error ?? row?.combatLogError ?? null,
    createdAt: (row?.created_at ?? row?.createdAt ?? occurredAt.toISOString())
  };
}

function killEventSignature(event) {
  if (!event) return null;
  const occurred = event.occurredAt || event.createdAt || '';
  const killer = event.killerSteamId || '';
  const victim = event.victimSteamId || '';
  const raw = event.raw || '';
  return `${occurred}:${killer}:${victim}:${raw}`;
}

function cacheKillEvent(serverId, event) {
  if (!event) return;
  const key = Number(serverId);
  if (!Number.isFinite(key)) return;
  const existing = killFeedCache.get(key) || [];
  const signature = killEventSignature(event);
  const next = [...existing];
  let replaced = false;
  for (let i = 0; i < next.length; i += 1) {
    const currentSignature = killEventSignature(next[i]);
    if (currentSignature === signature) {
      next[i] = { ...next[i], ...event };
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    next.push(event);
  }
  next.sort((a, b) => {
    const aTime = Date.parse(a.occurredAt || a.createdAt || '');
    const bTime = Date.parse(b.occurredAt || b.createdAt || '');
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
    return 0;
  });
  const cutoff = Date.now() - KILL_FEED_RETENTION_MS;
  const filtered = next.filter((entry) => {
    const ts = Date.parse(entry.occurredAt || entry.createdAt || '');
    return Number.isFinite(ts) ? ts >= cutoff : true;
  }).slice(0, KILL_FEED_MAX_CACHE);
  killFeedCache.set(key, filtered);
}

function scheduleCombatLogFetch({ serverId, victimSteamId, eventId = null, baseEvent = null, delayMs = 10000 }) {
  const key = Number(serverId);
  if (!Number.isFinite(key)) return;
  const steamId = victimSteamId ? String(victimSteamId).trim() : '';
  if (!steamId) return;
  const waitMs = Number(delayMs);
  const ms = Number.isFinite(waitMs) && waitMs >= 0 ? waitMs : 10000;

  (async () => {
    if (ms > 0) {
      await delay(ms);
    }

    const serverRow = await getMonitoredServerRow(key);
    if (!serverRow) return;

    try {
      const reply = await sendRconCommand(serverRow, `combatlog ${steamId}`, {
        silent: true,
        timeoutMs: 15000
      });
      const combatLog = normaliseCombatLogReply(reply);
      await applyCombatLogToKillEvent(key, {
        eventId,
        combatLog,
        error: null,
        baseEvent
      });
    } catch (err) {
      const message = err?.message || String(err);
      await applyCombatLogToKillEvent(key, {
        eventId,
        combatLog: null,
        error: message,
        baseEvent
      });
    }
  })().catch((err) => {
    console.warn('combat log fetch failed', err);
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer?.unref === 'function') timer.unref();
  });
}

async function applyCombatLogToKillEvent(serverId, { eventId = null, combatLog = null, error = null, baseEvent = null }) {
  if (!combatLog && !error) return;
  const key = Number(serverId);
  if (!Number.isFinite(key)) return;
  const id = Number(eventId);
  if (Number.isFinite(id) && typeof db?.updateKillEventCombatLog === 'function') {
    try {
      await db.updateKillEventCombatLog({
        id,
        server_id: key,
        combat_log: combatLog ?? null,
        combat_log_error: error ?? null
      });
    } catch (err) {
      console.warn('Failed to persist combat log update', err);
    }
  }

  if (!baseEvent) return;
  const updatedEvent = {
    ...baseEvent,
    combatLog: combatLog ?? baseEvent.combatLog ?? null,
    combatLogError: error ?? null
  };

  cacheKillEvent(key, updatedEvent);
  maybeCleanupKillFeed(key);
  io.to(`srv:${key}`).emit('kill', { serverId: key, event: updatedEvent });
}

function normaliseCombatLogReply(reply) {
  const message = typeof reply?.Message === 'string'
    ? reply.Message
    : (typeof reply === 'string' ? reply : '');
  if (!message) return null;
  const cleaned = stripAnsiSequences(message).replace(/\r/g, '');
  const lines = cleaned.split('\n').map((line) => line.replace(/\s+$/g, '')).filter((line) => line);
  if (lines.length === 0) return null;
  return {
    text: lines.slice(0, 120).join('\n'),
    lines: lines.slice(0, 120),
    fetchedAt: new Date().toISOString()
  };
}

function maybeCleanupKillFeed(serverId) {
  if (typeof db?.purgeKillEvents !== 'function') return;
  const key = Number(serverId);
  if (!Number.isFinite(key)) return;
  const now = Date.now();
  const last = killFeedCleanupSchedule.get(key) || 0;
  if (now - last < KILL_FEED_PURGE_INTERVAL_MS) return;
  killFeedCleanupSchedule.set(key, now);
  const cutoffIso = new Date(now - KILL_FEED_RETENTION_MS).toISOString();
  db.purgeKillEvents({ before: cutoffIso, server_id: key }).catch((err) => {
    console.warn(`Failed to purge kill feed for server ${key}`, err);
  });
  runKillFeedGlobalCleanup();
}

function runKillFeedGlobalCleanup() {
  if (typeof db?.purgeKillEvents !== 'function') return null;
  if (killFeedGlobalCleanupPromise) return killFeedGlobalCleanupPromise;
  const cutoffIso = new Date(Date.now() - KILL_FEED_RETENTION_MS).toISOString();
  killFeedGlobalCleanupPromise = (async () => {
    try {
      await db.purgeKillEvents({ before: cutoffIso });
    } catch (err) {
      console.warn('Failed to purge kill feed globally', err);
    } finally {
      killFeedGlobalCleanupPromise = null;
    }
  })();
  return killFeedGlobalCleanupPromise;
}

function cacheTeamInfoMiss(serverId, steamId, now = Date.now()) {
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric) || !steamId) return;
  const store = ensureTeamInfoCache(numeric);
  if (!store) return;
  store.players.set(steamId, {
    steamId,
    teamId: 0,
    teamName: null,
    leaderSteamId: null,
    ownerSteamId: null,
    members: [],
    fetchedAt: now,
    hasTeam: false,
    error: true
  });
}

function applyTeamInfoToPlayers(serverId, players, now = Date.now()) {
  if (!Array.isArray(players)) return;
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric)) return;
  for (const player of players) {
    const steamId = String(player?.steamId || '').trim();
    if (!steamId) continue;
    const cached = lookupCachedTeamInfoForPlayer(numeric, steamId, now);
    if (!cached) continue;
    if (cached.teamId > 0 && Number(player.teamId) !== cached.teamId) {
      player.teamId = cached.teamId;
    } else if ((!Number.isFinite(player.teamId) || player.teamId == null || player.teamId <= 0) && !cached.error) {
      player.teamId = cached.teamId || 0;
    }
    if (cached.ownerSteamId && !player.ownerSteamId) {
      player.ownerSteamId = cached.ownerSteamId;
    } else if (cached.leaderSteamId && !player.ownerSteamId) {
      player.ownerSteamId = cached.leaderSteamId;
    }
    if (cached.teamName && !player.teamName) {
      player.teamName = cached.teamName;
    }
  }
}

function ensurePositionCache(serverId) {
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric)) return null;
  let entry = positionCache.get(numeric);
  if (!entry) {
    entry = { players: new Map() };
    positionCache.set(numeric, entry);
  }
  return entry;
}

function prunePositionCache(serverId, now = Date.now()) {
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric)) return;
  const entry = positionCache.get(numeric);
  if (!entry) return;
  for (const [steamId, cached] of entry.players) {
    if (now - cached.fetchedAt > POSITION_CACHE_TTL) entry.players.delete(steamId);
  }
  if (entry.players.size === 0) positionCache.delete(numeric);
}

function lookupCachedPositionForPlayer(serverId, steamId, now = Date.now()) {
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric) || !steamId) return null;
  const entry = positionCache.get(numeric);
  if (!entry) return null;
  const cached = entry.players.get(steamId);
  if (!cached) return null;
  if (now - cached.fetchedAt > POSITION_CACHE_TTL) {
    entry.players.delete(steamId);
    if (entry.players.size === 0) positionCache.delete(numeric);
    return null;
  }
  return cached;
}

function cachePlayerPosition(serverId, steamId, position, now = Date.now()) {
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric) || !steamId || !position) return;
  const store = ensurePositionCache(numeric);
  if (!store) return;
  store.players.set(steamId, {
    steamId,
    position,
    fetchedAt: now,
    error: false
  });
}

function cachePlayerPositionMiss(serverId, steamId, now = Date.now()) {
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric) || !steamId) return;
  const store = ensurePositionCache(numeric);
  if (!store) return;
  store.players.set(steamId, {
    steamId,
    position: null,
    fetchedAt: now,
    error: true
  });
}

function applyPositionCacheToPlayers(serverId, players, now = Date.now()) {
  if (!Array.isArray(players)) return;
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric)) return;
  for (const player of players) {
    if (hasValidPosition(player?.position)) continue;
    const steamId = String(player?.steamId || '').trim();
    if (!steamId) continue;
    const cached = lookupCachedPositionForPlayer(numeric, steamId, now);
    if (!cached || !cached.position || cached.error) continue;
    player.position = cached.position;
  }
}

function parsePrintPosMessage(message) {
  if (message == null) return null;
  const raw = typeof message === 'object' && message && Object.prototype.hasOwnProperty.call(message, 'Message')
    ? message.Message
    : message;
  const cleaned = stripAnsiSequences(String(raw ?? ''));
  if (!cleaned.trim()) return null;
  const lines = cleaned
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => stripRconTimestampPrefix(line).trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const candidates = [...lines].reverse();
  for (const line of candidates) {
    let match = line.match(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/);
    if (match) {
      const vector = parseVector3({ x: match[1], y: match[2], z: match[3] });
      if (vector) return vector;
    }
    const xMatch = line.match(/x\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
    const yMatch = line.match(/y\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
    const zMatch = line.match(/z\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
    if (xMatch || yMatch || zMatch) {
      const vector = parseVector3({
        x: xMatch ? xMatch[1] : null,
        y: yMatch ? yMatch[1] : null,
        z: zMatch ? zMatch[1] : null
      });
      if (vector) return vector;
    }
    match = line.match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
    if (match) {
      const vector = parseVector3({ x: match[1], y: match[2], z: match[3] });
      if (vector) return vector;
    }
  }
  return null;
}

const MONUMENT_ICON_RULES = [
  { pattern: /oil\s*rig/i, icon: 'oil-rig' },
  { pattern: /dome/i, icon: 'sphere-tank' },
  { pattern: /lighthouse/i, icon: 'lighthouse' },
  { pattern: /harbo(u)?r/i, icon: 'harbor' },
  { pattern: /launch|rocket/i, icon: 'rocket' },
  { pattern: /airfield|airport/i, icon: 'airfield' },
  { pattern: /train.*yard/i, icon: 'train-yard' },
  { pattern: /train.*station/i, icon: 'train-station' },
  { pattern: /power\s*plant/i, icon: 'power-plant' },
  { pattern: /military|outpost/i, icon: 'military' },
  { pattern: /bandit/i, icon: 'bandit' },
  { pattern: /satellite|dish|telecom|tower|antenna/i, icon: 'satellite' },
  { pattern: /junkyard/i, icon: 'junkyard' },
  { pattern: /ranch/i, icon: 'ranch' },
  { pattern: /fishing/i, icon: 'fishing' },
  { pattern: /gas\s*station|fuel/i, icon: 'gas-station' },
  { pattern: /supermarket|shop/i, icon: 'store' },
  { pattern: /excavator/i, icon: 'excavator' }
];

function monumentIconFromLabel(label, category) {
  const haystack = [label, category]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  for (const { pattern, icon } of MONUMENT_ICON_RULES) {
    if (pattern.test(haystack)) return icon;
  }
  return 'map-pin';
}

function normaliseIconToken(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  const segment = lowered.split(/[\\/]/).pop();
  const withoutQuery = segment.split(/[?#]/)[0];
  const withoutExt = withoutQuery.replace(/\.[a-z0-9]+$/, '');
  const normalized = withoutExt
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!normalized) return null;

  const withoutSuffix = normalized.replace(/-\d+$/, '');
  const cleaned = withoutSuffix.replace(/^(?:icon|monument|map)-/, '');
  return cleaned || withoutSuffix || normalized;
}

function slugifyMonumentId(value, fallback) {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed) {
      const slug = trimmed.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (slug) return slug;
    }
  }
  if (Number.isFinite(value)) return `mon-${Math.trunc(value)}`;
  return fallback;
}

function extractMonumentPosition(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const candidates = [];
  const direct = {
    x: entry.x ?? entry.X ?? entry.posX ?? entry.positionX ?? entry.worldX,
    y: entry.y ?? entry.Y ?? entry.posY ?? entry.positionY ?? entry.worldY,
    z: entry.z ?? entry.Z ?? entry.posZ ?? entry.positionZ ?? entry.worldZ
  };
  if (direct.x != null || direct.y != null || direct.z != null) candidates.push(direct);
  const nestedKeys = ['position', 'Position', 'location', 'Location', 'coords', 'Coords', 'worldPosition', 'WorldPosition'];
  for (const key of nestedKeys) {
    if (entry[key]) candidates.push(entry[key]);
  }
  if (entry.transform?.position) candidates.push(entry.transform.position);
  if (entry.Transform?.Position) candidates.push(entry.Transform.Position);
  for (const candidate of candidates) {
    const vector = parseVector3(candidate);
    if (vector) return vector;
  }
  return null;
}

function normaliseMonumentsFromMeta(monuments) {
  if (!Array.isArray(monuments)) return [];
  const results = [];
  monuments.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const position = extractMonumentPosition(entry);
    if (!position) return;
    const rawId = entry.id ?? entry.identifier ?? entry.prefabName ?? entry.name ?? entry.displayName ?? index;
    const id = slugifyMonumentId(rawId, `mon-${index}`);
    const label = entry.displayName || entry.name || entry.label || entry.token || `Monument ${index + 1}`;
    const shortName = entry.shortName || entry.token || entry.name || label;
    const category = entry.category || entry.type || entry.kind || entry.MonumentType || null;
    const icon = normaliseIconToken(entry.icon) || monumentIconFromLabel(label, category);
    results.push({ id, label, shortName, category, icon, position });
  });
  return results;
}

function parseEntitySearchResults(message) {
  if (message == null) return [];
  const raw = typeof message === 'object' && message && Object.prototype.hasOwnProperty.call(message, 'Message')
    ? message.Message
    : message;
  const cleaned = stripAnsiSequences(String(raw ?? ''));
  if (!cleaned.trim()) return [];
  const lines = cleaned
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => stripRconTimestampPrefix(line).trim())
    .filter(Boolean);
  const results = [];
  for (const line of lines) {
    const coordMatch = line.match(/\((-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)\)/);
    if (!coordMatch) continue;
    const position = parseVector3({ x: coordMatch[1], y: coordMatch[2], z: coordMatch[3] });
    if (!position) continue;
    const entityMatch = line.match(/([a-z0-9_\/.-]+)\[(\d+)\]/i);
    const prefab = entityMatch ? entityMatch[1] : null;
    const entityId = entityMatch ? entityMatch[2] : null;
    const label = entityMatch ? (line.slice(0, entityMatch.index).trim() || prefab) : line.slice(0, coordMatch.index).trim();
    results.push({
      entityId: entityId ? String(entityId) : null,
      prefab: prefab || null,
      label: label || prefab || null,
      raw: line,
      position
    });
  }
  return results;
}

function matchesEntityDefinition(result, definition) {
  if (!definition?.matchers || definition.matchers.length === 0) return true;
  const haystack = [result.prefab, result.label, result.raw]
    .filter((value) => typeof value === 'string' && value)
    .join(' ')
    .toLowerCase();
  if (!haystack) return false;
  return definition.matchers.some((pattern) => pattern.test(haystack));
}

function normaliseEntityResult(result, definition, index) {
  return {
    id: result.entityId ? `${definition.type}-${result.entityId}` : `${definition.type}-${index}`,
    type: definition.type,
    label: definition.label,
    icon: definition.icon,
    prefab: result.prefab || null,
    position: result.position,
    raw: result.raw || null
  };
}

async function fetchDynamicWorldEntities(serverRow, { logger } = {}) {
  const dynamic = [];
  for (const definition of ENTITY_SEARCH_DEFINITIONS) {
    const seen = new Set();
    for (const command of definition.commands) {
      let results = [];
      try {
        const reply = await sendRconCommand(serverRow, command, { silent: true, timeoutMs: ENTITY_SEARCH_TIMEOUT_MS });
        results = parseEntitySearchResults(reply?.Message ?? reply);
      } catch (err) {
        if (logger?.debug) {
          logger.debug('Entity search command failed', { command, error: err?.message || err });
        }
        continue;
      }
      for (const result of results) {
        if (!matchesEntityDefinition(result, definition)) continue;
        const dedupeKey = result.entityId
          ? `${definition.type}:${result.entityId}`
          : `${definition.type}:${result.prefab || ''}:${Math.round(result.position?.x ?? 0)}:${Math.round(result.position?.z ?? 0)}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        dynamic.push(normaliseEntityResult(result, definition, dynamic.length));
      }
      if (results.length > 0) break;
    }
  }
  return dynamic;
}

async function resolveWorldEntities(serverId, serverRow, { mapMetadata, logger } = {}) {
  const now = Date.now();
  const cached = worldEntityCache.get(serverId);
  let dynamic = cached?.entities || [];
  let timestamp = cached?.timestamp || 0;
  const shouldRefresh = !cached || now - cached.timestamp > WORLD_ENTITY_CACHE_TTL_MS;
  if (shouldRefresh) {
    try {
      dynamic = await fetchDynamicWorldEntities(serverRow, { logger });
      timestamp = now;
      worldEntityCache.set(serverId, { timestamp: now, entities: dynamic });
    } catch (err) {
      if (logger?.warn) {
        logger.warn('Dynamic world entity query failed', err);
      }
      if (!cached) {
        timestamp = now;
        worldEntityCache.set(serverId, { timestamp: now, entities: [] });
        dynamic = [];
      } else {
        timestamp = cached.timestamp;
        dynamic = cached.entities;
      }
    }
  }

  const monuments = normaliseMonumentsFromMeta(mapMetadata?.monuments);
  const fetchedAt = new Date(timestamp || now).toISOString();
  return {
    fetchedAt,
    monuments,
    entities: dynamic.map((entry) => ({
      ...entry,
      position: entry.position ? { ...entry.position } : null
    }))
  };
}

async function enrichPlayersWithTeamInfo(
  serverId,
  serverRow,
  players,
  { logger, allowLookup = true, pendingSteamIds = null } = {}
) {
  if (!Array.isArray(players) || players.length === 0) {
    return { players, lookupsPerformed: false, pending: [] };
  }
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric)) {
    return { players, lookupsPerformed: false, pending: [] };
  }

  const now = Date.now();
  pruneTeamInfoCache(numeric, now);
  applyTeamInfoToPlayers(numeric, players, now);

  const playerMap = new Map();
  for (const player of players) {
    const steamId = String(player?.steamId || '').trim();
    if (!steamId || !STEAM_ID_REGEX.test(steamId)) continue;
    if (!playerMap.has(steamId)) playerMap.set(steamId, player);
  }

  let pending = Array.isArray(pendingSteamIds)
    ? pendingSteamIds.filter((steamId) => STEAM_ID_REGEX.test(steamId) && playerMap.has(steamId))
    : null;

  if (!pending) {
    pending = [];
    for (const [steamId, player] of playerMap.entries()) {
      if (Number(player.teamId) > 0) continue;
      const cached = lookupCachedTeamInfoForPlayer(numeric, steamId, now);
      if (cached) {
        if (!cached.error) continue;
        if (now - cached.fetchedAt < TEAM_INFO_ERROR_RETRY_INTERVAL_MS) continue;
      }
      pending.push(steamId);
    }
  } else {
    pending = [...new Set(pending)];
  }

  if (!allowLookup || pending.length === 0) {
    pruneTeamInfoCache(numeric, now);
    return { players, lookupsPerformed: false, pending };
  }

  let lookupsPerformed = false;
  for (const steamId of pending) {
    try {
      const reply = await sendRconCommand(serverRow, `teaminfo ${steamId}`, {
        silent: true,
        timeoutMs: TEAM_INFO_COMMAND_TIMEOUT_MS
      });
      lookupsPerformed = true;
      const info = parseTeamInfoMessage(reply, steamId);
      if (info?.hasTeam) {
        cacheTeamInfoForServer(numeric, info, Date.now());
        if (logger?.debug) {
          logger.debug('teaminfo resolved', { steamId, teamId: info.teamId || 0, hasTeam: info.hasTeam });
        }
      } else if (info) {
        const timestamp = Date.now();
        const targets = new Set();
        if (info.requestedSteamId && STEAM_ID_REGEX.test(info.requestedSteamId)) {
          targets.add(info.requestedSteamId);
        }
        if (Array.isArray(info.members)) {
          for (const member of info.members) {
            if (member?.steamId && STEAM_ID_REGEX.test(member.steamId)) {
              targets.add(member.steamId);
            }
          }
        }
        if (targets.size === 0 && STEAM_ID_REGEX.test(steamId)) {
          targets.add(steamId);
        }
        for (const target of targets) {
          cacheTeamInfoMiss(numeric, target, timestamp);
        }
        if (logger?.debug) {
          logger.debug('teaminfo reported no team', { steamId, requestedSteamId: info.requestedSteamId, memberCount: info.members?.length || 0 });
        }
      } else {
        cacheTeamInfoMiss(numeric, steamId, Date.now());
        if (logger?.debug) {
          logger.debug('teaminfo returned no data', { steamId });
        }
      }
    } catch (err) {
      lookupsPerformed = true;
      cacheTeamInfoMiss(numeric, steamId, Date.now());
      if (logger?.warn) {
        logger.warn('teaminfo command failed', { steamId, error: err?.message || err });
      }
    }
  }

  const refreshTime = Date.now();
  applyTeamInfoToPlayers(numeric, players, refreshTime);
  pruneTeamInfoCache(numeric, refreshTime);

  const remaining = [];
  for (const steamId of pending) {
    const cached = lookupCachedTeamInfoForPlayer(numeric, steamId, refreshTime);
    if (!cached || (cached.error && Number(playerMap.get(steamId)?.teamId) <= 0)) {
      remaining.push(steamId);
    }
  }

  return { players, lookupsPerformed, pending: remaining };
}

async function enrichPlayersWithPositions(
  serverId,
  serverRow,
  players,
  { logger, allowLookup = true, pendingSteamIds = null } = {}
) {
  if (!Array.isArray(players) || players.length === 0) {
    return { players, lookupsPerformed: false, pending: [] };
  }
  const numeric = Number(serverId);
  if (!Number.isFinite(numeric)) {
    return { players, lookupsPerformed: false, pending: [] };
  }

  const now = Date.now();
  prunePositionCache(numeric, now);
  applyPositionCacheToPlayers(numeric, players, now);

  const playerMap = new Map();
  for (const player of players) {
    const steamId = String(player?.steamId || '').trim();
    if (!steamId || !STEAM_ID_REGEX.test(steamId)) continue;
    if (!playerMap.has(steamId)) playerMap.set(steamId, player);
  }

  let pending = Array.isArray(pendingSteamIds)
    ? pendingSteamIds.filter((steamId) => STEAM_ID_REGEX.test(steamId) && playerMap.has(steamId))
    : null;

  if (!pending) {
    pending = [];
    for (const [steamId, player] of playerMap.entries()) {
      if (hasValidPosition(player.position)) continue;
      const cached = lookupCachedPositionForPlayer(numeric, steamId, now);
      if (cached) continue;
      pending.push(steamId);
    }
  } else {
    pending = [...new Set(pending)];
  }

  if (!allowLookup || pending.length === 0) {
    prunePositionCache(numeric, now);
    return { players, lookupsPerformed: false, pending };
  }

  let lookupsPerformed = false;
  for (const steamId of pending) {
    try {
      const reply = await sendRconCommand(serverRow, `printpos ${steamId}`, {
        silent: true,
        timeoutMs: POSITION_COMMAND_TIMEOUT_MS
      });
      lookupsPerformed = true;
      const position = parsePrintPosMessage(reply?.Message ?? reply);
      if (position) {
        cachePlayerPosition(numeric, steamId, position, Date.now());
        const player = playerMap.get(steamId);
        if (player) player.position = position;
        if (logger?.debug) logger.debug('printpos resolved', { steamId });
      } else {
        cachePlayerPositionMiss(numeric, steamId, Date.now());
        if (logger?.debug) logger.debug('printpos returned no position', { steamId });
      }
    } catch (err) {
      lookupsPerformed = true;
      cachePlayerPositionMiss(numeric, steamId, Date.now());
      if (logger?.warn) {
        logger.warn('printpos command failed', { steamId, error: err?.message || err });
      }
    }
  }

  const refreshTime = Date.now();
  applyPositionCacheToPlayers(numeric, players, refreshTime);
  prunePositionCache(numeric, refreshTime);

  const remaining = [];
  for (const steamId of pending) {
    const cached = lookupCachedPositionForPlayer(numeric, steamId, refreshTime);
    if (!cached || cached.error || !cached.position) {
      remaining.push(steamId);
    }
  }

  return { players, lookupsPerformed, pending: remaining };
}

async function maybeRefreshTeamInfoFromMonitor(serverId, players) {
  const numericId = Number(serverId);
  if (!Number.isFinite(numericId)) return players;
  if (!Array.isArray(players) || players.length === 0) {
    teamInfoMonitorState.delete(numericId);
    return players;
  }

  const state = teamInfoMonitorState.get(numericId) || { lastRun: 0, pending: [] };
  let result = await enrichPlayersWithTeamInfo(numericId, null, players, {
    allowLookup: false,
    pendingSteamIds: Array.isArray(state.pending) && state.pending.length > 0 ? state.pending : null
  });

  const now = Date.now();
  const shouldLookup = result.pending.length > 0 && now - state.lastRun >= MANUAL_REFRESH_MIN_INTERVAL_MS;

  if (shouldLookup) {
    const serverRow = await getMonitoredServerRow(numericId);
    if (serverRow) {
      const logger = createLogger(`teaminfo-monitor:${numericId}`);
      try {
        const lookupResult = await enrichPlayersWithTeamInfo(numericId, serverRow, result.players, {
          logger,
          allowLookup: true,
          pendingSteamIds: result.pending
        });
        result = lookupResult;
        state.lastRun = Date.now();
      } catch (err) {
        state.lastRun = Date.now();
        logger.warn('Failed to refresh teaminfo during monitor', err);
      }
    } else {
      state.lastRun = now;
    }
  }

  state.pending = Array.isArray(result.pending) ? result.pending : [];
  teamInfoMonitorState.set(numericId, state);
  return result.players;
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
    players = await maybeRefreshTeamInfoFromMonitor(serverId, players);
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

function shouldResetMapRecord(record, now = new Date(), resetPoint = firstThursdayResetTime(now)) {
  if (!record) return false;
  if (isCustomMapRecord(record)) return false;
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

function isWithinDir(targetPath, dir) {
  if (!targetPath) return false;
  const resolvedTarget = path.resolve(targetPath);
  const resolvedDir = path.resolve(dir);
  return resolvedTarget.startsWith(resolvedDir);
}

function mapMetadataHasRemote(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const sources = [meta.downloadUrl, meta.imageUrl, meta.rawImageUrl, meta.thumbnailUrl];
  return sources.some((value) => typeof value === 'string' && value.length > 0);
}

async function clearServerMapRecord(serverId, record = null) {
  const id = Number(serverId);
  if (!Number.isFinite(id)) return;
  let existing = record;
  if (!existing) {
    try { existing = await db.getServerMap(id); }
    catch (err) {
      console.warn('failed to load server map for clearing', err);
      return;
    }
  }
  if (!existing) return;
  await removeMapImage(existing);
  if (existing.map_key) {
    try {
      await removeCachedRustMapMetadata(existing.map_key);
    } catch (err) {
      console.warn('failed to clear cached map metadata', err);
    }
  }
  try {
    await db.deleteServerMap(id);
  } catch (err) {
    console.warn('failed to delete server map record', err);
  }
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
        if (row?.map_key) await removeCachedRustMapMetadata(row.map_key);
        const id = Number(row.server_id ?? row.serverId ?? row.id);
        if (!Number.isFinite(id)) continue;
        await db.deleteServerMap(id);
      } catch (err) {
        console.warn('map cache purge failed for server', row?.server_id ?? row?.serverId ?? row?.id, err);
      }
    }
  }
  await purgeRustMapCacheIfDue(resetPoint, now, activeImages, activeMapKeys);
}

function isCustomFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === '1') return true;
    if (normalized === '0') return false;
    if (['true', 't', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', 'f', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return false;
}

function isCustomMapRecord(record) {
  if (!record || typeof record !== 'object') return false;
  return isCustomFlag(record.custom);
}

function parseMapRecordData(record) {
  if (!record) return null;
  const raw = record.data;
  if (!raw) return null;
  try {
    if (typeof raw === 'string') return JSON.parse(raw);
    if (typeof raw === 'object') return { ...raw };
  } catch {
    return null;
  }
  return null;
}

function mapRecordToPayload(serverId, record, metadataOverride = null) {
  if (!record) return null;
  let meta = {};
  meta = parseMapRecordData(record) || meta;
  if (metadataOverride && typeof metadataOverride === 'object') {
    meta = { ...meta, ...metadataOverride };
  }
  const updatedAt = record.updated_at || record.updatedAt || record.created_at || record.createdAt || null;
  const mapKey = record.map_key || meta.mapKey || null;
  if (mapKey && !meta.mapKey) meta.mapKey = mapKey;
  const cachedAt = metadataOverride?.cachedAt || meta.cachedAt || updatedAt;
  if (cachedAt && !meta.cachedAt) meta.cachedAt = cachedAt;
  const isCustomRecord = isCustomMapRecord(record);
  const hasRemote = !isCustomRecord && mapMetadataHasRemote(meta);
  const version = encodeURIComponent(cachedAt || updatedAt || '');
  const payload = {
    ...meta,
    mapKey,
    cached: !!record.image_path,
    cachedAt: cachedAt || updatedAt || null,
    custom: isCustomRecord
  };
  const imagePath = `/servers/${serverId}/map-image?v=${version}`;
  if (record.image_path) {
    payload.imageUrl = imagePath;
    payload.localImage = true;
  } else if (hasRemote) {
    payload.imageUrl = imagePath;
    payload.remoteImage = true;
  } else {
    payload.imageUrl = null;
  }
  if (payload.custom && !record.image_path) payload.needsUpload = true;
  return payload;
}

function deriveMapKey(info = {}, metadata = null) {
  const rawSize = extractInteger(metadata?.size ?? info.size);
  const rawSeed = extractInteger(metadata?.seed ?? info.seed);
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

const SUPPORTED_IMAGE_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp'
};

function resolveImageFormat(mime, filename = '') {
  const normalizedMime = typeof mime === 'string' ? mime.trim().toLowerCase() : '';
  if (normalizedMime && SUPPORTED_IMAGE_EXTENSIONS[normalizedMime]) {
    return { mime: normalizedMime, extension: SUPPORTED_IMAGE_EXTENSIONS[normalizedMime] };
  }
  const name = typeof filename === 'string' ? filename.trim().toLowerCase() : '';
  if (name.endsWith('.png')) return { mime: 'image/png', extension: 'png' };
  if (name.endsWith('.webp')) return { mime: 'image/webp', extension: 'webp' };
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  return null;
}

function createRequestError(code, status = 400) {
  const err = new Error(code || 'error');
  err.code = code || 'error';
  err.status = status;
  return err;
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
    const format = resolveImageFormat(mime);
    if (!format) return null;
    return { buffer, ...format };
  } catch {
    return null;
  }
}

async function persistServerMapImageUpload(serverId, { buffer, extension, mapKey }) {
  if (!Number.isFinite(serverId)) throw createRequestError('invalid_id');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw createRequestError('invalid_image');
  if (buffer.length > MAX_MAP_IMAGE_BYTES) throw createRequestError('image_too_large', 413);
  const server = await db.getServer(serverId);
  if (!server) throw createRequestError('not_found', 404);
  let record = await db.getServerMap(serverId);
  const info = getCachedServerInfo(serverId) || {};
  const normalizedMapKey = typeof mapKey === 'string' && mapKey.trim() ? mapKey.trim() : null;
  const derivedKey = deriveMapKey(info) || null;
  let targetKey;
  if (isCustomMapRecord(record) && record?.map_key) {
    targetKey = record.map_key;
  } else {
    const baseKey = normalizedMapKey || derivedKey;
    targetKey = baseKey ? `${baseKey}-server-${serverId}` : `server-${serverId}-custom`;
  }
  if (record) await removeMapImage(record);
  if (record?.map_key && record.map_key !== targetKey) await removeCachedRustMapMetadata(record.map_key);
  const filePath = serverMapImageFilePath(serverId, targetKey, extension);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
  let data = {};
  if (record?.data) {
    try { data = typeof record.data === 'string' ? JSON.parse(record.data) : { ...record.data }; }
    catch { data = {}; }
  }
  if (info?.size && !data.size) data.size = info.size;
  if (info?.seed && !data.seed) data.seed = info.seed;
  if (info?.mapName && !data.mapName) data.mapName = info.mapName;
  const stored = { ...data, mapKey: targetKey, manualUpload: true };
  if (!stored.cachedAt) stored.cachedAt = new Date().toISOString();
  await db.saveServerMap(serverId, {
    map_key: targetKey,
    data: JSON.stringify(stored),
    image_path: filePath,
    custom: 1
  });
  const updatedRecord = await db.getServerMap(serverId);
  const map = mapRecordToPayload(serverId, updatedRecord, stored);
  return { map, updatedAt: new Date().toISOString() };
}

async function syncServerMapLevelUrl(serverRow, { logger: providedLogger } = {}) {
  const serverId = Number(serverRow?.id ?? serverRow?.server_id ?? serverRow?.serverId);
  if (!Number.isFinite(serverId)) return;
  const logger = providedLogger || createLogger(`map-sync:${serverId}`);
  let levelUrl;
  try {
    levelUrl = await fetchLevelUrl(serverRow, { silent: true });
  } catch (err) {
    logger.warn('Failed to query level URL during connect', err);
    return;
  }
  const normalized = typeof levelUrl === 'string' ? levelUrl.trim() : '';
  if (!isLikelyLevelUrl(normalized)) return;

  const customUrl = isCustomLevelUrl(normalized);
  let record = await db.getServerMap(serverId);
  let data = parseMapRecordData(record) || {};
  const storedLevelUrl = typeof data.levelUrl === 'string' ? data.levelUrl.trim() : '';

  if (record && storedLevelUrl && storedLevelUrl !== normalized) {
    logger.info('Level URL changed, clearing cached map state', {
      previousLevelUrl: storedLevelUrl,
      nextLevelUrl: normalized
    });
    await clearServerMapRecord(serverId, record);
    record = null;
    data = {};
  } else if (record && isCustomMapRecord(record) && !customUrl) {
    logger.info('Server switched to procedural map, clearing custom map cache');
    await clearServerMapRecord(serverId, record);
    record = null;
    data = {};
  }

  if (!customUrl && !record) {
    return;
  }

  if (!record && customUrl) {
    data = {};
  }

  const existingCustomFlag = record ? (isCustomFlag(record.custom) ? 1 : 0) : 0;
  const nextCustomFlag = customUrl ? 1 : existingCustomFlag;
  const nextData = { ...data };
  nextData.levelUrl = normalized;
  if (customUrl) nextData.customLevelUrl = true;
  else delete nextData.customLevelUrl;

  const needsInsert = !record;
  const needsUpdate =
    needsInsert
    || existingCustomFlag !== nextCustomFlag
    || storedLevelUrl !== normalized
    || (!!data.customLevelUrl) !== customUrl;

  if (!needsUpdate) return;

  if (needsInsert && customUrl && !nextData.cachedAt) {
    nextData.cachedAt = new Date().toISOString();
  }

  await db.saveServerMap(serverId, {
    map_key: record?.map_key || null,
    data: JSON.stringify(nextData),
    image_path: record?.image_path || null,
    custom: nextCustomFlag
  });
}

function respondToMapUploadError(err, res) {
  const code = err?.code || err?.message;
  if (code === 'image_too_large') return res.status(413).json({ error: 'image_too_large' });
  if (code === 'invalid_image' || code === 'invalid_id') return res.status(400).json({ error: 'invalid_image' });
  if (code === 'not_found') return res.status(404).json({ error: 'not_found' });
  console.error('map upload failed', err);
  return res.status(500).json({ error: 'map_upload_failed' });
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
  const configJson = row.config_json ?? row.configJson ?? null;
  return {
    serverId: Number.isFinite(serverId) ? serverId : null,
    guildId: row.guild_id || row.guildId || null,
    channelId: row.channel_id || row.channelId || null,
    statusMessageId: row.status_message_id || row.statusMessageId || null,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
    hasToken: Boolean(row.bot_token),
    hasCommandToken: Boolean(row.command_bot_token),
    config: parseDiscordBotConfig(configJson)
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
      for (const key of [...killFeedCache.keys()]) {
        if (!seen.has(key)) killFeedCache.delete(key);
      }
      for (const key of [...killFeedCleanupSchedule.keys()]) {
        if (!seen.has(key)) killFeedCleanupSchedule.delete(key);
      }
      for (const [serverId] of [...offlineSnapshotTimestamps.entries()]) {
        if (!seen.has(serverId)) offlineSnapshotTimestamps.delete(serverId);
      }
      for (const key of [...monitoredServerRows.keys()]) {
        if (!seen.has(key)) monitoredServerRows.delete(key);
      }
      for (const key of [...teamInfoMonitorState.keys()]) {
        if (!seen.has(key)) teamInfoMonitorState.delete(key);
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

const chatPurgeHandle = setInterval(() => {
  runGlobalChatCleanup();
}, CHAT_PURGE_INTERVAL_MS);
if (chatPurgeHandle.unref) chatPurgeHandle.unref();
await runGlobalChatCleanup();

const killFeedPurgeHandle = setInterval(() => {
  runKillFeedGlobalCleanup();
}, KILL_FEED_PURGE_INTERVAL_MS);
if (killFeedPurgeHandle.unref) killFeedPurgeHandle.unref();
await runKillFeedGlobalCleanup();

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
    const context = await loadUserContext(row.id);
    const roleForToken = context?.role || row.role;
    const token = signToken({ ...row, role: roleForToken }, JWT_SECRET);
    res.json({
      token,
      username: context?.username || row.username,
      role: roleForToken,
      roleName: context?.roleName || row.role_name || roleForToken,
      id: row.id,
      permissions: context?.permissions || normaliseRolePermissions(row.role_permissions, row.role),
      activeTeamId: context?.activeTeamId || null,
      activeTeamName: context?.activeTeamName || null,
      activeTeamHasDiscordToken: context?.activeTeamHasDiscordToken || false,
      teamDiscord: context?.teamDiscord || { hasToken: false },
      teams: context?.teams || []
    });
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
    const context = await loadUserContext(req.user.uid);
    if (!context) return res.status(404).json({ error: 'not_found' });
    res.json({
      id: context.id,
      username: context.username,
      role: context.role,
      roleName: context.roleName,
      permissions: context.permissions,
      created_at: context.created_at || null,
      activeTeamId: context.activeTeamId,
      activeTeamName: context.activeTeamName,
      activeTeamHasDiscordToken: context.activeTeamHasDiscordToken || false,
      teamDiscord: context.teamDiscord || { hasToken: false },
      teams: context.teams
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

app.get('/api/teams', auth, async (req, res) => {
  try {
    const context = await loadUserContext(req.authUser.id);
    res.json({
      activeTeamId: context?.activeTeamId ?? null,
      activeTeamName: context?.activeTeamName ?? null,
      activeTeamHasDiscordToken: context?.activeTeamHasDiscordToken ?? false,
      teamDiscord: context?.teamDiscord || { hasToken: false },
      teams: context?.teams || []
    });
  } catch (err) {
    console.error('failed to load teams', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/team/discord', auth, async (req, res) => {
  if (!hasGlobalPermission(req.authUser, 'manageUsers') && !hasGlobalPermission(req.authUser, 'manageRoles')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const teamId = req.authUser?.activeTeamId;
  if (teamId == null) return res.status(400).json({ error: 'no_active_team' });
  if (typeof db.getTeamDiscordSettings !== 'function') {
    return res.status(501).json({ error: 'not_supported' });
  }
  try {
    const info = await db.getTeamDiscordSettings(teamId);
    const hasToken = Boolean(info?.hasToken);
    res.json({
      hasToken,
      teamDiscord: { hasToken },
      activeTeamHasDiscordToken: hasToken
    });
  } catch (err) {
    console.error('failed to load team discord token', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/team/discord', auth, async (req, res) => {
  if (!hasGlobalPermission(req.authUser, 'manageUsers') && !hasGlobalPermission(req.authUser, 'manageRoles')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const teamId = req.authUser?.activeTeamId;
  if (teamId == null) return res.status(400).json({ error: 'no_active_team' });
  if (typeof db.setTeamDiscordToken !== 'function') {
    return res.status(501).json({ error: 'not_supported' });
  }
  try {
    const body = req.body || {};
    const token = sanitizeDiscordToken(body.token ?? body.discordToken ?? body.botToken);
    if (!token) return res.status(400).json({ error: 'missing_token' });
    await db.setTeamDiscordToken(teamId, token);
    let hasToken = true;
    if (typeof db.getTeamDiscordSettings === 'function') {
      try {
        const info = await db.getTeamDiscordSettings(teamId);
        hasToken = Boolean(info?.hasToken);
      } catch (err) {
        console.warn('failed to refresh team discord token state', err);
      }
    }
    const numericTeamId = Number(teamId);
    if (req.authUser?.id && typeof loadUserContext === 'function') {
      try {
        const refreshed = await loadUserContext(req.authUser.id);
        if (refreshed) req.authUser = refreshed;
      } catch (err) {
        console.warn('failed to refresh auth context after team token update', err);
        req.authUser.activeTeamHasDiscordToken = hasToken;
        req.authUser.teamDiscord = { hasToken };
        if (Array.isArray(req.authUser.teams)) {
          req.authUser.teams = req.authUser.teams.map((team) => {
            if (!team) return team;
            const id = Number(team.id);
            if (Number.isFinite(id) && Number.isFinite(numericTeamId) && id === numericTeamId) {
              return { ...team, hasDiscordToken: hasToken };
            }
            if (team.id === teamId) return { ...team, hasDiscordToken: hasToken };
            return team;
          });
        }
      }
    } else if (req.authUser) {
      req.authUser.activeTeamHasDiscordToken = hasToken;
      req.authUser.teamDiscord = { hasToken };
      if (Array.isArray(req.authUser.teams)) {
        req.authUser.teams = req.authUser.teams.map((team) => {
          if (!team) return team;
          const id = Number(team.id);
          if (Number.isFinite(id) && Number.isFinite(numericTeamId) && id === numericTeamId) {
            return { ...team, hasDiscordToken: hasToken };
          }
          if (team.id === teamId) return { ...team, hasDiscordToken: hasToken };
          return team;
        });
      }
    }
    res.json({
      hasToken,
      teamDiscord: { hasToken },
      activeTeamHasDiscordToken: hasToken
    });
  } catch (err) {
    console.error('failed to save team discord token', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/team/discord', auth, async (req, res) => {
  if (!hasGlobalPermission(req.authUser, 'manageUsers') && !hasGlobalPermission(req.authUser, 'manageRoles')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const teamId = req.authUser?.activeTeamId;
  if (teamId == null) return res.status(400).json({ error: 'no_active_team' });
  if (typeof db.clearTeamDiscordToken !== 'function') {
    return res.status(501).json({ error: 'not_supported' });
  }
  try {
    await db.clearTeamDiscordToken(teamId);
    let hasToken = false;
    if (typeof db.getTeamDiscordSettings === 'function') {
      try {
        const info = await db.getTeamDiscordSettings(teamId);
        hasToken = Boolean(info?.hasToken);
      } catch (err) {
        console.warn('failed to refresh team discord token state', err);
      }
    }
    const numericTeamId = Number(teamId);
    if (req.authUser?.id && typeof loadUserContext === 'function') {
      try {
        const refreshed = await loadUserContext(req.authUser.id);
        if (refreshed) req.authUser = refreshed;
      } catch (err) {
        console.warn('failed to refresh auth context after team token removal', err);
        req.authUser.activeTeamHasDiscordToken = hasToken;
        req.authUser.teamDiscord = { hasToken };
        if (Array.isArray(req.authUser.teams)) {
          req.authUser.teams = req.authUser.teams.map((team) => {
            if (!team) return team;
            const id = Number(team.id);
            if (Number.isFinite(id) && Number.isFinite(numericTeamId) && id === numericTeamId) {
              return { ...team, hasDiscordToken: hasToken };
            }
            if (team.id === teamId) return { ...team, hasDiscordToken: hasToken };
            return team;
          });
        }
      }
    } else if (req.authUser) {
      req.authUser.activeTeamHasDiscordToken = hasToken;
      req.authUser.teamDiscord = { hasToken };
      if (Array.isArray(req.authUser.teams)) {
        req.authUser.teams = req.authUser.teams.map((team) => {
          if (!team) return team;
          const id = Number(team.id);
          if (Number.isFinite(id) && Number.isFinite(numericTeamId) && id === numericTeamId) {
            return { ...team, hasDiscordToken: hasToken };
          }
          if (team.id === teamId) return { ...team, hasDiscordToken: hasToken };
          return team;
        });
      }
    }
    res.json({
      hasToken,
      teamDiscord: { hasToken },
      activeTeamHasDiscordToken: hasToken
    });
  } catch (err) {
    console.error('failed to clear team discord token', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/me/active-team', auth, async (req, res) => {
  const { teamId } = req.body || {};
  const numeric = Number(teamId);
  if (!Number.isFinite(numeric)) return res.status(400).json({ error: 'invalid_team' });
  try {
    let teams = req.authUser?.teams || [];
    if (!teams.some((team) => team.id === numeric)) {
      teams = await db.listUserTeams(req.authUser.id);
      if (!teams.some((team) => team.id === numeric)) {
        return res.status(404).json({ error: 'not_found' });
      }
    }
    await db.setUserActiveTeam(req.authUser.id, numeric);
    const context = await loadUserContext(req.authUser.id);
    req.authUser = context;
    res.json({
      ok: true,
      activeTeamId: context?.activeTeamId ?? numeric,
      activeTeamName: context?.activeTeamName ?? null,
      role: context?.role,
      roleName: context?.roleName,
      permissions: context?.permissions,
      activeTeamHasDiscordToken: context?.activeTeamHasDiscordToken ?? false,
      teamDiscord: context?.teamDiscord || { hasToken: false },
      teams: context?.teams || []
    });
  } catch (err) {
    console.error('failed to set active team', err);
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
    const teamId = req.authUser?.activeTeamId;
    if (teamId == null) return res.json([]);
    const rows = await db.listUsers(teamId);
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
  const teamId = req.authUser?.activeTeamId;
  if (teamId == null) return res.status(400).json({ error: 'no_active_team' });
  if (!userName) return res.status(400).json({ error: 'missing_fields' });
  if (!/^[a-z0-9_\-.]{3,32}$/i.test(userName)) return res.status(400).json({ error: 'invalid_username' });
  const roleKey = typeof role === 'string' && role.trim() ? role.trim() : 'user';
  try {
    const roleRecord = await db.getRole(roleKey);
    if (!roleRecord) return res.status(400).json({ error: 'invalid_role' });
    const existing = await findUserCaseInsensitive(userName);
    let targetUser = existing || null;
    let created = false;
    if (password && password.length > 0) {
      if (password.length < 8) return res.status(400).json({ error: 'weak_password' });
      if (existing) return res.status(409).json({ error: 'username_taken' });
      const hash = bcrypt.hashSync(password, 10);
      const id = await db.createUser({ username: userName, password_hash: hash, role: roleKey });
      targetUser = { id, username: userName, role: roleKey };
      created = true;
    } else {
      if (!existing) return res.status(404).json({ error: 'user_not_found' });
    }
    if (!targetUser) return res.status(500).json({ error: 'user_create_failed' });
    const membership = await db.getTeamMember(teamId, targetUser.id);
    if (membership) return res.status(409).json({ error: 'already_member' });
    await db.addTeamMember({ team_id: teamId, user_id: targetUser.id, role: roleKey });
    const status = created ? 201 : 200;
    res.status(status).json({ id: targetUser.id, username: targetUser.username, role: roleKey, roleName: roleRecord.name });
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
  const teamId = req.authUser?.activeTeamId;
  if (teamId == null) return res.status(400).json({ error: 'no_active_team' });
  try {
    const roleRecord = await db.getRole(roleKey);
    if (!roleRecord) return res.status(400).json({ error: 'invalid_role' });
    const membership = await db.getTeamMember(teamId, id);
    if (!membership) return res.status(404).json({ error: 'not_found' });
    await db.updateTeamMemberRole(teamId, id, roleKey);
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
  const teamId = req.authUser?.activeTeamId;
  if (teamId == null) return res.status(400).json({ error: 'no_active_team' });
  try {
    const membership = await db.getTeamMember(teamId, id);
    if (!membership) return res.status(404).json({ error: 'not_found' });
    if (membership.role === 'admin') {
      const members = await db.listUsers(teamId);
      const adminCount = members.filter((member) => member.role === 'admin').length;
      if (adminCount <= 1) return res.status(400).json({ error: 'last_admin' });
    }
    const removed = await db.removeTeamMember(teamId, id);
    res.json({ deleted: removed });
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
    const teamId = req.authUser?.activeTeamId;
    if (teamId == null) return res.json([]);
    const rows = await db.listServers(teamId);
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

app.get('/api/servers/:id/f7-reports', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'view');
  if (id == null) return;
  const rawScope = typeof req.query?.scope === 'string' ? req.query.scope.toLowerCase() : 'new';
  const scope = rawScope === 'all' ? 'all' : 'new';
  const limitParam = Number(req.query?.limit);
  const defaultLimit = scope === 'all' ? 100 : 25;
  const maxLimit = scope === 'all' ? 200 : 50;
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(Math.max(Math.floor(limitParam), 1), maxLimit)
    : defaultLimit;
  const options = { limit };
  if (scope === 'new') {
    options.since = new Date(Date.now() - F7_REPORT_NEW_WINDOW_MS).toISOString();
  } else if (typeof req.query?.since === 'string' && req.query.since.trim()) {
    const sinceDate = new Date(req.query.since);
    if (!Number.isNaN(sinceDate.valueOf())) options.since = sinceDate.toISOString();
  }
  try {
    if (typeof db?.listF7Reports !== 'function') {
      return res.json({ scope, reports: [] });
    }
    const rows = await db.listF7Reports(id, options);
    const reports = Array.isArray(rows) ? rows.map((row) => projectF7Report(row, { serverId: id })) : [];
    res.json({ scope, reports });
  } catch (err) {
    console.error('failed to list f7 reports', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/servers/:id/f7-reports/:reportId', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'view');
  if (id == null) return;
  const reportId = Number(req.params?.reportId);
  if (!Number.isFinite(reportId)) {
    res.status(400).json({ error: 'invalid_report' });
    return;
  }
  if (typeof db?.getF7ReportById !== 'function') {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  try {
    const row = await db.getF7ReportById(id, reportId);
    if (!row) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const report = projectF7Report(row, { serverId: id });
    let history = [];
    let targetSummary = null;
    if (row?.target_steamid && typeof db?.listF7ReportsForTarget === 'function') {
      try {
        const related = await db.listF7ReportsForTarget(id, row.target_steamid, {
          limit: F7_RECENT_HISTORY_LIMIT,
          excludeId: row.id
        });
        if (Array.isArray(related)) {
          history = related.map((entry) => projectF7Report(entry, { serverId: id }));
        }
      } catch (err) {
        console.warn('failed to load related f7 reports', err);
      }
    }
    if (row?.target_steamid && typeof db?.getF7TargetSummary === 'function') {
      try {
        targetSummary = await db.getF7TargetSummary(id, row.target_steamid);
      } catch (err) {
        console.warn('failed to load f7 target summary', err);
      }
    }
    res.json({ report, recentForTarget: history, targetSummary });
  } catch (err) {
    console.error('failed to load f7 report', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/servers/:id/map-state', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'liveMap');
  if (id == null) return;
  try {
    const record = await db.getServerMap(id);
    if (!record) {
      return res.json({
        map: null,
        custom: false,
        hasImage: false,
        locked: false,
        levelUrl: null,
        updatedAt: null
      });
    }
    const map = mapRecordToPayload(id, record);
    const meta = parseMapRecordData(record) || {};
    const levelUrl = typeof map?.levelUrl === 'string'
      ? map.levelUrl
      : (typeof meta.levelUrl === 'string' ? meta.levelUrl : null);
    const hasImage = !!map?.imageUrl;
    const custom = !!map?.custom;
    const locked = custom && !hasImage;
    res.json({
      map,
      custom,
      hasImage,
      locked,
      levelUrl,
      updatedAt: map?.cachedAt || record.updated_at || record.updatedAt || record.created_at || record.createdAt || null
    });
  } catch (err) {
    console.error('map state lookup failed', err);
    res.status(500).json({ error: 'map_state_error' });
  }
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
    const commandTokenInput = sanitizeDiscordToken(body.commandBotToken ?? body.command_bot_token);
    if (!guildId || !channelId) return res.status(400).json({ error: 'missing_fields' });
    let botToken = tokenInput;
    if (!botToken) {
      const existingToken = existing?.bot_token;
      if (existingToken) botToken = existingToken;
      else return res.status(400).json({ error: 'missing_bot_token' });
    }
    let commandBotToken = commandTokenInput;
    if (!commandBotToken) {
      const existingCommandToken = existing?.command_bot_token ?? existing?.commandBotToken;
      if (existingCommandToken) commandBotToken = existingCommandToken;
      else commandBotToken = botToken;
    }
    let statusMessageId = existing?.status_message_id ?? existing?.statusMessageId ?? null;
    if (existing?.channel_id && existing.channel_id !== channelId) {
      statusMessageId = null;
    }
    const configJson = existing?.config_json ?? existing?.configJson ?? null;
    await db.saveServerDiscordIntegration(id, {
      bot_token: botToken,
      command_bot_token: commandBotToken,
      guild_id: guildId,
      channel_id: channelId,
      status_message_id: statusMessageId,
      config_json: configJson
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
    let teamId = req.authUser?.activeTeamId || null;
    if (teamId == null && typeof db.createTeam === 'function') {
      const teamName = req.authUser?.username ? `${req.authUser.username}'s Team` : 'My Team';
      teamId = await db.createTeam({ name: teamName, owner_user_id: req.authUser.id });
      await db.addTeamMember({ team_id: teamId, user_id: req.authUser.id, role: req.authUser.role || 'admin' });
      if (typeof db.setUserActiveTeam === 'function') {
        await db.setUserActiveTeam(req.authUser.id, teamId);
      }
      if (req.authUser) {
        req.authUser.activeTeamId = teamId;
        req.authUser.activeTeamName = teamName;
        if (Array.isArray(req.authUser.teams)) {
          if (!req.authUser.teams.some((team) => team?.id === teamId)) {
            req.authUser.teams.push({ id: teamId, name: teamName, ownerId: req.authUser.id, role: req.authUser.role || 'admin', roleName: req.authUser.roleName || req.authUser.role || 'admin' });
          }
        } else {
          req.authUser.teams = [{ id: teamId, name: teamName, ownerId: req.authUser.id, role: req.authUser.role || 'admin', roleName: req.authUser.roleName || req.authUser.role || 'admin' }];
        }
      }
    }
    if (teamId == null) return res.status(400).json({ error: 'no_active_team' });
    const id = await db.createServer({ name, host, port: parseInt(port, 10), password, tls: tls ? 1 : 0, team_id: teamId });
    if (req.authUser) {
      try {
        const refreshed = await loadUserContext(req.authUser.id);
        if (refreshed) req.authUser = refreshed;
      } catch (err) {
        console.warn('Failed to refresh user context after server creation', err);
      }
    }
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
  const payload = req.body || {};
  const { team_id: _teamId, teamId: _teamIdAlt, ...changes } = payload;
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
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
  });
  const logger = createLogger(`live-map:${id}`);
  logger.info('Live map request received');
  try {
    const server = await db.getServer(id);
    if (!server) return res.status(404).json({ error: 'not_found' });
    logger.debug('Loaded server details', { name: server?.name, host: server?.host, port: server?.port });
    ensureRconBinding(server);
    const skipImagery = (() => {
      const raw = req.query?.skipImagery;
      const truthy = (value) => {
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          if (!normalized) return false;
          return ['1', 'true', 'yes', 'on'].includes(normalized);
        }
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'boolean') return value;
        return false;
      };
      if (Array.isArray(raw)) {
        return raw.some((entry) => truthy(entry));
      }
      if (raw == null) return false;
      return truthy(raw);
    })();
    let playerPayload = '';
    try {
      const reply = await sendRconCommand(server, 'playerlist', { silent: true });
      playerPayload = reply?.Message || '';
    } catch (err) {
      logger.error('playerlist command failed', err);
      return res.status(502).json({ error: 'playerlist_failed' });
    }
    let players = parsePlayerListMessage(playerPayload);
    const playerCount = Array.isArray(players) ? players.length : 0;
    const playerArray = Array.isArray(players) ? players : [];
    const playerListHasTeamData = Boolean(playerArray._hasPlayerListTeamField)
      || playerArray.some((p) => Number(p?.teamId) > 0);
    const playerListHasPositionData = playerArray.some((p) => hasValidPosition(p?.position));
    const teamDataSource = playerListHasTeamData || playerCount === 0 ? 'playerlist' : 'teaminfo';
    const positionDataSource = playerListHasPositionData || playerCount === 0 ? 'playerlist' : 'printpos';

    const teamPrep = await enrichPlayersWithTeamInfo(id, server, players, {
      logger,
      allowLookup: false
    });
    players = teamPrep.players;
    const positionPrep = await enrichPlayersWithPositions(id, server, players, {
      logger,
      allowLookup: false
    });
    players = positionPrep.players;

    const needsManualTeamLookup = teamPrep.pending.length > 0;
    const needsManualPositionLookup = positionPrep.pending.length > 0;
    const requiresManualCooldown = (!playerListHasTeamData && needsManualTeamLookup)
      || (!playerListHasPositionData && needsManualPositionLookup);

    if (!(needsManualTeamLookup || needsManualPositionLookup)) {
      clearManualRefreshState(id);
    }

    if (requiresManualCooldown) {
      const cooldown = manualRefreshCooldown(id);
      if (cooldown.coolingDown) {
        const retryAfterSeconds = Math.max(1, Math.ceil(cooldown.retryAfterMs / 1000));
        res.set('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          error: 'manual_refresh_cooldown',
          retryAfter: retryAfterSeconds,
          message: `Manual refresh cooldown active. Try again in ${retryAfterSeconds} seconds.`
        });
      }
    }

    const teamResult = needsManualTeamLookup
      ? await enrichPlayersWithTeamInfo(id, server, players, {
        logger,
        allowLookup: true,
        pendingSteamIds: teamPrep.pending
      })
      : teamPrep;

    const positionResult = needsManualPositionLookup
      ? await enrichPlayersWithPositions(id, server, teamResult.players, {
        logger,
        allowLookup: true,
        pendingSteamIds: positionPrep.pending
      })
      : positionPrep;

    players = positionResult.players;

    const manualLookupsPerformed = Boolean(teamResult.lookupsPerformed || positionResult.lookupsPerformed);
    if (manualLookupsPerformed) {
      markManualRefresh(id);
    } else if (!(needsManualTeamLookup || needsManualPositionLookup)) {
      clearManualRefreshState(id);
    }

    players = await enrichLivePlayers(players);
    await syncServerPlayerDirectory(id, players);
    logger.debug('Processed live players', { count: players.length });
    let info = getCachedServerInfo(id);
    if (!info) {
      try {
        info = await fetchServerInfo(server, { silent: true });
        cacheServerInfo(id, info);
        logger.debug('Fetched serverinfo via RCON', { size: info?.size, seed: info?.seed, mapName: info?.mapName });
      } catch (err) {
        info = { raw: null, mapName: null, size: null, seed: null };
        logger.warn('Failed to fetch serverinfo via RCON', err);
      }
    }
    let levelUrl = typeof info?.levelUrl === 'string' ? info.levelUrl.trim() : '';
    if (!isLikelyLevelUrl(levelUrl)) levelUrl = '';
    if (!levelUrl) {
      try {
        const parsedLevelUrl = await fetchLevelUrl(server, { silent: true });
        if (parsedLevelUrl) {
          levelUrl = parsedLevelUrl;
          if (info) {
            info.levelUrl = levelUrl;
            cacheServerInfo(id, info);
          }
        }
      } catch (err) {
        logger.warn('Failed to fetch level URL via RCON', err);
      }
    }
    if (levelUrl && !isFacepunchLevelUrl(levelUrl)) {
      logger.warn('Server reported non-Facepunch level URL, treating as custom map', { levelUrl });
    }
    let hasCustomLevelUrl = isCustomLevelUrl(levelUrl);
    // The frontend only opts-in to skip imagery when it has already paused
    // RustMaps polling for a custom map. Trust that signal so we don't keep
    // hitting the external API and trigger its rate limits.
    const skipImageryFetch = skipImagery;
    const derivedMapKey = deriveMapKey(info) || null;
    let infoMapKey = hasCustomLevelUrl ? null : derivedMapKey;

    if (!info?.size || !info?.seed) {
      try {
        const { size, seed } = await fetchWorldSettings(server, { silent: true });
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
    let mapRecord = await db.getServerMap(id);
    if (isCustomMapRecord(mapRecord) && levelUrl && !isCustomLevelUrl(levelUrl)) {
      logger.info('Server reports procedural level URL, clearing custom map cache');
      await removeMapImage(mapRecord);
      if (mapRecord.map_key) await removeCachedRustMapMetadata(mapRecord.map_key);
      await db.deleteServerMap(id);
      mapRecord = null;
    }
    if (isCustomMapRecord(mapRecord) && !hasCustomLevelUrl && !levelUrl) {
      hasCustomLevelUrl = true;
      infoMapKey = null;
    }
    if (mapRecord && shouldResetMapRecord(mapRecord, now, resetPoint)) {
      logger.info('Existing map record expired, removing cached image');
      const wasCustom = isCustomMapRecord(mapRecord);
      await removeMapImage(mapRecord);
      if (!wasCustom && mapRecord.map_key) await removeCachedRustMapMetadata(mapRecord.map_key);
      await db.deleteServerMap(id);
      mapRecord = null;
    }
    if (mapRecord && !isCustomMapRecord(mapRecord) && hasCustomLevelUrl) {
      logger.info('Server reports custom level URL, clearing procedural map cache');
      await removeMapImage(mapRecord);
      if (mapRecord.map_key) await removeCachedRustMapMetadata(mapRecord.map_key);
      await db.deleteServerMap(id);
      mapRecord = null;
    }
    if (mapRecord && !isCustomMapRecord(mapRecord) && infoMapKey && mapRecord.map_key && mapRecord.map_key !== infoMapKey) {
      logger.info('Map key changed, clearing stale cache', { previousKey: mapRecord.map_key, nextKey: infoMapKey });
      await removeMapImage(mapRecord);
      if (mapRecord.map_key) await removeCachedRustMapMetadata(mapRecord.map_key);
      await db.deleteServerMap(id);
      mapRecord = null;
    }

    let mapMetadata = null;
    if (mapRecord?.map_key) {
      const cachedMeta = await loadCachedRustMapMetadata(mapRecord.map_key);
      if (cachedMeta && isRustMapMetadataStale(cachedMeta, now, resetPoint)) {
        logger.info('Cached map metadata expired, clearing stored record', { mapKey: mapRecord.map_key });
        await removeMapImage(mapRecord);
        await removeCachedRustMapMetadata(mapRecord.map_key);
        await db.deleteServerMap(id);
        mapRecord = null;
      } else if (cachedMeta) {
        mapMetadata = cachedMeta;
      }
    }

    if (!mapRecord && infoMapKey) {
      const cachedMeta = await loadCachedRustMapMetadata(infoMapKey);
      if (cachedMeta && !isRustMapMetadataStale(cachedMeta, now, resetPoint)) {
        const cacheKey = cachedMeta.mapKey || infoMapKey;
        const cachedImage = await findCachedRustMapImage(cacheKey);
        logger.info('Rehydrating map record from global cache', { mapKey: cacheKey, hasImage: !!cachedImage?.path });
        await db.saveServerMap(id, {
          map_key: cacheKey,
          data: JSON.stringify({ ...cachedMeta }),
          image_path: cachedImage?.path || null,
          custom: isCustomFlag(cachedMeta?.isCustomMap) ? 1 : 0
        });
        mapRecord = await db.getServerMap(id);
        mapMetadata = cachedMeta;
      } else if (cachedMeta) {
        await removeCachedRustMapMetadata(infoMapKey);
      }
    }

    if (isCustomMapRecord(mapRecord) && !levelUrl) {
      const storedMeta = mapMetadata || parseMapRecordData(mapRecord) || {};
      const storedLevelUrl = typeof storedMeta.levelUrl === 'string' ? storedMeta.levelUrl.trim() : '';
      if (isCustomLevelUrl(storedLevelUrl)) {
        levelUrl = storedLevelUrl;
        hasCustomLevelUrl = true;
        infoMapKey = null;
        if (info) {
          const cachedLevelUrl = typeof info.levelUrl === 'string' ? info.levelUrl.trim() : '';
          if (cachedLevelUrl !== storedLevelUrl) {
            info.levelUrl = storedLevelUrl;
            cacheServerInfo(id, info);
          }
        }
      }
    }

    let map = mapRecordToPayload(id, mapRecord, mapMetadata);
    if (!map && hasCustomLevelUrl) {
      const baseKey = derivedMapKey;
      const customKey = baseKey ? `${baseKey}-server-${id}` : `server-${id}-custom`;
      const storedMeta = { mapKey: customKey };
      if (Number.isFinite(info?.size)) storedMeta.size = info.size;
      if (Number.isFinite(info?.seed)) storedMeta.seed = info.seed;
      if (info?.mapName) storedMeta.mapName = info.mapName;
      if (levelUrl) storedMeta.levelUrl = levelUrl;
      storedMeta.cachedAt = new Date().toISOString();
      try {
        await db.saveServerMap(id, {
          map_key: customKey,
          data: JSON.stringify(storedMeta),
          image_path: null,
          custom: 1
        });
        mapRecord = await db.getServerMap(id);
        const persisted = mapRecordToPayload(id, mapRecord, storedMeta);
        if (persisted) map = persisted;
      } catch (err) {
        logger.warn('Failed to persist custom map placeholder', err);
      }
      if (!map) {
        map = {
          mapKey: customKey,
          custom: true,
          cached: false,
          cachedAt: storedMeta.cachedAt,
          imageUrl: null,
          needsUpload: true,
          levelUrl
        };
        if (Number.isFinite(info?.size)) map.size = info.size;
        if (Number.isFinite(info?.seed)) map.seed = info.seed;
        if (info?.mapName) map.mapName = info.mapName;
      }
    }
    if (map && !map.mapKey && infoMapKey) map.mapKey = infoMapKey;
    if (!map) {
      if (skipImageryFetch) {
        logger.info('Skipping RustMaps imagery fetch due to client lock');
        if (mapRecord) {
          map = mapRecordToPayload(id, mapRecord, mapMetadata);
        }
      } else if (!hasCustomLevelUrl && info?.size && info?.seed) {
        const userKey = await db.getUserSetting(req.user.uid, 'rustmaps_api_key');
        const apiKey = userKey || DEFAULT_RUSTMAPS_API_KEY || '';
        try {
          logger.info('Requesting RustMaps metadata', { size: info.size, seed: info.seed, apiKeyProvided: !!apiKey });
          let metadata = await fetchRustMapMetadata(info.size, info.seed, apiKey, { logger });
          const metadataIsCustom = isCustomFlag(metadata?.isCustomMap);
          const finalKey = deriveMapKey(info, metadata) || infoMapKey;
          const storedMeta = { ...metadata, mapKey: finalKey };
          storedMeta.isCustomMap = metadataIsCustom;
          if (Number.isFinite(metadata?.size)) info.size = metadata.size;
          if (Number.isFinite(metadata?.seed)) info.seed = metadata.seed;
          if (metadata?.mapName) info.mapName = metadata.mapName;
          cacheServerInfo(id, info);
          if (!storedMeta.size && Number.isFinite(info.size)) storedMeta.size = info.size;
          if (!storedMeta.seed && Number.isFinite(info.seed)) storedMeta.seed = info.seed;
          storedMeta.cachedAt = new Date().toISOString();
          await removeMapImage(mapRecord);
          if (mapRecord?.map_key && mapRecord.map_key !== finalKey) {
            await removeCachedRustMapMetadata(mapRecord.map_key);
          }
          let imagePath = null;
          if (!metadataIsCustom) {
            const cacheKey = finalKey || infoMapKey || `server-${id}`;
            const cached = await findCachedRustMapImage(cacheKey);
            if (cached?.path) {
              logger.info('Using cached global map image', { cacheKey });
              imagePath = cached.path;
            } else {
              try {
                const download = await downloadRustMapImage(metadata, apiKey);
                if (download?.buffer) {
                  const filePath = resolveRustMapImageCachePath(cacheKey, download.extension);
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
            custom: metadataIsCustom,
            cached: cachedImage
          });
          const mapKeyToPersist = finalKey || infoMapKey;
          await db.saveServerMap(id, {
            map_key: mapKeyToPersist,
            data: JSON.stringify(storedMeta),
            image_path: imagePath,
            custom: metadataIsCustom ? 1 : 0
          });
          await saveCachedRustMapMetadata(mapKeyToPersist, storedMeta);
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
        map = mapRecordToPayload(id, mapRecord, mapMetadata);
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
    if (!mapPayload) {
      if (!info?.size || !info?.seed) {
        status = 'awaiting_server_info';
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

    let worldEntities;
    try {
      worldEntities = await resolveWorldEntities(id, server, { mapMetadata: mapPayload, logger });
    } catch (entityErr) {
      logger.warn('World entity resolution failed', entityErr);
      worldEntities = {
        fetchedAt: new Date().toISOString(),
        monuments: normaliseMonumentsFromMeta(mapPayload?.monuments),
        entities: []
      };
    }

    // backward-compatible shape + richer fields
    const responsePayload = {
      players,
      map: mapPayload,
      info,
      status,                    // <-- new
      fetchedAt: new Date().toISOString(),
      playerDataSources: {
        positions: positionDataSource,
        teams: teamDataSource
      },
      entities: worldEntities
    };

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
    const metadataIsCustom = isCustomFlag(metadata?.isCustomMap);
    const storedMeta = { ...metadata, mapKey: finalKey };
    storedMeta.isCustomMap = metadataIsCustom;
    if (!storedMeta.size && Number.isFinite(enrichedInfo.size)) storedMeta.size = enrichedInfo.size;
    if (!storedMeta.seed && Number.isFinite(enrichedInfo.seed)) storedMeta.seed = enrichedInfo.seed;
    storedMeta.cachedAt = new Date().toISOString();

    let record = await db.getServerMap(id);
    if (record) await removeMapImage(record);
    if (record?.map_key && record.map_key !== finalKey) await removeCachedRustMapMetadata(record.map_key);

    let imagePath = null;
    if (!metadataIsCustom) {
      const cacheKey = finalKey;
      const cached = await findCachedRustMapImage(cacheKey);
      if (cached?.path) {
        logger.info('Using cached global map image for manual request', { cacheKey });
        imagePath = cached.path;
      } else {
        try {
          const download = await downloadRustMapImage(metadata, apiKey);
          if (download?.buffer) {
            const filePath = resolveRustMapImageCachePath(cacheKey, download.extension);
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
      custom: metadataIsCustom ? 1 : 0
    });
    await saveCachedRustMapMetadata(finalKey, storedMeta);
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
  try {
    const payload = await persistServerMapImageUpload(id, {
      buffer: decoded.buffer,
      extension: decoded.extension,
      mapKey
    });
    res.json(payload);
  } catch (err) {
    respondToMapUploadError(err, res);
  }
});

app.post(
  '/api/servers/:id/map-image/upload',
  auth,
  (req, res, next) => {
    const id = ensureServerCapability(req, res, 'manage');
    if (id == null) return;
    req.serverId = id;
    next();
  },
  mapImageUploadMiddleware,
  async (req, res) => {
    const id = req.serverId ?? ensureServerCapability(req, res, 'manage');
    if (id == null) return;
    const file = req.file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      return res.status(400).json({ error: 'missing_image' });
    }
    const format = resolveImageFormat(file.mimetype, file.originalname);
    if (!format) {
      return res.status(415).json({ error: 'unsupported_image_type' });
    }
    try {
      const payload = await persistServerMapImageUpload(id, {
        buffer: file.buffer,
        extension: format.extension,
        mapKey: req.body?.mapKey
      });
      res.json(payload);
    } catch (err) {
      respondToMapUploadError(err, res);
    }
  }
);

app.get('/api/servers/:id/map-image', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'liveMap');
  if (id == null) return;
  const logger = createLogger(`map-image:${id}`);
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
  });
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
      const cachedMeta = await loadCachedRustMapMetadata(resolvedMapKey);
      if (cachedMeta && isRustMapMetadataStale(cachedMeta, now, resetPoint)) {
        await removeCachedRustMapMetadata(resolvedMapKey);
      } else if (cachedMeta) {
        meta = { ...cachedMeta, ...(meta || {}) };
      }
    }

    const metaIsCustom = isCustomFlag(meta?.isCustomMap) || isCustomFlag(record?.custom);
    const info = getCachedServerInfo(id) || {};

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
            custom: isCustomFlag(record?.custom) ? 1 : 0
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

    if (!metaIsCustom) {
      const candidateKeys = new Set();
      if (record?.map_key) candidateKeys.add(record.map_key);
      if (meta?.mapKey) candidateKeys.add(meta.mapKey);
      const derivedKey = deriveMapKey(info, meta) || deriveMapKey(info) || null;
      if (derivedKey) candidateKeys.add(derivedKey);

      for (const key of candidateKeys) {
        if (!key) continue;
        const cachedImage = await findCachedRustMapImage(key);
        if (!cachedImage?.path) continue;
        try {
          await fs.stat(cachedImage.path);
        } catch (err) {
          if (err?.code === 'ENOENT') continue;
          throw err;
        }

        const storedMeta = { ...(meta || {}), mapKey: key };
        storedMeta.isCustomMap = metaIsCustom;
        storedMeta.cachedAt = new Date().toISOString();
        try {
          await db.saveServerMap(id, {
            map_key: key,
            data: JSON.stringify(storedMeta),
            image_path: cachedImage.path,
            custom: metaIsCustom ? 1 : 0
          });
          await saveCachedRustMapMetadata(key, storedMeta);
        } catch (err) {
          logger.warn('Failed to persist cache metadata during rehydrate', err);
        }

        logger.info('Serving map image from global cache', { mapKey: key, path: cachedImage.path });
        res.sendFile(path.resolve(cachedImage.path));
        return;
      }
    }

    if (metaIsCustom) {
      logger.info('Map record flagged as custom, skipping remote imagery fetch');
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
      const finalKey = record?.map_key || meta.mapKey || deriveMapKey(info, meta) || deriveMapKey(info) || `server-${id}`;
      const filePath = resolveRustMapImageCachePath(finalKey, download.extension);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, download.buffer);
      const metaIsCustom = isCustomFlag(meta?.isCustomMap);
      const storedMeta = { ...meta, mapKey: finalKey };
      storedMeta.isCustomMap = metaIsCustom;
      if (!storedMeta.size && Number.isFinite(info.size)) storedMeta.size = info.size;
      if (!storedMeta.seed && Number.isFinite(info.seed)) storedMeta.seed = info.seed;
      if (!storedMeta.cachedAt) storedMeta.cachedAt = new Date().toISOString();
      await db.saveServerMap(id, {
        map_key: finalKey,
        data: JSON.stringify(storedMeta),
        image_path: filePath,
        custom: metaIsCustom ? 1 : 0
      });
      await saveCachedRustMapMetadata(finalKey, storedMeta);
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
  const limit = parsePlayerQueryLimit(req.query.limit);
  const offset = limit == null ? 0 : parsePlayerQueryOffset(req.query.offset);
  const search = parsePlayerQuerySearch(req.query.q ?? req.query.query ?? req.query.search);
  try {
    const listPromise = db.listPlayers({ limit, offset, search });
    const canCount = typeof db.countPlayers === 'function';
    const filteredCountPromise = canCount ? db.countPlayers({ search }) : Promise.resolve(null);
    const totalCountPromise = canCount && search ? db.countPlayers({ search: '' }) : Promise.resolve(null);
    const [rows, filteredRaw, totalRaw] = await Promise.all([listPromise, filteredCountPromise, totalCountPromise]);
    const toCount = (value, fallback = 0) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) return fallback;
      return Math.floor(numeric);
    };
    const filteredCount = toCount(filteredRaw, Array.isArray(rows) ? rows.length : 0);
    const totalCount = totalRaw != null ? toCount(totalRaw, filteredCount) : filteredCount;
    const effectiveLimit = limit == null ? null : Math.floor(limit);
    const page = effectiveLimit && effectiveLimit > 0 ? Math.floor(offset / effectiveLimit) : 0;
    const hasMore = effectiveLimit && effectiveLimit > 0
      ? offset + (Array.isArray(rows) ? rows.length : 0) < filteredCount
      : false;
    res.json({
      items: rows,
      total: totalCount,
      filtered: filteredCount,
      limit: effectiveLimit,
      offset,
      page,
      hasMore,
      query: search
    });
  } catch (err) {
    console.error('listPlayers failed', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/servers/:id/players', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'players');
  if (id == null) return;
  const limit = parsePlayerQueryLimit(req.query.limit);
  const offset = limit == null ? 0 : parsePlayerQueryOffset(req.query.offset);
  const search = parsePlayerQuerySearch(req.query.q ?? req.query.query ?? req.query.search);
  try {
    const listPromise = db.listServerPlayers(id, { limit, offset, search });
    const canCount = typeof db.countServerPlayers === 'function';
    const filteredCountPromise = canCount ? db.countServerPlayers(id, { search }) : Promise.resolve(null);
    const totalCountPromise = canCount && search ? db.countServerPlayers(id, { search: '' }) : Promise.resolve(null);
    const [rows, filteredRaw, totalRaw] = await Promise.all([listPromise, filteredCountPromise, totalCountPromise]);
    const toCount = (value, fallback = 0) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) return fallback;
      return Math.floor(numeric);
    };
    const filteredCount = toCount(filteredRaw, Array.isArray(rows) ? rows.length : 0);
    const totalCount = totalRaw != null ? toCount(totalRaw, filteredCount) : filteredCount;
    const payload = (Array.isArray(rows) ? rows : [])
      .map((row) => normaliseServerPlayer(row))
      .filter(Boolean);
    const effectiveLimit = limit == null ? null : Math.floor(limit);
    const page = effectiveLimit && effectiveLimit > 0 ? Math.floor(offset / effectiveLimit) : 0;
    const hasMore = effectiveLimit && effectiveLimit > 0
      ? offset + payload.length < filteredCount
      : false;
    res.json({
      items: payload,
      total: totalCount,
      filtered: filteredCount,
      limit: effectiveLimit,
      offset,
      page,
      hasMore,
      query: search
    });
  } catch (err) {
    console.error('listServerPlayers failed', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/servers/:id/chat', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'console');
  if (id == null) return;
  const limitValue = Number(req.query.limit);
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(Math.floor(limitValue), 500) : 200;
  const rawChannel = typeof req.query.channel === 'string' ? req.query.channel.trim().toLowerCase() : 'all';
  const channel = rawChannel === 'global' || rawChannel === 'team' ? rawChannel : null;
  try {
    const rows = typeof db.listChatMessages === 'function'
      ? await db.listChatMessages(id, { limit, channel })
      : [];
    const messages = (rows || []).map((row) => ({
      id: row?.id ?? null,
      serverId: row?.server_id ?? id,
      channel: row?.channel || (channel || 'global'),
      steamId: row?.steamid || null,
      username: row?.username || null,
      message: row?.message || '',
      createdAt: row?.created_at || null,
      raw: row?.raw || null,
      color: row?.color || null
    })).filter((entry) => entry.message);
    res.json({ messages });
  } catch (err) {
    console.error('chat history fetch failed', err);
    res.status(500).json({ error: 'chat_history_failed' });
  }
});

app.get('/api/servers/:id/kills', auth, async (req, res) => {
  const id = ensureServerCapability(req, res, 'console');
  if (id == null) return;
  const limitValue = Number(req.query.limit);
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(Math.floor(limitValue), 500) : 200;
  const sinceParam = req.query.since;
  const sinceTs = parseTimestamp(sinceParam);
  const defaultSince = Date.now() - KILL_FEED_RETENTION_MS;
  const sinceIso = Number.isFinite(sinceTs) ? new Date(sinceTs).toISOString() : new Date(defaultSince).toISOString();
  try {
    let rows = [];
    if (typeof db.listKillEvents === 'function') {
      rows = await db.listKillEvents(id, { limit, since: sinceIso });
    }
    let events = Array.isArray(rows) ? rows.map((row) => normaliseKillEventRow(row)).filter(Boolean) : [];
    if (!events.length) {
      const cached = killFeedCache.get(id);
      if (cached && cached.length) {
        events = cached.slice(0, limit);
      }
    } else {
      killFeedCache.set(id, events.slice(0, KILL_FEED_MAX_CACHE));
    }
    res.json({ events });
  } catch (err) {
    console.error('kill feed history fetch failed', err);
    res.status(500).json({ error: 'kill_feed_failed' });
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

function ensureManageCapabilityForNotes(req, res, rawServerId) {
  const serverId = toServerId(rawServerId);
  if (serverId == null) {
    res.status(400).json({ error: 'invalid_server_id' });
    return null;
  }
  if (!canAccessServer(req.authUser, serverId, 'manage')) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return serverId;
}

app.get('/api/players/:steamid/notes', auth, async (req, res) => {
  if (typeof db.listPlayerNotes !== 'function') {
    return res.status(400).json({ error: 'unsupported' });
  }
  const steamid = String(req.params.steamid || '').trim();
  if (!steamid) return res.status(400).json({ error: 'invalid_steamid' });
  const serverIdRaw = req.query?.server_id ?? req.query?.serverId;
  const serverId = ensureManageCapabilityForNotes(req, res, serverIdRaw);
  if (serverId == null) return;
  const limitRaw = Number(req.query.limit);
  const offsetRaw = Number(req.query.offset);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 500) : 100;
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
  try {
    const rows = await db.listPlayerNotes(steamid, { limit, offset, serverId });
    const notes = (rows || []).map((row) => projectPlayerNote(row)).filter(Boolean);
    res.json({ steamid, notes });
  } catch (err) {
    console.error('listPlayerNotes failed', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/players/:steamid/notes', auth, async (req, res) => {
  if (typeof db.addPlayerNote !== 'function') {
    return res.status(400).json({ error: 'unsupported' });
  }
  const steamid = String(req.params.steamid || '').trim();
  if (!steamid) return res.status(400).json({ error: 'invalid_steamid' });
  const serverIdRaw = req.body?.server_id ?? req.body?.serverId;
  const serverId = ensureManageCapabilityForNotes(req, res, serverIdRaw);
  if (serverId == null) return;
  const noteRaw = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (!noteRaw) return res.status(400).json({ error: 'invalid_note' });
  if (noteRaw.length > MAX_PLAYER_NOTE_LENGTH) return res.status(400).json({ error: 'note_too_long' });
  try {
    const row = await db.addPlayerNote({ steamid, server_id: serverId, note: noteRaw });
    if (!row) return res.status(500).json({ error: 'db_error' });
    const projected = projectPlayerNote(row);
    res.status(201).json({ note: projected });
  } catch (err) {
    console.error('addPlayerNote failed', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/players/:steamid/notes/:noteId', auth, async (req, res) => {
  if (typeof db.deletePlayerNote !== 'function') {
    return res.status(400).json({ error: 'unsupported' });
  }
  const steamid = String(req.params.steamid || '').trim();
  if (!steamid) return res.status(400).json({ error: 'invalid_steamid' });
  const serverIdRaw = req.query?.server_id ?? req.query?.serverId;
  const serverId = ensureManageCapabilityForNotes(req, res, serverIdRaw);
  if (serverId == null) return;
  const noteId = Number(req.params.noteId);
  if (!Number.isFinite(noteId) || noteId <= 0) return res.status(400).json({ error: 'invalid_note_id' });
  try {
    const deleted = await db.deletePlayerNote({ steamid, id: Math.trunc(noteId), server_id: serverId });
    if (!deleted) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('deletePlayerNote failed', err);
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
