const API_BASE_URL = 'https://api.rustmaps.com/v4';
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

function createError(code, status, message, extra = {}) {
  const err = new Error(code || message || 'rustmaps_error');
  err.code = code || 'rustmaps_error';
  if (status) err.status = status;
  if (message && !code) err.message = message;
  Object.assign(err, extra);
  return err;
}

async function parseJsonSafe(res) {
  const type = res.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) return null;
  try { return await res.json(); }
  catch { return null; }
}

function extractMapId(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  if (payload.mapId) return payload.mapId;
  if (payload.id) return payload.id;
  const data = payload.data;
  if (typeof data === 'string') return data;
  if (data?.mapId) return data.mapId;
  if (data?.id) return data.id;
  if (Array.isArray(payload) && payload.length > 0) return extractMapId(payload[0]);
  return null;
}

function normalizeMapData(data) {
  if (!data) return null;
  return {
    id: data.id || null,
    type: data.type || null,
    seed: typeof data.seed === 'number' ? data.seed : Number(data.seed) || null,
    size: typeof data.size === 'number' ? data.size : Number(data.size) || null,
    saveVersion: typeof data.saveVersion === 'number' ? data.saveVersion : Number(data.saveVersion) || null,
    mapName: data.mapName || data.map || null,
    imageUrl: data.imageUrl || data.rawImageUrl || data.downloadUrl || null,
    rawImageUrl: data.rawImageUrl || null,
    thumbnailUrl: data.thumbnailUrl || data.imageIconUrl || null,
    url: data.url || null,
    downloadUrl: data.downloadUrl || null,
    canDownload: typeof data.canDownload === 'boolean' ? data.canDownload : null,
    isCustomMap: !!data.isCustomMap,
    totalMonuments: typeof data.totalMonuments === 'number' ? data.totalMonuments : Number(data.totalMonuments) || null
  };
}

async function rustmapsRequest(path, { method = 'GET', apiKey, body, signal, headers = {} } = {}) {
  if (!apiKey) {
    throw createError('rustmaps_api_key_missing');
  }
  const requestHeaders = { ...headers, 'x-api-key': apiKey };
  if (body && !requestHeaders['content-type']) requestHeaders['content-type'] = 'application/json';
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, { method, headers: requestHeaders, body, signal });
  const payload = await parseJsonSafe(res);
  return { res, payload };
}

async function getMapBySizeSeed(size, seed, { apiKey, staging = false, signal } = {}) {
  const path = `/maps/${encodeURIComponent(size)}/${encodeURIComponent(seed)}?staging=${staging ? 'true' : 'false'}`;
  const { res, payload } = await rustmapsRequest(path, { apiKey, signal });
  const status = res.status;
  if (status === 401 || status === 403) throw createError('rustmaps_unauthorized', status);
  if (status === 429) throw createError('rustmaps_rate_limited', status);
  if (status === 404) return { status, mapId: extractMapId(payload) };
  if (status === 409) return { status, mapId: extractMapId(payload) };
  if (!res.ok) throw createError('rustmaps_error', status);
  const metadata = normalizeMapData(payload?.data || payload);
  if (!metadata) throw createError('rustmaps_error', status);
  return { status: 200, metadata, mapId: extractMapId(payload) };
}

async function getMapById(mapId, { apiKey, signal } = {}) {
  if (!mapId) return { status: 404, mapId: null };
  const { res, payload } = await rustmapsRequest(`/maps/${encodeURIComponent(mapId)}`, { apiKey, signal });
  const status = res.status;
  if (status === 401 || status === 403) throw createError('rustmaps_unauthorized', status);
  if (status === 429) throw createError('rustmaps_rate_limited', status);
  if (status === 404) return { status, mapId: extractMapId(payload) };
  if (status === 409) return { status, mapId: extractMapId(payload) };
  if (!res.ok) throw createError('rustmaps_error', status);
  const metadata = normalizeMapData(payload?.data || payload);
  if (!metadata) throw createError('rustmaps_error', status);
  return { status: 200, metadata, mapId: extractMapId(payload) };
}

async function requestMapGeneration(size, seed, { apiKey, staging = false, signal } = {}) {
  const body = JSON.stringify({ size: Number(size), seed: Number(seed), staging: !!staging });
  const { res, payload } = await rustmapsRequest('/maps', { method: 'POST', apiKey, body, signal });
  const status = res.status;
  if (status === 401 || status === 403) throw createError('rustmaps_unauthorized', status);
  if (status === 429) throw createError('rustmaps_rate_limited', status);
  if (status === 400) throw createError('rustmaps_invalid_request', status);
  if (status === 200 || status === 201) {
    const metadata = normalizeMapData(payload?.data || payload);
    return { status, metadata, mapId: extractMapId(payload) };
  }
  if (status === 409) {
    return { status, metadata: null, mapId: extractMapId(payload) };
  }
  throw createError('rustmaps_error', status);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchRustMapMetadata(size, seed, apiKey, {
  staging = false,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  generationTimeoutMs = DEFAULT_GENERATION_TIMEOUT_MS,
  signal
} = {}) {
  if (!size || !seed) return null;
  const pollInterval = Math.max(1_000, Number(pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS);
  const timeoutMs = Math.max(pollInterval, Number(generationTimeoutMs) || DEFAULT_GENERATION_TIMEOUT_MS);
  const start = Date.now();

  let lookup = await getMapBySizeSeed(size, seed, { apiKey, staging, signal });
  if (lookup.status === 200 && lookup.metadata) return lookup.metadata;
  let mapId = lookup.mapId || null;

  if (lookup.status === 404) {
    const generation = await requestMapGeneration(size, seed, { apiKey, staging, signal });
    if ((generation.status === 200 || generation.status === 201) && generation.metadata) {
      return generation.metadata;
    }
    if (generation.mapId) mapId = generation.mapId;
  }

  const deadline = start + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw createError('rustmaps_aborted');
    await delay(pollInterval);
    let result;
    if (mapId) {
      result = await getMapById(mapId, { apiKey, signal });
      if (result.status === 404 && !staging) {
        // Map may not have an id yet, fallback to seed/size lookup
        result = await getMapBySizeSeed(size, seed, { apiKey, staging, signal });
      }
    } else {
      result = await getMapBySizeSeed(size, seed, { apiKey, staging, signal });
    }
    if (result.status === 200 && result.metadata) return result.metadata;
    if (result.status === 404) continue;
    if (result.status === 409) {
      if (!mapId && result.mapId) mapId = result.mapId;
      continue;
    }
  }
  throw createError('rustmaps_generation_timeout');
}

export async function downloadRustMapImage(meta, apiKey, { signal } = {}) {
  if (!meta) return null;
  const downloadUrl = meta.downloadUrl || meta.rawImageUrl || meta.imageUrl;
  if (!downloadUrl) return null;
  const headers = apiKey ? { 'x-api-key': apiKey } : undefined;
  const res = await fetch(downloadUrl, { headers, signal });
  if (res.status === 401 || res.status === 403) throw createError('rustmaps_unauthorized', res.status);
  if (!res.ok) {
    const err = createError('rustmaps_image_error', res.status);
    throw err;
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const type = res.headers.get('content-type') || '';
  let extension = 'jpg';
  if (type.includes('png')) extension = 'png';
  else if (type.includes('webp')) extension = 'webp';
  else if (type.includes('jpeg')) extension = 'jpg';
  return { buffer, extension, mime: type || 'image/jpeg' };
}
