const FACEPUNCH_LEVEL_HOST_PATTERN = /^(?:blob:)?https?:\/\/files\.facepunch\.com/i;
const LEVEL_URL_PATTERN = /^(?:blob:)?https?:\/\/\S+/i;
const LEVEL_URL_INLINE_PATTERN = /(?:blob:)?https?:\/\/\S+/i;
const ANSI_ESCAPE_SEQUENCE_PATTERN = /\u001b\[[0-?]*[ -\/]*[@-~]/g;
const CHAT_PREFIX_PATTERN = /^(?:\[(?:chat|CHAT)\]|chat)\s*[:>\-]?\s*/i;
const CHAT_SCOPE_PATTERN = /^(?:\[(team|global)\]|\((team|global)\))\s*/i;
const CHAT_STEAMID_PATTERN = /(\d{16,})/;

export function stripAnsiSequences(value) {
  if (typeof value !== 'string' || !value) return value;
  return value.replace(ANSI_ESCAPE_SEQUENCE_PATTERN, '');
}

export function stripRconTimestampPrefix(value) {
  if (typeof value !== 'string' || !value) return value;
  let result = value;
  let attempts = 0;
  const MAX_ATTEMPTS = 4;
  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    let modified = false;
    const bracketMatch = result.match(/^\s*\[[^\]]*\]\s*/);
    if (bracketMatch) {
      const inner = bracketMatch[0].replace(/^\s*\[|\]\s*$/g, '');
      if (/\d{1,4}[-/:]\d{1,2}[-/:]\d{1,4}/.test(inner) || /\d{1,2}:\d{2}/.test(inner)) {
        result = result.slice(bracketMatch[0].length);
        modified = true;
      }
    }
    if (!modified) {
      const trailingMatch = result.match(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?]\s*/i);
      if (trailingMatch) {
        result = result.slice(trailingMatch[0].length);
        modified = true;
      }
    }
    if (!modified) break;
  }
  return result;
}

export function normaliseRconLine(line) {
  if (typeof line !== 'string') return '';
  const withoutAnsi = stripAnsiSequences(line);
  const withoutTimestamp = stripRconTimestampPrefix(withoutAnsi);
  return withoutTimestamp.replace(/^\s*>+\s*/, '');
}

function normaliseChatScope(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if (text.startsWith('team')) return 'team';
  if (text.startsWith('global')) return 'global';
  return null;
}

function normaliseChatChannel(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value === 1 ? 'team' : 'global';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (lower === '1' || lower === 'team') return 'team';
    if (lower === '0' || lower === 'global') return 'global';
    return normaliseChatScope(trimmed);
  }
  return null;
}

function sanitiseSteamId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!/^[0-9]{16,}$/.test(text)) return null;
  return text;
}

function normaliseChatColor(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  const hexMatch = text.match(/^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    return `#${hexMatch[1].toLowerCase()}`;
  }

  const compact = text.replace(/\s+/g, '');
  const rgbMatch = compact.match(/^rgba?\((\d{1,3}),(\d{1,3}),(\d{1,3})(?:,(0|1|0?\.\d+))?\)$/i);
  if (rgbMatch) {
    const [r, g, b] = rgbMatch.slice(1, 4).map((component) => {
      const parsed = Number(component);
      return Number.isFinite(parsed) ? parsed : null;
    });
    if ([r, g, b].some((component) => component == null || component < 0 || component > 255)) {
      return null;
    }
    const alphaRaw = rgbMatch[4];
    if (typeof alphaRaw === 'string') {
      const alpha = Number(alphaRaw);
      if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  }

  return null;
}

function normaliseTimestamp(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const ms = numeric > 1e12 ? numeric : numeric * 1000;
    const fromNumber = new Date(ms);
    if (!Number.isNaN(fromNumber.getTime())) return fromNumber.toISOString();
  }
  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function trimOrNull(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

export function parseChatMessage(message, payload = {}) {
  const payloadMessage = typeof payload?.Message === 'string' ? payload.Message : (typeof payload?.message === 'string' ? payload.message : null);
  const baseText = trimOrNull(stripAnsiSequences(message ?? payloadMessage ?? ''));
  const raw = baseText || null;

  const fromPayloadName = trimOrNull(
    payload?.Username
    ?? payload?.User
    ?? payload?.Name
    ?? payload?.username
    ?? payload?.user
    ?? payload?.name
  );
  const fromPayloadSteam = sanitiseSteamId(
    payload?.UserId
    ?? payload?.UserID
    ?? payload?.SteamId
    ?? payload?.steamid
    ?? payload?.userid
    ?? payload?.playerId
  );
  const fromPayloadScope = normaliseChatChannel(
    payload?.Channel
    ?? payload?.channel
    ?? payload?.Scope
    ?? payload?.scope
  );
  const color = normaliseChatColor(payload?.Color || payload?.color);

  const timestampCandidates = [
    payload?.createdAt,
    payload?.created_at,
    payload?.timestamp,
    payload?.Timestamp,
    payload?.Time,
    payload?.time,
    payload?.Date,
    payload?.date
  ];
  let timestamp = null;
  for (const candidate of timestampCandidates) {
    const normalised = normaliseTimestamp(candidate);
    if (normalised) {
      timestamp = normalised;
      break;
    }
  }

  if (!raw && !fromPayloadName && !fromPayloadSteam) {
    return null;
  }

  let working = stripRconTimestampPrefix(raw || '').trim();
  if (!working && typeof payloadMessage === 'string') {
    working = stripRconTimestampPrefix(stripAnsiSequences(payloadMessage)).trim();
  }

  if (working) {
    const firstBrace = working.indexOf('{');
    const lastBrace = working.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = working.slice(firstBrace, lastBrace + 1);
      try {
        const parsedJson = JSON.parse(candidate);
        if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
          if (!timestamp) {
            const jsonTimestampSources = [
              parsedJson.createdAt,
              parsedJson.created_at,
              parsedJson.timestamp,
              parsedJson.Timestamp,
              parsedJson.Time,
              parsedJson.time,
              parsedJson.Date,
              parsedJson.date
            ];
            for (const candidateTs of jsonTimestampSources) {
              const normalisedTs = normaliseTimestamp(candidateTs);
              if (normalisedTs) {
                timestamp = normalisedTs;
                break;
              }
            }
          }
          const messageText = trimOrNull(
            parsedJson.Message
            ?? parsedJson.message
            ?? parsedJson.Text
            ?? parsedJson.text
            ?? parsedJson.Body
            ?? parsedJson.body
          );
          if (messageText) {
            const username = trimOrNull(
              parsedJson.Username
              ?? parsedJson.User
              ?? parsedJson.Name
              ?? parsedJson.username
              ?? parsedJson.user
              ?? parsedJson.name
              ?? fromPayloadName
            );
            const steamId = sanitiseSteamId(
              parsedJson.UserId
              ?? parsedJson.UserID
              ?? parsedJson.userId
              ?? parsedJson.userid
              ?? parsedJson.playerId
              ?? parsedJson.PlayerId
              ?? parsedJson.SteamId
              ?? parsedJson.steamid
              ?? fromPayloadSteam
            );
            const scope = normaliseChatChannel(
              parsedJson.Channel
              ?? parsedJson.channel
              ?? parsedJson.Scope
              ?? parsedJson.scope
              ?? parsedJson.Type
              ?? parsedJson.type
              ?? fromPayloadScope
            ) || 'global';
            const resolvedColor = normaliseChatColor(
              parsedJson.Color
              ?? parsedJson.color
              ?? parsedJson.Colour
              ?? parsedJson.colour
              ?? color
            );
            return {
              raw: raw || messageText,
              message: messageText,
              username: username || null,
              steamId: steamId || null,
              channel: scope,
              color: resolvedColor || null,
              timestamp: timestamp || null
            };
          }
        }
      } catch {
        // not JSON, fall through to string parsing
      }
    }
  }

  if (!working) {
    working = '';
  }

  if (CHAT_PREFIX_PATTERN.test(working)) {
    working = working.replace(CHAT_PREFIX_PATTERN, '').trim();
  }

  let scope = fromPayloadScope;
  const scopeMatch = working.match(CHAT_SCOPE_PATTERN);
  if (scopeMatch) {
    scope = scope || normaliseChatChannel(scopeMatch[1] || scopeMatch[2]);
    working = working.slice(scopeMatch[0].length).trim();
  }

  let namePart = working;
  let bodyPart = '';
  const colonIndex = working.indexOf(':');
  if (colonIndex >= 0) {
    namePart = working.slice(0, colonIndex).trim();
    bodyPart = working.slice(colonIndex + 1).trim();
  }

  if (!scope) {
    const inlineScope = namePart.match(/\[(team|global)\]/i) || namePart.match(/\((team|global)\)/i);
    if (inlineScope) {
      scope = normaliseChatChannel(inlineScope[1]);
      namePart = namePart.replace(inlineScope[0], '').trim();
    }
  }

  let steamId = null;
  const steamMatch = namePart.match(CHAT_STEAMID_PATTERN);
  if (steamMatch) {
    steamId = sanitiseSteamId(steamMatch[1]);
    namePart = namePart.replace(steamMatch[0], '').trim();
  }
  namePart = namePart.replace(/[\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();

  const username = trimOrNull(namePart) || fromPayloadName;
  let text = trimOrNull(bodyPart);
  if (!text) {
    const fallback = working && working !== namePart ? working : null;
    text = trimOrNull(fallback) || trimOrNull(payloadMessage);
  }

  const messageText = text;
  if (!messageText) return null;

  return {
    raw: raw || messageText,
    message: messageText,
    username: username || null,
    steamId: steamId || fromPayloadSteam || null,
    channel: scope || 'global',
    color: color || null,
    timestamp: timestamp || null
  };
}

export function extractInteger(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const normalized = String(value)
    .replace(/[_'\s]/g, '')
    .replace(/,/g, '')
    .trim();
  if (!normalized) return null;
  const match = normalized.match(/-?\d+/);
  if (!match) return null;
  const num = parseInt(match[0], 10);
  return Number.isFinite(num) ? num : null;
}

export function extractFloat(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = String(value)
    .replace(/[_'\s]/g, '')
    .replace(/,/g, '')
    .trim();
  if (!normalized) return null;
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = parseFloat(match[0]);
  return Number.isFinite(num) ? num : null;
}

export function isLikelyLevelUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return LEVEL_URL_PATTERN.test(trimmed);
}

export function isFacepunchLevelUrl(value) {
  if (!isLikelyLevelUrl(value)) return false;
  return FACEPUNCH_LEVEL_HOST_PATTERN.test(value.trim());
}

export function isCustomLevelUrl(value) {
  return isLikelyLevelUrl(value) && !isFacepunchLevelUrl(value);
}

export function parseLevelUrlMessage(message) {
  if (message == null) return null;
  const text = stripAnsiSequences(String(message));
  const trimmed = text.trim();
  if (!trimmed) return null;
  const normalized = stripRconTimestampPrefix(trimmed).trim() || trimmed;

  try {
    const json = JSON.parse(normalized);
    if (typeof json === 'string') {
      const parsed = json.trim();
      if (parsed && isLikelyLevelUrl(parsed)) return parsed;
    }
    if (json && typeof json === 'object') {
      for (const value of Object.values(json)) {
        const nested = parseLevelUrlMessage(value);
        if (nested) return nested;
      }
    }
  } catch {
    // not JSON, continue with pattern-based parsing
  }

  const quotedMatch = normalized.match(/["']\s*(https?:\/\/[^"']+?)\s*["']/i);
  if (quotedMatch && quotedMatch[1]) {
    const candidate = quotedMatch[1].trim();
    if (isLikelyLevelUrl(candidate)) return candidate;
  }

  const urlMatch = normalized.match(LEVEL_URL_INLINE_PATTERN);

  if (urlMatch && urlMatch[0]) {
    const candidate = urlMatch[0].replace(/["'\s>;\]]+$/, '').trim();
    if (isLikelyLevelUrl(candidate)) return candidate;
  }

  const colonIndex = normalized.toLowerCase().indexOf('levelurl');
  if (colonIndex >= 0) {
    const afterKey = normalized.slice(colonIndex + 'levelurl'.length);
    const separatorIndex = afterKey.indexOf(':');
    if (separatorIndex >= 0) {
      const candidate = afterKey.slice(separatorIndex + 1).trim()
        .replace(/^["']+/, '')
        .replace(/["',;>\]]+$/, '')
        .trim();
      if (candidate && isLikelyLevelUrl(candidate)) return candidate;
    }
  }

  const genericColonIndex = normalized.indexOf(':');
  if (genericColonIndex >= 0) {
    const candidate = normalized.slice(genericColonIndex + 1).trim()
      .replace(/^["']+/, '')
      .replace(/["',;>\]]+$/, '')
      .trim();
    if (candidate && isLikelyLevelUrl(candidate)) return candidate;
  }

  return null;
}

export function parseServerInfoMessage(message) {
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
    if (lower.includes('level') && lower.includes('url')) {
      if (!result.levelUrl) {
        const parsed = parseLevelUrlMessage(trimmedValue);
        if (parsed) result.levelUrl = parsed;
      }
    }
    if (!result.levelUrl && typeof trimmedValue === 'string') {
      const candidateText = trimmedValue.trim();
      if (candidateText) {
        const lowerValue = candidateText.toLowerCase();
        if (lowerValue.includes('levelurl') || LEVEL_URL_PATTERN.test(candidateText)) {
          const parsed = parseLevelUrlMessage(candidateText);
          if (parsed) result.levelUrl = parsed;
        }
      }
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
    for (const rawLine of lines) {
      const line = normaliseRconLine(rawLine);
      if (!line.trim()) continue;
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
    const sizeField = fields.WorldSize ?? fields.worldSize ?? fields.size ?? null;
    const size = extractInteger(sizeField);
    if (size != null) result.size = size;
  }

  if (result.seed == null) {
    const seedField = fields.WorldSeed ?? fields.worldSeed ?? fields.seed ?? null;
    const seed = extractInteger(seedField);
    if (seed != null) result.seed = seed;
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

  if (!output.levelUrl) {
    const candidates = [
      result.levelUrl,
      fields.levelUrl,
      fields.levelURL,
      fields.LevelUrl,
      fields.LevelURL,
      fields['Level Url'],
      fields['Level URL']
    ];
    for (const candidate of candidates) {
      const parsed = parseLevelUrlMessage(candidate);
      if (parsed) {
        output.levelUrl = parsed;
        break;
      }
    }
  }

  if (!output.levelUrl) {
    const parsed = parseLevelUrlMessage(trimmed);
    if (parsed) output.levelUrl = parsed;
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

export function isLikelyProceduralLevelUrl(value) {
  return isLikelyLevelUrl(value) && !isCustomLevelUrl(value);
}
