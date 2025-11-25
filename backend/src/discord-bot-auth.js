import { randomUUID, randomBytes } from 'node:crypto';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { db } from './db/index.js';
import { sanitizeId, normalizeBaseUrl } from './discord-bot-utils.js';

const MIN_LINK_TTL_MS = 60 * 1000;
const DEFAULT_LINK_TTL_MS = 15 * 60 * 1000;

const TEAM_AUTH_LINK_TTL_MS = (() => {
  const value = Number(process.env.TEAM_AUTH_LINK_TTL_MS);
  if (Number.isFinite(value) && value >= MIN_LINK_TTL_MS) return Math.floor(value);
  return DEFAULT_LINK_TTL_MS;
})();

const PANEL_PUBLIC_URL = normalizeBaseUrl(process.env.PANEL_PUBLIC_URL);
const APP_URL_FROM_ENV = normalizeBaseUrl(process.env.APP_URL);
const LEGACY_PUBLIC_APP_URL = normalizeBaseUrl(process.env.PUBLIC_APP_URL);
const TEAM_AUTH_APP_URL = APP_URL_FROM_ENV || PANEL_PUBLIC_URL || LEGACY_PUBLIC_APP_URL || '';

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

export async function handleAuthCommand(state, interaction) {
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
        await interaction.editReply(`Linked players will now receive <@&${roleId}> after you finish.`);
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
      const response = [
        'Use the link below to connect your Discord and Steam accounts so staff can identify alternate accounts and build your player profile:',
        link,
        `This link expires ${expiresStamp} (about ${ttlLabel}).`
      ];
      if (settings.roleId) {
        response.push(`You will receive <@&${settings.roleId}> after you finish.`);
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

