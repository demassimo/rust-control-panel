const COMBAT_LOG_MAX_LENGTH = 8000;

function ensureMaxLength(text) {
  if (typeof text !== 'string') return null;
  return text.length > COMBAT_LOG_MAX_LENGTH ? text.slice(0, COMBAT_LOG_MAX_LENGTH) : text;
}

export function serializeCombatLogPayload(combatPayload) {
  if (combatPayload == null) return null;

  if (typeof combatPayload === 'string') {
    return ensureMaxLength(combatPayload);
  }

  if (typeof combatPayload !== 'object') {
    return null;
  }

  const payload = { ...combatPayload };
  if (Array.isArray(payload.lines)) payload.lines = payload.lines.slice();
  if (Array.isArray(payload.records)) payload.records = payload.records.slice();

  const encode = () => {
    try {
      return JSON.stringify(payload);
    } catch {
      return null;
    }
  };

  let json = encode();
  if (json == null) return null;
  if (json.length <= COMBAT_LOG_MAX_LENGTH) return json;

  const shrinkArray = (key) => {
    const arr = payload[key];
    if (!Array.isArray(arr) || arr.length === 0) return;
    while (arr.length > 0) {
      arr.pop();
      const encoded = encode();
      if (encoded == null) {
        json = null;
        return;
      }
      json = encoded;
      if (json.length <= COMBAT_LOG_MAX_LENGTH) return;
    }
  };

  shrinkArray('records');
  if (json != null && json.length <= COMBAT_LOG_MAX_LENGTH) return json;

  shrinkArray('lines');
  if (json != null && json.length <= COMBAT_LOG_MAX_LENGTH) return json;

  if (typeof payload.text === 'string' && payload.text.length > 0) {
    const overBy = json ? json.length - COMBAT_LOG_MAX_LENGTH : payload.text.length;
    const targetLength = Math.max(0, payload.text.length - overBy);
    payload.text = payload.text.slice(0, targetLength);
    json = encode();
    if (json != null && json.length <= COMBAT_LOG_MAX_LENGTH) return json;
  }

  const fallbackText = typeof combatPayload.text === 'string'
    ? combatPayload.text
    : Array.isArray(combatPayload.lines)
      ? combatPayload.lines.join('\n')
      : '';

  if (!fallbackText) return null;
  return ensureMaxLength(fallbackText);
}
