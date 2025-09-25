import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import { Client, GatewayIntentBits, ActivityType } from 'discord.js';
import { initDb, db } from './db/index.js';

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

async function ensureBot(integration) {
  const serverId = Number(integration?.server_id ?? integration?.serverId);
  if (!Number.isFinite(serverId)) return null;

  const token = sanitizeId(integration?.bot_token ?? integration?.botToken);
  const guildId = sanitizeId(integration?.guild_id ?? integration?.guildId);
  const channelId = sanitizeId(integration?.channel_id ?? integration?.channelId);

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
      client: new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] }),
      ready: false,
      connectPromise: null,
      cooldownMs: MIN_REFRESH_MS,
      cooldownUntil: 0,
      channel: null,
      lastPresenceKey: null,
      lastAnnouncement: null
    };

    state.client.on('ready', () => {
      state.ready = true;
      state.cooldownMs = MIN_REFRESH_MS;
      state.cooldownUntil = 0;
      const username = state.client.user?.tag ?? '(unknown)';
      console.log(`discord bot ready for server ${serverId} as ${username}`);
    });

    state.client.on('error', (err) => {
      console.error(`discord client error (server ${serverId})`, err);
    });

    state.client.on('shardError', (err) => {
      console.error(`discord shard error (server ${serverId})`, err);
    });

    bots.set(serverId, state);
  }

  state.guildId = guildId;
  if (state.channelId !== channelId) {
    state.channelId = channelId;
    state.channel = null;
  }

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
          state.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
          state.client.on('ready', () => {
            state.ready = true;
            state.cooldownMs = MIN_REFRESH_MS;
            state.cooldownUntil = 0;
            const username = state.client.user?.tag ?? '(unknown)';
            console.log(`discord bot ready for server ${serverId} as ${username}`);
          });
          state.client.on('error', (innerErr) => {
            console.error(`discord client error (server ${serverId})`, innerErr);
          });
          state.client.on('shardError', (innerErr) => {
            console.error(`discord shard error (server ${serverId})`, innerErr);
          });
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

function formatPresence(isOnline, players, maxPlayers) {
  if (!isOnline) {
    return {
      status: 'dnd',
      activity: 'Server offline'
    };
  }
  const maxPart = Number.isFinite(maxPlayers) ? `/${maxPlayers}` : '';
  return {
    status: 'online',
    activity: `${players}${maxPart} players`
  };
}

function formatAnnouncement(isOnline, serverName, players, maxPlayers, queued, sleepers) {
  if (!isOnline) {
    return `❌ **${serverName}** is offline.`;
  }
  const lines = [`✅ **${serverName}** is online.`];
  const maxPart = Number.isFinite(maxPlayers) ? `${maxPlayers}` : 'unknown';
  lines.push(`• Players: ${players}/${maxPart}`);
  if (Number.isFinite(queued) && queued > 0) {
    lines.push(`• Queued: ${queued}`);
  }
  if (Number.isFinite(sleepers) && sleepers > 0) {
    lines.push(`• Sleepers: ${sleepers}`);
  }
  return lines.join('\n');
}

async function updateBot(state, integration) {
  const serverId = state.serverId;
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
  let recordedAt = null;
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
    recordedAt = parseDate(stats.recorded_at ?? stats.recordedAt);
  }

  const isRecent = recordedAt ? (Date.now() - recordedAt.getTime()) <= staleThreshold : false;
  const isOnline = stats != null && isRecent;

  const presence = formatPresence(isOnline, players, maxPlayers);
  const presenceKey = `${presence.status}|${presence.activity}`;

  if (state.client?.user && state.lastPresenceKey !== presenceKey) {
    try {
      await state.client.user.setPresence({
        status: presence.status,
        activities: [{ name: presence.activity, type: ActivityType.Watching }]
      });
      state.lastPresenceKey = presenceKey;
    } catch (err) {
      console.error(`failed to update presence for server ${serverId}`, err);
    }
  }

  const statusKey = isOnline ? 'online' : 'offline';
  if (state.lastAnnouncement !== statusKey) {
    const channel = await ensureChannel(state);
    if (channel) {
      const message = formatAnnouncement(isOnline, serverName, players, maxPlayers, queued, sleepers);
      try {
        await channel.send({ content: message });
        state.lastAnnouncement = statusKey;
      } catch (err) {
        console.error(`failed to send announcement for server ${serverId}`, err);
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
