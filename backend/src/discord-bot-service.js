import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import {
  Client,
  GatewayIntentBits,
  ActivityType,
  EmbedBuilder,
  ApplicationCommandOptionType,
  PermissionFlagsBits,
  ChannelType,
  escapeMarkdown
} from 'discord.js';
import { initDb, db } from './db/index.js';

const MIN_REFRESH_MS = 10000;
const DEFAULT_REFRESH_MS = 60000;
const DEFAULT_STALE_MS = 5 * 60 * 1000;

const STATUS_COLORS = {
  online: 0x57f287,
  offline: 0xed4245,
  stale: 0xfee75c
};

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

function createDiscordClient(state) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

  client.on('ready', async () => {
    state.ready = true;
    state.cooldownMs = MIN_REFRESH_MS;
    state.cooldownUntil = 0;
    const username = client.user?.tag ?? '(unknown)';
    console.log(`discord bot ready for server ${state.serverId} as ${username}`);
    try {
      await registerCommands(state);
    } catch (err) {
      console.error(`failed to register slash commands for server ${state.serverId}`, err);
    }
  });

  client.on('error', (err) => {
    console.error(`discord client error (server ${state.serverId})`, err);
  });

  client.on('shardError', (err) => {
    console.error(`discord shard error (server ${state.serverId})`, err);
  });

  client.on('interactionCreate', (interaction) => {
    handleInteraction(state, interaction).catch((err) => {
      console.error(`failed to handle interaction for server ${state.serverId}`, err);
    });
  });

  return client;
}

async function registerCommands(state) {
  if (!state.client?.application || !state.guildId) return;
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
    }
  ];

  await state.client.application.commands.set(commands, state.guildId);
}

async function shutdownBot(serverId) {
  const state = bots.get(serverId);
  if (!state) return;
  bots.delete(serverId);
  try {
    await state.client.destroy();
  } catch (err) {
    console.error(`discord bot ${serverId} destroy failed`, err);
  }
}

async function persistIntegration(state) {
  if (typeof db.saveServerDiscordIntegration !== 'function') return;
  try {
    await db.saveServerDiscordIntegration(state.serverId, {
      bot_token: state.token,
      guild_id: state.guildId,
      channel_id: state.channelId,
      status_message_id: state.statusMessageId || null
    });
    state.integration = {
      ...(state.integration || {}),
      bot_token: state.token,
      guild_id: state.guildId,
      channel_id: state.channelId,
      status_message_id: state.statusMessageId || null
    };
  } catch (err) {
    console.error(`failed to persist discord integration for server ${state.serverId}`, err);
  }
}

async function ensureBot(integration) {
  const serverId = Number(integration?.server_id ?? integration?.serverId);
  if (!Number.isFinite(serverId)) return null;

  const token = sanitizeId(integration?.bot_token ?? integration?.botToken);
  const guildId = sanitizeId(integration?.guild_id ?? integration?.guildId);
  const channelId = sanitizeId(integration?.channel_id ?? integration?.channelId);
  const statusMessageId = sanitizeId(integration?.status_message_id ?? integration?.statusMessageId);

  if (!token || !guildId || !channelId) {
    await shutdownBot(serverId);
    return null;
  }

  let state = bots.get(serverId);
  if (state && state.token !== token) {
    await shutdownBot(serverId);
    state = null;
  }

  if (!state) {
    state = {
      serverId,
      token,
      guildId,
      channelId,
      client: null,
      ready: false,
      connectPromise: null,
      cooldownMs: MIN_REFRESH_MS,
      cooldownUntil: 0,
      channel: null,
      statusMessageId,
      lastPresenceKey: null,
      lastStatusEmbedKey: null,
      integration
    };
    state.client = createDiscordClient(state);
    bots.set(serverId, state);
  }

  state.token = token;
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

  const now = Date.now();
  if (state.cooldownUntil > now) {
    return state;
  }

  if (!state.ready) {
    if (!state.connectPromise) {
      state.connectPromise = (async () => {
        try {
          await state.client.login(token);
        } catch (err) {
          console.error(`discord bot login failed for server ${serverId}`, err);
          state.ready = false;
          try {
            await state.client.destroy();
          } catch (destroyErr) {
            console.error(`discord bot destroy after login failure (server ${serverId})`, destroyErr);
          }
          const nextCooldown = Math.min(state.cooldownMs * 2, 5 * 60 * 1000);
          state.cooldownMs = Math.max(nextCooldown, MIN_REFRESH_MS);
          state.cooldownUntil = Date.now() + state.cooldownMs;
          state.client = createDiscordClient(state);
          throw err;
        }
      })().finally(() => {
        state.connectPromise = null;
      });
    }

    try {
      await state.connectPromise;
    } catch (err) {
      return state;
    }
  }

  return state;
}

async function ensureChannel(state) {
  if (!state?.ready) return null;
  if (!state.channelId) return null;
  if (state.channel && state.channel.id === state.channelId) {
    return state.channel;
  }

  try {
    const channel = await state.client.channels.fetch(state.channelId);
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

async function loadServerStatus(serverId) {
  let serverName = `Server ${serverId}`;
  try {
    if (typeof db.getServer === 'function') {
      const server = await db.getServer(serverId);
      if (server?.name) {
        serverName = server.name;
      }
    }
  } catch (err) {
    console.error(`failed to load server metadata for ${serverId}`, err);
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

function formatPresence(status) {
  if (!status?.hasStats) {
    return { status: 'idle', activity: 'Waiting for data' };
  }

  const countPart = Number.isFinite(status.maxPlayers)
    ? `(${status.players}/${status.maxPlayers})`
    : `(${status.players})`;

  if (status.stale) {
    return { status: 'idle', activity: `${countPart} playing (stale)` };
  }

  if (!status.isOnline) {
    return { status: 'dnd', activity: 'Server offline' };
  }

  const joiningPart = Number.isFinite(status.joining) && status.joining > 0
    ? `joining (${status.joining})`
    : 'playing';
  return {
    status: 'online',
    activity: `${countPart} ${joiningPart}`
  };
}

function buildStatusEmbed(status) {
  const embed = new EmbedBuilder()
    .setTitle(status.serverName)
    .setTimestamp(status.recordedAt ?? new Date());

  if (!status.hasStats) {
    embed
      .setColor(STATUS_COLORS.stale)
      .setDescription('No recent status data has been recorded yet.');
    return embed;
  }

  if (status.stale) {
    embed
      .setColor(STATUS_COLORS.stale)
      .setDescription('⚠️ The latest data is stale; the server may be restarting.');
  } else if (!status.isOnline) {
    embed
      .setColor(STATUS_COLORS.offline)
      .setDescription('❌ The server appears to be offline or unreachable.');
  } else {
    embed
      .setColor(STATUS_COLORS.online)
      .setDescription('✅ The server is online and reporting live data.');
  }

  const maxPart = Number.isFinite(status.maxPlayers) ? `${status.maxPlayers}` : 'unknown';
  embed.addFields({
    name: 'Players',
    value: `**${status.players}** / ${maxPart}`,
    inline: true
  });

  if (Number.isFinite(status.joining)) {
    embed.addFields({ name: 'Joining', value: formatCount(status.joining, '0'), inline: true });
  }

  if (Number.isFinite(status.queued)) {
    embed.addFields({ name: 'Queued', value: formatCount(status.queued, '0'), inline: true });
  }

  if (Number.isFinite(status.sleepers)) {
    embed.addFields({ name: 'Sleepers', value: formatCount(status.sleepers, '0'), inline: true });
  }

  if (Number.isFinite(status.fps)) {
    embed.addFields({ name: 'Server FPS', value: status.fps.toFixed(1), inline: true });
  }

  if (status.recordedAt) {
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
  let status;
  try {
    status = await loadServerStatus(state.serverId);
  } catch (err) {
    console.error(`failed to load status for server ${state.serverId}`, err);
    return;
  }

  const presence = formatPresence(status);
  const presenceKey = `${presence.status}|${presence.activity}`;

  if (state.client?.user && state.lastPresenceKey !== presenceKey) {
    try {
      await state.client.user.setPresence({
        status: presence.status,
        activities: [{ name: presence.activity, type: ActivityType.Playing }]
      });
      state.lastPresenceKey = presenceKey;
    } catch (err) {
      console.error(`failed to update presence for server ${state.serverId}`, err);
    }
  }

  const embed = buildStatusEmbed(status);
  await ensureStatusMessage(state, embed);
}

function requireManageGuild(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
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
  const sub = interaction.options.getSubcommand();

  if (sub === 'status') {
    const status = await loadServerStatus(state.serverId);
    const embed = buildStatusEmbed(status);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (!requireManageGuild(interaction)) {
    await interaction.reply({
      content: 'You need the **Manage Server** permission to use this subcommand.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

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

async function handleRustLookupCommand(state, interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
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
  if (!interaction.isChatInputCommand()) return;
  if (interaction.guildId && state.guildId && interaction.guildId !== state.guildId) {
    return;
  }

  try {
    if (interaction.commandName === 'ruststatus') {
      await handleRustStatusCommand(state, interaction);
    } else if (interaction.commandName === 'rustlookup') {
      await handleRustLookupCommand(state, interaction);
    }
  } catch (err) {
    console.error(`interaction handler error for server ${state.serverId}`, err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('An unexpected error occurred while processing the command.');
    } else {
      await interaction.reply({
        content: 'An unexpected error occurred while processing the command.',
        ephemeral: true
      });
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
    if (state.ready) {
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
