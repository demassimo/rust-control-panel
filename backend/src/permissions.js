export const PERMISSIONS = {
  SYSTEM_ADMIN: 'system.admin',
  USERS_MANAGE: 'users.manage',
  SERVERS_VIEW: 'servers.view',
  SERVERS_MANAGE: 'servers.manage',
  SERVERS_CONTROL: 'servers.control',
  SERVERS_MONITOR: 'servers.monitor',
  PLAYERS_VIEW: 'players.view',
  PLAYERS_MANAGE: 'players.manage'
};

export const PERMISSION_DEFINITIONS = [
  {
    key: PERMISSIONS.SYSTEM_ADMIN,
    label: 'System administration',
    description: 'Unrestricted access to every feature and configuration area.',
    allowServerScope: false
  },
  {
    key: PERMISSIONS.USERS_MANAGE,
    label: 'Manage users & roles',
    description: 'Invite or remove users, reset passwords and configure role permissions.',
    allowServerScope: false
  },
  {
    key: PERMISSIONS.SERVERS_VIEW,
    label: 'View servers',
    description: 'View the dashboard and basic status for allowed servers.',
    allowServerScope: true
  },
  {
    key: PERMISSIONS.SERVERS_MANAGE,
    label: 'Manage servers',
    description: 'Create, edit or remove servers and upload custom maps.',
    allowServerScope: true
  },
  {
    key: PERMISSIONS.SERVERS_CONTROL,
    label: 'Send RCON commands',
    description: 'Send console commands and interact with server RCON.',
    allowServerScope: true
  },
  {
    key: PERMISSIONS.SERVERS_MONITOR,
    label: 'Monitor live telemetry',
    description: 'Access the live map, server metrics and realtime telemetry feeds.',
    allowServerScope: true
  },
  {
    key: PERMISSIONS.PLAYERS_VIEW,
    label: 'View player directory',
    description: 'Browse the global player directory and server-specific player lists.',
    allowServerScope: true
  },
  {
    key: PERMISSIONS.PLAYERS_MANAGE,
    label: 'Manage player history',
    description: 'Record player notes/events and sync extended Steam metadata.',
    allowServerScope: false
  }
];

const WILDCARD_TOKEN = '*';

function normalisePermissionKey(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function normaliseServerId(value) {
  if (value === null || typeof value === 'undefined') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

export function buildAccessContext({ user, roles = [], permissions = [] } = {}) {
  if (!user) return null;
  const entries = [];
  for (const entry of permissions) {
    const key = normalisePermissionKey(entry?.permission);
    if (!key) continue;
    entries.push({
      key,
      serverId: normaliseServerId(entry?.server_id)
    });
  }
  const deduped = [];
  const seen = new Set();
  for (const entry of entries) {
    const token = `${entry.key}:${entry.serverId ?? 'global'}`;
    if (seen.has(token)) continue;
    seen.add(token);
    deduped.push(entry);
  }
  return {
    userId: user.id,
    username: user.username,
    legacyRole: user.role || 'user',
    roles: (roles || []).map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description || null
    })),
    permissions: deduped
  };
}

function permissionMatches(pattern, target) {
  if (!pattern) return false;
  if (pattern === WILDCARD_TOKEN) return true;
  if (pattern === target) return true;
  const patternParts = pattern.split('.');
  const targetParts = target.split('.');
  for (let i = 0; i < patternParts.length; i += 1) {
    const currentPattern = patternParts[i];
    const currentTarget = targetParts[i];
    if (currentPattern === WILDCARD_TOKEN) return true;
    if (typeof currentTarget === 'undefined') return false;
    if (currentPattern !== currentTarget) return false;
  }
  return patternParts.length === targetParts.length;
}

export function hasPermission(context, permission, { serverId = null } = {}) {
  if (!context) return false;
  const key = normalisePermissionKey(permission);
  if (!key) return false;
  if ((context.legacyRole || '').toLowerCase() === 'admin') return true;
  const targetServer = normaliseServerId(serverId);
  for (const entry of context.permissions || []) {
    const entryKey = normalisePermissionKey(entry.key);
    if (!entryKey) continue;
    if (entryKey === PERMISSIONS.SYSTEM_ADMIN || entryKey === WILDCARD_TOKEN) return true;
    if (!permissionMatches(entryKey, key)) continue;
    if (entry.serverId == null) return true;
    if (targetServer != null && entry.serverId === targetServer) return true;
  }
  return false;
}

export function toUserPayload(context) {
  if (!context) return null;
  return {
    id: context.userId,
    username: context.username,
    role: context.legacyRole,
    roles: context.roles || [],
    permissions: (context.permissions || []).map((entry) => ({
      permission: entry.key,
      serverId: entry.serverId
    }))
  };
}

export function findPermissionDefinition(key) {
  const normalised = normalisePermissionKey(key);
  return PERMISSION_DEFINITIONS.find((def) => normalisePermissionKey(def.key) === normalised) || null;
}
