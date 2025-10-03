const FACEPUNCH_LEVEL_HOST_PATTERN = /^(?:blob:)?https?:\/\/files\.facepunch\.com/i;
const LEVEL_URL_PATTERN = /^(?:blob:)?https?:\/\/\S+/i;
const LEVEL_URL_INLINE_PATTERN = /(?:blob:)?https?:\/\/\S+/i;
const ANSI_ESCAPE_SEQUENCE_PATTERN = /\u001b\[[0-?]*[ -\/]*[@-~]/g;

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
