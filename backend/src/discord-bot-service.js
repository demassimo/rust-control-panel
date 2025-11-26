import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import process from 'node:process';
import { randomUUID, randomBytes } from 'node:crypto';
import {
  Client,
  GatewayIntentBits,
  ActivityType,
  EmbedBuilder,
  AttachmentBuilder,
  ApplicationCommandOptionType,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  escapeMarkdown,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder
} from 'discord.js';
import { initDb, db } from './db/index.js';
import {
  STATUS_COLORS,
  DEFAULT_DISCORD_BOT_CONFIG,
  DEFAULT_TICKETING_CONFIG,
  DEFAULT_TEAM_DISCORD_CONFIG,
  parseDiscordBotConfig,
  encodeDiscordBotConfig,
  cloneDiscordBotConfig,
  parseTeamDiscordConfig,
  CONFIG_FIELD_CHOICES,
  renderPresenceTemplate,
  describePresenceTemplateUsage,
  formatColorHex,
  parseColorString,
  normalizeCommandPermissions
} from './discord-config.js';

const MIN_REFRESH_MS = 10000;
const DEFAULT_REFRESH_MS = 60000;
const DEFAULT_STALE_MS = 5 * 60 * 1000;

const refreshInterval = Math.max(
  Number(process.env.DISCORD_BOT_REFRESH_MS ?? DEFAULT_REFRESH_MS) || DEFAULT_REFRESH_MS,
  MIN_REFRESH_MS
);
const staleThreshold = Math.max(
  Number(process.env.DISCORD_BOT_STALE_MS ?? DEFAULT_STALE_MS) || DEFAULT_STALE_MS,
  MIN_REFRESH_MS
);

const bots = new Map();
let shuttingDown = false;

const TICKET_PANEL_BUTTON_ID = 'ticket:panel:open';
const TICKET_MODAL_PREFIX = 'ticket:modal:';
const TICKET_SELECT_PREFIX = 'ticket:select:';
const MAX_PENDING_REQUEST_AGE_MS = 10 * 60 * 1000;
const TEAM_AUTH_LINK_TTL_MS = (() => {
  const value = Number(process.env.TEAM_AUTH_LINK_TTL_MS);
  if (Number.isFinite(value) && value >= 60 * 1000) return Math.floor(value);
  return 15 * 60 * 1000;
})();
const TICKET_PREVIEW_PAGE = process.env.TICKET_PREVIEW_PAGE || '/ticket-preview.html';
const PANEL_PUBLIC_URL = normalizeBaseUrl(process.env.PANEL_PUBLIC_URL);
const APP_URL_FROM_ENV = normalizeBaseUrl(process.env.APP_URL);
const LEGACY_PUBLIC_APP_URL = normalizeBaseUrl(process.env.PUBLIC_APP_URL);
const TEAM_AUTH_APP_URL = APP_URL_FROM_ENV || PANEL_PUBLIC_URL || LEGACY_PUBLIC_APP_URL || '';

// Server-specific Discord bots are limited to presence/status updates only. All
// interactive slash commands are handled by the team-level bot instead.
const ENABLE_SERVER_COMMAND_BOT = false;

const pendingTicketRequests = new Map();
const teamBots = new Map();
// Ensure slash commands stay guild-scoped by clearing any global registrations once per client.
const clientsWithClearedGlobalCommands = new WeakSet();

function cleanupExpiredRequests() {
  const now = Date.now();
  for (const [id, entry] of pendingTicketRequests.entries()) {
    if (!entry) {
      pendingTicketRequests.delete(id);
      continue;
    }
    if (now - (entry.createdAt ?? 0) > MAX_PENDING_REQUEST_AGE_MS) {
      pendingTicketRequests.delete(id);
    }
  }
}

function savePendingTicketRequest(id, data) {
  if (!id) return;
  cleanupExpiredRequests();
  pendingTicketRequests.set(id, { ...data, createdAt: data.createdAt ?? Date.now() });
}

function getPendingTicketRequest(id) {
  cleanupExpiredRequests();
  return pendingTicketRequests.get(id);
}

function deletePendingTicketRequest(id) {
  if (!id) return;
  pendingTicketRequests.delete(id);
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sanitizeId(value) {
  if (value == null) return '';
  return String(value).trim();
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatCount(value, fallback = '—') {
  const num = safeNumber(value);
  if (num == null) return fallback;
  return String(num);
}

function formatDiscordTimestamp(date, style = 'R') {
  const parsed = parseDate(date);
  if (!parsed) return 'unknown';
  const seconds = Math.floor(parsed.getTime() / 1000);
  return `<t:${seconds}:${style}>`;
}

function sanitizeTicketText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 500);
}

function normalizeBaseUrl(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

function resolvePreviewHref(relative) {
  if (!relative) return relative;
  if (/^https?:\/\//i.test(relative)) return relative;
  if (!PANEL_PUBLIC_URL) return relative;
  if (relative.startsWith('/')) {
    return `${PANEL_PUBLIC_URL}${relative}`;
  }
  return `${PANEL_PUBLIC_URL}/${relative}`;
}

function buildTicketPreviewUrl(teamId, ticket) {
  const numericTeamId = Number(teamId);
  if (!Number.isFinite(numericTeamId)) return null;
  let previewToken = null;
  if (typeof ticket === 'string') {
    const trimmed = ticket.trim();
    previewToken = trimmed || null;
  } else if (typeof ticket === 'number') {
    previewToken = Number.isFinite(ticket) ? String(Math.trunc(ticket)) : null;
  } else if (ticket && typeof ticket === 'object') {
    const direct = typeof ticket.previewToken === 'string' ? ticket.previewToken.trim() : '';
    const legacy = typeof ticket.preview_token === 'string' ? ticket.preview_token.trim() : '';
    const idValue = ticket.id ?? ticket.ticketId ?? ticket.ticket_id;
    if (direct) {
      previewToken = direct;
    } else if (legacy) {
      previewToken = legacy;
    } else if (typeof idValue === 'string' && idValue.trim()) {
      previewToken = idValue.trim();
    } else if (Number.isFinite(idValue)) {
      previewToken = String(Number(idValue));
    }
  } else if (ticket != null) {
    const text = String(ticket).trim();
    previewToken = text || null;
  }
  if (!previewToken) return null;
  const base = TICKET_PREVIEW_PAGE || '/ticket-preview.html';
  const [pathPart, searchPart = ''] = String(base).split('?');
  const params = new URLSearchParams(searchPart);
  params.set('teamId', String(numericTeamId));
  params.set('ticketToken', previewToken);
  const relative = `${pathPart}?${params.toString()}`;
  return resolvePreviewHref(relative);
}

function getTicketConfig(state) {
  const config = getTeamConfig(state);
  return config.ticketing ?? DEFAULT_TICKETING_CONFIG;
}

function updateTicketConfig(state, mutate) {
  if (typeof mutate !== 'function') return getTicketConfig(state);
  const nextRoot = getTeamConfig(state) ? { ...getTeamConfig(state) } : { ...DEFAULT_TEAM_DISCORD_CONFIG };
  const working = { ...(nextRoot.ticketing ?? DEFAULT_TICKETING_CONFIG) };
  const mutated = mutate(working);
  const finalTicketing =
    typeof mutated === 'object' && mutated != null ? mutated : working;
  nextRoot.ticketing = { ...DEFAULT_TICKETING_CONFIG, ...finalTicketing };
  const appliedConfig = setTeamConfig(state, nextRoot);
  return appliedConfig.ticketing ?? DEFAULT_TICKETING_CONFIG;
}

function getTeamConfig(state) {
  if (state?.teamCommandState?.config) return state.teamCommandState.config;
  if (state?.teamConfig) return state.teamConfig;
  return DEFAULT_TEAM_DISCORD_CONFIG;
}

function setTeamConfig(state, config) {
  if (!config) {
    if (state) state.teamConfig = DEFAULT_TEAM_DISCORD_CONFIG;
    return DEFAULT_TEAM_DISCORD_CONFIG;
  }
  const parsed = parseTeamDiscordConfig(config);
  if (state) {
    state.teamConfig = parsed;
    if (state.teamCommandState) {
      state.teamCommandState.config = parsed;
    }
  }
  return parsed;
}

function getCommandPermissions(state) {
  const config = getTeamConfig(state);
  return normalizeCommandPermissions(config.commandPermissions || {});
}

function formatChannelMention(id, fallback = 'Not set') {
  const value = sanitizeId(id);
  return value ? `<#${value}>` : fallback;
}

function formatRoleMention(id, fallback = 'Not set') {
  const value = sanitizeId(id);
  return value ? `<@&${value}>` : fallback;
}

const DEFAULT_TEAM_AUTH_SETTINGS = Object.freeze({
  enabled: false,
  roleId: null,
  guildId: null,
  token: null
});

function buildTeamAuthLink(token) {
  const safe = typeof token === 'string' ? token.trim() : '';
  if (!safe) return null;
  if (TEAM_AUTH_APP_URL) return `${TEAM_AUTH_APP_URL}/request.html?token=${safe}`;
  return `/request.html?token=${safe}`;
}

async function loadTeamAuthSettings(teamId) {
  if (typeof db.getTeamAuthSettings !== 'function') {
    return { ...DEFAULT_TEAM_AUTH_SETTINGS };
  }
  const numeric = Number(teamId);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return { ...DEFAULT_TEAM_AUTH_SETTINGS };
  }
  try {
    const settings = await db.getTeamAuthSettings(numeric);
    return {
      enabled: Boolean(settings?.enabled),
      roleId: sanitizeId(settings?.roleId),
      guildId: sanitizeId(settings?.guildId),
      token: sanitizeId(settings?.token)
    };
  } catch (err) {
    console.error('failed to load team auth settings', err);
    return { ...DEFAULT_TEAM_AUTH_SETTINGS };
  }
}

async function saveTeamAuthSettings(teamId, updates) {
  if (typeof db.setTeamAuthSettings !== 'function') return 0;
  const numeric = Number(teamId);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  try {
    return await db.setTeamAuthSettings(numeric, updates);
  } catch (err) {
    console.error('failed to persist team auth settings', err);
    throw err;
  }
}

function generateTeamAuthToken() {
  try {
    return randomBytes(24).toString('hex');
  } catch (err) {
    console.error('failed to generate auth token with randomBytes, falling back to uuid', err);
    return randomUUID().replace(/-/g, '');
  }
}

function setStateConfig(state, config) {
  const target = state || {};
  const next = cloneDiscordBotConfig(config ?? DEFAULT_DISCORD_BOT_CONFIG);
  const encoded = encodeDiscordBotConfig(next);
  if (!target.config || target.configKey !== encoded) {
    target.config = next;
    target.configKey = encoded;
    if (state) {
      state.lastStatusEmbedKey = null;
      state.lastPresenceKey = null;
    }
  }
  return target.config;
}

function getStateConfig(state) {
  if (!state) return cloneDiscordBotConfig(DEFAULT_DISCORD_BOT_CONFIG);
  if (!state.config) {
    return setStateConfig(state, DEFAULT_DISCORD_BOT_CONFIG);
  }
  return state.config;
}

function updateStateConfigFromIntegration(state, integration) {
  const parsed = parseDiscordBotConfig(integration?.config_json ?? integration?.configJson ?? integration?.config);
  return setStateConfig(state, parsed);
}

function cloneStateConfig(state) {
  return cloneDiscordBotConfig(getStateConfig(state));
}

function getStatusKey(status) {
  if (!status?.hasStats) return 'waiting';
  if (status.stale) return 'stale';
  if (!status.isOnline) return 'offline';
  return 'online';
}

function buildPresenceContext(status, statusKey) {
  const hasStats = Boolean(status?.hasStats);
  const maxPlayers = Number.isFinite(status.maxPlayers) ? status.maxPlayers : null;
  return {
    serverName: status.serverName,
    players: hasStats ? status.players : 0,
    maxPlayers: hasStats && maxPlayers != null ? maxPlayers : 'unknown',
    playerCount: hasStats
      ? (maxPlayers != null ? `${status.players}/${maxPlayers}` : `${status.players}`)
      : 'no data',
    queued: hasStats && Number.isFinite(status.queued) ? status.queued : 0,
    sleepers: hasStats && Number.isFinite(status.sleepers) ? status.sleepers : 0,
    joining: hasStats && Number.isFinite(status.joining) ? status.joining : 0,
    fps: hasStats && Number.isFinite(status.fps) ? status.fps.toFixed(1) : '—',
    status: statusKey,
    statusEmoji:
      statusKey === 'offline' ? '❌' : statusKey === 'stale' ? '⚠️' : statusKey === 'online' ? '✅' : '⏳',
    hasStats,
  };
}

async function loadIntegrations() {
  if (typeof db.listServerDiscordIntegrations === 'function') {
    return await db.listServerDiscordIntegrations();
  }

  if (typeof db.listServers !== 'function' || typeof db.getServerDiscordIntegration !== 'function') {
    return [];
  }

  const integrations = [];
  const servers = await db.listServers();
  for (const server of servers) {
    const integration = await db.getServerDiscordIntegration(server.id);
    if (integration) integrations.push(integration);
  }
  return integrations;
}

async function loadTeamServers(state, { force = false } = {}) {
  if (!state) return [];
  const now = Date.now();
  if (!force && state.teamServers && state.teamServers.size && state.teamServerCacheUntil > now) {
    return [...state.teamServers.values()];
  }

  let primaryServer = null;
  if (typeof db.getServer === 'function') {
    try {
      primaryServer = await db.getServer(state.serverId);
    } catch (err) {
      console.error(`failed to load server metadata for ${state.serverId}`, err);
    }
  }

  const primaryName = primaryServer?.name;
  if (primaryName) {
    state.serverName = primaryName;
  }

  const rawTeamId = primaryServer?.team_id ?? primaryServer?.teamId;
  const numericTeamId = Number(rawTeamId);
  state.teamId = Number.isFinite(numericTeamId) ? numericTeamId : null;

  let teamServerIds = [state.serverId];
  if (state.teamId && typeof db.listTeamServerIds === 'function') {
    try {
      const fetched = await db.listTeamServerIds(state.teamId);
      if (Array.isArray(fetched) && fetched.length) {
        teamServerIds = fetched;
      }
    } catch (err) {
      console.error(`failed to list servers for team ${state.teamId}`, err);
    }
  }

  const uniqueIds = new Set();
  for (const id of teamServerIds) {
    const numeric = Number(id);
    if (Number.isFinite(numeric)) uniqueIds.add(numeric);
  }
  uniqueIds.add(state.serverId);

  const teamServers = new Map();
  const unresolved = [];

  if (primaryServer) {
    teamServers.set(state.serverId, {
      id: state.serverId,
      name: primaryServer?.name ?? `Server ${state.serverId}`,
      teamId: state.teamId
    });
  }

  for (const id of uniqueIds) {
    if (teamServers.has(id)) continue;
    if (typeof db.getServer === 'function') {
      unresolved.push(id);
      continue;
    }
    teamServers.set(id, { id, name: `Server ${id}`, teamId: state.teamId });
  }

  for (const id of unresolved) {
    try {
      const server = await db.getServer(id);
      const teamId = Number(server?.team_id ?? server?.teamId);
      teamServers.set(id, {
        id,
        name: server?.name ?? `Server ${id}`,
        teamId: Number.isFinite(teamId) ? teamId : state.teamId
      });
    } catch (err) {
      console.error(`failed to load server metadata for ${id}`, err);
      teamServers.set(id, { id, name: `Server ${id}`, teamId: state.teamId });
    }
  }

  if (!teamServers.has(state.serverId)) {
    teamServers.set(state.serverId, {
      id: state.serverId,
      name: `Server ${state.serverId}`,
      teamId: state.teamId
    });
  }

  state.teamServers = teamServers;
  state.teamServerIds = new Set(teamServers.keys());
  state.teamServerCacheUntil = Date.now() + 5 * 60 * 1000;

  return [...teamServers.values()];
}

function buildServerChoiceLabel(server) {
  if (!server) return 'Unknown server';
  const id = Number(server.id);
  const name = typeof server.name === 'string' && server.name.trim()
    ? server.name.trim()
    : Number.isFinite(id)
      ? `Server ${id}`
      : 'Unknown server';
  const suffix = Number.isFinite(id) ? ` (#${id})` : '';
  return `${name}${suffix}`.slice(0, 100);
}

async function respondWithTeamServerChoices(state, interaction) {
  const shouldForce = !state.teamServers || state.teamServerCacheUntil < Date.now();
  try {
    await loadTeamServers(state, { force: shouldForce });
  } catch (err) {
    console.error(`failed to load team servers for autocomplete (server ${state.serverId})`, err);
  }

  const focused = typeof interaction.options?.getFocused === 'function'
    ? interaction.options.getFocused(true)
    : null;
  const rawQuery = focused?.value;
  const query = typeof rawQuery === 'number'
    ? String(rawQuery)
    : typeof rawQuery === 'string'
      ? rawQuery
      : '';
  const normalized = query.trim().toLowerCase();

  const servers = Array.from(state.teamServers?.values() ?? []);
  servers.sort((a, b) => {
    const nameA = (a?.name ?? '').toLowerCase();
    const nameB = (b?.name ?? '').toLowerCase();
    if (nameA && nameB && nameA !== nameB) return nameA.localeCompare(nameB);
    return Number(a?.id ?? 0) - Number(b?.id ?? 0);
  });

  const filtered = normalized
    ? servers.filter((server) => {
        const idText = String(server?.id ?? '').toLowerCase();
        const nameText = (server?.name ?? '').toLowerCase();
        return idText.includes(normalized) || nameText.includes(normalized);
      })
    : servers;

  const choices = filtered
    .slice(0, 25)
    .map((server) => ({
      name: buildServerChoiceLabel(server),
      value: Number(server.id)
    }))
    .filter((choice) => Number.isFinite(choice.value));

  try {
    await interaction.respond(choices);
  } catch (err) {
    console.error(`failed to respond to autocomplete for server ${state.serverId}`, err);
  }
  return true;
}

function createStatusClient(state) {
  state.statusReady = false;
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

  let readyHandled = false;
  const handleReady = async () => {
    if (readyHandled) return;
    readyHandled = true;
    state.statusReady = true;
    state.statusCooldownMs = MIN_REFRESH_MS;
    state.statusCooldownUntil = 0;
    const username = client.user?.tag ?? '(unknown)';
    console.log(`discord status bot ready for server ${state.serverId} as ${username}`);
    if (state.useSharedClient) {
      state.commandClient = client;
      state.commandReady = true;
      state.commandCooldownMs = MIN_REFRESH_MS;
      state.commandCooldownUntil = 0;
      try {
        await registerCommands(state);
      } catch (err) {
        console.error(`failed to register slash commands for server ${state.serverId}`, err);
      }
    }
  };

  client.once('clientReady', handleReady);
  client.once('ready', handleReady);

  client.on('error', (err) => {
    console.error(`discord client error (server ${state.serverId})`, err);
  });

  client.on('shardError', (err) => {
    console.error(`discord shard error (server ${state.serverId})`, err);
  });

  if (state.useSharedClient) {
    client.on('interactionCreate', (interaction) => {
      handleInteraction(state, interaction).catch((err) => {
        console.error(`failed to handle interaction for server ${state.serverId}`, err);
      });
    });
  }

  return client;
}

function createCommandClient(state) {
  state.commandReady = false;
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

  let readyHandled = false;
  const handleReady = async () => {
    if (readyHandled) return;
    readyHandled = true;
    state.commandReady = true;
    state.commandCooldownMs = MIN_REFRESH_MS;
    state.commandCooldownUntil = 0;
    const username = client.user?.tag ?? '(unknown)';
    console.log(`discord command bot ready for server ${state.serverId} as ${username}`);
    try {
      await registerCommands(state);
    } catch (err) {
      console.error(`failed to register slash commands for server ${state.serverId}`, err);
    }
  };

  client.once('clientReady', handleReady);
  client.once('ready', handleReady);

  client.on('error', (err) => {
    console.error(`discord command client error (server ${state.serverId})`, err);
  });

  client.on('shardError', (err) => {
    console.error(`discord command shard error (server ${state.serverId})`, err);
  });

  client.on('interactionCreate', (interaction) => {
    handleInteraction(state, interaction).catch((err) => {
      console.error(`failed to handle interaction for server ${state.serverId}`, err);
    });
  });

  return client;
}


function buildServerCommandDefinitions() {
  return [];
}

function buildTeamCommandDefinitions() {
  return [
    {
      name: 'help',
      description: 'Show information about available commands',
      dm_permission: false
    },
    {
      name: 'ruststatus',
      description: 'Show Rust server status snapshots',
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'status',
          description: 'Show the latest status snapshot'
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'listservers',
          description: 'List the Rust servers assigned to this team'
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'server',
          description: 'Show the latest status snapshot for a specific team server',
          options: [
            {
              type: ApplicationCommandOptionType.Integer,
              name: 'id',
              description: 'Select the server to query',
              required: true,
              min_value: 1,
              autocomplete: true
            }
          ]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'refresh',
          description: 'Force an immediate status refresh'
        }
      ]
    },
    {
      name: 'rustlookup',
      description: 'Lookup player information from the control panel database',
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'player',
          description: 'Search for players by name',
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: 'query',
              description: 'Partial name or SteamID64 to search for',
              required: true,
              min_length: 2
            }
          ]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'steamid',
          description: 'Lookup a specific player by SteamID64',
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: 'id',
              description: 'SteamID64 to lookup',
              required: true,
              min_length: 5
            }
          ]
        }
      ]
    },
    {
      name: 'auth',
      description: 'Link your Discord and Steam accounts for the Rust control panel',
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'link',
          description: 'Generate a one-time account linking URL'
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'status',
          description: 'Show whether Discord account linking is enabled'
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'enable',
          description: 'Enable Discord/Steam account linking for this control panel'
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'disable',
          description: 'Disable Discord/Steam account linking for this control panel'
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'setrole',
          description: 'Choose the Discord role granted after a player links their account',
          options: [
            {
              type: ApplicationCommandOptionType.Role,
              name: 'role',
              description: 'Role to grant to verified players (leave empty to clear)',
              required: false
            }
          ]
        }
      ]
    },
    {
      name: 'ticket',
      description: 'Create or manage support tickets',
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'open',
          description: 'Open a new support ticket',
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: 'subject',
              description: 'Brief summary of your request',
              required: true,
              min_length: 3,
              max_length: 120
            },
            {
              type: ApplicationCommandOptionType.String,
              name: 'details',
              description: 'Additional information for the staff team',
              required: false,
              max_length: 500
            },
            {
              type: ApplicationCommandOptionType.Integer,
              name: 'server',
              description: 'Select the server to associate with the ticket',
              required: false,
              min_value: 1,
              autocomplete: true
            }
          ]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'close',
          description: 'Close an existing ticket channel',
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: 'reason',
              description: 'Reason for closing the ticket',
              required: false,
              max_length: 190
            }
          ]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'panel',
          description: 'Post or update the interactive ticket panel',
          options: [
            {
              type: ApplicationCommandOptionType.Channel,
              name: 'channel',
              description: 'Channel that should contain the ticket panel',
              required: false,
              channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
            },
            {
              type: ApplicationCommandOptionType.String,
              name: 'title',
              description: 'Custom embed title',
              required: false,
              max_length: 190
            },
            {
              type: ApplicationCommandOptionType.String,
              name: 'description',
              description: 'Custom embed description',
              required: false,
              max_length: 500
            },
            {
              type: ApplicationCommandOptionType.String,
              name: 'button_label',
              description: 'Custom button label',
              required: false,
              max_length: 80
            }
          ]
        },
        {
          type: ApplicationCommandOptionType.SubcommandGroup,
          name: 'config',
          description: 'Configure the ticket system',
          options: [
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: 'show',
              description: 'Show the current ticket configuration'
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: 'toggle',
              description: 'Enable or disable ticket creation',
              options: [
                {
                  type: ApplicationCommandOptionType.Boolean,
                  name: 'enabled',
                  description: 'Whether the ticket system should be enabled',
                  required: true
                }
              ]
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: 'setcategory',
              description: 'Set the category used for ticket channels',
              options: [
                {
                  type: ApplicationCommandOptionType.Channel,
                  name: 'category',
                  description: 'Category channel for new tickets',
                  required: true,
                  channel_types: [ChannelType.GuildCategory]
                }
              ]
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: 'setlog',
              description: 'Set or clear the ticket log channel',
              options: [
                {
                  type: ApplicationCommandOptionType.Channel,
                  name: 'channel',
                  description: 'Channel that will receive ticket logs',
                  required: false,
                  channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
                }
              ]
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: 'setstaff',
              description: 'Set or clear the staff role pinged on new tickets',
              options: [
                {
                  type: ApplicationCommandOptionType.Role,
                  name: 'role',
                  description: 'Role to notify when a ticket is opened',
                  required: false
                }
              ]
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: 'setwelcome',
              description: 'Update the welcome message posted in new tickets',
              options: [
                {
                  type: ApplicationCommandOptionType.String,
                  name: 'message',
                  description: 'Welcome message content',
                  required: false,
                  max_length: 500
                },
                {
                  type: ApplicationCommandOptionType.Boolean,
                  name: 'reset',
                  description: 'Reset to the default welcome message',
                  required: false
                }
              ]
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: 'setprompt',
              description: 'Update the instructions provided to users',
              options: [
                {
                  type: ApplicationCommandOptionType.String,
                  name: 'message',
                  description: 'Prompt message content',
                  required: false,
                  max_length: 500
                },
                {
                  type: ApplicationCommandOptionType.Boolean,
                  name: 'reset',
                  description: 'Reset to the default prompt',
                  required: false
                }
              ]
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: 'setping',
              description: 'Toggle staff pings when new tickets open',
              options: [
                {
                  type: ApplicationCommandOptionType.Boolean,
                  name: 'enabled',
                  description: 'Whether to ping the staff role when tickets are opened',
                  required: true
                }
              ]
            }
          ]
        }
      ]
    }
  ];
}

async function registerCommandsForClient(client, guildId, commands, { logContext } = {}) {
  if (!client?.application || !guildId) return;
  if (!clientsWithClearedGlobalCommands.has(client)) {
    try {
      await client.application.commands.set([]);
      clientsWithClearedGlobalCommands.add(client);
    } catch (err) {
      const contextLabel = logContext ? ` (${logContext})` : '';
      console.error(`failed to clear global slash commands${contextLabel}`, err);
    }
  }
  await client.application.commands.set(commands ?? [], guildId);
}

async function registerCommands(state) {
  const commands = buildServerCommandDefinitions();
  await registerCommandsForClient(state.commandClient, state.guildId, commands, {
    logContext: `server ${state.serverId}`
  });
}

function createTeamCommandClient(teamState) {
  teamState.ready = false;
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

  let readyHandled = false;
  const handleReady = async () => {
    if (readyHandled) return;
    readyHandled = true;
    teamState.ready = true;
    teamState.cooldownMs = MIN_REFRESH_MS;
    teamState.cooldownUntil = 0;
    const username = client.user?.tag ?? '(unknown)';
    console.log(`discord team command bot ready for team ${teamState.teamId} as ${username}`);
    for (const state of teamState.serverStates.values()) {
      state.commandClient = client;
      state.commandReady = true;
      state.commandCooldownMs = MIN_REFRESH_MS;
      state.commandCooldownUntil = 0;
    }
    for (const guildId of teamState.guildServers.keys()) {
      try {
        await ensureTeamGuildRegistration(teamState, guildId);
      } catch (err) {
        console.error(`failed to register slash commands for team ${teamState.teamId} in guild ${guildId}`, err);
      }
    }
  };

  client.once('clientReady', handleReady);
  client.once('ready', handleReady);

  client.on('error', (err) => {
    console.error(`discord team command client error (team ${teamState.teamId})`, err);
  });

  client.on('shardError', (err) => {
    console.error(`discord team command shard error (team ${teamState.teamId})`, err);
  });

  client.on('interactionCreate', (interaction) => {
    handleTeamInteraction(teamState, interaction).catch((err) => {
      console.error(`failed to handle interaction for team ${teamState.teamId}`, err);
    });
  });

  return client;
}

async function ensureTeamGuildRegistration(teamState, guildId) {
  if (!teamState?.client?.application || !guildId) return;
  const registered = teamState.guildRegistrations.get(guildId);
  if (registered) return;
  const commands = buildTeamCommandDefinitions();
  await registerCommandsForClient(teamState.client, guildId, commands, {
    logContext: `team ${teamState.teamId}`
  });
  teamState.guildRegistrations.set(guildId, true);
}

async function resetTeamCommandState(teamState, token) {
  if (!teamState) return;
  if (teamState.connectPromise) {
    try {
      await teamState.connectPromise;
    } catch {
      // ignore
    }
  }
  const previousClient = teamState.client;
  if (previousClient) {
    try {
      await previousClient.destroy();
    } catch (err) {
      console.error(`failed to destroy team command client for team ${teamState.teamId}`, err);
    }
  }
  teamState.client = null;
  teamState.ready = false;
  teamState.connectPromise = null;
  teamState.cooldownMs = MIN_REFRESH_MS;
  teamState.cooldownUntil = 0;
  teamState.guildRegistrations.clear();
  teamState.token = token;
  for (const state of teamState.serverStates.values()) {
    if (state.commandClient === previousClient) {
      state.commandClient = null;
      state.commandReady = false;
    }
  }
}

async function ensureTeamBot(teamId, { token, guildId, state } = {}) {
  if (!Number.isFinite(teamId) || !token) return null;

  let teamState = teamBots.get(teamId);
  if (!teamState) {
    teamState = {
      teamId,
      token,
      client: null,
      ready: false,
      connectPromise: null,
      cooldownMs: MIN_REFRESH_MS,
      cooldownUntil: 0,
      guildRegistrations: new Map(),
      guildServers: new Map(),
      serverStates: new Map(),
      config: state?.teamConfig ?? DEFAULT_TEAM_DISCORD_CONFIG
    };
    teamBots.set(teamId, teamState);
  } else if (teamState.token !== token) {
    await resetTeamCommandState(teamState, token);
  }

  if (state) {
    if (state.teamCommandState && state.teamCommandState !== teamState) {
      detachStateFromTeamBot(state);
    }
    teamState.serverStates.set(state.serverId, state);
    if (state.teamConfig) {
      teamState.config = state.teamConfig;
    }
    state.teamCommandState = teamState;
    if (guildId) {
      for (const [existingGuildId, members] of teamState.guildServers.entries()) {
        if (existingGuildId !== guildId && members.delete(state) && members.size === 0) {
          teamState.guildServers.delete(existingGuildId);
          teamState.guildRegistrations.delete(existingGuildId);
        }
      }
      if (!teamState.guildServers.has(guildId)) {
        teamState.guildServers.set(guildId, new Set());
      }
      teamState.guildServers.get(guildId)?.add(state);
    }
    state.commandClient = teamState.client ?? state.commandClient;
    state.commandReady = Boolean(teamState.ready && teamState.client);
  }

  if (!teamState.client) {
    teamState.client = createTeamCommandClient(teamState);
  }

  const now = Date.now();
  if (teamState.cooldownUntil <= now && !teamState.ready) {
    if (!teamState.connectPromise) {
      teamState.connectPromise = (async () => {
        const readyPromise = once(teamState.client, 'ready');
        try {
          await teamState.client.login(teamState.token);
          await readyPromise;
        } catch (err) {
          readyPromise.catch(() => {});
          console.error(`discord team command bot login failed for team ${teamId}`, err);
          teamState.ready = false;
          try {
            await teamState.client.destroy();
          } catch (destroyErr) {
            console.error(`discord team command bot destroy after login failure (team ${teamId})`, destroyErr);
          }
          const nextCooldown = Math.min((teamState.cooldownMs || MIN_REFRESH_MS) * 2, 5 * 60 * 1000);
          teamState.cooldownMs = Math.max(nextCooldown, MIN_REFRESH_MS);
          teamState.cooldownUntil = Date.now() + teamState.cooldownMs;
          teamState.client = null;
          throw err;
        }
      })().finally(() => {
        teamState.connectPromise = null;
      });
    }
    try {
      await teamState.connectPromise;
    } catch {
      // login failure handled above
    }
  }

  if (guildId) {
    if (teamState.ready) {
      try {
        await ensureTeamGuildRegistration(teamState, guildId);
      } catch (err) {
        console.error(`failed to register slash commands for team ${teamId} in guild ${guildId}`, err);
      }
    } else {
      teamState.guildRegistrations.set(guildId, false);
    }
  }

  if (state) {
    state.commandClient = teamState.client ?? state.commandClient;
    state.commandReady = Boolean(teamState.ready && teamState.client);
  }

  return teamState;
}

async function shutdownTeamBot(teamState, { remove = false } = {}) {
  if (!teamState) return;
  await resetTeamCommandState(teamState, teamState.token);
  if (remove) {
    teamBots.delete(teamState.teamId);
    teamState.serverStates.clear();
    teamState.guildServers.clear();
  }
}

function detachStateFromTeamBot(state) {
  const teamState = state?.teamCommandState;
  if (!teamState) return;
  if (teamState.serverStates.get(state.serverId) === state) {
    teamState.serverStates.delete(state.serverId);
  } else {
    for (const [key, entry] of teamState.serverStates.entries()) {
      if (entry === state) {
        teamState.serverStates.delete(key);
        break;
      }
    }
  }
  for (const [guildId, members] of teamState.guildServers.entries()) {
    if (members.delete(state) && members.size === 0) {
      teamState.guildServers.delete(guildId);
      teamState.guildRegistrations.delete(guildId);
    }
  }
  if (state.commandClient === teamState.client) {
    state.commandClient = null;
    state.commandReady = false;
  }
  state.teamCommandState = null;
  if (teamState.serverStates.size === 0) {
    shutdownTeamBot(teamState, { remove: true }).catch((err) => {
      console.error(`failed to shutdown team bot for team ${teamState.teamId}`, err);
    });
  }
}

function selectTeamServerState(teamState, interaction) {
  if (!interaction?.guildId) {
    return { state: null, requiresExplicitSelection: false };
  }
  const guildStates = teamState.guildServers.get(interaction.guildId);
  if (!guildStates || guildStates.size === 0) {
    return { state: null, requiresExplicitSelection: false };
  }

  const wrapState = (state) => ({ state, requiresExplicitSelection: false });

  const findStateByServerId = (serverId) => {
    const numeric = Number(serverId);
    if (!Number.isFinite(numeric)) return null;
    return teamState.serverStates.get(numeric) || [...guildStates].find((entry) => entry.serverId === numeric) || null;
  };

  if (interaction.isModalSubmit() || interaction.isStringSelectMenu()) {
    const customId = interaction.customId ?? '';
    if (customId.startsWith(TICKET_MODAL_PREFIX) || customId.startsWith(TICKET_SELECT_PREFIX)) {
      const prefix = customId.startsWith(TICKET_MODAL_PREFIX) ? TICKET_MODAL_PREFIX : TICKET_SELECT_PREFIX;
      const requestId = customId.slice(prefix.length);
      const entry = getPendingTicketRequest(requestId);
      if (entry?.serverId != null) {
        const byServer = findStateByServerId(entry.serverId);
        if (byServer) return wrapState(byServer);
      }
    }
  }

  if (interaction.isButton() && interaction.customId === TICKET_PANEL_BUTTON_ID) {
    for (const state of guildStates) {
      if (state.channelId && interaction.channelId === state.channelId) return wrapState(state);
      const ticketing = getTicketConfig(state);
      if (ticketing?.panelChannelId && ticketing.panelChannelId === interaction.channelId) return wrapState(state);
    }
  }

  if (interaction.isChatInputCommand()) {
    let requestedServer = null;
    if (interaction.commandName === 'ticket') {
      requestedServer = interaction.options.getInteger('server', false);
    } else if (interaction.commandName === 'ruststatus') {
      requestedServer = interaction.options.getInteger('server', false);
      if (!Number.isFinite(requestedServer)) {
        requestedServer = interaction.options.getInteger('id', false);
      }
    }
    if (Number.isFinite(requestedServer)) {
      const byServer = findStateByServerId(requestedServer);
      if (byServer) return wrapState(byServer);
    }
  }

  for (const state of guildStates) {
    if (state.channelId && state.channelId === interaction.channelId) {
      return wrapState(state);
    }
  }

  for (const state of guildStates) {
    const ticketing = getTicketConfig(state);
    if (ticketing?.panelChannelId && ticketing.panelChannelId === interaction.channelId) {
      return wrapState(state);
    }
  }

  if (guildStates.size === 1) {
    return wrapState(guildStates.values().next().value);
  }

  return { state: null, requiresExplicitSelection: guildStates.size > 1 };
}

async function handleTeamInteraction(teamState, interaction) {
  if (!interaction?.guildId) return;
  if (interaction.isChatInputCommand?.() && interaction.commandName === 'help') {
    await handleHelpCommand(interaction, { teamState });
    return;
  }
  const { state, requiresExplicitSelection } = selectTeamServerState(teamState, interaction);
  if (!state) {
    if (requiresExplicitSelection && typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand()) {
      const canReply = typeof interaction.isRepliable === 'function'
        ? interaction.isRepliable()
        : Boolean(interaction.repliable);
      if (canReply) {
        const message = 'Multiple Rust servers are linked to this team in this guild. Please specify a server when using this command.';
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(message);
          } else {
            await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
          }
        } catch (err) {
          console.error('failed to notify user about ambiguous team interaction', err);
        }
      }
    }
    return;
  }
  await handleInteraction(state, interaction);
}

function hasAdminPermission(interaction) {
  try {
    return Boolean(interaction?.member?.permissions?.has(PermissionFlagsBits.Administrator));
  } catch {
    return false;
  }
}

function memberHasRole(interaction, roleId) {
  if (!roleId) return false;
  const target = String(roleId).trim();
  if (!target) return false;
  const roles = interaction?.member?.roles;
  if (!roles) return false;
  if (roles.cache?.has?.(target)) return true;
  const roleList = Array.isArray(roles)
    ? roles
    : Array.isArray(roles.data)
      ? roles.data
      : roles instanceof Map || roles instanceof Set
        ? Array.from(roles.values())
        : null;
  if (!roleList) return false;
  return roleList.some((role) => {
    const id = typeof role === 'string' ? role : role?.id;
    return id && String(id).trim() === target;
  });
}

function commandKeyForInteraction(interaction) {
  const name = interaction?.commandName;
  if (!name) return null;
  if (name === 'ruststatus') return 'ruststatus';
  if (name === 'rustlookup') return 'rustlookup';
  if (name === 'ticket') return 'ticket';
  if (name === 'auth') return 'auth';
  return null;
}

function getInteractionSubcommandGroup(interaction) {
  try {
    if (typeof interaction?.options?.getSubcommandGroup === 'function') {
      return interaction.options.getSubcommandGroup(false) || null;
    }
  } catch {
    return null;
  }
  return null;
}

function getInteractionSubcommand(interaction) {
  try {
    if (typeof interaction?.options?.getSubcommand === 'function') {
      return interaction.options.getSubcommand(false) || null;
    }
  } catch {
    return null;
  }
  return null;
}

function buildPermissionKeyChain(interaction) {
  const base = commandKeyForInteraction(interaction);
  if (!base) return [];
  const keys = [];
  const group = getInteractionSubcommandGroup(interaction);
  const sub = getInteractionSubcommand(interaction);
  if (group && sub) keys.push(`${base}.${group}.${sub}`);
  if (sub && !group) keys.push(`${base}.${sub}`);
  if (group) keys.push(`${base}.${group}`);
  keys.push(base);
  return keys;
}

async function ensureCommandPermission(state, interaction) {
  const permissionKeys = buildPermissionKeyChain(interaction);
  if (!permissionKeys.length) return true;
  const permissions = getCommandPermissions(state) || {};
  let requiredRoles = [];
  for (const key of permissionKeys) {
    const roles = Array.isArray(permissions[key])
      ? permissions[key].map((role) => sanitizeId(role)).filter(Boolean)
      : [];
    if (roles.length) {
      requiredRoles = roles;
      break;
    }
  }
  if (requiredRoles.length === 0) return true;
  if (hasAdminPermission(interaction)) return true;
  if (requiredRoles.some((roleId) => memberHasRole(interaction, roleId))) return true;
  const message = 'You do not have permission to use this command.';
  const canReply = typeof interaction.isRepliable === 'function'
    ? interaction.isRepliable()
    : Boolean(interaction.repliable);
  if (canReply) {
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(message);
      } else {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      console.error('failed to send permission denial response', err);
    }
  }
  return false;
}


async function shutdownBot(serverId) {
  const state = bots.get(serverId);
  if (!state) return;
  bots.delete(serverId);
  if (state.teamCommandState) {
    detachStateFromTeamBot(state);
  }
  try {
    if (state.statusClient) {
      await state.statusClient.destroy();
    }
  } catch (err) {
    console.error(`discord status bot ${serverId} destroy failed`, err);
  }
  try {
    if (
      state.commandClient &&
      state.commandClient !== state.statusClient &&
      (!state.teamCommandState || state.commandClient !== state.teamCommandState.client)
    ) {
      await state.commandClient.destroy();
    }
  } catch (err) {
    console.error(`discord command bot ${serverId} destroy failed`, err);
  }
}

async function persistIntegration(state) {
  if (typeof db.saveServerDiscordIntegration !== 'function') return;
  try {
    const configJson = state.configKey || encodeDiscordBotConfig(getStateConfig(state));
    await db.saveServerDiscordIntegration(state.serverId, {
      bot_token: state.statusToken,
      command_bot_token: state.commandToken,
      guild_id: state.guildId,
      channel_id: state.channelId,
      status_message_id: state.statusMessageId || null,
      config_json: configJson
    });
    state.integration = {
      ...(state.integration || {}),
      bot_token: state.statusToken,
      command_bot_token: state.commandToken,
      guild_id: state.guildId,
      channel_id: state.channelId,
      status_message_id: state.statusMessageId || null,
      config_json: configJson,
      configJson,
      config: cloneStateConfig(state)
    };
    state.configKey = configJson;
  } catch (err) {
    console.error(`failed to persist discord integration for server ${state.serverId}`, err);
  }
}

async function ensureBot(integration) {
  const serverId = Number(integration?.server_id ?? integration?.serverId);
  if (!Number.isFinite(serverId)) return null;

  const statusToken = sanitizeId(integration?.bot_token ?? integration?.botToken);
  const commandTokenRaw = sanitizeId(integration?.command_bot_token ?? integration?.commandBotToken);
  const guildId = sanitizeId(integration?.guild_id ?? integration?.guildId);
  const channelId = sanitizeId(integration?.channel_id ?? integration?.channelId);
  const statusMessageId = sanitizeId(integration?.status_message_id ?? integration?.statusMessageId);
  const commandToken = commandTokenRaw || statusToken;

  if (!statusToken || !guildId || !channelId) {
    await shutdownBot(serverId);
    return null;
  }

  let state = bots.get(serverId);
  if (!state) {
    state = {
      serverId,
      statusToken,
      commandToken,
      guildId,
      channelId,
      statusClient: null,
      commandClient: null,
      statusReady: false,
      commandReady: false,
      statusConnectPromise: null,
      commandConnectPromise: null,
      statusCooldownMs: MIN_REFRESH_MS,
      statusCooldownUntil: 0,
      commandCooldownMs: MIN_REFRESH_MS,
      commandCooldownUntil: 0,
      channel: null,
      statusMessageId,
      lastPresenceKey: null,
      lastStatusEmbedKey: null,
      config: null,
      configKey: null,
      integration,
      teamId: null,
      teamToken: null,
      teamGuildId: null,
      teamCommandState: null,
      teamServers: null,
      teamServerIds: null,
      teamServerCacheUntil: 0,
      serverName: null,
      useSharedClient: false
    };
    state.statusClient = createStatusClient(state);
    bots.set(serverId, state);
  }

  const previousStatusToken = state.statusToken;
  state.statusToken = statusToken;

  if (previousStatusToken && previousStatusToken !== statusToken && state.statusClient) {
    try {
      await state.statusClient.destroy();
    } catch (err) {
      console.error(`failed to destroy existing status client for server ${serverId}`, err);
    }
    state.statusReady = false;
    state.statusConnectPromise = null;
    state.statusClient = createStatusClient(state);
  } else if (!state.statusClient) {
    state.statusClient = createStatusClient(state);
    state.statusReady = false;
  }

  const previousCommandClient = state.commandClient;
  const previousTeamClient = state.teamCommandState?.client ?? null;

  state.commandToken = commandToken;

  if (state.channelId !== channelId) {
    state.channelId = channelId;
    state.channel = null;
    state.statusMessageId = statusMessageId;
    state.lastStatusEmbedKey = null;
  } else if (state.statusMessageId !== statusMessageId) {
    state.statusMessageId = statusMessageId;
    state.lastStatusEmbedKey = null;
  }
  state.guildId = guildId;
  state.integration = integration;
  updateStateConfigFromIntegration(state, integration);

  let teamId = state.teamId;
  if (!Number.isFinite(teamId) && typeof db.getServer === 'function') {
    try {
      const serverRow = await db.getServer(serverId);
      const rawTeamId = serverRow?.team_id ?? serverRow?.teamId;
      const numericTeamId = Number(rawTeamId);
      if (Number.isFinite(numericTeamId)) {
        teamId = numericTeamId;
      }
    } catch (err) {
      console.error(`failed to load server metadata for ${serverId} while preparing discord bots`, err);
    }
  }
  state.teamId = Number.isFinite(teamId) ? teamId : null;

  let teamToken = null;
  let teamGuildId = state.teamGuildId;
  let teamConfig = state.teamConfig ?? DEFAULT_TEAM_DISCORD_CONFIG;
  if (Number.isFinite(state.teamId)) {
    try {
      if (typeof db.getTeamDiscordSettings === 'function') {
        const settings = await db.getTeamDiscordSettings(state.teamId);
        teamToken = sanitizeId(settings?.token ?? settings?.discord_token);
        teamGuildId = sanitizeId(settings?.guildId ?? settings?.discord_guild_id ?? settings?.discordGuildId);
        teamConfig = parseTeamDiscordConfig(settings?.config ?? teamConfig ?? null);
      } else if (typeof db.getTeam === 'function') {
        const team = await db.getTeam(state.teamId);
        teamToken = sanitizeId(team?.discord_token);
        teamGuildId = sanitizeId(team?.discord_guild_id ?? team?.discordGuildId);
      }
    } catch (err) {
      console.error(`failed to load team ${state.teamId} discord token for server ${serverId}`, err);
    }
  }
  state.teamToken = teamToken;
  state.teamGuildId = teamGuildId;
  setTeamConfig(state, teamConfig);

  const usingTeamCommand = Boolean(teamToken);
  const allowServerCommands =
    ENABLE_SERVER_COMMAND_BOT && !usingTeamCommand && Boolean(commandToken);
  const useSharedClient = allowServerCommands && commandToken === statusToken;

  if (
    !allowServerCommands &&
    previousCommandClient &&
    previousCommandClient !== state.statusClient &&
    previousCommandClient !== previousTeamClient
  ) {
    try {
      await previousCommandClient.destroy();
    } catch (err) {
      console.error(`failed to destroy server command client for server ${serverId}`, err);
    }
    if (state.commandClient === previousCommandClient) {
      state.commandClient = null;
      state.commandReady = false;
      state.commandConnectPromise = null;
      state.commandCooldownMs = MIN_REFRESH_MS;
      state.commandCooldownUntil = 0;
    }
  }

  if (state.useSharedClient !== useSharedClient) {
    if (state.useSharedClient && state.commandClient === state.statusClient) {
      state.commandClient = null;
      state.commandReady = false;
    }
    state.useSharedClient = useSharedClient;
  }

  if (!allowServerCommands && !usingTeamCommand) {
    state.commandCooldownMs = MIN_REFRESH_MS;
    state.commandCooldownUntil = 0;
  }

  if (usingTeamCommand) {
    if (previousCommandClient && previousCommandClient !== state.statusClient && (!state.teamCommandState || previousCommandClient !== state.teamCommandState.client)) {
      try {
        await previousCommandClient.destroy();
      } catch (err) {
        console.error(`failed to destroy dedicated command client for server ${serverId}`, err);
      }
    }
    state.commandClient = null;
    state.commandReady = false;
    state.commandConnectPromise = null;
    state.commandCooldownMs = MIN_REFRESH_MS;
    state.commandCooldownUntil = 0;
  } else if (state.teamCommandState) {
    detachStateFromTeamBot(state);
  }

  if (usingTeamCommand) {
    const teamState = await ensureTeamBot(state.teamId, { token: teamToken, guildId: teamGuildId, state });
    if (teamState?.client) {
      state.commandClient = teamState.client;
      state.commandReady = Boolean(teamState.ready);
    }
  } else if (state.useSharedClient) {
    state.commandClient = state.statusClient;
    if (state.statusReady) {
      state.commandReady = true;
      state.commandCooldownMs = state.statusCooldownMs;
      state.commandCooldownUntil = state.statusCooldownUntil;
    } else {
      state.commandReady = false;
    }
  } else if (allowServerCommands) {
    if (state.commandClient && state.commandClient !== state.statusClient && state.commandToken !== commandToken) {
      try {
        await state.commandClient.destroy();
      } catch (err) {
        console.error(`failed to destroy existing command client for server ${serverId}`, err);
      }
      state.commandClient = null;
      state.commandReady = false;
      state.commandConnectPromise = null;
    }
    if (!state.commandClient) {
      state.commandClient = createCommandClient(state);
    }
  } else {
    if (state.commandClient && state.commandClient !== state.statusClient) {
      try {
        await state.commandClient.destroy();
      } catch (err) {
        console.error(`failed to destroy command client without token for server ${serverId}`, err);
      }
    }
    state.commandClient = state.useSharedClient ? state.statusClient : null;
    state.commandReady = false;
    state.commandConnectPromise = null;
  }

  const now = Date.now();

  if (state.statusCooldownUntil <= now && !state.statusReady) {
    if (!state.statusConnectPromise) {
      state.statusConnectPromise = (async () => {
        const readyPromise = once(state.statusClient, 'ready');
        try {
          await state.statusClient.login(statusToken);
          await readyPromise;
        } catch (err) {
          readyPromise.catch(() => {});
          console.error(`discord status bot login failed for server ${serverId}`, err);
          state.statusReady = false;
          try {
            await state.statusClient.destroy();
          } catch (destroyErr) {
            console.error(`discord status bot destroy after login failure (server ${serverId})`, destroyErr);
          }
          const nextCooldown = Math.min((state.statusCooldownMs || MIN_REFRESH_MS) * 2, 5 * 60 * 1000);
          state.statusCooldownMs = Math.max(nextCooldown, MIN_REFRESH_MS);
          state.statusCooldownUntil = Date.now() + state.statusCooldownMs;
          state.statusClient = createStatusClient(state);
          throw err;
        }
      })().finally(() => {
        state.statusConnectPromise = null;
      });
    }
    try {
      await state.statusConnectPromise;
    } catch (err) {
      // status login failed; continue so command token can still operate
    }
  }

  if (allowServerCommands && !state.useSharedClient) {
    if (state.commandCooldownUntil <= now && !state.commandReady) {
      if (!state.commandClient) {
        state.commandClient = createCommandClient(state);
      }
      if (!state.commandConnectPromise) {
        state.commandConnectPromise = (async () => {
          const readyPromise = once(state.commandClient, 'ready');
          try {
            await state.commandClient.login(commandToken);
            await readyPromise;
          } catch (err) {
            readyPromise.catch(() => {});
            console.error(`discord command bot login failed for server ${serverId}`, err);
            state.commandReady = false;
            try {
              await state.commandClient.destroy();
            } catch (destroyErr) {
              console.error(`discord command bot destroy after login failure (server ${serverId})`, destroyErr);
            }
            const nextCooldown = Math.min((state.commandCooldownMs || MIN_REFRESH_MS) * 2, 5 * 60 * 1000);
            state.commandCooldownMs = Math.max(nextCooldown, MIN_REFRESH_MS);
            state.commandCooldownUntil = Date.now() + state.commandCooldownMs;
            state.commandClient = null;
            throw err;
          }
        })().finally(() => {
          state.commandConnectPromise = null;
        });
      }
      try {
        await state.commandConnectPromise;
      } catch (err) {
        // command login failure shouldn't stop status operations
      }
    }
  }

  try {
    const forceRefresh = !state.teamServers || state.teamServerCacheUntil < Date.now();
    await loadTeamServers(state, { force: forceRefresh });
  } catch (err) {
    console.error(`failed to refresh team context for server ${state.serverId}`, err);
  }

  return state;
}


async function ensureChannel(state) {
  if (!state?.statusReady) return null;
  if (!state.channelId) return null;
  if (state.channel && state.channel.id === state.channelId) {
    return state.channel;
  }

  try {
    const channel = await state.statusClient.channels.fetch(state.channelId);
    if (!channel?.isTextBased?.()) {
      console.error(`discord channel ${state.channelId} for server ${state.serverId} is not text-based`);
      state.channel = null;
      return null;
    }
    if (channel.guildId && state.guildId && channel.guildId !== state.guildId) {
      console.error(`discord channel ${state.channelId} guild mismatch for server ${state.serverId}`);
      state.channel = null;
      return null;
    }
    state.channel = channel;
    return channel;
  } catch (err) {
    console.error(`failed to fetch discord channel ${state.channelId} for server ${state.serverId}`, err);
    state.channel = null;
    return null;
  }
}

async function loadServerStatus(serverId, contextState = null) {
  let serverName = contextState?.teamServers?.get(serverId)?.name ?? `Server ${serverId}`;
  const hasCachedMetadata = contextState?.teamServers?.has(serverId);

  if (!hasCachedMetadata) {
    try {
      if (typeof db.getServer === 'function') {
        const server = await db.getServer(serverId);
        if (server?.name) {
          serverName = server.name;
        }
        if (contextState) {
          const teamIdRaw = server?.team_id ?? server?.teamId;
          const mapped = contextState.teamServers instanceof Map ? contextState.teamServers : new Map();
          mapped.set(serverId, {
            id: serverId,
            name: server?.name ?? serverName,
            teamId: Number.isFinite(Number(teamIdRaw)) ? Number(teamIdRaw) : contextState.teamId ?? null
          });
          contextState.teamServers = mapped;
          contextState.teamServerIds = new Set(mapped.keys());
        }
      }
    } catch (err) {
      console.error(`failed to load server metadata for ${serverId}`, err);
    }
  }

  let stats = null;
  try {
    if (typeof db.getLatestServerPlayerCount === 'function') {
      stats = await db.getLatestServerPlayerCount(serverId);
    }
  } catch (err) {
    console.error(`failed to load player counts for server ${serverId}`, err);
  }

  let players = 0;
  let maxPlayers = null;
  let queued = null;
  let sleepers = null;
  let joining = null;
  let fps = null;
  let recordedAt = null;
  let onlineFlag = null;

  if (stats) {
    const playerCount = Number(stats.player_count ?? stats.playerCount);
    if (Number.isFinite(playerCount) && playerCount >= 0) {
      players = playerCount;
    }
    const maxCount = Number(stats.max_players ?? stats.maxPlayers);
    if (Number.isFinite(maxCount) && maxCount > 0) {
      maxPlayers = maxCount;
    }
    const queuedCount = Number(stats.queued);
    if (Number.isFinite(queuedCount) && queuedCount >= 0) {
      queued = queuedCount;
    }
    const sleeperCount = Number(stats.sleepers);
    if (Number.isFinite(sleeperCount) && sleeperCount >= 0) {
      sleepers = sleeperCount;
    }
    const joiningCount = Number(stats.joining);
    if (Number.isFinite(joiningCount) && joiningCount >= 0) {
      joining = joiningCount;
    }
    const fpsValue = Number(stats.fps);
    if (Number.isFinite(fpsValue) && fpsValue >= 0) {
      fps = fpsValue;
    }
    recordedAt = parseDate(stats.recorded_at ?? stats.recordedAt);
    const onlineRaw = stats.online ?? stats.is_online ?? stats.onlineFlag;
    if (typeof onlineRaw === 'boolean') onlineFlag = onlineRaw;
    else if (onlineRaw != null) onlineFlag = Number(onlineRaw) !== 0;
  }

  const hasStats = stats != null;
  const isRecent = recordedAt ? (Date.now() - recordedAt.getTime()) <= staleThreshold : false;
  const stale = hasStats && !isRecent;
  const isOnline = hasStats && !stale && (onlineFlag == null ? true : Boolean(onlineFlag));

  return {
    serverId,
    serverName,
    players,
    maxPlayers,
    queued,
    sleepers,
    joining,
    fps,
    recordedAt,
    isOnline,
    stale,
    hasStats
  };
}

function formatPresence(status, config) {
  const cfg = config ?? DEFAULT_DISCORD_BOT_CONFIG;
  const statusKey = getStatusKey(status);
  const statuses = cfg.presenceStatuses ?? DEFAULT_DISCORD_BOT_CONFIG.presenceStatuses;
  const presenceStatus = statuses[statusKey] ?? DEFAULT_DISCORD_BOT_CONFIG.presenceStatuses[statusKey] ?? 'online';
  const context = buildPresenceContext(status, statusKey);
  const template = cfg.presenceTemplate ?? DEFAULT_DISCORD_BOT_CONFIG.presenceTemplate;
  const activity = renderPresenceTemplate(template, context);
  return {
    status: presenceStatus,
    activity
  };
}

function buildStatusEmbed(status, config) {
  const cfg = config ?? DEFAULT_DISCORD_BOT_CONFIG;
  const embed = new EmbedBuilder()
    .setTitle(status.serverName)
    .setTimestamp(status.recordedAt ?? new Date());

  if (!status.hasStats) {
    const colors = cfg?.colors ?? DEFAULT_DISCORD_BOT_CONFIG.colors;
    embed
      .setColor(colors.stale ?? STATUS_COLORS.stale)
      .setDescription('No recent status data has been recorded yet.');
    return embed;
  }

  const colors = cfg?.colors ?? DEFAULT_DISCORD_BOT_CONFIG.colors;
  const statusKey = getStatusKey(status);
  if (statusKey === 'stale') {
    embed
      .setColor(colors.stale ?? STATUS_COLORS.stale)
      .setDescription('⚠️ The latest data is stale; the server may be restarting.');
  } else if (statusKey === 'offline') {
    embed
      .setColor(colors.offline ?? STATUS_COLORS.offline)
      .setDescription('❌ The server appears to be offline or unreachable.');
  } else {
    embed
      .setColor(colors.online ?? STATUS_COLORS.online)
      .setDescription('✅ The server is online and reporting live data.');
  }

  const maxPart = Number.isFinite(status.maxPlayers) ? `${status.maxPlayers}` : 'unknown';
  embed.addFields({
    name: 'Players',
    value: `**${status.players}** / ${maxPart}`,
    inline: true
  });

  const fieldConfig = cfg?.fields ?? DEFAULT_DISCORD_BOT_CONFIG.fields;

  if (fieldConfig.joining && Number.isFinite(status.joining)) {
    embed.addFields({ name: 'Joining', value: formatCount(status.joining, '0'), inline: true });
  }

  if (fieldConfig.queued && Number.isFinite(status.queued)) {
    embed.addFields({ name: 'Queued', value: formatCount(status.queued, '0'), inline: true });
  }

  if (fieldConfig.sleepers && Number.isFinite(status.sleepers)) {
    embed.addFields({ name: 'Sleepers', value: formatCount(status.sleepers, '0'), inline: true });
  }

  if (fieldConfig.fps && Number.isFinite(status.fps)) {
    embed.addFields({ name: 'Server FPS', value: status.fps.toFixed(1), inline: true });
  }

  if (fieldConfig.lastUpdate && status.recordedAt) {
    embed.addFields({ name: 'Last Update', value: formatDiscordTimestamp(status.recordedAt, 'R'), inline: true });
  }

  return embed;
}

function embedKeyFromBuilder(embed) {
  try {
    return JSON.stringify(embed.toJSON());
  } catch (err) {
    console.error('failed to serialise status embed', err);
    return `${Date.now()}-${Math.random()}`;
  }
}

async function ensureStatusMessage(state, embed) {
  const channel = await ensureChannel(state);
  if (!channel) return;

  const embedKey = embedKeyFromBuilder(embed);
  if (state.lastStatusEmbedKey === embedKey && state.statusMessageId) {
    return;
  }

  let message = null;
  if (state.statusMessageId) {
    try {
      message = await withDiscordRetry(
        () => channel.messages.fetch(state.statusMessageId),
        {
          attempts: 4,
          delayMs: 1500,
          description: `fetch status message ${state.statusMessageId} for server ${state.serverId}`
        }
      );
    } catch (err) {
      if (err?.code !== 10008) {
        console.error(`failed to fetch status message ${state.statusMessageId} for server ${state.serverId}`, err);
      }
      state.statusMessageId = null;
      await persistIntegration(state);
    }
  }

  try {
    if (message) {
      await withDiscordRetry(
        () => message.edit({ embeds: [embed] }),
        {
          attempts: 4,
          delayMs: 1500,
          description: `edit status message ${state.statusMessageId} for server ${state.serverId}`
        }
      );
    } else {
      const sent = await withDiscordRetry(
        () => channel.send({ embeds: [embed] }),
        {
          attempts: 4,
          delayMs: 1500,
          description: `send status message for server ${state.serverId}`
        }
      );
      state.statusMessageId = sent.id;
      await persistIntegration(state);
    }
    state.lastStatusEmbedKey = embedKey;
  } catch (err) {
    console.error(`failed to update status embed for server ${state.serverId}`, err);
  }
}

function isRetryableDiscordError(err) {
  if (!err) return false;
  const retryableCodes = new Set(['EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT']);
  const code = typeof err.code === 'string' ? err.code : typeof err.errno === 'string' ? err.errno : null;
  if (code && retryableCodes.has(code)) {
    return true;
  }
  const message = typeof err.message === 'string' ? err.message : '';
  return retryableCodes.has('EAI_AGAIN') && message.includes('EAI_AGAIN');
}

async function withDiscordRetry(operation, { attempts = 3, delayMs = 1000, description = 'discord operation' } = {}) {
  let attempt = 0;
  let lastError = null;
  while (attempt < attempts) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      attempt += 1;
      if (!isRetryableDiscordError(err) || attempt >= attempts) {
        throw err;
      }
      const waitTime = Math.max(delayMs, 50);
      console.warn(
        `temporary failure attempting to ${description}; retrying (${attempt}/${attempts}) in ${waitTime}ms`,
        err
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      delayMs = Math.min(delayMs * 2, 10000);
    }
  }
  throw lastError;
}

async function updateBot(state, integration) {
  state.integration = integration;
  if (integration) {
    updateStateConfigFromIntegration(state, integration);
  }
  let status;
  try {
    status = await loadServerStatus(state.serverId, state);
  } catch (err) {
    console.error(`failed to load status for server ${state.serverId}`, err);
    return;
  }

  const config = getStateConfig(state);
  const presence = formatPresence(status, config);
  const presenceKey = `${presence.status}|${presence.activity}`;

  if (state.statusClient?.user && state.lastPresenceKey !== presenceKey) {
    try {
      await state.statusClient.user.setPresence({
        status: presence.status,
        activities: [{ name: presence.activity, type: ActivityType.Watching }]
      });
      state.lastPresenceKey = presenceKey;
    } catch (err) {
      console.error(`failed to update presence for server ${state.serverId}`, err);
    }
  }

  const embed = buildStatusEmbed(status, config);
  await ensureStatusMessage(state, embed);
}

function requireManageGuild(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

function requireManageChannels(interaction) {
  if (!interaction?.memberPermissions) return false;
  if (interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
    return true;
  }
  return requireManageGuild(interaction);
}

function buildLookupListEntry(row) {
  const displayName = row.forced_display_name ?? row.forcedDisplayName ?? row.display_name ?? row.displayName ?? row.persona ?? row.steamid;
  const safeName = escapeMarkdown(displayName || 'Unknown player');
  const profileUrl = row.profileurl ?? row.profileUrl;
  const namePart = profileUrl ? `[${safeName}](${profileUrl})` : `**${safeName}**`;
  const lastSeen = parseDate(row.last_seen ?? row.lastSeen);
  const lastSeenText = lastSeen ? formatDiscordTimestamp(lastSeen, 'R') : 'unknown';
  const extras = [];
  if (row.country) extras.push(`Country: ${String(row.country).toUpperCase()}`);
  const vacBanned = row.vac_banned ?? row.vacBanned;
  if (vacBanned != null) extras.push(`VAC: ${Number(vacBanned) ? 'banned' : 'clean'}`);
  const gameBans = Number(row.game_bans ?? row.gameBans);
  if (Number.isFinite(gameBans) && gameBans > 0) extras.push(`${gameBans} game bans`);
  const serverName = row.server_name ?? row.serverName;
  const serverId = Number(row.server_id ?? row.serverId);
  let serverSuffix = '';
  if (serverName || Number.isFinite(serverId)) {
    const label = serverName ? escapeMarkdown(serverName) : `Server ${serverId}`;
    const idSuffix = Number.isFinite(serverId) ? ` (#${serverId})` : '';
    serverSuffix = ` • Server: ${label}${idSuffix}`;
  }
  return `${namePart} • \`${row.steamid}\`\nLast seen ${lastSeenText}${extras.length ? ` • ${extras.join(' • ')}` : ''}${serverSuffix}`;
}

function buildDetailedPlayerEmbed(row) {
  const displayName = row.forced_display_name ?? row.forcedDisplayName ?? row.display_name ?? row.displayName ?? row.persona ?? row.steamid;
  const safeName = escapeMarkdown(displayName || 'Unknown player');
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(safeName);

  const profileUrl = row.profileurl ?? row.profileUrl;
  if (profileUrl) embed.setURL(profileUrl);
  if (row.avatar) embed.setThumbnail(row.avatar);

  if (row.persona && row.persona !== displayName) {
    embed.setDescription(`Persona: ${escapeMarkdown(row.persona)}`);
  }

  embed.addFields({ name: 'SteamID', value: `\`${row.steamid}\``, inline: true });

  const serverName = row.server_name ?? row.serverName;
  const serverId = Number(row.server_id ?? row.serverId);
  if (serverName || Number.isFinite(serverId)) {
    const label = serverName ? escapeMarkdown(serverName) : `Server ${serverId}`;
    const value = Number.isFinite(serverId) ? `${label} (#${serverId})` : label;
    embed.addFields({ name: 'Server', value, inline: true });
  }

  const lastSeen = parseDate(row.last_seen ?? row.lastSeen);
  if (lastSeen) embed.addFields({ name: 'Last Seen', value: formatDiscordTimestamp(lastSeen, 'R'), inline: true });

  const firstSeen = parseDate(row.first_seen ?? row.firstSeen);
  if (firstSeen) embed.addFields({ name: 'First Seen', value: formatDiscordTimestamp(firstSeen, 'R'), inline: true });

  if (row.country) embed.addFields({ name: 'Country', value: String(row.country).toUpperCase(), inline: true });

  const vacBanned = row.vac_banned ?? row.vacBanned;
  if (vacBanned != null) {
    embed.addFields({ name: 'VAC Banned', value: Number(vacBanned) ? 'Yes' : 'No', inline: true });
  }

  const gameBans = Number(row.game_bans ?? row.gameBans);
  if (Number.isFinite(gameBans)) {
    embed.addFields({ name: 'Game Bans', value: String(gameBans), inline: true });
  }

  const playtimeMinutes = Number(row.rust_playtime_minutes ?? row.rustPlaytimeMinutes);
  if (Number.isFinite(playtimeMinutes) && playtimeMinutes > 0) {
    const hours = Math.round(playtimeMinutes / 60);
    embed.addFields({ name: 'Rust Playtime', value: `${hours}h (${playtimeMinutes}m)`, inline: true });
  }

  const lastIp = row.last_ip ?? row.lastIp;
  if (lastIp) embed.addFields({ name: 'Last IP', value: `\`${lastIp}\``, inline: true });

  const lastPort = row.last_port ?? row.lastPort;
  if (lastPort) embed.addFields({ name: 'Last Port', value: formatCount(lastPort), inline: true });

  if (row.note) {
    embed.setFooter({ text: row.note });
  }

  return embed;
}

function collectHelpServerSummaries({ state = null, teamState = null, guildId = null } = {}) {
  const entries = new Map();

  const recordServer = (serverState) => {
    if (!serverState) return;
    const primaryId = Number(serverState.serverId);
    if (Number.isFinite(primaryId) && !entries.has(primaryId)) {
      let name = null;
      if (serverState.serverName) {
        name = serverState.serverName;
      } else if (serverState.teamServers instanceof Map && serverState.teamServers.has(primaryId)) {
        name = serverState.teamServers.get(primaryId)?.name ?? null;
      }
      entries.set(primaryId, name);
    }

    if (serverState.teamServers instanceof Map) {
      for (const [rawId, info] of serverState.teamServers.entries()) {
        const numericId = Number(rawId);
        if (!Number.isFinite(numericId) || entries.has(numericId)) continue;
        entries.set(numericId, info?.name ?? null);
      }
    }
  };

  if (teamState) {
    if (guildId && teamState.guildServers instanceof Map) {
      const guildStates = teamState.guildServers.get(guildId);
      if (guildStates && guildStates.size) {
        for (const guildState of guildStates) {
          recordServer(guildState);
        }
      }
    }

    if (entries.size === 0 && teamState.serverStates instanceof Map) {
      for (const guildState of teamState.serverStates.values()) {
        recordServer(guildState);
      }
    }
  }

  if (state) {
    recordServer(state);
  }

  const servers = Array.from(entries.entries()).map(([id, name]) => ({
    id,
    name: name ?? `Server ${id}`
  }));

  servers.sort((a, b) => a.id - b.id);
  return servers;
}

async function handleHelpCommand(interaction, { state = null, teamState = null } = {}) {
  const description = [
    'Use these commands to manage your Rust servers and support tickets:',
    '',
    '• `/ruststatus status` — Show the latest status snapshot.',
    '• `/ruststatus listservers` — List the Rust servers linked to this team.',
    '• `/ruststatus refresh` — Force an immediate status refresh in the configured channel.',
    '• `/ruststatus config` — Adjust embed fields, colours, and the presence template.',
    '',
    '• `/rustlookup player <query>` — Search for player records by name or SteamID.',
    '• `/rustlookup steamid <id>` — Retrieve the detailed record for a specific SteamID64.',
    '',
    '• `/auth link` — Generate a private link to connect your Discord and Steam accounts.',
    '• `/auth status` — Show whether linking is enabled and which role is granted.',
    '• `/auth enable` or `/auth disable` — Toggle linking (Manage Server/Roles required).',
    '• `/auth setrole` — Choose the Discord role granted after successful linking.',
    '',
    '• `/ticket open` — Open a support ticket for the staff team.',
    '• `/ticket close` — Close a ticket channel, log it, and remove it.',
    '• `/ticket panel` — Post or update the interactive ticket panel.',
    '• `/ticket config` — Configure ticket categories, logging, staff roles, and messages.',
    '',
    'Most commands accept a **server** option when multiple servers are linked. Run `/ruststatus listservers` to see the available IDs.'
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Rust Control Panel Bot Help')
    .setDescription(description);

  const servers = collectHelpServerSummaries({ state, teamState, guildId: interaction.guildId });
  if (servers.length) {
    const lines = servers
      .map((server) => {
        const label = escapeMarkdown(server.name ?? `Server ${server.id}`);
        return `• **${label}** — ID \`${server.id}\``;
      })
      .join('\n');
    embed.addFields({ name: 'Linked servers', value: lines });
  }

  const payload = { embeds: [embed], flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply(payload);
  }
}

async function handleRustStatusCommand(state, interaction) {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (!group && sub === 'status') {
    const status = await loadServerStatus(state.serverId, state);
    const embed = buildStatusEmbed(status, getStateConfig(state));
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (!group && sub === 'listservers') {
    try {
      await loadTeamServers(state, { force: !state.teamServers || state.teamServerCacheUntil < Date.now() });
    } catch (err) {
      console.error(`failed to load team servers for server ${state.serverId}`, err);
    }
    const servers = Array.from(state.teamServers?.values() ?? []);
    if (!servers.length) {
      await interaction.reply({
        content: 'No additional servers are assigned to this team yet.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const lines = servers
      .map((server) => `• **${escapeMarkdown(server.name ?? `Server ${server.id}`)}** — ID \`${server.id}\``)
      .join('\n');
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Team servers')
      .setDescription(lines.slice(0, 4000));
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (!group && sub === 'server') {
    const requestedId = interaction.options.getInteger('id', true);
    const serverId = Number(requestedId);
    if (!Number.isFinite(serverId) || serverId <= 0) {
      await interaction.reply({
        content: 'Please select a valid server.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      await loadTeamServers(state, { force: !state.teamServers || state.teamServerCacheUntil < Date.now() });
    } catch (err) {
      console.error(`failed to refresh team servers for server ${state.serverId}`, err);
    }

    if (!state.teamServerIds?.has(serverId)) {
      await interaction.reply({
        content: 'That server is not assigned to this team.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const status = await loadServerStatus(serverId, state);
    const embed = buildStatusEmbed(status, getStateConfig(state));
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (group === 'config') {
    if (!requireManageGuild(interaction)) {
      await interaction.reply({
        content: 'You need the **Manage Server** permission to use this configuration command.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    await handleRustStatusConfigCommand(state, interaction, sub);
    return;
  }

  if (!requireManageGuild(interaction)) {
    await interaction.reply({
      content: 'You need the **Manage Server** permission to use this subcommand.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  if (sub === 'setchannel') {
    const requested = interaction.options.getChannel('channel', false);
    const channel = requested ?? interaction.channel;
    if (!channel?.isTextBased?.()) {
      await interaction.editReply('The selected channel is not text-based.');
      return;
    }
    if (channel.guildId && channel.guildId !== state.guildId) {
      await interaction.editReply('That channel belongs to a different guild.');
      return;
    }

    state.channelId = channel.id;
    state.channel = channel;
    state.statusMessageId = null;
    state.lastStatusEmbedKey = null;
    await persistIntegration(state);
    await updateBot(state, state.integration);

    await interaction.editReply(`Status updates will now be posted in ${channel}.`);
    return;
  }

  if (sub === 'refresh') {
    state.lastStatusEmbedKey = null;
    await updateBot(state, state.integration);
    await interaction.editReply('Triggered a manual refresh.');
    return;
  }

  await interaction.editReply('Unknown subcommand.');
}

async function handleAuthCommand(state, interaction) {
  const rawTeamId = state?.teamId;
  const numericTeamId = rawTeamId == null ? Number.NaN : Number(rawTeamId);
  const teamId = Number.isFinite(numericTeamId) && numericTeamId > 0
    ? Math.trunc(numericTeamId)
    : null;
  const supported =
    teamId != null &&
    typeof db.createTeamAuthRequest === 'function' &&
    typeof db.getTeamAuthSettings === 'function';
  if (!supported) {
    const message = 'Account linking is not available right now. Ask a server admin to configure the control panel.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message);
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (!interaction.deferred && typeof interaction.deferReply === 'function') {
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (err) {
      console.error('failed to defer auth interaction', err);
      if (!interaction.replied) {
        try {
          await interaction.reply({
            content: 'Something went wrong before the command could start. Please try again.',
            flags: MessageFlags.Ephemeral
          });
        } catch (replyErr) {
          console.error('failed to reply after auth defer failure', replyErr);
        }
      }
      return;
    }
  }

  const sub = typeof interaction.options?.getSubcommand === 'function'
    ? interaction.options.getSubcommand()
    : null;
  const settings = await loadTeamAuthSettings(teamId);
  const hasManagePermission = Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)
  );

  const ttlMinutes = Math.max(1, Math.round(TEAM_AUTH_LINK_TTL_MS / 60000));
  const ttlLabel = ttlMinutes === 1 ? '1 minute' : `${ttlMinutes} minutes`;

  try {
    if (sub === 'status') {
      const lines = [
        `Status: ${settings.enabled ? '✅ Enabled' : '❌ Disabled'}`,
        `Role: ${settings.roleId ? `<@&${settings.roleId}>` : 'Not configured'}`
      ];
      if (!settings.enabled) {
        lines.push('Use `/auth enable` if you have Manage Server or Manage Roles permissions to turn it on.');
      }
      await interaction.editReply(lines.join('\n'));
      return;
    }

    if (sub === 'enable') {
      if (!hasManagePermission) {
        await interaction.editReply('You need the **Manage Server** or **Manage Roles** permission to enable account linking.');
        return;
      }
      if (typeof db.setTeamAuthSettings !== 'function') {
        await interaction.editReply('Updating auth settings is not supported by the current database driver.');
        return;
      }
      await saveTeamAuthSettings(teamId, { enabled: true });
      const refreshed = await loadTeamAuthSettings(teamId);
      const roleNotice = refreshed.roleId
        ? `Linked players will receive <@&${refreshed.roleId}> after completing the flow.`
        : 'No role is configured yet. Use `/auth setrole` if you want to grant one automatically.';
      await interaction.editReply(
        `Discord/Steam account linking is now **enabled** for this control panel. ${roleNotice}`
      );
      return;
    }

    if (sub === 'disable') {
      if (!hasManagePermission) {
        await interaction.editReply('You need the **Manage Server** or **Manage Roles** permission to disable account linking.');
        return;
      }
      if (typeof db.setTeamAuthSettings !== 'function') {
        await interaction.editReply('Updating auth settings is not supported by the current database driver.');
        return;
      }
      await saveTeamAuthSettings(teamId, { enabled: false });
      await interaction.editReply('Discord/Steam account linking has been disabled. Existing links remain valid, but new profiles cannot be created until it is re-enabled.');
      return;
    }

    if (sub === 'setrole') {
      if (!hasManagePermission) {
        await interaction.editReply('You need the **Manage Server** or **Manage Roles** permission to update the granted role.');
        return;
      }
      if (typeof db.setTeamAuthSettings !== 'function') {
        await interaction.editReply('Updating auth settings is not supported by the current database driver.');
        return;
      }
      let selectedRole = null;
      if (typeof interaction.options?.getRole === 'function') {
        selectedRole = interaction.options.getRole('role', false);
      }
      if (selectedRole && interaction.guildId && selectedRole.guild && selectedRole.guild.id !== interaction.guildId) {
        await interaction.editReply('Please choose a role from this Discord server.');
        return;
      }
      const roleId = selectedRole?.id ? String(selectedRole.id) : null;
      await saveTeamAuthSettings(teamId, { roleId });
      if (roleId) {
        await interaction.editReply(`Linked players will now receive ${formatRoleMention(roleId, 'the selected role')}.`);
      } else {
        await interaction.editReply('Linked players will no longer receive a Discord role automatically.');
      }
      return;
    }

    if (sub === 'link') {
      if (!settings.enabled) {
        await interaction.editReply('Account linking is currently disabled. Ask a server admin to enable it with `/auth enable`.');
        return;
      }
      const discordId = sanitizeId(interaction.user?.id);
      if (!discordId) {
        await interaction.editReply('Unable to determine your Discord ID. Please try again from within the server.');
        return;
      }
      const displayName = interaction.user?.tag || interaction.user?.username || discordId;
      const token = generateTeamAuthToken();
      const expiresAt = new Date(Date.now() + TEAM_AUTH_LINK_TTL_MS);
      let record;
      try {
        record = await db.createTeamAuthRequest({
          team_id: teamId,
          requested_by_user_id: null,
          discord_id: discordId,
          discord_username: displayName,
          state_token: token,
          expires_at: expiresAt.toISOString()
        });
      } catch (err) {
        console.error('failed to create team auth request from discord command', err);
        await interaction.editReply('Something went wrong while creating your link. Please try again in a moment.');
        return;
      }
      const linkToken = record?.state_token || token;
      const link = buildTeamAuthLink(linkToken);
      if (!link) {
        await interaction.editReply('Failed to build an auth link. Please let the staff team know.');
        return;
      }
      const expiresStamp = `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`;
      // Share a one-time link that pairs this Discord account with a Steam profile for alt-account tracking.
      const response = [
        'Use the link below to connect your Discord and Steam accounts so staff can identify alternate accounts and build your player profile:',
        link,
        `This link expires ${expiresStamp} (about ${ttlLabel}).`
      ];
      if (settings.roleId) {
        response.push(`You will receive ${formatRoleMention(settings.roleId, 'the configured role')} after you finish.`);
      }
      response.push('Do **not** share this link with anyone else.');
      await interaction.editReply(response.join('\n'));
      return;
    }

    await interaction.editReply('Unknown subcommand.');
  } catch (err) {
    console.error('failed to handle auth command', err);
    try {
      await interaction.editReply('An unexpected error occurred while handling the command.');
    } catch (replyErr) {
      console.error('failed to send error reply for auth command', replyErr);
    }
  }
}

function buildConfigSummaryEmbed(state) {
  const config = getStateConfig(state);
  const templateDisplay = escapeMarkdown(config.presenceTemplate).slice(0, 900);
  const statuses = config.presenceStatuses ?? DEFAULT_DISCORD_BOT_CONFIG.presenceStatuses;
  const colors = config.colors ?? DEFAULT_DISCORD_BOT_CONFIG.colors;
  const fields = config.fields ?? DEFAULT_DISCORD_BOT_CONFIG.fields;

  const statusLines = [
    `Online: **${statuses.online}**`,
    `Offline: **${statuses.offline}**`,
    `Stale: **${statuses.stale}**`,
    `Waiting: **${statuses.waiting}**`
  ].join('\n');

  const colorLines = [
    `Online: ${formatColorHex(colors.online)}`,
    `Offline: ${formatColorHex(colors.offline)}`,
    `Stale: ${formatColorHex(colors.stale)}`
  ].join('\n');

  const fieldLines = CONFIG_FIELD_CHOICES
    .map((choice) => {
      const enabled = Boolean(fields?.[choice.value]);
      return `${choice.name}: ${enabled ? '✅ Enabled' : '❌ Disabled'}`;
    })
    .join('\n');

  const ticketing = config.ticketing ?? DEFAULT_TICKETING_CONFIG;
  const ticketLines = [
    `Status: ${ticketing.enabled ? '✅ Enabled' : '❌ Disabled'}`,
    `Category: ${formatChannelMention(ticketing.categoryId)}`,
    `Log channel: ${formatChannelMention(ticketing.logChannelId)}`,
    `Staff role: ${formatRoleMention(ticketing.staffRoleId)}`,
    `Ping staff: ${ticketing.pingStaffOnOpen ? 'Enabled' : 'Disabled'}`,
    `Panel channel: ${formatChannelMention(ticketing.panelChannelId)}`,
    `Panel message ID: ${ticketing.panelMessageId ? `\`${ticketing.panelMessageId}\`` : 'Not set'}`
  ].join('\n');

  const welcomePreview = escapeMarkdown(ticketing.welcomeMessage).slice(0, 900);
  const promptPreview = escapeMarkdown(ticketing.questionPrompt).slice(0, 900);
  const panelTitlePreview = escapeMarkdown(ticketing.panelTitle).slice(0, 900);
  const panelDescriptionPreview = escapeMarkdown(ticketing.panelDescription).slice(0, 900);
  const panelButtonLabelPreview = escapeMarkdown(ticketing.panelButtonLabel).slice(0, 100);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Discord bot configuration')
    .addFields({ name: 'Presence template', value: `\`\`\`\n${templateDisplay}\n\`\`\``, inline: false })
    .addFields({ name: 'Presence statuses', value: statusLines, inline: true })
    .addFields({ name: 'Embed colours', value: colorLines, inline: true })
    .addFields({ name: 'Status fields', value: fieldLines, inline: false })
    .addFields({ name: 'Ticketing', value: ticketLines, inline: false })
    .addFields({ name: 'Ticket welcome message', value: `\`\`\`\n${welcomePreview}\n\`\`\``, inline: false })
    .addFields({ name: 'Ticket prompt', value: `\`\`\`\n${promptPreview}\n\`\`\``, inline: false })
    .addFields({ name: 'Ticket panel title', value: `\`\`\`\n${panelTitlePreview}\n\`\`\``, inline: false })
    .addFields({ name: 'Ticket panel description', value: `\`\`\`\n${panelDescriptionPreview}\n\`\`\``, inline: false })
    .addFields({ name: 'Ticket panel button label', value: `\`${panelButtonLabelPreview}\``, inline: true })
    .setFooter({ text: `Available tokens: ${describePresenceTemplateUsage()}` });

  return embed;
}

async function handleRustStatusConfigCommand(state, interaction, sub) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  if (sub === 'show') {
    const embed = buildConfigSummaryEmbed(state);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (sub === 'setpresence') {
    const reset = interaction.options.getBoolean('reset', false);
    const templateInput = interaction.options.getString('template', false);
    if (!reset && (!templateInput || !templateInput.trim())) {
      await interaction.editReply('Provide a template or enable the reset option.');
      return;
    }

    const next = cloneStateConfig(state);
    if (reset) {
      next.presenceTemplate = DEFAULT_DISCORD_BOT_CONFIG.presenceTemplate;
    } else {
      next.presenceTemplate = templateInput.trim().slice(0, 190);
    }

    setStateConfig(state, next);
    await persistIntegration(state);
    await updateBot(state, state.integration);

    const previewStatus = await loadServerStatus(state.serverId, state).catch(() => null);
    let previewText = '';
    if (previewStatus) {
      const presence = formatPresence(previewStatus, getStateConfig(state));
      previewText = `\nPreview: \`${escapeMarkdown(presence.activity).slice(0, 90)}\``;
    }

    await interaction.editReply(`Updated the presence template.${previewText}`);
    return;
  }

  if (sub === 'setcolors') {
    const reset = interaction.options.getBoolean('reset', false);
    const onlineRaw = interaction.options.getString('online', false);
    const offlineRaw = interaction.options.getString('offline', false);
    const staleRaw = interaction.options.getString('stale', false);

    if (!reset && !onlineRaw && !offlineRaw && !staleRaw) {
      await interaction.editReply('Provide at least one colour or enable the reset option.');
      return;
    }

    const next = cloneStateConfig(state);
    if (reset) {
      next.colors = { ...DEFAULT_DISCORD_BOT_CONFIG.colors };
    } else {
      if (onlineRaw) {
        const parsed = parseColorString(onlineRaw);
        if (parsed == null) {
          await interaction.editReply('Invalid colour value for the online state. Use hex such as `#57F287`.');
          return;
        }
        next.colors.online = parsed;
      }
      if (offlineRaw) {
        const parsed = parseColorString(offlineRaw);
        if (parsed == null) {
          await interaction.editReply('Invalid colour value for the offline state. Use hex such as `#ED4245`.');
          return;
        }
        next.colors.offline = parsed;
      }
      if (staleRaw) {
        const parsed = parseColorString(staleRaw);
        if (parsed == null) {
          await interaction.editReply('Invalid colour value for the stale state. Use hex such as `#FEE75C`.');
          return;
        }
        next.colors.stale = parsed;
      }
    }

    setStateConfig(state, next);
    await persistIntegration(state);
    await updateBot(state, state.integration);

    const updated = getStateConfig(state).colors;
    await interaction.editReply(
      `Updated embed colours: online ${formatColorHex(updated.online)}, offline ${formatColorHex(updated.offline)}, stale ${formatColorHex(updated.stale)}.`
    );
    return;
  }

  if (sub === 'toggle') {
    const fieldKey = interaction.options.getString('field', true);
    const enabled = interaction.options.getBoolean('enabled', true);
    const choice = CONFIG_FIELD_CHOICES.find((opt) => opt.value === fieldKey);
    if (!choice) {
      await interaction.editReply('Unknown field selection.');
      return;
    }

    const next = cloneStateConfig(state);
    next.fields[fieldKey] = Boolean(enabled);
    setStateConfig(state, next);
    await persistIntegration(state);
    await updateBot(state, state.integration);

    await interaction.editReply(`${choice.name} is now ${enabled ? 'enabled' : 'disabled'}.`);
    return;
  }

  if (sub === 'reset') {
    setStateConfig(state, DEFAULT_DISCORD_BOT_CONFIG);
    await persistIntegration(state);
    await updateBot(state, state.integration);
    await interaction.editReply('Reset the Discord bot configuration to defaults.');
    return;
  }

  await interaction.editReply('Unknown configuration subcommand.');
}

async function handleTicketConfigCommand(state, interaction, sub) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  if (sub === 'show') {
    const embed = buildConfigSummaryEmbed(state);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (sub === 'toggle') {
    const enabled = Boolean(interaction.options.getBoolean('enabled', true));
    const config = updateTicketConfig(state, (ticket) => {
      ticket.enabled = enabled;
      return ticket;
    });
    await persistIntegration(state);
    await interaction.editReply(`Ticketing is now ${config.enabled ? 'enabled' : 'disabled'}.`);
    return;
  }

  if (sub === 'setcategory') {
    const category = interaction.options.getChannel('category', true);
    if (!category || category.type !== ChannelType.GuildCategory) {
      await interaction.editReply('Please choose a category channel.');
      return;
    }
    if (category.guildId && category.guildId !== state.guildId) {
      await interaction.editReply('That category belongs to a different guild.');
      return;
    }
    updateTicketConfig(state, (ticket) => {
      ticket.categoryId = category.id;
      return ticket;
    });
    await persistIntegration(state);
    await interaction.editReply(`New tickets will now be created in ${category}.`);
    return;
  }

  if (sub === 'setlog') {
    const logChannel = interaction.options.getChannel('channel', false);
    if (logChannel) {
      if (!logChannel.isTextBased?.()) {
        await interaction.editReply('The log channel must be text-based.');
        return;
      }
      if (logChannel.guildId && logChannel.guildId !== state.guildId) {
        await interaction.editReply('That channel belongs to a different guild.');
        return;
      }
    }
    updateTicketConfig(state, (ticket) => {
      ticket.logChannelId = logChannel ? logChannel.id : null;
      return ticket;
    });
    await persistIntegration(state);
    await interaction.editReply(logChannel ? `Ticket logs will be posted in ${logChannel}.` : 'Ticket log channel cleared.');
    return;
  }

  if (sub === 'setstaff') {
    const role = interaction.options.getRole('role', false);
    if (role && role.guild && role.guild.id !== state.guildId) {
      await interaction.editReply('That role belongs to a different guild.');
      return;
    }
    updateTicketConfig(state, (ticket) => {
      ticket.staffRoleId = role ? role.id : null;
      return ticket;
    });
    await persistIntegration(state);
    await interaction.editReply(role ? `Staff role set to ${role}.` : 'Staff role cleared.');
    return;
  }

  if (sub === 'setwelcome') {
    const reset = interaction.options.getBoolean('reset', false);
    const messageRaw = interaction.options.getString('message', false);
    if (!reset && (!messageRaw || !messageRaw.trim())) {
      await interaction.editReply('Provide a message or enable the reset option.');
      return;
    }
    const message = reset
      ? DEFAULT_TICKETING_CONFIG.welcomeMessage
      : sanitizeTicketText(messageRaw, DEFAULT_TICKETING_CONFIG.welcomeMessage);
    updateTicketConfig(state, (ticket) => {
      ticket.welcomeMessage = message;
      return ticket;
    });
    await persistIntegration(state);
    await interaction.editReply(reset ? 'Welcome message reset to default.' : 'Updated the welcome message for new tickets.');
    return;
  }

  if (sub === 'setprompt') {
    const reset = interaction.options.getBoolean('reset', false);
    const messageRaw = interaction.options.getString('message', false);
    if (!reset && (!messageRaw || !messageRaw.trim())) {
      await interaction.editReply('Provide a message or enable the reset option.');
      return;
    }
    const message = reset
      ? DEFAULT_TICKETING_CONFIG.questionPrompt
      : sanitizeTicketText(messageRaw, DEFAULT_TICKETING_CONFIG.questionPrompt);
    updateTicketConfig(state, (ticket) => {
      ticket.questionPrompt = message;
      return ticket;
    });
    await persistIntegration(state);
    await interaction.editReply(reset ? 'Prompt reset to default.' : 'Updated the prompt shown to users.');
    return;
  }

  if (sub === 'setping') {
    const enabled = Boolean(interaction.options.getBoolean('enabled', true));
    updateTicketConfig(state, (ticket) => {
      ticket.pingStaffOnOpen = enabled;
      return ticket;
    });
    await persistIntegration(state);
    await interaction.editReply(`Staff ping on new tickets is now ${enabled ? 'enabled' : 'disabled'}.`);
    return;
  }

  await interaction.editReply('Unknown ticket configuration subcommand.');
}

function resolveTicketServerId(state, requestedServerId) {
  if (!Number.isFinite(Number(requestedServerId))) {
    return null;
  }
  const numeric = Number(requestedServerId);
  if (state.teamServerIds?.has(numeric)) {
    return numeric;
  }
  if (state.serverId === numeric) {
    return numeric;
  }
  return null;
}

function getServerDisplay(state, serverId) {
  const meta = state.teamServers instanceof Map ? state.teamServers.get(serverId) : null;
  const teamId = Number.isFinite(Number(meta?.teamId))
    ? Number(meta.teamId)
    : (Number.isFinite(state.teamId) ? state.teamId : null);
  if (meta?.name) {
    return { id: serverId, name: meta.name, teamId };
  }
  return { id: serverId, name: `Server ${serverId}`, teamId };
}

async function createTicketForInteraction(state, interaction, { subject, details, requestedServerId }) {
  const config = getTicketConfig(state);
  if (!config.enabled) {
    return { ok: false, message: 'The ticket system is currently disabled.' };
  }

  try {
    await loadTeamServers(state, { force: !state.teamServers || state.teamServerCacheUntil < Date.now() });
  } catch (err) {
    console.error(`failed to refresh team context before opening ticket for server ${state.serverId}`, err);
  }

  const guild = interaction.guild ?? (state.commandClient ? await state.commandClient.guilds.fetch(state.guildId) : null);
  if (!guild) {
    return { ok: false, message: 'This command can only be used in a guild channel.' };
  }

  if (!config.categoryId) {
    return { ok: false, message: 'No ticket category is configured yet. Ask a server manager to run `/ticket config setcategory`.' };
  }

  const desiredServerId = requestedServerId != null ? resolveTicketServerId(state, requestedServerId) : state.serverId;
  if (requestedServerId != null && desiredServerId == null) {
    return { ok: false, message: 'That server is not assigned to this team.' };
  }

  const targetServerId = desiredServerId ?? state.serverId;
  const serverInfo = getServerDisplay(state, targetServerId);

  let category = null;
  try {
    category = await guild.channels.fetch(config.categoryId);
  } catch (err) {
    console.error(`failed to fetch ticket category ${config.categoryId}`, err);
  }
  if (!category || category.type !== ChannelType.GuildCategory) {
    return { ok: false, message: 'The configured ticket category no longer exists.' };
  }

  let ticketNumber = null;
  if (typeof db.getNextDiscordTicketNumber === 'function') {
    try {
      ticketNumber = await db.getNextDiscordTicketNumber(state.guildId);
    } catch (err) {
      console.error('failed to fetch next ticket number', err);
    }
  }
  if (!Number.isFinite(ticketNumber) || ticketNumber <= 0) {
    ticketNumber = Math.max(1, Math.floor(Date.now() / 1000));
  }

  const cleanSubject = sanitizeTicketText(subject, 'Ticket request').slice(0, 120);
  const cleanDetails = sanitizeTicketText(details, '');

  const baseSlug = cleanSubject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  const serverSlug = `s${targetServerId}`;
  const channelName = [
    `ticket-${ticketNumber}`,
    serverSlug,
    baseSlug
  ]
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .slice(0, 90);

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

  if (config.staffRoleId) {
    overwrites.push({
      id: config.staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  const botUserId = state.commandClient?.user?.id ?? state.statusClient?.user?.id ?? null;
  if (botUserId) {
    overwrites.push({
      id: botUserId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: overwrites,
      topic: `Ticket #${ticketNumber} for ${interaction.user.tag ?? interaction.user.username} • ${serverInfo.name}`
    });
  } catch (err) {
    console.error(`failed to create ticket channel for server ${state.serverId}`, err);
    return { ok: false, message: 'Failed to create the ticket channel. Please contact a server manager.' };
  }

  const now = new Date();
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Ticket #${ticketNumber}: ${escapeMarkdown(cleanSubject).slice(0, 240)}`)
    .addFields({ name: 'Opened by', value: `<@${interaction.user.id}>`, inline: true })
    .addFields({ name: 'Server', value: `${escapeMarkdown(serverInfo.name)} (ID ${serverInfo.id})`, inline: true })
    .addFields({ name: 'Opened at', value: formatDiscordTimestamp(now, 'R'), inline: true })
    .setTimestamp(now);

  if (cleanDetails) {
    embed.addFields({ name: 'Details', value: escapeMarkdown(cleanDetails).slice(0, 1000), inline: false });
  }

  const mentionParts = [`<@${interaction.user.id}>`];
  const allowedMentions = {
    users: [interaction.user.id],
    roles: [],
    repliedUser: false
  };

  if (config.staffRoleId && config.pingStaffOnOpen) {
    mentionParts.push(`<@&${config.staffRoleId}>`);
    allowedMentions.roles.push(config.staffRoleId);
  }

  try {
    await ticketChannel.send({
      content: mentionParts.join(' '),
      embeds: [embed],
      allowedMentions
    });
  } catch (err) {
    console.error(`failed to send ticket announcement for server ${state.serverId}`, err);
  }

  const prompt = sanitizeTicketText(config.questionPrompt, DEFAULT_TICKETING_CONFIG.questionPrompt);
  const welcome = sanitizeTicketText(config.welcomeMessage, DEFAULT_TICKETING_CONFIG.welcomeMessage);

  for (const message of [prompt, welcome]) {
    if (!message) continue;
    try {
      await ticketChannel.send({ content: message });
    } catch (err) {
      console.error(`failed to send ticket helper message for server ${state.serverId}`, err);
      break;
    }
  }

  let ticketRecord = null;
  if (typeof db.createDiscordTicket === 'function') {
    try {
      ticketRecord = await db.createDiscordTicket({
        server_id: targetServerId,
        team_id: serverInfo.teamId ?? state.teamId ?? null,
        guild_id: state.guildId,
        channel_id: ticketChannel.id,
        ticket_number: ticketNumber,
        subject: cleanSubject,
        details: cleanDetails,
        created_by: interaction.user.id,
        created_by_tag: interaction.user.tag ?? interaction.user.username
      });
    } catch (err) {
      console.error(`failed to persist ticket for server ${state.serverId}`, err);
    }
  }

  if (config.logChannelId) {
    try {
      const logChannel = await guild.channels.fetch(config.logChannelId);
      if (logChannel?.isTextBased?.()) {
        const logEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`Ticket opened (#${ticketRecord?.ticket_number ?? ticketNumber})`)
          .setDescription(`Subject: **${escapeMarkdown(cleanSubject)}**`)
          .addFields(
            { name: 'Channel', value: `<#${ticketChannel.id}>`, inline: true },
            { name: 'Opened by', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Server', value: `${escapeMarkdown(serverInfo.name)} (ID ${serverInfo.id})`, inline: true }
          )
          .setTimestamp(now);
        if (cleanDetails) {
          logEmbed.addFields({ name: 'Details', value: escapeMarkdown(cleanDetails).slice(0, 1000), inline: false });
        }
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (err) {
      console.error(`failed to post ticket log for server ${state.serverId}`, err);
    }
  }

  const ticketNumberDisplay = ticketRecord?.ticket_number ?? ticketNumber;
  return {
    ok: true,
    ticketChannelId: ticketChannel.id,
    ticketNumber: ticketNumberDisplay,
    serverId: targetServerId,
    serverName: serverInfo.name,
    message: `Created ticket <#${ticketChannel.id}> (#${ticketNumberDisplay}).`
  };
}

function buildTicketPanelEmbed(state, config = getTicketConfig(state)) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(escapeMarkdown(config.panelTitle ?? DEFAULT_TICKETING_CONFIG.panelTitle))
    .setDescription(escapeMarkdown(config.panelDescription ?? DEFAULT_TICKETING_CONFIG.panelDescription));

  const servers = Array.from(state.teamServers?.values() ?? []);
  if (servers.length) {
    const lines = servers
      .sort((a, b) => a.id - b.id)
      .slice(0, 10)
      .map((server) => `• ${escapeMarkdown(server.name)} (ID ${server.id})`);
    embed.addFields({ name: 'Available servers', value: lines.join('\n').slice(0, 1024), inline: false });
  } else {
    embed.addFields({
      name: 'Available servers',
      value: 'No Rust servers are currently assigned to this team yet.',
      inline: false
    });
  }

  embed.setFooter({ text: 'Use the button below to open a support ticket.' });
  return embed;
}

function buildTicketPanelComponents(config = DEFAULT_TICKETING_CONFIG) {
  const label = (config.panelButtonLabel ?? DEFAULT_TICKETING_CONFIG.panelButtonLabel) || 'Open Ticket';
  const button = new ButtonBuilder()
    .setCustomId(TICKET_PANEL_BUTTON_ID)
    .setLabel(label)
    .setStyle(ButtonStyle.Primary);
  return [new ActionRowBuilder().addComponents(button)];
}

async function handleTicketOpenCommand(state, interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const subjectRaw = interaction.options.getString('subject', true);
  const detailsRaw = interaction.options.getString('details', false);
  const requestedServer = interaction.options.getInteger('server', false);

  const result = await createTicketForInteraction(state, interaction, {
    subject: subjectRaw,
    details: detailsRaw ?? '',
    requestedServerId: requestedServer ?? null
  });

  if (!result.ok) {
    await interaction.editReply(result.message);
    return;
  }

  const extraInfo = result.serverName
    ? ` Linked server: ${result.serverName} (ID ${result.serverId}).`
    : '';
  await interaction.editReply(`${result.message}${extraInfo}`);
}

async function handleTicketPanelCommand(state, interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  if (!requireManageGuild(interaction)) {
    await interaction.editReply('You need the **Manage Server** permission to manage the ticket panel.');
    return;
  }

  const channelInput = interaction.options.getChannel('channel', false);
  const targetChannel = channelInput ?? interaction.channel;

  if (!targetChannel?.isTextBased?.()) {
    await interaction.editReply('Select a text or announcement channel for the ticket panel.');
    return;
  }
  if (targetChannel.guildId && targetChannel.guildId !== state.guildId) {
    await interaction.editReply('That channel belongs to a different guild.');
    return;
  }

  const titleInput = interaction.options.getString('title', false);
  const descriptionInput = interaction.options.getString('description', false);
  const buttonLabelInput = interaction.options.getString('button_label', false);

  const updatedConfig = updateTicketConfig(state, (ticket) => {
    if (titleInput != null) ticket.panelTitle = titleInput;
    if (descriptionInput != null) ticket.panelDescription = descriptionInput;
    if (buttonLabelInput != null) ticket.panelButtonLabel = buttonLabelInput;
    return ticket;
  });

  try {
    await loadTeamServers(state, { force: !state.teamServers || state.teamServerCacheUntil < Date.now() });
  } catch (err) {
    console.error(`failed to refresh team context before updating ticket panel for server ${state.serverId}`, err);
  }

  const panelConfig = updatedConfig;

  const embed = buildTicketPanelEmbed(state, panelConfig);
  const components = buildTicketPanelComponents(panelConfig);

  let existingMessage = null;
  if (panelConfig.panelChannelId && panelConfig.panelMessageId) {
    try {
      const guild = targetChannel.guild ?? (state.commandClient ? await state.commandClient.guilds.fetch(state.guildId) : null);
      if (guild) {
        const storedChannel = await guild.channels.fetch(panelConfig.panelChannelId);
        if (storedChannel?.isTextBased?.()) {
          existingMessage = await storedChannel.messages.fetch(panelConfig.panelMessageId);
        }
      }
    } catch (err) {
      if (err?.code !== 10008) {
        console.error('failed to fetch existing ticket panel message', err);
      }
      existingMessage = null;
    }
  }

  if (existingMessage && existingMessage.channel.id !== targetChannel.id) {
    try {
      await existingMessage.delete();
    } catch (err) {
      console.error('failed to remove outdated ticket panel message', err);
    }
    existingMessage = null;
  }

  let panelMessage;
  try {
    if (existingMessage) {
      panelMessage = await existingMessage.edit({ embeds: [embed], components });
    } else {
      panelMessage = await targetChannel.send({ embeds: [embed], components });
    }
  } catch (err) {
    console.error(`failed to post ticket panel for server ${state.serverId}`, err);
    await interaction.editReply('Failed to post the ticket panel. Check my channel permissions and try again.');
    return;
  }

  updateTicketConfig(state, (ticket) => {
    ticket.panelChannelId = panelMessage.channel.id;
    ticket.panelMessageId = panelMessage.id;
    return ticket;
  });

  await persistIntegration(state);
  await interaction.editReply(`Ticket panel is now active in ${targetChannel}.`);
}

async function handleTicketPanelButton(state, interaction) {
  const config = getTicketConfig(state);
  if (!config.enabled) {
    await interaction.reply({
      content: 'Ticketing is currently disabled. Please contact a server manager.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  try {
    await loadTeamServers(state, { force: !state.teamServers || state.teamServerCacheUntil < Date.now() });
  } catch (err) {
    console.error(`failed to refresh team context before handling ticket panel button for server ${state.serverId}`, err);
  }

  const servers = Array.from(state.teamServers?.values() ?? []);
  if (!servers.length) {
    await interaction.reply({
      content: 'No Rust servers are assigned to this team yet. Please contact a server manager.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const requestId = randomUUID();
  savePendingTicketRequest(requestId, {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    serverId: state.serverId,
    subject: '',
    details: ''
  });

  const modal = new ModalBuilder()
    .setCustomId(`${TICKET_MODAL_PREFIX}${requestId}`)
    .setTitle('Open a support ticket');

  const subjectInput = new TextInputBuilder()
    .setCustomId('ticket_subject')
    .setLabel('Subject')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(120)
    .setPlaceholder('Brief summary of your issue');

  const detailsInput = new TextInputBuilder()
    .setCustomId('ticket_details')
    .setLabel('Details')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500)
    .setPlaceholder('Provide additional information for the staff team');

  modal.addComponents(
    new ActionRowBuilder().addComponents(subjectInput),
    new ActionRowBuilder().addComponents(detailsInput)
  );

  await interaction.showModal(modal);
}

async function handleTicketModalSubmit(state, interaction) {
  const customId = interaction.customId;
  if (!customId.startsWith(TICKET_MODAL_PREFIX)) {
    return false;
  }

  const requestId = customId.slice(TICKET_MODAL_PREFIX.length);
  const entry = getPendingTicketRequest(requestId);
  if (!entry || entry.userId !== interaction.user.id) {
    await interaction.reply({
      content: 'That ticket request has expired. Please click the panel again.',
      flags: MessageFlags.Ephemeral
    });
    deletePendingTicketRequest(requestId);
    return true;
  }

  const subject = interaction.fields.getTextInputValue('ticket_subject')?.trim() ?? '';
  const details = interaction.fields.getTextInputValue('ticket_details')?.trim() ?? '';
  savePendingTicketRequest(requestId, {
    ...entry,
    subject,
    details
  });

  try {
    await loadTeamServers(state, { force: !state.teamServers || state.teamServerCacheUntil < Date.now() });
  } catch (err) {
    console.error(`failed to refresh team context before ticket server selection for server ${state.serverId}`, err);
  }

  const servers = Array.from(state.teamServers?.values() ?? []);
  if (!servers.length) {
    deletePendingTicketRequest(requestId);
    await interaction.reply({
      content: 'No Rust servers are assigned to this team yet. Please contact a server manager.',
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${TICKET_SELECT_PREFIX}${requestId}`)
    .setPlaceholder('Select the server for your ticket')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      servers
        .sort((a, b) => a.id - b.id)
        .slice(0, 25)
        .map((server) => ({
          label: server.name.slice(0, 100),
          description: `Server ID ${server.id}`,
          value: String(server.id)
        }))
    );

  await interaction.reply({
    content: 'Select the server you need help with:',
    components: [new ActionRowBuilder().addComponents(select)],
    flags: MessageFlags.Ephemeral
  });
  return true;
}

async function handleTicketServerSelect(state, interaction) {
  const customId = interaction.customId;
  if (!customId.startsWith(TICKET_SELECT_PREFIX)) {
    return false;
  }

  const requestId = customId.slice(TICKET_SELECT_PREFIX.length);
  const entry = getPendingTicketRequest(requestId);
  if (!entry || entry.userId !== interaction.user.id) {
    await interaction.reply({
      content: 'That ticket request has expired. Please click the panel again.',
      flags: MessageFlags.Ephemeral
    });
    deletePendingTicketRequest(requestId);
    return true;
  }

  const selected = interaction.values?.[0];
  const serverId = Number(selected);
  if (!Number.isFinite(serverId)) {
    await interaction.reply({
      content: 'Invalid server selection. Please try again.',
      flags: MessageFlags.Ephemeral
    });
    deletePendingTicketRequest(requestId);
    return true;
  }

  try {
    await interaction.update({ content: 'Creating your ticket…', components: [] });
  } catch (err) {
    console.error('failed to acknowledge ticket selection interaction', err);
  }

  const result = await createTicketForInteraction(state, interaction, {
    subject: entry.subject,
    details: entry.details,
    requestedServerId: serverId
  });

  deletePendingTicketRequest(requestId);

  if (!result.ok) {
    await interaction.followUp({
      content: result.message,
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const extraInfo = result.serverName
    ? ` Linked server: ${result.serverName} (ID ${result.serverId}).`
    : '';
  await interaction.followUp({
    content: `${result.message}${extraInfo}`,
    flags: MessageFlags.Ephemeral
  });

  return true;
}

async function createTicketTranscript(channel, context = {}) {
  if (!channel?.isTextBased?.()) {
    throw new Error('Cannot generate transcript for a non text-based channel.');
  }

  const {
    ticketNumber,
    channelName,
    subject,
    closedBy,
    reason,
    openedBy,
    openedByTag
  } = context ?? {};

  const safeChannelName = (typeof channelName === 'string' && channelName.trim().length)
    ? channelName.trim()
    : channel?.name ?? `channel-${channel?.id ?? 'unknown'}`;
  const safeSubject = typeof subject === 'string' && subject.trim().length
    ? subject.trim().replace(/\r\n?/g, ' ')
    : null;
  const safeReason = typeof reason === 'string' && reason.trim().length
    ? reason.trim()
    : 'No reason provided.';

  const header = [
    'Ticket transcript',
    `Generated at: ${new Date().toISOString()}`,
    `Channel: ${safeChannelName}`,
    `Channel ID: ${channel?.id ?? 'unknown'}`
  ];

  if (ticketNumber != null) {
    header.push(`Ticket number: ${ticketNumber}`);
  }
  if (safeSubject) {
    header.push(`Subject: ${safeSubject.slice(0, 240)}`);
  }
  if (openedBy || openedByTag) {
    const openerParts = [];
    if (openedByTag) openerParts.push(openedByTag);
    if (openedBy) openerParts.push(`ID ${openedBy}`);
    header.push(`Opened by: ${openerParts.join(' • ')}`);
  } else {
    header.push('Opened by: Unknown');
  }

  if (closedBy) {
    const closerParts = [];
    if (closedBy.tag) {
      closerParts.push(closedBy.tag);
    } else if (closedBy.username) {
      closerParts.push(closedBy.username);
    }
    if (closedBy.id) {
      closerParts.push(`ID ${closedBy.id}`);
    }
    header.push(`Closed by: ${closerParts.join(' • ') || 'Unknown'}`);
  } else {
    header.push('Closed by: Unknown');
  }

  header.push(`Reason: ${safeReason}`);

  const lines = [];
  const transcriptEntries = [];
  let messageCount = 0;
  const seen = new Set();
  let before;

  while (true) {
    const fetchOptions = { limit: 100 };
    if (before) fetchOptions.before = before;

    const batch = await channel.messages.fetch(fetchOptions);
    if (!batch?.size) break;

    const sorted = [...batch.values()].sort(
      (a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0)
    );

    for (const message of sorted) {
      if (!message || seen.has(message.id)) continue;
      seen.add(message.id);
      messageCount += 1;

      const timestamp = new Date(message.createdTimestamp ?? Date.now()).toISOString();
      const authorTag = message.author?.tag ?? message.author?.username ?? 'Unknown user';
      const authorId = message.author?.id ?? 'unknown';
      const botLabel = message.author?.bot ? ' [BOT]' : '';
      const baseLine = `[${timestamp}] ${authorTag} (${authorId})${botLabel}`;

      const contentRaw = message.cleanContent ?? message.content ?? '';
      const content = String(contentRaw ?? '').replace(/\r\n?/g, '\n').trim();
      const requesterId = context?.openedBy ? String(context.openedBy) : null;
      const attachments = message.attachments?.size ? [...message.attachments.values()] : [];
      const attachmentEntryLines = [];
      const attachmentTranscriptLines = [];
      for (const attachment of attachments) {
        if (!attachment) continue;
        const url = attachment.url;
        if (!url) continue;
        const attachmentName = attachment.name ?? 'attachment';
        attachmentTranscriptLines.push(`  [Attachment] ${attachmentName} — ${url}`);
        const cleanName = typeof attachmentName === 'string' ? attachmentName.trim() : '';
        attachmentEntryLines.push(cleanName ? `${cleanName}: ${url}` : url);
      }
      if (content) {
        const [firstLine, ...rest] = content.split('\n');
        lines.push(`${baseLine}: ${firstLine}`);
        for (const extra of rest) {
          lines.push(`  ${extra}`);
        }
      } else {
        lines.push(baseLine);
      }

      lines.push(`  Message ID: ${message.id}`);

      if (message.reference?.messageId) {
        lines.push(`  Replying to message ID: ${message.reference.messageId}`);
      }

      for (const transcriptLine of attachmentTranscriptLines) {
        lines.push(transcriptLine);
      }

      if (message.embeds?.length) {
        lines.push(`  [Embeds] ${message.embeds.length} embed(s).`);
      }

      if (message.stickers?.size) {
        lines.push(`  [Stickers] ${message.stickers.size} sticker(s).`);
      }

      if (message.components?.length) {
        lines.push(`  [Components] ${message.components.length} component(s).`);
      }

      lines.push('');

      const entryLines = [];
      if (content) entryLines.push(content);
      entryLines.push(...attachmentEntryLines);
      if (entryLines.length) {
        const role = requesterId && authorId && String(authorId) === requesterId ? 'requester' : 'staff';
        transcriptEntries.push({
          id: String(message.id),
          role,
          postedAt: timestamp,
          content: entryLines.join('\n'),
          authorId: typeof authorId === 'string' ? authorId : String(authorId ?? ''),
          authorTag: typeof authorTag === 'string' ? authorTag : null
        });
      }
    }

    const oldest = sorted[0];
    const newBefore = oldest?.id;
    if (!newBefore || newBefore === before) break;
    before = newBefore;
  }

  header.push(`Messages captured: ${messageCount}`);
  header.push('');

  if (lines.length === 0) {
    lines.push('No messages were found in this ticket.');
  }

  const transcriptLines = [...header, ...lines];
  const text = `${transcriptLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
  return { text, entries: transcriptEntries };
}

async function handleTicketCloseCommand(state, interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('This command can only be used in a guild channel.');
    return;
  }

  const targetChannel = interaction.channel;
  if (!targetChannel?.isTextBased?.()) {
    await interaction.editReply('Run this command from the ticket channel you want to close.');
    return;
  }
  if (targetChannel.guildId && targetChannel.guildId !== state.guildId) {
    await interaction.editReply('That channel belongs to a different guild.');
    return;
  }

  let ticketRecord = null;
  if (typeof db.getDiscordTicketByChannel === 'function') {
    try {
      ticketRecord = await db.getDiscordTicketByChannel(targetChannel.id);
    } catch (err) {
      console.error(`failed to lookup ticket for channel ${targetChannel.id}`, err);
    }
  }

  if (!ticketRecord) {
    await interaction.editReply('This channel is not registered as a ticket.');
    return;
  }

  const canManage = requireManageChannels(interaction);
  const isRequester = ticketRecord.created_by && String(ticketRecord.created_by) === interaction.user.id;
  if (!canManage && !isRequester) {
    await interaction.editReply('You need the **Manage Channels** permission or be the ticket opener to close this ticket.');
    return;
  }

  const reasonRaw = interaction.options.getString('reason', false);
  const reason = sanitizeTicketText(reasonRaw ?? '', 'Closed without a reason.');
  const now = new Date();

  if (typeof db.closeDiscordTicket === 'function') {
    try {
      const updated = await db.closeDiscordTicket(targetChannel.id, {
        closed_by: interaction.user.id,
        closed_by_tag: interaction.user.tag ?? interaction.user.username,
        close_reason: reason
      });
      if (updated) {
        ticketRecord = updated;
      }
    } catch (err) {
      console.error(`failed to update ticket status for ${targetChannel.id}`, err);
    }
  }

  try {
    await targetChannel.send({ content: `Ticket closed by ${interaction.user} — ${reason}` });
  } catch (err) {
    console.error(`failed to send ticket closure message for server ${state.serverId}`, err);
  }

  if (ticketRecord.created_by) {
    try {
      await targetChannel.permissionOverwrites.edit(ticketRecord.created_by, {
        ViewChannel: false,
        SendMessages: false,
        AddReactions: false,
        AttachFiles: false
      });
    } catch (err) {
      console.error(`failed to update ticket requester permissions for ${targetChannel.id}`, err);
    }
  }

  try {
    await targetChannel.permissionOverwrites.edit(guild.roles.everyone, {
      SendMessages: false,
      AddReactions: false
    });
  } catch (err) {
    console.error(`failed to lock ticket channel ${targetChannel.id}`, err);
  }

  const config = getTicketConfig(state);

  let transcriptBuffer = null;
  let transcriptFileName = null;
  const ticketNumberDisplay = ticketRecord.ticket_number ?? 'unknown';
  const channelName = targetChannel.name ?? `ticket-${ticketNumberDisplay}`;
  const previewUrl = buildTicketPreviewUrl(
    ticketRecord.team_id ?? ticketRecord.teamId,
    {
      id: ticketRecord.id ?? ticketRecord.ticket_id ?? ticketRecord.ticketId,
      previewToken: ticketRecord.preview_token ?? ticketRecord.previewToken
    }
  );

  let transcriptEntries = [];
  try {
    const transcriptPayload = await createTicketTranscript(targetChannel, {
      ticketNumber: ticketNumberDisplay,
      channelName,
      subject: ticketRecord.subject,
      closedBy: interaction.user,
      reason,
      openedBy: ticketRecord.created_by,
      openedByTag: ticketRecord.created_by_tag
    });
    if (transcriptPayload?.text) {
      transcriptBuffer = Buffer.from(transcriptPayload.text, 'utf8');
      transcriptFileName = `ticket-${ticketNumberDisplay}.txt`;
    }
    if (Array.isArray(transcriptPayload?.entries)) {
      transcriptEntries = transcriptPayload.entries;
    }
  } catch (err) {
    console.error(`failed to generate transcript for ticket ${targetChannel.id}`, err);
  }

  const numericTicketId = Number(ticketRecord.id ?? ticketRecord.ticket_id ?? ticketRecord.ticketId);
  if (Number.isFinite(numericTicketId) && typeof db.replaceDiscordTicketDialogEntries === 'function') {
    const mappedEntries = Array.isArray(transcriptEntries)
      ? transcriptEntries
          .map((entry) => {
            if (!entry || !entry.id) return null;
            const messageId = String(entry.id).trim();
            if (!messageId) return null;
            const role = entry.role === 'requester' ? 'requester' : 'staff';
            const content = typeof entry.content === 'string' ? entry.content : '';
            return {
              message_id: messageId,
              role,
              author_id: typeof entry.authorId === 'string' ? entry.authorId : null,
              author_tag: typeof entry.authorTag === 'string' ? entry.authorTag : null,
              content,
              posted_at: entry.postedAt ?? null
            };
          })
          .filter((entry) => entry && entry.content)
      : [];
    try {
      await db.replaceDiscordTicketDialogEntries(numericTicketId, mappedEntries);
    } catch (err) {
      console.error(`failed to persist ticket dialog for ${targetChannel.id}`, err);
    }
  }

  let dmSuccess = false;
  if (ticketRecord.created_by && transcriptBuffer) {
    try {
      const user = await interaction.client.users.fetch(String(ticketRecord.created_by));
      if (user) {
        const attachment = new AttachmentBuilder(transcriptBuffer, {
          name: transcriptFileName ?? 'ticket-transcript.txt'
        });
        const dmLines = [`Your ticket #${ticketNumberDisplay} has been closed.`];
        const safeSubject = typeof ticketRecord.subject === 'string' && ticketRecord.subject.trim().length
          ? ticketRecord.subject.trim().replace(/\r\n?/g, ' ')
          : null;
        if (safeSubject) {
          dmLines.push(`Subject: ${safeSubject}`);
        }
        const safeReason = reason.replace(/\r\n?/g, ' ');
        dmLines.push(`Reason: ${safeReason}`);
        if (previewUrl) {
          dmLines.push('');
          dmLines.push(`View your ticket transcript: ${previewUrl}`);
        }
        await user.send({
          content: dmLines.join('\n'),
          files: [attachment]
        });
        dmSuccess = true;
      }
    } catch (err) {
      console.error(`failed to DM ticket requester ${ticketRecord.created_by}`, err);
    }
  }

  const dmStatusMessage = ticketRecord.created_by
    ? (dmSuccess ? 'Transcript DM sent to requester.' : 'Could not DM requester.')
    : 'No requester recorded for this ticket.';
  const dmLogMessage = ticketRecord.created_by
    ? (dmSuccess ? 'DM sent to requester.' : 'Could not DM requester or DM disabled.')
    : 'No requester recorded for this ticket.';

  if (config.logChannelId) {
    try {
      const logChannel = await guild.channels.fetch(config.logChannelId);
      if (logChannel?.isTextBased?.()) {
        const logEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle(`Ticket closed (#${ticketNumberDisplay})`)
          .addFields(
            { name: 'Channel name', value: escapeMarkdown(channelName).slice(0, 200), inline: true },
            { name: 'Closed by', value: `<@${interaction.user.id}>`, inline: true }
          )
          .setTimestamp(now);
        if (ticketRecord.created_by) {
          logEmbed.addFields({ name: 'Opened by', value: `<@${ticketRecord.created_by}>`, inline: true });
        }
        if (ticketRecord.subject) {
          logEmbed.addFields({ name: 'Subject', value: escapeMarkdown(ticketRecord.subject).slice(0, 200), inline: false });
        }
        if (reason) {
          logEmbed.addFields({ name: 'Reason', value: escapeMarkdown(reason).slice(0, 1000), inline: false });
        }
        logEmbed.addFields({ name: 'Transcript delivery', value: dmLogMessage });
        if (previewUrl) {
          logEmbed.addFields({ name: 'Transcript preview', value: escapeMarkdown(previewUrl).slice(0, 200), inline: false });
        }

        const payload = { embeds: [logEmbed] };
        if (transcriptBuffer) {
          payload.files = [
            new AttachmentBuilder(transcriptBuffer, {
              name: transcriptFileName ?? 'ticket-transcript.txt'
            })
          ];
        } else {
          logEmbed.addFields({ name: 'Transcript status', value: 'Unable to generate transcript.', inline: false });
        }

        await logChannel.send(payload);
      }
    } catch (err) {
      console.error(`failed to send ticket close log for ${targetChannel.id}`, err);
    }
  }

  try {
    await targetChannel.delete('Ticket closed and logged');
  } catch (err) {
    console.error(`failed to delete ticket channel ${targetChannel.id}`, err);
  }

  const transcriptStatusMessage = transcriptBuffer
    ? 'Transcript archived.'
    : 'Transcript could not be generated.';

  await interaction.editReply(
    `Closed ticket ${channelName} (#${ticketNumberDisplay}). ${transcriptStatusMessage} ${dmStatusMessage}`
  );
}

async function handleTicketCommand(state, interaction) {
  if (!state.guildId || interaction.guildId !== state.guildId) {
    await interaction.reply({
      content: 'This command can only be used in the configured guild.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (group === 'config') {
    if (!requireManageGuild(interaction)) {
      await interaction.reply({
        content: 'You need the **Manage Server** permission to use ticket configuration commands.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    await handleTicketConfigCommand(state, interaction, sub);
    return;
  }

  if (sub === 'open') {
    await handleTicketOpenCommand(state, interaction);
    return;
  }

  if (sub === 'panel') {
    await handleTicketPanelCommand(state, interaction);
    return;
  }

  if (sub === 'close') {
    await handleTicketCloseCommand(state, interaction);
    return;
  }

  await interaction.reply({
    content: 'Unknown ticket subcommand.',
    flags: MessageFlags.Ephemeral
  });
}

async function handleRustLookupCommand(state, interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  if (!state.guildId || interaction.guildId !== state.guildId) {
    await interaction.editReply('This command can only be used in the configured guild.');
    return;
  }

  try {
    await loadTeamServers(state, { force: !state.teamServers || state.teamServerCacheUntil < Date.now() });
  } catch (err) {
    console.error(`failed to refresh team context before lookup for server ${state.serverId}`, err);
  }

  const serverIds = new Set();
  serverIds.add(state.serverId);
  if (state.teamServers instanceof Map) {
    for (const id of state.teamServers.keys()) {
      const numeric = Number(id);
      if (Number.isFinite(numeric)) serverIds.add(numeric);
    }
  } else if (state.teamServerIds instanceof Set) {
    for (const id of state.teamServerIds.values()) {
      const numeric = Number(id);
      if (Number.isFinite(numeric)) serverIds.add(numeric);
    }
  }

  const resolveServerName = (id) => {
    if (state.teamServers instanceof Map && state.teamServers.has(id)) {
      return state.teamServers.get(id)?.name ?? `Server ${id}`;
    }
    if (id === state.serverId) {
      return state.serverName ?? `Server ${id}`;
    }
    return `Server ${id}`;
  };

  const sub = interaction.options.getSubcommand();

  if (sub === 'player') {
    const queryRaw = interaction.options.getString('query', true);
    const query = queryRaw.trim();
    if (!query) {
      await interaction.editReply('Please provide a search query.');
      return;
    }
    if (typeof db.searchServerPlayers !== 'function') {
      await interaction.editReply('Player search is not supported by the current database driver.');
      return;
    }

    const aggregated = [];
    for (const serverId of serverIds) {
      try {
        const rows = await db.searchServerPlayers(serverId, query, { limit: 10 });
        for (const row of rows ?? []) {
          aggregated.push({
            ...row,
            server_id: serverId,
            serverId,
            server_name: resolveServerName(serverId)
          });
        }
      } catch (err) {
        console.error(`failed to search players on server ${serverId}`, err);
      }
    }

    const deduped = new Map();
    for (const row of aggregated) {
      if (!row?.steamid) continue;
      const steamid = row.steamid;
      const seen = parseDate(row.last_seen ?? row.lastSeen);
      const ts = seen ? seen.getTime() : 0;
      const existing = deduped.get(steamid);
      if (!existing || ts > existing.ts) {
        deduped.set(steamid, { row, ts });
      }
    }

    const sorted = Array.from(deduped.values())
      .sort((a, b) => b.ts - a.ts)
      .map((entry) => entry.row)
      .slice(0, 10);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`Player search: ${escapeMarkdown(query)}`);

    if (!sorted.length) {
      embed.setDescription('No matching players were found.');
    } else {
      const lines = sorted.map((row) => buildLookupListEntry(row)).join('\n\n');
      embed.setDescription(lines.slice(0, 4000));
    }

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (sub === 'steamid') {
    const idRaw = interaction.options.getString('id', true);
    const id = idRaw.trim();
    if (!id) {
      await interaction.editReply('Please provide a SteamID64.');
      return;
    }

    let best = null;
    let bestTimestamp = -Infinity;
    if (typeof db.getServerPlayer === 'function') {
      for (const serverId of serverIds) {
        try {
          const candidate = await db.getServerPlayer(serverId, id);
          if (candidate) {
            const seen = parseDate(candidate.last_seen ?? candidate.lastSeen);
            const ts = seen ? seen.getTime() : 0;
            if (!best || ts > bestTimestamp) {
              best = {
                ...candidate,
                server_id: serverId,
                serverId,
                server_name: resolveServerName(serverId)
              };
              bestTimestamp = ts;
            }
          }
        } catch (err) {
          console.error(`failed to lookup player ${id} on server ${serverId}`, err);
        }
      }
    }

    if (!best && typeof db.getPlayer === 'function') {
      try {
        best = await db.getPlayer(id);
      } catch (err) {
        console.error(`failed to lookup global player ${id}`, err);
      }
    }

    if (!best) {
      await interaction.editReply('No player was found for that SteamID64.');
      return;
    }

    if (!best.steamid) best.steamid = id;
    const embed = buildDetailedPlayerEmbed(best);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  await interaction.editReply('Unknown subcommand.');
}

async function handleAutocomplete(state, interaction) {
  const focused = typeof interaction.options?.getFocused === 'function'
    ? interaction.options.getFocused(true)
    : null;
  const optionName = focused?.name;

  if (interaction.commandName === 'ruststatus') {
    const group = typeof interaction.options?.getSubcommandGroup === 'function'
      ? interaction.options.getSubcommandGroup(false)
      : null;
    const sub = typeof interaction.options?.getSubcommand === 'function'
      ? interaction.options.getSubcommand(false)
      : null;
    if (!group && sub === 'server' && optionName === 'id') {
      await respondWithTeamServerChoices(state, interaction);
      return true;
    }
  }

  if (interaction.commandName === 'ticket') {
    const group = typeof interaction.options?.getSubcommandGroup === 'function'
      ? interaction.options.getSubcommandGroup(false)
      : null;
    const sub = typeof interaction.options?.getSubcommand === 'function'
      ? interaction.options.getSubcommand(false)
      : null;
    if (!group && sub === 'open' && optionName === 'server') {
      await respondWithTeamServerChoices(state, interaction);
      return true;
    }
  }

  return false;
}

  async function handleInteraction(state, interaction) {
    if (interaction.guildId && state.guildId && interaction.guildId !== state.guildId) {
      return;
    }

    try {
      if (typeof interaction.isAutocomplete === 'function' && interaction.isAutocomplete()) {
        const handled = await handleAutocomplete(state, interaction);
        if (handled) return;
      }

      if (interaction.isChatInputCommand()) {
        const allowed = await ensureCommandPermission(state, interaction);
        if (!allowed) return;
        if (interaction.commandName === 'help') {
          await handleHelpCommand(interaction, { state, teamState: state.teamCommandState });
        } else if (interaction.commandName === 'ruststatus') {
          await handleRustStatusCommand(state, interaction);
        } else if (interaction.commandName === 'rustlookup') {
        await handleRustLookupCommand(state, interaction);
      } else if (interaction.commandName === 'auth') {
        await handleAuthCommand(state, interaction);
      } else if (interaction.commandName === 'ticket') {
        await handleTicketCommand(state, interaction);
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === TICKET_PANEL_BUTTON_ID) {
        await handleTicketPanelButton(state, interaction);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      const handled = await handleTicketModalSubmit(state, interaction);
      if (handled) return;
    }

    if (interaction.isStringSelectMenu()) {
      const handled = await handleTicketServerSelect(state, interaction);
      if (handled) return;
    }
  } catch (err) {
    console.error(`interaction handler error for server ${state.serverId}`, err);
    const canReply = typeof interaction.isRepliable === 'function'
      ? interaction.isRepliable()
      : Boolean(interaction.repliable);
    if (canReply) {
      if (interaction.deferred || interaction.replied) {
        try {
          await interaction.editReply('An unexpected error occurred while processing the interaction.');
        } catch (replyErr) {
          console.error('failed to edit interaction reply after error', replyErr);
        }
      } else {
        try {
          await interaction.reply({
            content: 'An unexpected error occurred while processing the interaction.',
            flags: MessageFlags.Ephemeral
          });
        } catch (replyErr) {
          console.error('failed to reply after interaction error', replyErr);
        }
      }
    }
  }
}

async function tick() {
  const integrations = await loadIntegrations();
  const activeServers = new Set();

  for (const integration of integrations) {
    const state = await ensureBot(integration);
    if (!state) {
      continue;
    }
    activeServers.add(state.serverId);
    if (state.statusReady) {
      try {
        await updateBot(state, integration);
      } catch (err) {
        console.error(`discord bot update failed for server ${state.serverId}`, err);
      }
    }
  }

  for (const [serverId] of bots) {
    if (!activeServers.has(serverId)) {
      console.log(`no discord integration for server ${serverId}; stopping bot`);
      await shutdownBot(serverId);
    }
  }
}

async function main() {
  await initDb();
  console.log('discord bot service starting');

  while (!shuttingDown) {
    try {
      await tick();
    } catch (err) {
      console.error('discord bot tick failed', err);
    }

    if (shuttingDown) break;
    await delay(refreshInterval);
  }

  for (const [serverId] of bots) {
    await shutdownBot(serverId);
  }

  console.log('discord bot service stopped');
}

function handleSignal(signal) {
  console.log(`received ${signal}, shutting down discord bot service`);
  shuttingDown = true;
}

process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);

main().catch((err) => {
  console.error('discord bot service crashed', err);
  process.exit(1);
});
