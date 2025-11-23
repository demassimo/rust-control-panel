export const STATUS_COLORS = Object.freeze({
  online: 0x57f287,
  offline: 0xed4245,
  stale: 0xfee75c
});

const ALLOWED_PRESENCE_STATUSES = new Set(['online', 'idle', 'dnd', 'invisible']);

export const DEFAULT_TICKETING_CONFIG = Object.freeze({
  enabled: false,
  categoryId: null,
  logChannelId: null,
  staffRoleId: null,
  welcomeMessage: 'Thanks for contacting the Rust server team! A staff member will be with you shortly.',
  questionPrompt: 'Please describe your issue so the team can help.',
  pingStaffOnOpen: true,
  panelChannelId: null,
  panelMessageId: null,
  panelTitle: 'Need assistance from the team?',
  panelDescription: 'Use the button below to open a ticket and let us know how we can help.',
  panelButtonLabel: 'Open Ticket'
});

export const DEFAULT_COMMAND_PERMISSIONS = Object.freeze({
  status: null,
  ticket: null,
  rustlookup: null,
  auth: null
});

export const DEFAULT_TEAM_DISCORD_CONFIG = Object.freeze({
  ticketing: Object.freeze({ ...DEFAULT_TICKETING_CONFIG }),
  commandPermissions: Object.freeze({ ...DEFAULT_COMMAND_PERMISSIONS })
});

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
  }),
  ticketing: Object.freeze({
    ...DEFAULT_TICKETING_CONFIG
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

const normalisingSources = new WeakSet();

function sanitizeSnowflake(value) {
  if (value == null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function sanitizeTicketMessage(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 500);
}

function normalizeCommandRole(value) {
  if (value == null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

export function normalizeCommandPermissions(permissions = {}) {
  const source = permissions && typeof permissions === 'object' ? permissions : {};
  const base = DEFAULT_COMMAND_PERMISSIONS;
  return {
    status: normalizeCommandRole(source.status ?? source.ruststatus),
    ticket: normalizeCommandRole(source.ticket),
    rustlookup: normalizeCommandRole(source.rustlookup ?? source.lookup),
    auth: normalizeCommandRole(source.auth)
  };
}

function sanitizePanelText(value, fallback, maxLength = 190) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, Math.max(1, maxLength));
}

function normalizeTicketingConfig(ticketing = {}) {
  const source = typeof ticketing === 'object' && ticketing != null ? ticketing : {};
  const base = DEFAULT_TICKETING_CONFIG;
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : base.enabled,
    categoryId: sanitizeSnowflake(source.categoryId ?? source.category_id),
    logChannelId: sanitizeSnowflake(source.logChannelId ?? source.log_channel_id),
    staffRoleId: sanitizeSnowflake(source.staffRoleId ?? source.staff_role_id),
    welcomeMessage: sanitizeTicketMessage(source.welcomeMessage ?? source.welcome_message, base.welcomeMessage),
    questionPrompt: sanitizeTicketMessage(source.questionPrompt ?? source.question_prompt, base.questionPrompt),
    pingStaffOnOpen: typeof source.pingStaffOnOpen === 'boolean'
      ? source.pingStaffOnOpen
      : base.pingStaffOnOpen,
    panelChannelId: sanitizeSnowflake(source.panelChannelId ?? source.panel_channel_id),
    panelMessageId: sanitizeSnowflake(source.panelMessageId ?? source.panel_message_id),
    panelTitle: sanitizePanelText(source.panelTitle ?? source.panel_title, base.panelTitle, 240),
    panelDescription: sanitizePanelText(source.panelDescription ?? source.panel_description, base.panelDescription, 1000),
    panelButtonLabel: sanitizePanelText(source.panelButtonLabel ?? source.panel_button_label, base.panelButtonLabel, 80)
  };
}

function defaultNormalisedConfig() {
  return {
    presenceTemplate: sanitizePresenceTemplate(DEFAULT_DISCORD_BOT_CONFIG.presenceTemplate),
    presenceStatuses: normalizePresenceStatuses(DEFAULT_DISCORD_BOT_CONFIG.presenceStatuses),
    colors: normalizeColors(DEFAULT_DISCORD_BOT_CONFIG.colors),
    fields: normalizeFields(DEFAULT_DISCORD_BOT_CONFIG.fields),
    ticketing: normalizeTicketingConfig(DEFAULT_DISCORD_BOT_CONFIG.ticketing)
  };
}

function cloneNormalisedConfig(normalised) {
  return {
    presenceTemplate: normalised.presenceTemplate,
    presenceStatuses: { ...normalised.presenceStatuses },
    colors: { ...normalised.colors },
    fields: { ...normalised.fields },
    ticketing: { ...normalised.ticketing }
  };
}

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
  const hasSource = typeof value === 'object' && value != null;
  const source = hasSource ? value : {};

  if (!hasSource) {
    return defaultNormalisedConfig();
  }

  if (normalisingSources.has(source)) {
    return defaultNormalisedConfig();
  }

  normalisingSources.add(source);
  try {
    return {
      presenceTemplate: sanitizePresenceTemplate(source.presenceTemplate ?? source.presence_template),
      presenceStatuses: normalizePresenceStatuses(source.presenceStatuses ?? source.presence_statuses),
      colors: normalizeColors(source.colors),
      fields: normalizeFields(source.fields),
      ticketing: normalizeTicketingConfig(source.ticketing)
    };
  } finally {
    normalisingSources.delete(source);
  }
}

export function normaliseTeamDiscordConfig(value = {}) {
  const hasSource = typeof value === 'object' && value != null;
  const source = hasSource ? value : {};
  const ticketing = normalizeTicketingConfig(source.ticketing);
  const commandPermissions = normalizeCommandPermissions(source.commandPermissions ?? source.command_permissions);
  return { ticketing, commandPermissions };
}

export function cloneDiscordBotConfig(config = DEFAULT_DISCORD_BOT_CONFIG) {
  const normalised = normaliseDiscordBotConfig(config);
  return cloneNormalisedConfig(normalised);
}

export function cloneTeamDiscordConfig(config = DEFAULT_TEAM_DISCORD_CONFIG) {
  const normalised = normaliseTeamDiscordConfig(config);
  return {
    ticketing: { ...normalised.ticketing },
    commandPermissions: { ...normalised.commandPermissions }
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

export function parseTeamDiscordConfig(raw) {
  if (raw == null) {
    return cloneTeamDiscordConfig(DEFAULT_TEAM_DISCORD_CONFIG);
  }
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      value = {};
    }
  }
  return cloneTeamDiscordConfig(value);
}

export function encodeTeamDiscordConfig(config = DEFAULT_TEAM_DISCORD_CONFIG) {
  return JSON.stringify(normaliseTeamDiscordConfig(config));
}

export function encodeDiscordBotConfig(config) {
  const normalised = normaliseDiscordBotConfig(config);
  return JSON.stringify({
    presenceTemplate: normalised.presenceTemplate,
    presenceStatuses: normalised.presenceStatuses,
    colors: normalised.colors,
    fields: normalised.fields,
    ticketing: normalised.ticketing
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
