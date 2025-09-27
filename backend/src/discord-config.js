export const STATUS_COLORS = Object.freeze({
  online: 0x57f287,
  offline: 0xed4245,
  stale: 0xfee75c
});

const ALLOWED_PRESENCE_STATUSES = new Set(['online', 'idle', 'dnd', 'invisible']);

export const DEFAULT_DISCORD_BOT_CONFIG = Object.freeze({
  presenceTemplate: '{statusEmoji} {playerCount} on {serverName}',
  presenceStatuses: Object.freeze({
    online: 'online',
    offline: 'dnd',
    stale: 'idle',
    waiting: 'idle'
  }),
  colors: Object.freeze({
    ...STATUS_COLORS
  }),
  fields: Object.freeze({
    joining: true,
    queued: true,
    sleepers: true,
    fps: true,
    lastUpdate: true
  })
});

export const CONFIG_FIELD_CHOICES = [
  { value: 'joining', name: 'Joining players' },
  { value: 'queued', name: 'Queue length' },
  { value: 'sleepers', name: 'Sleeping players' },
  { value: 'fps', name: 'Server FPS' },
  { value: 'lastUpdate', name: 'Last update timestamp' }
];

export const CONFIG_FIELD_LABELS = CONFIG_FIELD_CHOICES.reduce((map, choice) => {
  map[choice.value] = choice.name;
  return map;
}, {});

export const PRESENCE_TEMPLATE_TOKENS = Object.freeze([
  'serverName',
  'players',
  'maxPlayers',
  'playerCount',
  'queued',
  'sleepers',
  'joining',
  'fps',
  'status',
  'statusEmoji'
]);

const COLOR_HEX_REGEX = /^#?([0-9a-f]{6})$/i;

export function parseColorString(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const clamped = Math.max(0, Math.min(0xffffff, Math.floor(value)));
    return clamped;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(COLOR_HEX_REGEX);
  if (!match) return null;
  return parseInt(match[1], 16);
}

export function formatColorHex(value) {
  const numeric = typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(0xffffff, Math.floor(value)))
    : 0;
  return `#${numeric.toString(16).padStart(6, '0')}`;
}

function sanitizePresenceTemplate(template) {
  if (typeof template !== 'string') return DEFAULT_DISCORD_BOT_CONFIG.presenceTemplate;
  const trimmed = template.trim();
  if (!trimmed) return DEFAULT_DISCORD_BOT_CONFIG.presenceTemplate;
  return trimmed.slice(0, 190);
}

function normalizePresenceStatuses(statuses = {}) {
  const source = typeof statuses === 'object' && statuses != null ? statuses : {};
  const base = DEFAULT_DISCORD_BOT_CONFIG.presenceStatuses;
  const out = {
    online: ALLOWED_PRESENCE_STATUSES.has(source.online) ? source.online : base.online,
    offline: ALLOWED_PRESENCE_STATUSES.has(source.offline) ? source.offline : base.offline,
    stale: ALLOWED_PRESENCE_STATUSES.has(source.stale) ? source.stale : base.stale,
    waiting: ALLOWED_PRESENCE_STATUSES.has(source.waiting) ? source.waiting : base.waiting
  };
  return out;
}

function normalizeFields(fields = {}) {
  const source = typeof fields === 'object' && fields != null ? fields : {};
  const base = DEFAULT_DISCORD_BOT_CONFIG.fields;
  return {
    joining: typeof source.joining === 'boolean' ? source.joining : base.joining,
    queued: typeof source.queued === 'boolean' ? source.queued : base.queued,
    sleepers: typeof source.sleepers === 'boolean' ? source.sleepers : base.sleepers,
    fps: typeof source.fps === 'boolean' ? source.fps : base.fps,
    lastUpdate: typeof source.lastUpdate === 'boolean' ? source.lastUpdate : base.lastUpdate
  };
}

function normalizeColors(colors = {}) {
  const source = typeof colors === 'object' && colors != null ? colors : {};
  const base = DEFAULT_DISCORD_BOT_CONFIG.colors;
  const normalize = (key) => {
    const parsed = parseColorString(source[key]);
    return parsed == null ? base[key] : parsed;
  };
  return {
    online: normalize('online'),
    offline: normalize('offline'),
    stale: normalize('stale')
  };
}

export function normaliseDiscordBotConfig(value = {}) {
  const source = typeof value === 'object' && value != null ? value : {};
  return {
    presenceTemplate: sanitizePresenceTemplate(source.presenceTemplate ?? source.presence_template),
    presenceStatuses: normalizePresenceStatuses(source.presenceStatuses ?? source.presence_statuses),
    colors: normalizeColors(source.colors),
    fields: normalizeFields(source.fields)
  };
}

export function cloneDiscordBotConfig(config = DEFAULT_DISCORD_BOT_CONFIG) {
  const normalised = normaliseDiscordBotConfig(config);
  return {
    presenceTemplate: normalised.presenceTemplate,
    presenceStatuses: { ...normalised.presenceStatuses },
    colors: { ...normalised.colors },
    fields: { ...normalised.fields }
  };
}

export function parseDiscordBotConfig(raw) {
  if (raw == null) {
    return cloneDiscordBotConfig(DEFAULT_DISCORD_BOT_CONFIG);
  }
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      value = {};
    }
  }
  return cloneDiscordBotConfig(value);
}

export function encodeDiscordBotConfig(config) {
  const normalised = normaliseDiscordBotConfig(config);
  return JSON.stringify({
    presenceTemplate: normalised.presenceTemplate,
    presenceStatuses: normalised.presenceStatuses,
    colors: normalised.colors,
    fields: normalised.fields
  });
}

export function discordBotConfigKey(config) {
  return encodeDiscordBotConfig(config);
}

export function renderPresenceTemplate(template, context) {
  const baseTemplate = sanitizePresenceTemplate(template);
  const text = baseTemplate.replace(/\{(\w+)\}/g, (match, token) => {
    if (Object.hasOwn(context, token)) {
      const value = context[token];
      return value == null ? '' : String(value);
    }
    return '';
  });
  const cleaned = text.trim();
  if (cleaned.length === 0) {
    return sanitizePresenceTemplate(DEFAULT_DISCORD_BOT_CONFIG.presenceTemplate);
  }
  return cleaned.slice(0, 120);
}

export function describePresenceTemplateUsage() {
  const parts = PRESENCE_TEMPLATE_TOKENS.map((token) => `\`{${token}}\``);
  return parts.join(', ');
}
