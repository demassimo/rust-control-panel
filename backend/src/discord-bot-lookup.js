import { EmbedBuilder, MessageFlags, escapeMarkdown } from 'discord.js';
import { db } from './db/index.js';
import { parseDate, formatDiscordTimestamp, formatCount } from './discord-bot-utils.js';

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

export async function handleRustLookupCommand(state, interaction, { loadTeamServers }) {
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

