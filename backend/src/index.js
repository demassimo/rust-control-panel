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
import {
  connectRcon,
  sendRconCommand,
  closeRcon as terminateRcon,
  subscribeToRcon,
  startAutoMonitor,
  rconEventBus
} from './rcon.js';
import { fetchRustMapMetadata, downloadRustMapImage } from './rustmaps.js';


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

let monitorController = null;
let monitorRefreshPromise = null;

const PLAYER_CONNECTION_DEDUPE_MS = 5 * 60 * 1000;
const recentPlayerConnections = new Map();
const ANSI_COLOR_REGEX = /\u001b\[[0-9;]*m/g;

const steamProfileCache = new Map();
let monitoring = false;
let monitorTimer = null;

function recordStatus(id, data) {
  const key = Number(id);
  const payload = { id: key, ...data };
  statusMap.set(key, payload);
  io.to(`srv:${key}`).emit('status', payload);
  io.emit('status-map', { [key]: payload });
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
    sleepers: null
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

function parseServerInfoMessage(message) {
  const result = { raw: message, mapName: null, size: null, seed: null };
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

  const output = { ...fields, ...result };
  if (!output.mapName && typeof output.Map === 'string' && output.Map.trim()) output.mapName = output.Map.trim();
  if (!output.mapName && typeof output.map === 'string' && output.map.trim()) output.mapName = output.map.trim();
  if (output.size == null) {
    const mapSize = extractInteger(output.Map ?? output.map ?? null);
    if (mapSize != null) output.size = mapSize;
  }

  return output;
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
  return {
    server_id: Number.isFinite(serverId) ? serverId : null,
    display_name: row.display_name || row.displayName || base.persona || base.steamid || '',
    first_seen: toIso(row.first_seen || row.firstSeen),
    last_seen: toIso(row.last_seen || row.lastSeen),
    last_ip: ip || null,
    last_port: Number.isFinite(portNum) ? portNum : null,
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

function shouldRefreshProfile(profile, now = Date.now()) {
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
  const minutes = toNumber(profile.rust_playtime_minutes);
  return {
    persona: profile.persona || null,
    avatar: profile.avatar || null,
    country: profile.country || null,
    profileUrl: profile.profileurl || null,
    vacBanned: !!(Number(profile.vac_banned) || profile.vac_banned === true),
    gameBans: Number(profile.game_bans) || 0,
    daysSinceLastBan: toNumber(profile.last_ban_days),
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
    if (cached) {
      profileMap.set(steamid, cached);
      continue;
    }
    const existing = profileMap.get(steamid);
    if (!existing || shouldRefreshProfile(existing, now) || shouldRefreshPlaytime(existing, now)) {
      toFetch.push(steamid);
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
        const payload = {
          steamid: steamId,
          persona: profile.persona || displayName || null,
          avatar: profile.avatar || null,
          country: profile.country || null,
          profileurl: profile.profileUrl || null,
          vac_banned: profile.vacBanned ? 1 : 0,
          game_bans: toNumber(profile.gameBans),
          last_ban_days: toNumber(profile.daysSinceLastBan),
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
    const snapshot = {
      server_id: id,
      player_count: details.players.online,
      max_players: Number.isFinite(details.players.max) ? details.players.max : null,
      queued: Number.isFinite(details.queued) ? details.queued : null,
      sleepers: Number.isFinite(details.sleepers) ? details.sleepers : null
    };
    db.recordServerPlayerCount(snapshot).catch((err) => {
      console.warn('Failed to record player count snapshot', err);
    });
  }
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
  try {
    const rows = await db.listServers();
    const sanitized = rows.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const { password: _pw, ...rest } = row;
      return rest;
    });
    res.json(sanitized);
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
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
    refreshMonitoredServers().catch((err) => console.error('monitor refresh (create) failed', err));
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
      refreshMonitoredServers().catch((err) => console.error('monitor refresh (update) failed', err));
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
    refreshMonitoredServers().catch((err) => console.error('monitor refresh (delete) failed', err));
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
    let players = parsePlayerListMessage(playerPayload);
    players = await enrichLivePlayers(players);
    await syncServerPlayerDirectory(id, players);
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
          if (code === 'rustmaps_api_key_missing' || code === 'rustmaps_unauthorized' || code === 'rustmaps_invalid_parameters') {
            return res.status(400).json({ error: code });
          }
          if (code === 'rustmaps_generation_timeout') {
            return res.status(504).json({ error: code });
          }
          if (code === 'rustmaps_generation_pending') {
            return res.status(202).json({ error: code });
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

app.get('/api/servers/:id/players', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
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
      banMap.set(String(b.SteamId), {
        vac_banned: b.VACBanned ? 1 : 0,
        game_bans: Number(b.NumberOfGameBans) || 0,
        last_ban_days: Number.isFinite(Number(b.DaysSinceLastBan)) ? Number(b.DaysSinceLastBan) : null
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
      last_ban_days: Number.isFinite(Number(ban.last_ban_days)) ? Number(ban.last_ban_days) : null,
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
