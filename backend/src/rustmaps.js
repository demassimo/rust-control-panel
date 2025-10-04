import fs from 'fs/promises';
import path from 'path';

const API_BASE_URL = 'https://api.rustmaps.com/v4';
const DEFAULT_STAGING = false;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAP_CACHE_TZ_OFFSET_MINUTES = 120; // UTC+2
const MAP_CACHE_RESET_HOUR = 20;
const MAP_CACHE_RESET_MINUTE = 0;
const KNOWN_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

let rustMapsGlobalCacheDir = path.resolve(process.cwd(), 'data/maps/global');
let rustMapsMetadataCacheDir = path.resolve(process.cwd(), 'data/maps/metadata');
let lastGlobalMapCacheReset = null;

function createError(code, message = code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function parseDateLike(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return new Date(ts);
}

function sanitizeCacheKeySegment(value) {
  return (
    (String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'map')
      .slice(0, 80)
  );
}

export function configureRustMapsCache({
  globalCacheDir,
  metadataCacheDir
} = {}) {
  if (globalCacheDir) {
    rustMapsGlobalCacheDir = path.resolve(globalCacheDir);
  }
  if (metadataCacheDir) {
    rustMapsMetadataCacheDir = path.resolve(metadataCacheDir);
  }
  if (!rustMapsGlobalCacheDir) {
    rustMapsGlobalCacheDir = path.resolve(process.cwd(), 'data/maps/global');
  }
  if (!rustMapsMetadataCacheDir) {
    rustMapsMetadataCacheDir = path.resolve(process.cwd(), 'data/maps/metadata');
  }
}

export function getRustMapsCachePaths() {
  return {
    globalCacheDir: rustMapsGlobalCacheDir,
    metadataCacheDir: rustMapsMetadataCacheDir
  };
}

export async function ensureRustMapsCacheDirs() {
  await fs.mkdir(rustMapsGlobalCacheDir, { recursive: true });
  await fs.mkdir(rustMapsMetadataCacheDir, { recursive: true });
}

export function resolveRustMapImageCachePath(mapKey, extension = 'png') {
  const safeKey = sanitizeCacheKeySegment(mapKey || 'map');
  return path.join(rustMapsGlobalCacheDir, `${safeKey}.${extension}`);
}

export function resolveRustMapMetadataCachePath(mapKey) {
  const safeKey = sanitizeCacheKeySegment(mapKey || 'map');
  return path.join(rustMapsMetadataCacheDir, `${safeKey}.json`);
}

function ensureApiKey(apiKey) {
  if (!apiKey) throw createError('rustmaps_api_key_missing');
}

function toInt(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'bigint') return Number(value);
  const text = String(value).trim();
  if (!text) return null;
  const normalised = text.replace(/[_\s,]/g, '');
  if (!normalised) return null;
  const num = Number(normalised);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

async function readJsonBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildHeaders(apiKey, extra = {}) {
  const headers = { 'x-api-key': apiKey, ...extra };
  return headers;
}

async function rustMapsFetch(pathOrUrl, { method = 'GET', apiKey, body, signal, headers: extraHeaders } = {}) {
  ensureApiKey(apiKey);
  const isAbsolute = /^https?:/i.test(pathOrUrl);
  const url = isAbsolute ? pathOrUrl : `${API_BASE_URL}${pathOrUrl}`;
  const headers = buildHeaders(apiKey, extraHeaders);
  let payload = body;
  if (payload && typeof payload === 'object' && !(payload instanceof ArrayBuffer) && !(payload instanceof URLSearchParams) && !(payload instanceof FormData) && !Buffer.isBuffer(payload)) {
    headers['content-type'] = headers['content-type'] || 'application/json';
    payload = JSON.stringify(payload);
  }
  const res = await fetch(url, { method, headers, body: payload, signal });
  return res;
}

export async function loadCachedRustMapMetadata(mapKey) {
  if (!mapKey) return null;
  const filePath = resolveRustMapMetadataCachePath(mapKey);
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

export async function saveCachedRustMapMetadata(mapKey, metadata) {
  if (!mapKey || !metadata || typeof metadata !== 'object') return;
  const cachedAt = parseDateLike(metadata.cachedAt) || new Date();
  const payload = { ...metadata, mapKey, cachedAt: cachedAt.toISOString() };
  const filePath = resolveRustMapMetadataCachePath(mapKey);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to persist cached map metadata', err);
  }
}

export async function removeCachedRustMapMetadata(mapKey) {
  if (!mapKey) return;
  const filePath = resolveRustMapMetadataCachePath(mapKey);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err?.code !== 'ENOENT') console.warn('Failed to remove cached map metadata', err);
  }
}

export async function clearRustMapMetadataCache(activeMapKeys = new Set()) {
  let entries;
  try {
    entries = await fs.readdir(rustMapsMetadataCacheDir, { withFileTypes: true });
  } catch (err) {
    if (err?.code === 'ENOENT') return;
    console.warn('global map metadata read failed', err);
    return;
  }
  const keep = new Set();
  for (const key of activeMapKeys || []) {
    keep.add(sanitizeCacheKeySegment(key));
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!name.endsWith('.json')) continue;
    const base = name.slice(0, -5);
    if (keep.has(base)) continue;
    const target = path.join(rustMapsMetadataCacheDir, name);
    try {
      await fs.unlink(target);
    } catch (err) {
      if (err?.code !== 'ENOENT') console.warn('Failed to remove cached map metadata file', err);
    }
  }
}

export function firstThursdayResetTime(now = new Date()) {
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

export function isRustMapMetadataStale(meta, now = new Date(), resetPoint = firstThursdayResetTime(now)) {
  if (!meta) return false;
  const cachedAt = parseDateLike(meta.cachedAt);
  if (!cachedAt) return false;
  return now >= resetPoint && cachedAt < resetPoint;
}

export async function findCachedRustMapImage(mapKey) {
  if (!mapKey) return null;
  for (const ext of KNOWN_IMAGE_EXTENSIONS) {
    const filePath = resolveRustMapImageCachePath(mapKey, ext);
    try {
      await fs.access(filePath);
      return { path: filePath, extension: ext };
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function clearRustMapImageCache(activeImages = new Set()) {
  let entries;
  try {
    entries = await fs.readdir(rustMapsGlobalCacheDir, { withFileTypes: true });
  } catch (err) {
    if (err?.code === 'ENOENT') return;
    console.warn('global map cache read failed', err);
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const target = path.join(rustMapsGlobalCacheDir, entry.name);
    if (activeImages.has(target)) continue;
    try {
      await fs.unlink(target);
    } catch (err) {
      if (err?.code !== 'ENOENT') console.warn('Failed to remove cached global map image', err);
    }
  }
}

export async function purgeRustMapCacheIfDue(
  resetPoint,
  now = new Date(),
  activeImages = new Set(),
  activeMapKeys = new Set()
) {
  if (!resetPoint) return;
  if (now < resetPoint) return;
  if (lastGlobalMapCacheReset && lastGlobalMapCacheReset >= resetPoint) return;
  await clearRustMapImageCache(activeImages);
  await clearRustMapMetadataCache(activeMapKeys);
  lastGlobalMapCacheReset = now;
}

function normalizeMapData(data = {}) {
  if (!data || typeof data !== 'object') return null;
  return {
    id: data.id || data.mapId || null,
    mapId: data.id || data.mapId || null,
    type: data.type || null,
    seed: toInt(data.seed),
    size: toInt(data.size),
    saveVersion: toInt(data.saveVersion),
    mapName: data.mapName || data.map || data.displayName || null,
    imageUrl: data.imageUrl || null,
    rawImageUrl: data.rawImageUrl || null,
    imageIconUrl: data.imageIconUrl || null,
    thumbnailUrl: data.thumbnailUrl || null,
    url: data.url || null,
    isCustomMap: !!data.isCustomMap,
    canDownload: !!data.canDownload,
    downloadUrl: data.downloadUrl || null,
    totalMonuments: toInt(data.totalMonuments),
    monuments: Array.isArray(data.monuments) ? data.monuments : null,
    landPercentageOfMap: toInt(data.landPercentageOfMap),
    biomePercentages: data.biomePercentages || null,
    islands: toInt(data.islands),
    mountains: toInt(data.mountains),
    iceLakes: toInt(data.iceLakes),
    rivers: toInt(data.rivers),
    lakes: toInt(data.lakes),
    canyons: toInt(data.canyons),
    oases: toInt(data.oases),
    buildableRocks: toInt(data.buildableRocks)
  };
}

async function fetchMapBySizeSeed(size, seed, { apiKey, staging = DEFAULT_STAGING, signal } = {}) {
  const url = `/maps/${encodeURIComponent(size)}/${encodeURIComponent(seed)}?staging=${staging ? 'true' : 'false'}`;
  const res = await rustMapsFetch(url, { apiKey, signal });
  const body = await readJsonBody(res);
  if (res.status === 200) {
    return { status: 'ready', data: normalizeMapData(body?.data) };
  }
  if (res.status === 404) {
    return { status: 'not_found', data: null };
  }
  if (res.status === 409) {
    const mapId = body?.data?.id || body?.data?.mapId || null;
    return { status: 'generating', data: null, mapId };
  }
  if (res.status === 401 || res.status === 403) throw createError('rustmaps_unauthorized');
  throw createError('rustmaps_error');
}

async function fetchMapById(mapId, { apiKey, signal } = {}) {
  if (!mapId) return { status: 'not_found', data: null };
  const res = await rustMapsFetch(`/maps/${encodeURIComponent(mapId)}`, { apiKey, signal });
  const body = await readJsonBody(res);
  if (res.status === 200) {
    return { status: 'ready', data: normalizeMapData(body?.data) };
  }
  if (res.status === 404) return { status: 'not_found', data: null };
  if (res.status === 409) {
    const nextId = body?.data?.id || body?.data?.mapId || mapId;
    return { status: 'generating', data: null, mapId: nextId };
  }
  if (res.status === 401 || res.status === 403) throw createError('rustmaps_unauthorized');
  throw createError('rustmaps_error');
}

async function requestMapGeneration(size, seed, { apiKey, staging = DEFAULT_STAGING, signal } = {}) {
  const res = await rustMapsFetch('/maps', {
    method: 'POST',
    apiKey,
    signal,
    body: { size, seed, staging: !!staging }
  });
  const body = await readJsonBody(res);
  if (res.status === 200) {
    return { status: 'exists', mapId: null };
  }
  if (res.status === 201) {
    const mapId = body?.data?.mapId || body?.data?.id || null;
    return { status: 'queued', mapId };
  }
  if (res.status === 409) {
    const mapId = body?.data?.id || body?.data?.mapId || null;
    return { status: 'pending', mapId };
  }
  if (res.status === 401 || res.status === 403) throw createError('rustmaps_unauthorized');
  throw createError('rustmaps_error');
}

function hasImageCandidate(data) {
  if (!data) return false;
  return !!(data.downloadUrl || data.imageUrl || data.rawImageUrl || data.thumbnailUrl);
}

function delay(ms, { signal } = {}) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer = null;
    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      reject(err);
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    if (timer.unref) timer.unref();
  });
}

export async function fetchRustMapMetadata(size, seed, apiKey, {
  staging = DEFAULT_STAGING,
  waitForGeneration = true,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
  logger = console
} = {}) {
  const numericSize = toInt(size);
  const numericSeed = toInt(seed);
  if (!Number.isFinite(numericSize) || !Number.isFinite(numericSeed)) {
    throw createError('rustmaps_invalid_parameters');
  }
  ensureApiKey(apiKey);
  const deadline = Date.now() + Math.max(timeoutMs, 1000);
  let generationRequested = false;
  let mapId = null;

  while (true) {
    const existing = await fetchMapBySizeSeed(numericSize, numericSeed, { apiKey, staging, signal });
    if (existing.status === 'ready' && hasImageCandidate(existing.data)) {
      return existing.data;
    }
    if (!waitForGeneration) {
      if (existing.status === 'not_found') throw createError('rustmaps_not_found');
      if (existing.status === 'ready') return existing.data;
      throw createError('rustmaps_generation_pending');
    }
    if (existing.status === 'generating' && existing.mapId) {
      mapId = existing.mapId;
    } else if (existing.status === 'not_found' && !generationRequested) {
      const generation = await requestMapGeneration(numericSize, numericSeed, { apiKey, staging, signal });
      generationRequested = true;
      if (generation.mapId) mapId = generation.mapId;
      if (generation.status === 'exists') {
        // Map exists but may not have downloadable assets yet. Loop will poll again.
      }
    }

    if (Date.now() > deadline) {
      throw createError('rustmaps_generation_timeout');
    }

    if (mapId) {
      try {
        const byId = await fetchMapById(mapId, { apiKey, signal });
        if (byId.status === 'ready' && hasImageCandidate(byId.data)) {
          return byId.data;
        }
        if (byId.status === 'not_found') {
          mapId = null;
        } else if (byId.status === 'generating' && byId.mapId) {
          mapId = byId.mapId;
        }
      } catch (err) {
        if (err?.code === 'rustmaps_unauthorized') throw err;
        if (logger && typeof logger.warn === 'function') {
          logger.warn('RustMaps poll by id failed', err);
        }
      }
    }

    if (Date.now() > deadline) {
      throw createError('rustmaps_generation_timeout');
    }

    await delay(pollIntervalMs, { signal });
  }
}

export async function downloadRustMapImage(meta, apiKey, { signal } = {}) {
  if (!meta || typeof meta !== 'object') return null;
  const urls = [meta.downloadUrl, meta.imageUrl, meta.rawImageUrl, meta.thumbnailUrl].filter((value, index, arr) => typeof value === 'string' && value && arr.indexOf(value) === index);
  if (urls.length === 0) return null;
  let lastError = null;
  for (const url of urls) {
    try {
      const res = await rustMapsFetch(url, { apiKey, signal });
      if (!res.ok) {
        lastError = new Error(`Request failed with status ${res.status}`);
        lastError.code = 'rustmaps_image_error';
        continue;
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const type = res.headers.get('content-type') || '';
      let extension = 'jpg';
      if (type.includes('png')) extension = 'png';
      else if (type.includes('webp')) extension = 'webp';
      else if (type.includes('jpeg')) extension = 'jpg';
      return { buffer, extension, mime: type || 'image/jpeg', url };
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      lastError = err;
    }
  }
  if (lastError) {
    const error = createError('rustmaps_image_error');
    error.cause = lastError;
    throw error;
  }
  return null;
}

export default {
  fetchRustMapMetadata,
  downloadRustMapImage
};
