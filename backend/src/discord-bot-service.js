import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import {
  Client,
  GatewayIntentBits,
  ActivityType,
  EmbedBuilder,
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
  parseDiscordBotConfig,
  encodeDiscordBotConfig,
  cloneDiscordBotConfig,
  CONFIG_FIELD_CHOICES,
  renderPresenceTemplate,
  describePresenceTemplateUsage,
  formatColorHex,
  parseColorString
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

const pendingTicketRequests = new Map();

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

function getTicketConfig(state) {
  const config = getStateConfig(state);
  return config.ticketing ?? DEFAULT_TICKETING_CONFIG;
}

function updateTicketConfig(state, mutate) {
  if (typeof mutate !== 'function') return getTicketConfig(state);
  const nextRoot = cloneStateConfig(state);
  const working = { ...(nextRoot.ticketing ?? DEFAULT_TICKETING_CONFIG) };
  const mutated = mutate(working);
  const finalTicketing =
    typeof mutated === 'object' && mutated != null ? mutated : working;
  nextRoot.ticketing = { ...DEFAULT_TICKETING_CONFIG, ...finalTicketing };
  const appliedConfig = setStateConfig(state, nextRoot);
  return appliedConfig.ticketing ?? DEFAULT_TICKETING_CONFIG;
}

function formatChannelMention(id, fallback = 'Not set') {
  const value = sanitizeId(id);
  return value ? `<#${value}>` : fallback;
}

function formatRoleMention(id, fallback = 'Not set') {
  const value = sanitizeId(id);
  return value ? `<@&${value}>` : fallback;
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

async function registerCommands(state) {
  if (!state.commandClient?.application || !state.guildId) return;
  const commands = [
    {
      name: 'ruststatus',
      description: 'Manage the Rust server status message',
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
              description: 'Server ID to query',
              required: true,
              min_value: 1
            }
          ]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'setchannel',
          description: 'Select the channel used for status updates',
          options: [
            {
              type: ApplicationCommandOptionType.Channel,
              name: 'channel',
              description: 'Channel to post the status message in',
              channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
              required: false
            }
          ]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'refresh',
          description: 'Force an immediate status refresh'
        },
        {
          type: ApplicationCommandOptionType.SubcommandGroup,
          name: 'config',
          description: 'Configure the status message and presence',
          options: [
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: 'show',
              description: 'Show the current bot configuration'
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: 'setpresence',
              description: 'Update the presence template',
              options: [
                {
                  type: ApplicationCommandOptionType.String,
                  name: 'template',
                  description: 'Template for the presence text',
                  required: false,
                  min_length: 3,
                  max_length: 190
                },
                {
                  type: ApplicationCommandOptionType.Boolean,
                  name: 'reset',
                  description: 'Reset to the default template',
                  required: false
                }
              ]
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: 'setcolors',
              description: 'Change the embed colours',
              options: [
                {
                  type: ApplicationCommandOptionType.String,
                  name: 'online',
                  description: 'Hex colour for the online state (e.g. #57F287)',
                  required: false
                },
                {
                  type: ApplicationCommandOptionType.String,
                  name: 'offline',
                  description: 'Hex colour for the offline state',
                  required: false
                },
                {
                  type: ApplicationCommandOptionType.String,
                  name: 'stale',
                  description: 'Hex colour for the stale state',
                  required: false
                },
                {
                  type: ApplicationCommandOptionType.Boolean,
                  name: 'reset',
                  description: 'Reset all colours to defaults',
                  required: false
                }
              ]
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: 'toggle',
              description: 'Enable or disable fields in the status embed',
              options: [
                {
                  type: ApplicationCommandOptionType.String,
                  name: 'field',
                  description: 'Field to configure',
                  required: true,
                  choices: CONFIG_FIELD_CHOICES.map((choice) => ({ name: choice.name, value: choice.value }))
                },
                {
                  type: ApplicationCommandOptionType.Boolean,
                  name: 'enabled',
                  description: 'Whether the field should be shown',
                  required: true
                }
              ]
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: 'reset',
              description: 'Reset all configuration to defaults'
            }
          ]
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
              description: 'Server ID to associate with the ticket',
              required: false,
              min_value: 1
            }
          ]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: 'close',
          description: 'Close an existing ticket channel',
          options: [
            {
              type: ApplicationCommandOptionType.Channel,
              name: 'channel',
              description: 'Ticket channel to close',
              required: false,
              channel_types: [ChannelType.GuildText]
            },
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
              name: 'setarchive',
              description: 'Set or clear the archive category for closed tickets',
              options: [
                {
                  type: ApplicationCommandOptionType.Channel,
                  name: 'channel',
                  description: 'Category used to archive closed tickets',
                  required: false,
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

  await state.commandClient.application.commands.set(commands, state.guildId);
}

async function shutdownBot(serverId) {
  const state = bots.get(serverId);
  if (!state) return;
  bots.delete(serverId);
  try {
    if (state.statusClient) {
      await state.statusClient.destroy();
    }
  } catch (err) {
    console.error(`discord status bot ${serverId} destroy failed`, err);
  }
  try {
    if (state.commandClient && state.commandClient !== state.statusClient) {
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
  const useSharedClient = Boolean(commandToken) && commandToken === statusToken;

  if (state && state.useSharedClient !== useSharedClient) {
    await shutdownBot(serverId);
    state = null;
  }

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
      teamServers: null,
      teamServerIds: null,
      teamServerCacheUntil: 0,
      serverName: null,
      useSharedClient
    };
    state.statusClient = createStatusClient(state);
    if (!useSharedClient && commandToken) {
      state.commandClient = createCommandClient(state);
    }
    bots.set(serverId, state);
  }

  state.useSharedClient = useSharedClient;
  if (state.statusToken !== statusToken) {
    if (state.statusClient) {
      try {
        await state.statusClient.destroy();
      } catch (err) {
        console.error(`failed to destroy existing status client for server ${serverId}`, err);
      }
    }
    state.statusReady = false;
    state.statusConnectPromise = null;
    state.statusClient = createStatusClient(state);
  }
  state.statusToken = statusToken;

  if (!state.useSharedClient) {
    if (state.commandToken !== commandToken && state.commandClient) {
      try {
        await state.commandClient.destroy();
      } catch (err) {
        console.error(`failed to destroy existing command client for server ${serverId}`, err);
      }
      state.commandClient = null;
      state.commandReady = false;
      state.commandConnectPromise = null;
    }
    state.commandToken = commandToken;
    if (commandToken && !state.commandClient) {
      state.commandClient = createCommandClient(state);
    }
  } else {
    state.commandToken = statusToken;
    state.commandClient = state.statusClient;
    if (state.statusReady) {
      state.commandReady = true;
      state.commandCooldownMs = state.statusCooldownMs;
      state.commandCooldownUntil = state.statusCooldownUntil;
    } else {
      state.commandReady = false;
    }
  }

  state.guildId = guildId;
  if (state.channelId !== channelId) {
    state.channelId = channelId;
    state.channel = null;
    state.statusMessageId = statusMessageId;
    state.lastStatusEmbedKey = null;
  } else if (state.statusMessageId !== statusMessageId) {
    state.statusMessageId = statusMessageId;
    state.lastStatusEmbedKey = null;
  }
  state.integration = integration;
  updateStateConfigFromIntegration(state, integration);

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

  if (!state.useSharedClient && commandToken) {
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
      message = await channel.messages.fetch(state.statusMessageId);
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
      await message.edit({ embeds: [embed] });
    } else {
      const sent = await channel.send({ embeds: [embed] });
      state.statusMessageId = sent.id;
      await persistIntegration(state);
    }
    state.lastStatusEmbedKey = embedKey;
  } catch (err) {
    console.error(`failed to update status embed for server ${state.serverId}`, err);
  }
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
  return `${namePart} • \`${row.steamid}\`\nLast seen ${lastSeenText}${extras.length ? ` • ${extras.join(' • ')}` : ''}`;
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
        content: 'Please provide a valid server ID.',
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
    `Archive: ${formatChannelMention(ticketing.archiveChannelId)}`,
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

  if (sub === 'setarchive') {
    const archive = interaction.options.getChannel('channel', false);
    if (archive) {
      if (archive.type !== ChannelType.GuildCategory) {
        await interaction.editReply('The archive must be a category channel.');
        return;
      }
      if (archive.guildId && archive.guildId !== state.guildId) {
        await interaction.editReply('That category belongs to a different guild.');
        return;
      }
    }
    updateTicketConfig(state, (ticket) => {
      ticket.archiveChannelId = archive ? archive.id : null;
      return ticket;
    });
    await persistIntegration(state);
    await interaction.editReply(archive ? `Closed tickets will be moved to ${archive}.` : 'Archive category cleared.');
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

async function handleTicketCloseCommand(state, interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('This command can only be used in a guild channel.');
    return;
  }

  const providedChannel = interaction.options.getChannel('channel', false);
  const targetChannel = providedChannel ?? interaction.channel;
  if (!targetChannel?.isTextBased?.()) {
    await interaction.editReply('Select a text channel to close.');
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
  if (config.archiveChannelId && targetChannel.parentId !== config.archiveChannelId) {
    try {
      await targetChannel.setParent(config.archiveChannelId, { lockPermissions: false });
    } catch (err) {
      console.error(`failed to move ticket ${targetChannel.id} to archive`, err);
    }
  }

  if (config.logChannelId) {
    try {
      const logChannel = await guild.channels.fetch(config.logChannelId);
      if (logChannel?.isTextBased?.()) {
        const logEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle(`Ticket closed (#${ticketRecord.ticket_number ?? 'unknown'})`)
          .addFields(
            { name: 'Channel', value: `<#${targetChannel.id}>`, inline: true },
            { name: 'Closed by', value: `<@${interaction.user.id}>`, inline: true }
          )
          .setTimestamp(now);
        if (ticketRecord.subject) {
          logEmbed.addFields({ name: 'Subject', value: escapeMarkdown(ticketRecord.subject).slice(0, 200), inline: false });
        }
        if (reason) {
          logEmbed.addFields({ name: 'Reason', value: escapeMarkdown(reason).slice(0, 1000), inline: false });
        }
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (err) {
      console.error(`failed to send ticket close log for ${targetChannel.id}`, err);
    }
  }

  await interaction.editReply(`Closed ticket <#${targetChannel.id}>.`);
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

    const results = await db.searchServerPlayers(state.serverId, query, { limit: 10 });
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`Player search: ${escapeMarkdown(query)}`);

    if (!results || results.length === 0) {
      embed.setDescription('No matching players were found.');
    } else {
      const lines = results.map((row) => buildLookupListEntry(row)).join('\n\n');
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

    let row = null;
    if (typeof db.getServerPlayer === 'function') {
      row = await db.getServerPlayer(state.serverId, id);
    }
    if (!row && typeof db.getPlayer === 'function') {
      row = await db.getPlayer(id);
    }
    if (!row) {
      await interaction.editReply('No player was found for that SteamID64.');
      return;
    }

    if (!row.steamid) row.steamid = id;
    const embed = buildDetailedPlayerEmbed(row);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  await interaction.editReply('Unknown subcommand.');
}

async function handleInteraction(state, interaction) {
  if (interaction.guildId && state.guildId && interaction.guildId !== state.guildId) {
    return;
  }

  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'ruststatus') {
        await handleRustStatusCommand(state, interaction);
      } else if (interaction.commandName === 'rustlookup') {
        await handleRustLookupCommand(state, interaction);
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
